-- CreateEnum
CREATE TYPE "SocialPostPlatform" AS ENUM ('FACEBOOK', 'INSTAGRAM');

-- CreateEnum
CREATE TYPE "SocialPostStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "social_posts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "platform" "SocialPostPlatform" NOT NULL,
    "accountId" TEXT,
    "externalPostId" TEXT,
    "caption" TEXT,
    "mediaUrl" TEXT,
    "status" "SocialPostStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "social_posts_userId_idx" ON "social_posts"("userId");

-- CreateIndex
CREATE INDEX "social_posts_platform_status_idx" ON "social_posts"("platform", "status");

-- CreateIndex
CREATE INDEX "social_posts_externalPostId_idx" ON "social_posts"("externalPostId");

-- AddForeignKey
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
