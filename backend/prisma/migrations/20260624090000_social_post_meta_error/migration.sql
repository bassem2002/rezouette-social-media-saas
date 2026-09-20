-- AlterTable
ALTER TABLE "social_posts" ADD COLUMN     "metaCode" INTEGER,
ADD COLUMN     "metaSubcode" INTEGER,
ADD COLUMN     "metaReason" TEXT,
ADD COLUMN     "retryable" BOOLEAN;
