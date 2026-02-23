import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import SmartBreadcrumb from "@/components/SmartBreadcrumb";
import ProjectPageView from "@/components/ProjectPageView";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view } = await searchParams;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      plans: {
        include: { tasks: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!project) {
    notFound();
  }

  const plansForView = project.plans.map((p) => {
    const prosCons = p.prosCons as { pros?: string[]; cons?: string[] } | null;
    return {
      id: p.id,
      title: p.title,
      description: p.description,
      techStack: p.techStack,
      relevanceScore: p.relevanceScore,
      selected: p.selected,
      estimatedComplexity: p.estimatedComplexity,
      estimatedTime: p.estimatedTime,
      pros: prosCons?.pros ?? [],
      cons: prosCons?.cons ?? [],
      tasks: p.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        status: t.status,
        executorAgent: t.executorAgent,
      })),
    };
  });

  const initialView = view === "tasks" ? "tasks" : "plans";

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      <SmartBreadcrumb projectId={id} />
      <ProjectPageView
        projectId={project.id}
        ideaText={project.ideaText}
        status={project.status}
        context={project.context ?? ""}
        githubRepo={project.githubRepo}
        requireApproval={project.requireApproval ?? false}
        plans={plansForView}
        initialView={initialView}
      />
    </div>
  );
}
