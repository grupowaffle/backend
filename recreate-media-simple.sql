-- Drop existing table if exists
DROP TABLE IF EXISTS media_files CASCADE;

-- Create simplified media_files table (apenas metadados)
CREATE TABLE media_files (
    id TEXT PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "r2Key" TEXT NOT NULL UNIQUE,
    "internalUrl" TEXT NOT NULL,
    module TEXT NOT NULL DEFAULT 'general',
    "uploadedBy" TEXT,
    description TEXT,
    tags JSON DEFAULT '[]',
    metadata JSON DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create essential indexes
CREATE INDEX IF NOT EXISTS media_files_r2_key_idx ON media_files("r2Key");
CREATE INDEX IF NOT EXISTS media_files_module_idx ON media_files(module);
CREATE INDEX IF NOT EXISTS media_files_uploaded_by_idx ON media_files("uploadedBy");
CREATE INDEX IF NOT EXISTS media_files_created_at_idx ON media_files("createdAt");
CREATE INDEX IF NOT EXISTS media_files_is_active_idx ON media_files("isActive");