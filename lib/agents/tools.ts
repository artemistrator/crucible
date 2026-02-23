import { tool } from "ai";
import { z } from "zod";
import { promises as fs } from "fs";
import { dirname, join, normalize } from "path";
import { searchSimilar, findRelatedFiles, getFileEntities, searchWithContext } from "@/lib/rag/search";
import { prisma } from "@/lib/prisma";
import { ExecutionSessionManager } from "@/lib/execution/session-manager";
import { getProjectDir } from "@/lib/project-workspace";
import { createHash } from "crypto";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/** Normalizes file path: strips leading "./" and normalizes slashes. Use for readFile/writeFile params. */
function normalizeFilePath(p: string): string {
  if (!p || typeof p !== "string") return p;
  const trimmed = p.trim().replace(/^\.\/+/, "");
  return normalize(trimmed) || trimmed;
}

/**
 * Creates a searchKnowledge tool for a specific project.
 * This factory function allows dynamic projectId binding.
 */
export function createSearchKnowledgeTool(projectId: string) {
  return tool({
    description: "Search project documentation and files for relevant context",
    parameters: z.object({
      query: z.string()
    }),
    execute: async ({ query }) => {
      const results = await searchSimilar(projectId, query, 5);
      return results.map(r => ({
        content: r.content,
        similarity: r.similarity
      }));
    }
  });
}

/**
 * Web search tool using Tavily API.
 * Enables agents to search the internet for fresh documentation and solutions.
 */
