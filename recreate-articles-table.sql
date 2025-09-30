-- Drop existing table if exists
DROP TABLE IF EXISTS articles CASCADE;

-- Create articles table with all required fields
CREATE TABLE articles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    content JSON,
    excerpt TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP WITH TIME ZONE,
    "scheduledFor" TIMESTAMP WITH TIME ZONE,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "seoKeywords" JSON,
    "categoryId" TEXT,
    tags JSON,
    source TEXT NOT NULL DEFAULT 'manual',
    "sourceId" TEXT,
    "sourceUrl" TEXT,
    newsletter TEXT,
    "isFeatured" BOOLEAN DEFAULT false,
    "featuredPosition" INTEGER,
    "featuredUntil" TIMESTAMP WITH TIME ZONE,
    "featuredCategory" TEXT,
    "featuredBy" TEXT,
    "featuredAt" TIMESTAMP WITH TIME ZONE,
    "featuredImageId" TEXT,
    "featuredImage" TEXT,
    "galleryIds" JSON,
    "authorId" TEXT,
    "editorId" TEXT,
    views INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add foreign key constraints if categories table exists
-- ALTER TABLE articles ADD CONSTRAINT articles_categoryId_categories_id_fk
--     FOREIGN KEY ("categoryId") REFERENCES categories(id) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source);
CREATE INDEX IF NOT EXISTS idx_articles_publishedAt ON articles("publishedAt");
CREATE INDEX IF NOT EXISTS idx_articles_categoryId ON articles("categoryId");
CREATE INDEX IF NOT EXISTS idx_articles_authorId ON articles("authorId");
CREATE INDEX IF NOT EXISTS idx_articles_isFeatured ON articles("isFeatured");
CREATE INDEX IF NOT EXISTS idx_articles_createdAt ON articles("createdAt");
CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);