-- AlterTable
ALTER TABLE "social_accounts" ADD COLUMN     "lastRefreshAt" TIMESTAMP(3),
ADD COLUMN     "needsReconnect" BOOLEAN NOT NULL DEFAULT false;
