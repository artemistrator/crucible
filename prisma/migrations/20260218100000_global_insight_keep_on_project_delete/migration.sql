-- AlterTable: GlobalInsight.projectId FK: keep insights when project is deleted (SET NULL instead of CASCADE)
ALTER TABLE "GlobalInsight" DROP CONSTRAINT IF EXISTS "GlobalInsight_projectId_fkey";
ALTER TABLE "GlobalInsight" ADD CONSTRAINT "GlobalInsight_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