export const webSearch = tool({
  description: "Search the internet for fresh documentation, error solutions, and current information. Use this when you need up-to-date information or solutions to specific technical problems.",
  parameters: z.object({
    query: z.string().describe("Search query for the web search")
  }),
  execute: async ({ query }) => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return { error: "TAVILY_API_KEY not configured" };
    }

    try {
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: apiKey,
          query: query,
          max_results: 5,
          search_depth: "basic"
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { error: `Tavily API error: ${response.status} - ${errorText}` };
      }

      const data = await response.json();
      
      if (!data.results) {
        return { error: "No results returned from Tavily" };
      }

      return data.results.map((result: any) => ({
        title: result.title,
        content: result.content,
        url: result.url
      }));
    } catch (error) {
      return { error: `Web search failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
});

/**
 * Creates a readFile tool for a specific project.
 * Allows agents to read file content from the database.
 */
export function createReadFileTool(projectId: string) {
  return tool({
    description: "Read the content of a file from the project. Use this when the executor mentions creating or modifying specific files.",
    parameters: z.object({
      filePath: z.string().describe("Path to the file (e.g., 'src/components/Button.tsx' or 'app/api/route.ts')")
    }),
    execute: async ({ filePath }) => {
      try {
        const normalizedPath = normalizeFilePath(filePath);
        const files = await prisma.projectFile.findMany({
          where: {
            projectId: projectId,
            OR: [
              { name: { contains: normalizedPath, mode: "insensitive" } },
              { url: { contains: normalizedPath, mode: "insensitive" } }
            ]
          }
        });

        if (files.length === 0) {
          const allFiles = await prisma.projectFile.findMany({
            where: { projectId },
            select: { name: true, url: true }
          });
          return {
            error: `File not found: ${normalizedPath}`,
            suggestion: "Try one of these files:",
            availableFiles: allFiles.map(f => f.name || f.url).slice(0, 10)
          };
        }

        const exactMatch = files.find(f =>
          f.name === normalizedPath ||
          f.name.endsWith(normalizedPath) ||
          f.url.endsWith(normalizedPath)
        );

        const file = exactMatch || files[0];

        if (!file.content) {
          return {
            error: `File content not available for: ${file.name || file.url}`,
            mimeType: file.mimeType
          };
        }

        return {
          filePath: file.name || file.url,
          content: file.content,
          mimeType: file.mimeType
        };
      } catch (error) {
        return {
          error: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  });
}

function createErrorSignature(command: string, errorMessage: string): string {
  const signature = `${command}:${errorMessage}`;
  return createHash('sha256').update(signature).digest('hex').substring(0, 16);
}

async function handleCommandError(projectId: string, command: string, errorMessage: string, executionSessionId?: string): Promise<void> {
  if (!executionSessionId) {
    console.warn(`[Tools] Command error for '${command}' but no executionSessionId was provided.`);
    return;
  }
  const errorSignature = createErrorSignature(command, errorMessage);
  const sessionManager = ExecutionSessionManager.getInstance();

  await sessionManager.incrementRetryCounter(executionSessionId, errorSignature);

  const { shouldPause, reason } = await sessionManager.checkRetryLimit(executionSessionId, errorSignature);

  if (shouldPause) {
    await sessionManager.pauseSession(executionSessionId);
  }
}

/**
 * Creates an executeCommand tool for a specific project.
 * Allows agents to execute shell commands on the client's machine via the sync client.
 */
export function createExecuteCommandTool(projectId: string, executionSessionId?: string) {
  return tool({
    description: "Execute a shell command on the client's machine (e.g., 'npm test', 'npm run build', 'npm run lint'). The command will be sent to the sync client and must be approved by the user unless --auto-approve is set. Use this for running tests, building the project, or running linters.",
    parameters: z.object({
      command: z.string().describe("The shell command to execute (e.g., 'npm test', 'npm run build')"),
      reason: z.string().optional().describe("Optional explanation of why this command is being executed")
    }),
    execute: async ({ command, reason }) => {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002'}/api/sync/command`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            projectId,
            command,
            reason,
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          await handleCommandError(projectId, command, error, executionSessionId);
          return {
            success: false,
            error: `Failed to create command: ${error}`
          };
        }

        const data = await response.json();
        const commandId = data.commandId;

        let commandResult = null;
        let attempts = 0;
        const maxAttempts = 120;

        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000));

          const checkResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002'}/api/sync/command?projectId=${projectId}`, {
            method: 'GET',
          });

          if (!checkResponse.ok) {
            attempts++;
            continue;
          }

          const checkData = await checkResponse.json();

          if (checkData.command && checkData.command.id !== commandId) {
            attempts++;
            continue;
          }

          const commandRecord = await prisma.syncCommand.findUnique({
            where: { id: commandId },
          });

          if (!commandRecord) {
            attempts++;
            continue;
          }

          if (commandRecord.status === "COMPLETED" || commandRecord.status === "FAILED" || commandRecord.status === "REJECTED") {
            commandResult = commandRecord;
            break;
          }

          attempts++;
        }

        const createdAt = new Date();

        if (!commandResult) {
          return {
            success: false,
            error: "Command execution timed out. The client may not be running or command was not approved."
          };
        }

        const success = commandResult.status === "COMPLETED";

        if (!success && (commandResult.stderr || commandResult.exitCode !== 0)) {
          await handleCommandError(projectId, command, commandResult.stderr || `Exit code: ${commandResult.exitCode}`, executionSessionId);
        }

        return {
          success,
          exitCode: commandResult.exitCode,
          stdout: commandResult.stdout,
          stderr: commandResult.stderr,
          duration: `${commandResult.updatedAt.getTime() - createdAt.getTime()}ms`
        };
      } catch (error) {
        await handleCommandError(projectId, command, (error as Error).message, executionSessionId);
        return {
          success: false,
          error: `Failed to execute command: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  });
}

/**
 * Creates a cloudExecuteCommand tool for a specific project.
 * Executes shell commands directly inside the Docker container
 * in the project's working directory: /app/projects/[projectId].
 */
export function createCloudExecuteCommandTool(projectId: string, executionSessionId?: string) {
  return tool({
    description:
      "Execute a shell command inside the cloud workspace (Docker container) for this project. " +
      "The working directory is /app/projects/[projectId]. Use this for running tests, builds, or tools in cloud mode.",
    parameters: z.object({
      command: z.string().describe("The shell command to execute in the project directory (e.g., 'npm test', 'npm run build')"),
      reason: z.string().optional().describe("Optional explanation of why this command is being executed"),
    }),
    execute: async ({ command, reason }) => {
      const cwd = getProjectDir(projectId);
      const startTime = Date.now();

      // Prevent npm from walking up to parent directories when package.json is missing
      if (/npm\s+(run|install)/.test(command)) {
        try {
          await fs.access(join(cwd, "package.json"));
        } catch {
          return {
            success: false,
            error:
              "package.json not found in current directory. Prevented npm from traversing up to parent directories.",
            exitCode: 1,
            stdout: "",
            stderr: "package.json not found in current directory.",
            duration: "0ms",
          };
        }
      }

      try {
        const { stdout, stderr } = await execAsync(command, {
          cwd,
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
          // Hard timeout so long-running commands (e.g. dev servers, http servers)
          // do not hang the execution session forever.
          timeout: 120_000, // 120 seconds
          env: {
            ...process.env,
            // Make sure non-interactive, predictable environment
            CI: process.env.CI || "1",
          },
        });

        const duration = `${Date.now() - startTime}ms`;

        return {
          success: true,
          exitCode: 0,
          stdout,
          stderr,
          duration,
        };
      } catch (error: any) {
        const stdout = typeof error.stdout === "string" ? error.stdout : "";
        const stderr =
          typeof error.stderr === "string"
            ? error.stderr
            : error instanceof Error
            ? error.message
            : String(error);
        const exitCode = typeof error.code === "number" ? error.code : 1;

        await handleCommandError(
          projectId,
          command,
          stderr || `Exit code: ${exitCode}`,
          executionSessionId
        );

        const duration = `${Date.now() - startTime}ms`;

        return {
          success: false,
          exitCode,
          stdout,
          stderr,
          duration,
          error:
            stderr ||
            `Cloud command failed with exit code ${exitCode} in ${duration}`,
        };
      }
    },
  });
}

/**
 * Creates a cloud writeFile tool that writes directly to the project workspace.
 * Used in cloud mode when no sync client is running.
 */
export function createCloudWriteFileTool(projectId: string) {
  return tool({
    description:
      "Create or update a file in the cloud project workspace (/app/projects/[projectId]). Use this for creating new files or updating existing ones in cloud mode.",
    parameters: z.object({
      filePath: z.string().describe("Path to file to write (e.g., 'index.html', 'src/App.tsx')"),
      content: z.string().describe("The content to write to file"),
      reason: z.string().optional().describe("Optional explanation of why this file is being created or modified"),
    }),
    execute: async ({ filePath, content }) => {
      try {
        const rootPath = getProjectDir(projectId);
        const normalized = normalizeFilePath(filePath);
        const safePath = normalized.replace(/\.\./g, "").replace(/^\/+/, "");
        const fullPath = join(rootPath, safePath);

        if (!fullPath.startsWith(rootPath)) {
          return { success: false, error: "Invalid path: path traversal not allowed" };
        }

        await fs.mkdir(dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, content ?? "", "utf-8");

        return {
          success: true,
          filePath: safePath,
          message: `File ${safePath} written successfully`,
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  });
}

/**
 * Creates a findRelatedFiles tool for a specific project.
 * Allows agents to find files that depend on or are used by a given file.
 */
export function createFindRelatedFilesTool() {
  return tool({
    description: "Find files that are related to a specific file through code dependencies (imports, exports, function calls). This is useful when modifying a file to understand which other files might be affected.",
    parameters: z.object({
      filePath: z.string().describe("Path to the file (e.g., 'src/components/Button.tsx' or 'app/api/route.ts')")
    }),
    execute: async ({ filePath }) => {
      try {
        const files = await prisma.projectFile.findMany({
          where: {
            OR: [
              { name: { contains: filePath, mode: "insensitive" } },
              { url: { contains: filePath, mode: "insensitive" } }
            ]
          }
        });

        if (files.length === 0) {
          return {
            error: `File not found: ${filePath}`,
            suggestion: "The file may not exist in the project or hasn't been synced yet."
          };
        }

        const exactMatch = files.find(f => 
          f.name === filePath || 
          f.name.endsWith(filePath) || 
          f.url.endsWith(filePath)
        );

        const file = exactMatch || files[0];

        const relatedFiles = await findRelatedFiles(file.id);

        if (relatedFiles.length === 0) {
          return {
            filePath: file.name,
            message: "No related files found. This file may not have any dependencies or may not be imported by other files.",
            entities: await getFileEntities(file.id)
          };
        }

        return {
          filePath: file.name,
          relatedFiles: relatedFiles.map(rf => ({
            fileName: rf.fileName,
            relationship: rf.relationship,
            entityName: rf.entityName
          })),
          entities: await getFileEntities(file.id)
        };
      } catch (error) {
        return {
          error: `Failed to find related files: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  });
}

