import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TaskStatus } from "@prisma/client";

/**
 * MCP JSON-RPC Endpoint for Tool Execution
 * Handles POST requests only (GET goes to /sse)
 */

const VALID_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];

async function handleToolCall(name: string, args: Record<string, any>) {
  console.log("[MCP MESSAGES] Executing:", name, "with args:", args);
  
  switch (name) {
    case "get_my_tasks": {
      const { projectId } = args;
      if (!projectId || typeof projectId !== "string") {
        throw new Error("get_my_tasks requires projectId parameter");
      }
      const tasks = await prisma.task.findMany({
        where: { plan: { projectId } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          executorAgent: true,
          observerAgent: true,
          generatedPrompt: true,
          planId: true,
          branchName: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      console.log("[MCP MESSAGES] get_my_tasks: returning", tasks.length, "tasks");
      return tasks;
    }

    case "read_task": {
      const { taskId } = args;
      if (!taskId || typeof taskId !== "string") {
        throw new Error("read_task requires taskId parameter");
      }
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          plan: {
            select: {
              id: true,
              title: true,
              projectId: true,
              techStack: true,
            },
          },
          dependencies: {
            include: {
              dependsOn: {
                select: { id: true, title: true, status: true },
              },
            },
          },
        },
      });
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }
      console.log("[MCP MESSAGES] read_task: returning task");
      return task;
    }

    case "update_task_status": {
      const { taskId, status } = args;
      if (!taskId || typeof taskId !== "string") {
        throw new Error("update_task_status requires taskId parameter");
      }
      if (!status || typeof status !== "string" || !VALID_STATUSES.includes(status as TaskStatus)) {
        throw new Error(`update_task_status requires valid status: ${VALID_STATUSES.join(", ")}`);
      }
      const updated = await prisma.task.update({
        where: { id: taskId },
        data: { status: status as TaskStatus },
        include: {
          dependencies: {
            include: {
              dependsOn: {
                select: { id: true, title: true, status: true },
              },
            },
          },
        },
      });
      console.log("[MCP MESSAGES] update_task_status: updated task", taskId, "to", status);
      return updated;
    }

    default:
      throw new Error(`Unknown tool: ${name}. Available: get_my_tasks, read_task, update_task_status`);
  }
}

export async function POST(request: Request) {
  console.log("[MCP MESSAGES] Incoming POST request");
  console.log("[MCP MESSAGES] URL:", request.url);
  
  try {
    const body = await request.json();
    const { jsonrpc, id, method, params } = body;
    
    console.log("[MCP MESSAGES] Request body:", { jsonrpc, id, method });
    
    if (jsonrpc !== "2.0") {
      console.error("[MCP MESSAGES] Invalid JSON-RPC version:", jsonrpc);
      return NextResponse.json(
        { jsonrpc: "2.0", error: { code: -32600, message: "Invalid Request" }, id },
        { 
          status: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          }
        }
      );
    }

    if (method === "tools/call") {
      const { name, arguments: args } = params;
      console.log("[MCP MESSAGES] Tool call:", name, args);
      try {
        const result = await handleToolCall(name, args);
        console.log("[MCP MESSAGES] Tool result:", result);
        return NextResponse.json(
          { jsonrpc: "2.0", result, id },
          {
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization",
            }
          }
        );
      } catch (error) {
        console.error("[MCP MESSAGES] Tool execution error:", error);
        return NextResponse.json(
          {
            jsonrpc: "2.0",
            error: {
              code: -32602,
              message: "Invalid params or tool execution failed",
              data: error instanceof Error ? error.message : String(error)
            },
            id
          },
          {
            status: 400,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization",
            }
          }
        );
      }
    }

    console.error("[MCP MESSAGES] Unknown method:", method);
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32601, message: "Method not found" }, id },
      {
        status: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        }
      }
    );
  } catch (error) {
    console.error("[MCP MESSAGES] Internal error:", error);
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal error",
          data: error instanceof Error ? error.message : String(error)
        },
        id: null
      },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        }
      }
    );
  }
}

export async function OPTIONS(request: Request) {
  console.log("[MCP MESSAGES] Incoming OPTIONS request");
  console.log("[MCP MESSAGES] URL:", request.url);
  
  return new Response(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Max-Age": "86400",
    },
  });
}
