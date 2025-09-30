-- Check BeehIV posts count
SELECT 'BeehIV Posts' as type, COUNT(*) as total FROM beehiiv_posts;

-- Check Articles with BeehIV source
SELECT 'Articles (BeehIV)' as type, COUNT(*) as total FROM articles WHERE source = 'beehiiv';

-- Check Articles with beehiivPostId
SELECT 'Articles (with beehiivPostId)' as type, COUNT(*) as total FROM articles WHERE "beehiivPostId" IS NOT NULL;

-- List all BeehIV posts with their corresponding articles
SELECT
    bp.title as beehiiv_title,
    bp."beehiivId" as beehiiv_id,
    a.title as article_title,
    a.source as article_source,
    a."beehiivPostId" as article_beehiiv_post_id
FROM beehiiv_posts bp
LEFT JOIN articles a ON a."beehiivPostId" = bp.id
ORDER BY bp."createdTimestamp" DESC
LIMIT 20;