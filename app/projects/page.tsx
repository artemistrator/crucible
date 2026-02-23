import Link from "next/link";
import { ArrowLeft, Lightbulb, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import SmartBreadcrumb from "@/components/SmartBreadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyIdButton } from "@/components/CopyIdButton";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
} from "@/components/ui/tooltip";

async function getProjects() {
  return await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      plans: {
        select: { id: true },
        include: {
          tasks: {
            select: { id: true, status: true },
          },
        },
      },
    },
  });
}

export default async function ProjectsPage() {
  const projects = await getProjects();

  function truncateText(text: string, maxLength: number) {
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}...`;
  }

function getStatusBadge(status: string) {
  switch (status) {
    case "IN_PROGRESS":
      return <Badge variant="default">In Progress</Badge>;
    case "COMPLETED":
      return <Badge className="bg-green-500 hover:bg-green-600">Completed</Badge>;
    case "ARCHIVED":
      return <Badge variant="secondary">Archived</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

type ProjectWithTasks = NonNullable<Awaited<ReturnType<typeof getProjects>>>[number];

function ProjectTooltipContent({ project }: { project: ProjectWithTasks }) {
  const allTasks = project.plans.flatMap((plan) => plan.tasks);
  const completedTasks = allTasks.filter((task) => task.status === "DONE").length;
  const progress = allTasks.length > 0 ? Math.round((completedTasks / allTasks.length) * 100) : 0;
  const createdDate = project.createdAt
    ? new Date(project.createdAt).toLocaleDateString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "N/A";

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-500 dark:text-slate-400">
          Прогресс:
        </span>
        <span className="font-semibold text-slate-900 dark:text-slate-50">
          {progress}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-blue-500 dark:bg-blue-400"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-500 dark:text-slate-400">
          Дата создания:
        </span>
        <span className="font-semibold text-slate-900 dark:text-slate-50">
          {createdDate}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-slate-500 dark:text-slate-400">
          Задач:
        </span>
        <span className="font-semibold text-slate-900 dark:text-slate-50">
          {completedTasks}/{allTasks.length}
        </span>
      </div>
    </div>
  );
}

  return (
    <div className="flex flex-col">
      <SmartBreadcrumb />
      <div className="w-full p-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-slate-900 dark:text-slate-50">Projects</h1>
          <Button variant="outline" asChild>
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Link>
          </Button>
        </div>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="mb-6 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 p-6 dark:from-slate-800 dark:to-slate-900">
              <Lightbulb className="h-12 w-12 text-blue-600 dark:text-blue-300" />
            </div>
            <h2 className="mb-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">
              No projects yet
            </h2>
            <p className="mb-6 max-w-md text-center text-slate-600 dark:text-slate-400">
              Start by creating a new idea and we&apos;ll help you turn it into a development plan.
            </p>
            <Button size="lg" className="gap-2 bg-slate-900 hover:bg-slate-800" asChild>
              <Link href="/">
                <Plus className="h-5 w-5" />
                Create First Idea
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Tooltip
                key={project.id}
                content={<ProjectTooltipContent project={project} />}
                side="bottom"
                align="center"
              >
                <Link href={`/project/${project.id}`}>
                  <Card className="h-full transition hover:border-slate-300 hover:shadow-md">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="line-clamp-2 flex-1">{truncateText(project.ideaText, 60)}</CardTitle>
                        {getStatusBadge(project.status)}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between text-sm text-slate-500">
                        <span>{(project.plans?.length ?? 0)} {(project.plans?.length ?? 0) === 1 ? 'plan' : 'plans'}</span>
                        <span>{project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'N/A'}</span>
                      </div>
                      <CopyIdButton id={project.id} label="Project ID" />
                    </CardContent>
                  </Card>
                </Link>
              </Tooltip>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
