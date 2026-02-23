import { notFound } from "next/navigation";

import PlanPageClient from "@/components/PlanPageClient";
import { prisma } from "@/lib/prisma";

export default async function PlanTasksPage({
  params,
}: {
  params: Promise<{ id: string; planId: string }>;
}) {
  const { id, planId } = await params;
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: {
      tasks: {
        include: {
          dependencies: {
            include: {
              dependsOn: {
                select: { id: true, title: true, status: true },
              },
            },
          },
        },
      },
      project: true,
    },
  });

  if (!plan || plan.projectId !== id || !plan.project) {
    notFound();
  }

  const tasks = [...plan.tasks]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      executorAgent: task.executorAgent,
      observerAgent: task.observerAgent,
      generatedPrompt: task.generatedPrompt,
      branchName: task.branchName,
      dependencies: (task.dependencies ?? []).map((d) => ({
        id: d.dependsOn.id,
        title: d.dependsOn.title,
        status: d.dependsOn.status,
      })),
    }));

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <PlanPageClient
        projectId={id}
        planId={planId}
        tasks={tasks}
        aiProvider={plan.project?.aiProvider ?? null}
        aiModel={plan.project?.aiModel ?? null}
      />
    </div>
  );
}
