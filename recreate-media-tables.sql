-- Drop existing tables if exist
DROP TABLE IF EXISTS media_processing_jobs CASCADE;
DROP TABLE IF EXISTS media_usage CASCADE;
DROP TABLE IF EXISTS image_variants CASCADE;
DROP TABLE IF EXISTS media_files CASCADE;

-- Create media_files table with all required fields
CREATE TABLE media_files (
    id TEXT PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "r2Key" TEXT NOT NULL UNIQUE,
    "r2Url" TEXT NOT NULL,
    "internalUrl" TEXT NOT NULL,
    module TEXT NOT NULL,
    "entityId" TEXT,
    "uploadedBy" TEXT,
    description TEXT,
    alt TEXT,
    tags JSON,
    metadata JSON,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create image_variants table
CREATE TABLE image_variants (
    id TEXT PRIMARY KEY,
    "mediaFileId" TEXT NOT NULL,
    variant TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    "fileSize" INTEGER,
    "r2Key" TEXT NOT NULL,
    "r2Url" TEXT NOT NULL,
    "internalUrl" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create media_usage table
CREATE TABLE media_usage (
    id TEXT PRIMARY KEY,
    "mediaFileId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    usage TEXT NOT NULL,
    position INTEGER,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create media_processing_jobs table
CREATE TABLE media_processing_jobs (
    id TEXT PRIMARY KEY,
    "mediaFileId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    parameters JSON,
    result JSON,
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "scheduledFor" TIMESTAMP WITH TIME ZONE,
    "startedAt" TIMESTAMP WITH TIME ZONE,
    "completedAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS media_files_r2_key_idx ON media_files("r2Key");
CREATE INDEX IF NOT EXISTS media_files_module_idx ON media_files(module);
CREATE INDEX IF NOT EXISTS media_files_entity_id_idx ON media_files("entityId");
CREATE INDEX IF NOT EXISTS media_files_uploaded_by_idx ON media_files("uploadedBy");
CREATE INDEX IF NOT EXISTS media_files_created_at_idx ON media_files("createdAt");
CREATE INDEX IF NOT EXISTS media_files_is_active_idx ON media_files("isActive");

CREATE INDEX IF NOT EXISTS image_variants_media_file_id_idx ON image_variants("mediaFileId");
CREATE INDEX IF NOT EXISTS image_variants_variant_idx ON image_variants(variant);

CREATE INDEX IF NOT EXISTS media_usage_media_file_id_idx ON media_usage("mediaFileId");
CREATE INDEX IF NOT EXISTS media_usage_entity_idx ON media_usage("entityType", "entityId");
CREATE INDEX IF NOT EXISTS media_usage_usage_idx ON media_usage(usage);

CREATE INDEX IF NOT EXISTS media_processing_jobs_media_file_id_idx ON media_processing_jobs("mediaFileId");
CREATE INDEX IF NOT EXISTS media_processing_jobs_status_idx ON media_processing_jobs(status);
CREATE INDEX IF NOT EXISTS media_processing_jobs_job_type_idx ON media_processing_jobs("jobType");
CREATE INDEX IF NOT EXISTS media_processing_jobs_scheduled_for_idx ON media_processing_jobs("scheduledFor");