/**
 * Creates a writeFile tool for a specific project.
 * Allows agents to create or update files on the client's machine via sync client.
 */
export function createWriteFileTool(projectId: string, executionSessionId?: string) {
  return tool({
    description: "Create or update a file on the client's machine via sync client. The file will be written to disk after user approval (unless auto-approve is enabled). Use this for creating new files or updating existing ones.",
    parameters: z.object({
      filePath: z.string().describe("Path to file to write (e.g., 'src/components/Button.tsx' or 'app/api/route.ts')"),
      content: z.string().describe("The content to write to file"),
      reason: z.string().optional().describe("Optional explanation of why this file is being created or modified")
    }),
    execute: async ({ filePath, content, reason }) => {
      try {
        const normalizedPath = normalizeFilePath(filePath);
        const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002'}/api/sync/command`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            projectId,
            command: `Write file: ${normalizedPath}`,
            reason,
            type: 'WRITE_FILE',
            filePath: normalizedPath,
            fileContent: content,
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          await handleCommandError(projectId, `Write file: ${normalizedPath}`, error, executionSessionId);
          return {
            success: false,
            error: `Failed to create write file command: ${error}`
          };
        }

        const data = await response.json();
        const commandId = data.commandId;

        let commandResult = null;
        let attempts = 0;
        const maxAttempts = 120;

        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000));

          const checkResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3002'}/api/sync/command?projectId=${projectId}`, {
            method: 'GET',
          });

          if (!checkResponse.ok) {
            attempts++;
            continue;
          }

          const checkData = await checkResponse.json();

          if (checkData.command && checkData.command.id !== commandId) {
            attempts++;
            continue;
          }

          const commandRecord = await prisma.syncCommand.findUnique({
            where: { id: commandId },
          });

          if (!commandRecord) {
            attempts++;
            continue;
          }

          if (commandRecord.status === "COMPLETED" || commandRecord.status === "FAILED" || commandRecord.status === "REJECTED") {
            commandResult = commandRecord;
            break;
          }

          attempts++;
        }

        if (!commandResult) {
          return {
            success: false,
            error: "File write timed out. The client may not be running or command was not approved."
          };
        }

        const success = commandResult.status === "COMPLETED";

        if (!success && commandResult.stderr) {
          await handleCommandError(projectId, `Write file: ${normalizedPath}`, commandResult.stderr, executionSessionId);
        }

        return {
          success,
          filePath: normalizedPath,
          exitCode: commandResult.exitCode,
          stdout: commandResult.stdout,
          stderr: commandResult.stderr,
          message: success ? `File ${normalizedPath} written successfully` : `Failed to write ${normalizedPath}`
        };
      } catch (error) {
        await handleCommandError(projectId, `Write file: ${normalizeFilePath(filePath)}`, (error as Error).message, executionSessionId);
        return {
          success: false,
          error: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  });
}

/**
 * Creates a tool registry for agent operations.
 * Centralizes all tools used across different agent APIs.
 * When mode is "cloud", writeFile and executeCommand run in the server workspace (Docker/project dir); otherwise they use the sync client.
 */
export function createAgentTools(
  projectId: string,
  executionSessionId?: string,
  mode?: "local" | "cloud"
) {
  const useCloud = mode === "cloud";
  return {
    searchKnowledge: createSearchKnowledgeTool(projectId),
    webSearch,
    readFile: createReadFileTool(projectId),
    executeCommand: useCloud
      ? createCloudExecuteCommandTool(projectId, executionSessionId)
      : createExecuteCommandTool(projectId, executionSessionId),
    writeFile: useCloud
      ? createCloudWriteFileTool(projectId)
      : createWriteFileTool(projectId, executionSessionId),
    findRelatedFiles: createFindRelatedFilesTool(),
  };
}
