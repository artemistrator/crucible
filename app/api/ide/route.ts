import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateTaskPrompt } from '@/lib/agents/prompt-generator';
import { replanTasks, quickReview } from '@/lib/agents/architect';
import { verifyTaskCompletion } from '@/lib/agents/qa';

export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const action = searchParams.get('action');

  try {
    if (action === 'list_tasks') {
      const projectId = searchParams.get('projectId');
      if (!projectId) {
        return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
      }
      const tasks = await prisma.task.findMany({
        where: { plan: { projectId } },
        orderBy: { createdAt: 'asc' },
      });
      return NextResponse.json({ tasks });
    }

    if (action === 'read_task') {
      const taskId = searchParams.get('taskId');
      if (!taskId) {
        return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
      }
      const task = await prisma.task.findUnique({
        where: { id: taskId },
      });
      if (!task) {
        return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      }
      return NextResponse.json({ task });
    }

    if (action === 'get_next_task') {
      const projectId = searchParams.get('projectId');
      if (!projectId) {
        return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
      }

      const tasks = await prisma.task.findMany({
        where: {
          plan: { projectId },
          status: 'TODO'
        },
        include: {
          dependencies: {
            include: {
              dependsOn: {
                select: { id: true, status: true }
              }
            }
          }
        },
        orderBy: { createdAt: 'asc' }
      });

      const availableTasks = tasks.filter(task => {
        const deps = task.dependencies ?? [];
        if (deps.length === 0) return true;
        return deps.every(dep => dep.dependsOn.status === 'DONE');
      });

      const nextTask = availableTasks[0] ?? null;

      return NextResponse.json({ task: nextTask });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error(`[API/IDE] Error in GET`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, taskId, status } = body;

    if (action === 'update_task_status') {
      if (!taskId || !status) {
        return NextResponse.json({ error: 'taskId and status are required' }, { status: 400 });
      }

      if (status === 'DONE') {
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          include: {
            comments: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            plan: {
              include: {
                project: { select: { id: true } },
              },
            },
          },
        });

        if (!task) {
          return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }

        const lastComment = task.comments[0];
        const reportContent = lastComment?.content || 'Отсутствует отчет о выполнении';

        const qaResult = await verifyTaskCompletion(taskId, reportContent);

        if (process.env.NODE_ENV !== 'production') {
          console.log('[QA Agent]', qaResult);
        }

        if (qaResult.status === 'APPROVED') {
          const task = await prisma.task.findUnique({
            where: { id: taskId },
            include: {
              plan: {
                include: {
                  project: { select: { id: true, requireApproval: true } },
                },
              },
            },
          });

          if (!task) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 });
          }

          if (task.plan?.project?.requireApproval && task.status === 'WAITING_APPROVAL') {
            return NextResponse.json({
              success: true,
              task,
              qaApproved: true,
              qaReasoning: qaResult.reasoning,
              message: 'Задача одобрена QA агентом. Ожидает подтверждения человека.',
            });
          }

          if (task.plan?.project?.id && task.status === 'DONE') {
            try {
              // First: Quick Review of next 2 tasks (lightweight)
              const quickReviewResult = await quickReview(task.plan.project.id, taskId);
              if (process.env.NODE_ENV !== 'production' && quickReviewResult.needsUpdates) {
                console.log('[Quick Review]', quickReviewResult);
              }

              // Then: Full Replan of all pending tasks
              const replanResult = await replanTasks(task.plan.project.id, taskId);
              if (process.env.NODE_ENV !== 'production' && replanResult.needsReplan) {
                console.log('[Dynamic Replanning]', replanResult);
              }
            } catch (error) {
              if (process.env.NODE_ENV !== 'production') {
                console.error('[Dynamic Replanning] Error:', error);
              }
            }
          }

          return NextResponse.json({
            success: true,
            task,
            qaApproved: true,
            qaReasoning: qaResult.reasoning,
          });
        } else {
          // verifyTaskCompletion уже обновил статус задачи (finalStatus: REVIEW/WAITING_APPROVAL/DONE)
          const rejectedTask = await prisma.task.findUnique({
            where: { id: taskId },
          });

          await prisma.comment.create({
            data: {
              taskId,
              content: `❌ QA ОТКЛОНЕНИЕ\n\n${qaResult.reasoning}\n\nУверенность: ${(qaResult.confidence * 100).toFixed(0)}%\n\nПожалуйста, предоставьте более детальный отчет с доказательствами (логи тестов, результаты сборки, скриншоты).`,
              authorRole: 'TEAMLEAD',
            },
          });

          return NextResponse.json({
            success: false,
            task: rejectedTask,
            qaApproved: false,
            qaReasoning: qaResult.reasoning,
            debugSummary: qaResult.debugSummary,
            message: 'Задача отклонена QA агентом. Требуется доработка.',
          }, { status: 400 });
        }
      }

      const updatedTask = await prisma.task.update({
        where: { id: taskId },
        data: { status },
      });

      return NextResponse.json({ success: true, task: updatedTask });
    }

    if (action === 'generate_prompt') {
      const taskId = body.taskId;
      if (!taskId || typeof taskId !== 'string') {
        return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
      }

      const prompt = await generateTaskPrompt(taskId);

      return NextResponse.json({ success: true, prompt });
    }

    if (action === 'add_comment') {
      const { taskId, content, role = 'DEVOPS' } = body;
      if (!taskId || typeof taskId !== 'string' || !content || typeof content !== 'string') {
        return NextResponse.json({ error: 'taskId and content are required' }, { status: 400 });
      }

      const comment = await prisma.comment.create({
        data: {
          taskId,
          content,
          authorRole: role
        }
      });

      return NextResponse.json({ comment });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error(`[API/IDE] Error in POST`, error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
