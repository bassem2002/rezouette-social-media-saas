-- AlterEnum
ALTER TYPE "SocialPostPlatform" ADD VALUE 'TIKTOK';

-- AlterTable
ALTER TABLE "social_posts" ADD COLUMN     "publishId" TEXT;
