-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "auditRetentionDays" INTEGER NOT NULL DEFAULT 365;
