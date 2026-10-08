-- Blog / CMS tables (BlogPost, BlogCategory, BlogTag, BlogPostTag, BlogAuthor,
-- BlogPostRevision, BlogComment, BlogViewEvent, BlogRedirect, BlogSetting).
-- These models shipped in schema.prisma without a migration, so any database built
-- only from migrations (CI, fresh environments) had no blog tables.
-- Purely additive and idempotent (IF NOT EXISTS / duplicate_object guards), so it is
-- safe where the tables were already created by a schema push.

CREATE TABLE IF NOT EXISTS "public"."BlogPost" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "subtitle" TEXT,
    "excerpt" TEXT,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "featuredImage" TEXT,
    "featuredImageAlt" TEXT,
    "featuredImageCaption" TEXT,
    "readMins" INTEGER NOT NULL DEFAULT 3,
    "publishedAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "authorId" TEXT,
    "categoryId" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "focusKeyword" TEXT,
    "secondaryKeywords" TEXT,
    "canonicalUrl" TEXT,
    "robotsDirectives" TEXT DEFAULT 'index, follow',
    "ogTitle" TEXT,
    "ogDescription" TEXT,
    "ogImage" TEXT,
    "twitterTitle" TEXT,
    "twitterDescription" TEXT,
    "twitterImage" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "allowComments" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "relatedPostIds" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."BlogCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "featuredImage" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "canonicalUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."BlogTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."BlogPostTag" (
    "postId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogPostTag_pkey" PRIMARY KEY ("postId","tagId")
);

CREATE TABLE IF NOT EXISTS "public"."BlogAuthor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "email" TEXT,
    "avatar" TEXT,
    "bio" TEXT,
    "role" TEXT DEFAULT 'Author',
    "socialLinks" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogAuthor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."BlogPostRevision" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "excerpt" TEXT,
    "authorName" TEXT,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogPostRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."BlogComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."BlogViewEvent" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referrer" TEXT,
    "device" TEXT,
    "country" TEXT,
    "durationSeconds" INTEGER DEFAULT 0,

    CONSTRAINT "BlogViewEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."BlogRedirect" (
    "id" TEXT NOT NULL,
    "fromSlug" TEXT NOT NULL,
    "toSlug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogRedirect_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."BlogSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BlogPost_slug_key" ON "public"."BlogPost"("slug");

CREATE INDEX IF NOT EXISTS "BlogPost_status_publishedAt_idx" ON "public"."BlogPost"("status", "publishedAt");

CREATE INDEX IF NOT EXISTS "BlogPost_categoryId_idx" ON "public"."BlogPost"("categoryId");

CREATE INDEX IF NOT EXISTS "BlogPost_authorId_idx" ON "public"."BlogPost"("authorId");

CREATE INDEX IF NOT EXISTS "BlogPost_deletedAt_idx" ON "public"."BlogPost"("deletedAt");

CREATE INDEX IF NOT EXISTS "BlogPost_createdAt_idx" ON "public"."BlogPost"("createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "BlogCategory_slug_key" ON "public"."BlogCategory"("slug");

CREATE INDEX IF NOT EXISTS "BlogCategory_slug_idx" ON "public"."BlogCategory"("slug");

CREATE INDEX IF NOT EXISTS "BlogCategory_parentId_idx" ON "public"."BlogCategory"("parentId");

CREATE UNIQUE INDEX IF NOT EXISTS "BlogTag_slug_key" ON "public"."BlogTag"("slug");

CREATE INDEX IF NOT EXISTS "BlogTag_slug_idx" ON "public"."BlogTag"("slug");

CREATE INDEX IF NOT EXISTS "BlogPostTag_tagId_idx" ON "public"."BlogPostTag"("tagId");

CREATE INDEX IF NOT EXISTS "BlogPostTag_postId_idx" ON "public"."BlogPostTag"("postId");

CREATE UNIQUE INDEX IF NOT EXISTS "BlogAuthor_slug_key" ON "public"."BlogAuthor"("slug");

CREATE UNIQUE INDEX IF NOT EXISTS "BlogAuthor_userId_key" ON "public"."BlogAuthor"("userId");

CREATE INDEX IF NOT EXISTS "BlogAuthor_slug_idx" ON "public"."BlogAuthor"("slug");

CREATE INDEX IF NOT EXISTS "BlogPostRevision_postId_createdAt_idx" ON "public"."BlogPostRevision"("postId", "createdAt");

CREATE INDEX IF NOT EXISTS "BlogComment_postId_status_idx" ON "public"."BlogComment"("postId", "status");

CREATE INDEX IF NOT EXISTS "BlogComment_status_idx" ON "public"."BlogComment"("status");

CREATE INDEX IF NOT EXISTS "BlogViewEvent_postId_viewedAt_idx" ON "public"."BlogViewEvent"("postId", "viewedAt");

CREATE INDEX IF NOT EXISTS "BlogViewEvent_viewedAt_idx" ON "public"."BlogViewEvent"("viewedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "BlogRedirect_fromSlug_key" ON "public"."BlogRedirect"("fromSlug");

CREATE INDEX IF NOT EXISTS "BlogRedirect_fromSlug_idx" ON "public"."BlogRedirect"("fromSlug");

CREATE UNIQUE INDEX IF NOT EXISTS "BlogSetting_key_key" ON "public"."BlogSetting"("key");

DO $$ BEGIN
  ALTER TABLE "public"."BlogPost" ADD CONSTRAINT "BlogPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."BlogAuthor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "public"."BlogPost" ADD CONSTRAINT "BlogPost_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."BlogCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "public"."BlogCategory" ADD CONSTRAINT "BlogCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."BlogCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "public"."BlogPostTag" ADD CONSTRAINT "BlogPostTag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "public"."BlogPostTag" ADD CONSTRAINT "BlogPostTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."BlogTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "public"."BlogPostRevision" ADD CONSTRAINT "BlogPostRevision_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "public"."BlogComment" ADD CONSTRAINT "BlogComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "public"."BlogViewEvent" ADD CONSTRAINT "BlogViewEvent_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
