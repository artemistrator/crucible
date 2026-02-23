-- Rename AgentRole enum value FRONTEND to TASK_EXECUTOR (PostgreSQL requires new type + migrate)
CREATE TYPE "AgentRole_new" AS ENUM ('TASK_EXECUTOR', 'BACKEND', 'DEVOPS', 'TEAMLEAD', 'CURSOR', 'QA');

ALTER TABLE "Task" ALTER COLUMN "executorAgent" TYPE "AgentRole_new" USING (
  CASE WHEN "executorAgent"::text = 'FRONTEND' THEN 'TASK_EXECUTOR'::"AgentRole_new"
  ELSE "executorAgent"::text::"AgentRole_new" END
);
-- observerAgent has DEFAULT TEAMLEAD: drop default before type change, then restore
ALTER TABLE "Task" ALTER COLUMN "observerAgent" DROP DEFAULT;
ALTER TABLE "Task" ALTER COLUMN "observerAgent" TYPE "AgentRole_new" USING (
  CASE WHEN "observerAgent"::text = 'FRONTEND' THEN 'TASK_EXECUTOR'::"AgentRole_new"
  ELSE "observerAgent"::text::"AgentRole_new" END
);
ALTER TABLE "Task" ALTER COLUMN "observerAgent" SET DEFAULT 'TEAMLEAD'::"AgentRole_new";

ALTER TABLE "Comment" ALTER COLUMN "authorRole" TYPE "AgentRole_new" USING (
  CASE WHEN "authorRole"::text = 'FRONTEND' THEN 'TASK_EXECUTOR'::"AgentRole_new"
  ELSE "authorRole"::text::"AgentRole_new" END
);

ALTER TABLE "AgentMessage" ALTER COLUMN "sourceAgent" TYPE "AgentRole_new" USING (
  CASE WHEN "sourceAgent"::text = 'FRONTEND' THEN 'TASK_EXECUTOR'::"AgentRole_new"
  ELSE "sourceAgent"::text::"AgentRole_new" END
);
ALTER TABLE "AgentMessage" ALTER COLUMN "targetAgent" TYPE "AgentRole_new" USING (
  CASE WHEN "targetAgent"::text = 'FRONTEND' THEN 'TASK_EXECUTOR'::"AgentRole_new"
  ELSE "targetAgent"::text::"AgentRole_new" END
);

DROP TYPE "AgentRole";
ALTER TYPE "AgentRole_new" RENAME TO "AgentRole";
