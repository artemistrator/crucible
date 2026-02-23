import React from "react";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { prisma } from "@/lib/prisma";

interface SmartBreadcrumbProps {
  projectId?: string;
  planId?: string;
}

async function SmartBreadcrumb({ projectId, planId }: SmartBreadcrumbProps) {
  const segments: { label: string; href?: string }[] = [
    { label: "Home", href: "/" },
  ];

  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { ideaText: true },
    });

    if (project) {
      const projectName = project.ideaText.length > 30
        ? `${project.ideaText.slice(0, 30)}...`
        : project.ideaText;
      
      segments.push({
        label: projectName,
        href: `/project/${projectId}`,
      });
    }
  }

  if (planId) {
    const plan = await prisma.plan.findUnique({
      where: { id: planId },
      select: { title: true },
    });

    if (plan) {
      segments.push({
        label: plan.title,
      });
    }
  }

  return (
    <div className="border-b border-slate-100 bg-slate-50/80 px-6 py-3 dark:border-slate-800 dark:bg-slate-900/70">
      <Breadcrumb>
        <BreadcrumbList className="text-slate-500 dark:text-slate-400">
          {segments.map((segment, index) => (
            <React.Fragment key={index}>
              {index > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {segment.href ? (
                  <BreadcrumbLink asChild>
                    <Link href={segment.href}>{segment.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{segment.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}

export default SmartBreadcrumb;
