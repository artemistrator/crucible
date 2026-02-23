import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TaskStatus } from "@prisma/client";

/**
 * MCP SSE Endpoint for Tool Discovery and Tool Execution
 * Handles GET (SSE), POST (JSON-RPC), and OPTIONS (CORS)
 */

const VALID_STATUSES: TaskStatus[] = ["TODO", "IN_PROGRESS", "REVIEW", "DONE"];

function formatSSE(event: string, data: unknown): string {
  const payload = typeof data === "string" ? data : JSON.stringify(data);
  return `event: ${event}\ndata: ${payload}\n\n`;
}

async function handleToolCall(name: string, args: Record<string, any>) {
  console.log("[MCP SSE] Tool call:", name, "with args:", args);
  
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
      console.log("[MCP SSE] get_my_tasks: returning", tasks.length, "tasks");
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
      console.log("[MSE SSE] read_task: returning task");
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
      console.log("[MCP SSE] update_task_status: updated task", taskId, "to", status);
      return updated;
    }

    default:
      throw new Error(`Unknown tool: ${name}. Available: get_my_tasks, read_task, update_task_status`);
  }
}

export async function GET(request: NextRequest) {
  console.log("[MCP SSE] Incoming GET request");
  
  const endpointUrl = "http://192.168.2.5:3000/api/mcp/messages";
  
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let heartbeatInterval: NodeJS.Timeout;
      
      try {
        // 1. MCP Protocol Handshake
        const handshake = {
          jsonrpc: "2.0",
          method: "notifications/initialized",
          params: {
            protocol: "mcp",
            version: "2024-11-05",
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: "ai-orchestrator",
              version: "1.0.0",
            },
          },
        };
        controller.enqueue(encoder.encode(formatSSE("message", handshake)));
        console.log("[MCP SSE] Sent handshake");

        // 2. Send endpoint URL for POST requests (goes to /messages)
        controller.enqueue(encoder.encode(formatSSE("endpoint", endpointUrl)));
        console.log("[MCP SSE] Sent endpoint URL:", endpointUrl, "(dynamic)");

        // 3. Send tools/list (MCP standard)
        const toolsList = {
          jsonrpc: "2.0",
          method: "tools/list",
          result: {
            tools: [
              {
                name: "get_my_tasks",
                description: "Get list of tasks for a project with their status and generated prompts",
                inputSchema: {
                  type: "object",
                  properties: {
                    projectId: {
                      type: "string",
                      description: "The project ID to fetch tasks for"
                    }
                  },
                  required: ["projectId"]
                }
              },
              {
                name: "read_task",
                description: "Read detailed task information including title, description, status, and generated AI prompt",
                inputSchema: {
                  type: "object",
                  properties: {
                    taskId: {
                      type: "string",
                      description: "The task ID to read details for"
                    }
                  },
                  required: ["taskId"]
                }
              },
              {
                name: "update_task_status",
                description: "Update task status. Valid statuses: TODO, IN_PROGRESS, REVIEW, DONE",
                inputSchema: {
                  type: "object",
                  properties: {
                    taskId: {
                      type: "string",
                      description: "The task ID to update"
                    },
                    status: {
                      type: "string",
                      enum: ["TODO", "IN_PROGRESS", "REVIEW", "DONE"],
                      description: "New status for task"
                    }
                  },
                  required: ["taskId", "status"]
                }
              }
            ]
          }
        };
        controller.enqueue(encoder.encode(formatSSE("tools/list", toolsList)));
        console.log("[MCP SSE] Sent tools/list");

        // 4. Keep connection alive with heartbeat (30 seconds)
        heartbeatInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(formatSSE("ping", {})));
          } catch (error) {
            console.log("[MCP SSE] Heartbeat error:", error);
            clearInterval(heartbeatInterval);
          }
        }, 30000);
      } catch (error) {
        console.error("[MCP SSE] Initialization error:", error);
        controller.enqueue(
          encoder.encode(
            formatSSE("error", {
              jsonrpc: "2.0",
              error: {
                code: -32603,
                message: "Internal server error",
                data: error instanceof Error ? error.message : String(error)
              }
            })
          )
        );
        controller.close();
      }

      // Cleanup function for when stream closes
      return () => {
        console.log("[MCP SSE] Stream closed");
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
        }
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function POST(request: NextRequest) {
  console.log("[MCP SSE] Incoming POST request");
  console.log("[MCP SSE] URL:", request.url);
  
  try {
    const body = await request.json();
    const { jsonrpc, id, method, params } = body;
    
    console.log("[MCP SSE] Request body:", JSON.stringify(body, null, 2));
    
    if (jsonrpc !== "2.0") {
      console.error("[MCP SSE] Invalid JSON-RPC version:", jsonrpc);
      return NextResponse.json(
        { jsonrpc: "2.0", error: { code: -32600, message: "Invalid Request" }, id },
        { 
          status: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          }
        }
      );
    }

    if (method === "tools/call") {
      const { name, arguments: args } = params;
      console.log("[MCP SSE] Tool call:", name, args);
      try {
        const result = await handleToolCall(name, args);
        console.log("[MCP SSE] Tool result:", result);
        return NextResponse.json(
          { jsonrpc: "2.0", result, id },
          {
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
            }
          }
        );
      } catch (error) {
        console.error("[MCP SSE] Tool execution error:", error);
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
              "Access-Control-Allow-Headers": "Content-Type",
            }
          }
        );
      }
    }

    console.error("[MCP SSE] Unknown method:", method);
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32601, message: "Method not found" }, id },
      {
        status: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      }
    );
  } catch (error) {
    console.error("[M SSE] Internal error:", error);
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
          "Access-Control-Allow-Methods": " GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        }
      }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  console.log("[MCP SSE] Incoming OPTIONS request");
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
