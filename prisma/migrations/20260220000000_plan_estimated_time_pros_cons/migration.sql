-- AlterTable: Plan: add estimatedTime and prosCons for richer plan cards
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "estimatedTime" VARCHAR(80);
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "prosCons" JSONB;
