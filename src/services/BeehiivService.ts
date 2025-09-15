import { BeehiivRepository, ArticleRepository } from '../repositories';
import { DatabaseType } from '../repositories/BaseRepository';
import { ContentParser } from './ContentParser';
import { generateId } from '../lib/cuid';

// Types based on BeehIV API response
export interface BeehiivPostResponse {
  id: string;
  title: string;
  subtitle: string;
  authors: any[];
  created: number;
  status: string;
  publish_date: number | null;
  displayed_date: number | null;
  split_tested: boolean;
  subject_line: string;
  preview_text: string;
  slug: string;
  thumbnail_url: string;
  web_url: string;
  audience: string;
  platform: string;
  content_tags: any[];
  meta_default_description: string | null;
  meta_default_title: string | null;
  hidden_from_feed: boolean;
  content: {
    free: {
      rss: string;
    };
  };
}

export interface BeehiivApiResponse {
  data: BeehiivPostResponse[];
  page: number;
  limit: number;
  total_results: number;
  total_pages: number;
}

export interface BeehiivPublication {
  id: string;
  beehiivId: string;
  name: string;
  apiToken: string;
}

export class BeehiivService {
  private beehiivRepository: BeehiivRepository;
  private articleRepository: ArticleRepository;
  private contentParser: ContentParser;
  private baseUrl = 'https://api.beehiiv.com/v2';
  private env: any;

  constructor(db: DatabaseType, env?: any) {
    this.beehiivRepository = new BeehiivRepository(db);
    this.articleRepository = new ArticleRepository(db);
    this.contentParser = new ContentParser();
    this.env = env;
  }

  /**
   * Fetch the latest post from BeehIV API (modified to get only 1 post)
   */
  async fetchLatestPost(
    publicationId: string,
    apiToken: string,
    expand: string = 'free_rss_content'
  ): Promise<BeehiivPostResponse | null> {
    const url = new URL(`${this.baseUrl}/publications/${publicationId}/posts`);
    url.searchParams.append('page', '0');
    url.searchParams.append('limit', '1'); // Only fetch the latest
    url.searchParams.append('order_by', 'publish_date');
    url.searchParams.append('direction', 'desc');
    url.searchParams.append('expand', expand);

    console.log(`📰 Fetching latest BeehIV post: ${url.toString()}`);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`BeehIV API error: ${response.status} - ${errorText}`);
    }

    const apiResponse: BeehiivApiResponse = await response.json();
    return apiResponse.data[0] || null; // Return first (latest) post or null
  }

  /**
   * Fetch posts from BeehIV API (legacy method, kept for compatibility)
   */
  async fetchPosts(
    publicationId: string,
    apiToken: string,
    options: {
      page?: number;
      limit?: number;
      orderBy?: string;
      direction?: 'asc' | 'desc';
      expand?: string;
    } = {}
  ): Promise<BeehiivApiResponse> {
    const {
      page = 0,
      limit = 1, // Changed default to 1 for latest only
      orderBy = 'publish_date',
      direction = 'desc',
      expand = 'free_rss_content'
    } = options;

    const url = new URL(`${this.baseUrl}/publications/${publicationId}/posts`);
    url.searchParams.append('page', page.toString());
    url.searchParams.append('limit', limit.toString());
    url.searchParams.append('order_by', orderBy);
    url.searchParams.append('direction', direction);
    url.searchParams.append('expand', expand);

    console.log(`Fetching BeehIV posts: ${url.toString()}`);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`BeehIV API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Parse BeehIV RSS content using advanced parser
   */
  parseRssContent(rssContent: string) {
    return this.contentParser.parseRssContent(rssContent);
  }

  /**
   * Detect category from BeehIV post content (using new parser)
   */
  detectCategory(post: BeehiivPostResponse, sections: Array<{ title: string; content: string }>): string {
    const content = sections.map(s => s.title + ' ' + s.content).join(' ');
    return this.contentParser.detectCategory(post.title, content, sections);
  }

  /**
   * Convert BeehIV post to CMS article format (using new parser)
   */
  convertToArticle(post: BeehiivPostResponse, publicationSlug: string) {
    console.log(`🔄 Converting BeehIv post to article: "${post.title}"`);
    
    // Parse content using advanced parser
    const parsedContent = this.parseRssContent(post.content.free.rss);
    
    // Auto-detect category
    const detectedCategory = this.detectCategory(post, parsedContent.sections);
    
    // Generate excerpt from content if not available
    let excerpt = post.preview_text || post.subtitle || '';
    if (!excerpt && parsedContent.blocks.length > 0) {
      const firstParagraph = parsedContent.blocks.find(b => b.type === 'paragraph');
      if (firstParagraph && firstParagraph.data.text) {
        excerpt = firstParagraph.data.text.substring(0, 200) + (firstParagraph.data.text.length > 200 ? '...' : '');
      }
    }

    const article = {
      title: post.title,
      slug: post.slug,
      content: parsedContent.blocks, // Use structured blocks from parser
      excerpt,
      
      // Status mapping
      status: this.mapBeehiivStatus(post.status),
      publishedAt: post.publish_date ? new Date(post.publish_date * 1000) : null,
      
      // SEO
      seoTitle: post.meta_default_title || post.title,
      seoDescription: post.meta_default_description || excerpt,
      
      // Source tracking
      source: 'beehiiv' as const,
      sourceId: post.id,
      sourceUrl: post.web_url,
      beehiivUrl: post.web_url, // Original BeehIiv URL
      newsletter: publicationSlug,
      
      // Images
      featuredImage: post.thumbnail_url || (parsedContent.extractedImages[0] || null),
      
      // Auto-categorization
      autoCategory: detectedCategory, // Store detected category for manual review
      tags: post.content_tags || [],
      
      // Content metadata
      readTime: parsedContent.metadata.readingTime,
      wordCount: parsedContent.metadata.wordCount,
      
      // Analytics
      views: 0,
      shares: 0,
      likes: 0,
    };

    console.log(`✅ Article converted: ${parsedContent.blocks.length} blocks, ${parsedContent.extractedImages.length} images, category: ${detectedCategory}`);
    
    return article;
  }

  /**
   * Map BeehIV status to CMS workflow status
   */
  private mapBeehiivStatus(beehiivStatus: string): string {
    const statusMap: Record<string, string> = {
      'draft': 'beehiiv_pending',        // Newsletter em rascunho -> aguarda revisão
      'confirmed': 'beehiiv_pending',    // Newsletter confirmada -> aguarda revisão
      'sent': 'beehiiv_pending',         // Newsletter enviada -> aguarda revisão para publicação
      'archived': 'archived'             // Newsletter arquivada -> arquivado
    };

    return statusMap[beehiivStatus] || 'beehiiv_pending';
  }

  /**
   * Check if a single post already exists in database
   */
  async checkPostExists(post: BeehiivPostResponse): Promise<boolean> {
    try {
      const existingPosts = await this.beehiivRepository.findExistingPostsByBeehiivIds([post.id]);
      return existingPosts.length > 0;
    } catch (error) {
      console.error('Error checking if post exists:', error);
      return false; // Assume it doesn't exist if there's an error
    }
  }

  /**
   * Check if posts already exist in database (legacy method)
   */
  async filterNewPosts(posts: BeehiivPostResponse[]): Promise<BeehiivPostResponse[]> {
    if (posts.length === 0) return [];

    const beehiivIds = posts.map(p => p.id);
    const existingPosts = await this.beehiivRepository.findExistingPostsByBeehiivIds(beehiivIds);
    const existingIds = new Set(existingPosts.map(p => p.beehiivId));

    return posts.filter(post => !existingIds.has(post.id));
  }

  /**
   * Get all configured publications from environment variable
   */
  async getPublicationsFromEnv(): Promise<BeehiivPublication[]> {
    if (!this.env?.BEEHIIV_PUBLICATIONS) {
      console.log('⚠️ BEEHIIV_PUBLICATIONS not configured in environment');
      return [];
    }

    const publicationIds = this.env.BEEHIIV_PUBLICATIONS.split(',').map((id: string) => id.trim());
    console.log(`📋 Found ${publicationIds.length} publications in environment:`, publicationIds);

    const publications: BeehiivPublication[] = [];
    
    for (const pubId of publicationIds) {
      // Try to find existing publication in database
      let existingPub = await this.beehiivRepository.findPublicationByBeehiivId(pubId);
      
      if (existingPub) {
        publications.push({
          id: existingPub.beehiivId, // Use beehiivId instead of internal id
          beehiivId: existingPub.beehiivId,
          name: existingPub.name,
          apiToken: existingPub.apiToken || this.env.BEEHIIV_API_KEY || '',
        });
      } else {
        // Create publication in database if it doesn't exist
        console.log(`📝 Creating new publication: ${pubId}`);
        try {
          const newPublication = await this.beehiivRepository.createPublication({
            id: generateId(),
            beehiivId: pubId,
            name: `Publication ${pubId}`,
            slug: pubId.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            apiToken: this.env.BEEHIIV_API_KEY || '',
            isActive: true,
          });
          
          publications.push({
            id: newPublication.beehiivId, // Use beehiivId instead of internal id
            beehiivId: newPublication.beehiivId,
            name: newPublication.name,
            apiToken: newPublication.apiToken || this.env.BEEHIIV_API_KEY || '',
          });
          
          console.log(`✅ Created publication: ${newPublication.name}`);
        } catch (error) {
          console.error(`❌ Failed to create publication ${pubId}:`, error);
          // Still add to list for API calls even if DB creation failed
          publications.push({
            id: pubId,
            name: `Publication ${pubId}`,
            apiToken: this.env.BEEHIIV_API_KEY || '',
          });
        }
      }
    }

    return publications;
  }

  /**
   * Get all configured publications
   */
  async getAllPublications() {
    return await this.beehiivRepository.getAllPublications();
  }

  /**
   * Sync latest post from a specific publication
   */
  async syncLatestFromPublication(publicationId: string): Promise<{
    success: boolean;
    message: string;
    post?: any;
    article?: any;
  }> {
    try {
      console.log(`🔄 Starting sync for publication: ${publicationId}`);

      // First, check if publication is in environment variable
      const envPublications = await this.getPublicationsFromEnv();
      const envPublication = envPublications.find(pub => pub.id === publicationId);
      
      if (envPublication) {
        // Use publication from environment
        console.log(`📡 Fetching latest post from ${envPublication.name}...`);
        
        const latestPost = await this.fetchLatestPost(publicationId, envPublication.apiToken);
        
        if (!latestPost) {
          return {
            success: true,
            message: `No posts found for ${envPublication.name}`,
          };
        }
        
        // Check if post already exists
        const existingPost = await this.beehiivRepository.findPostByBeehiivId(latestPost.id);
        if (existingPost) {
          return {
            success: true,
            message: `Post already exists: ${latestPost.title}`,
            post: existingPost,
          };
        }
        
        // Save the post to database
        // Find the internal publication ID
        const internalPublication = await this.beehiivRepository.findPublicationByBeehiivId(publicationId);
        const internalPublicationId = internalPublication?.id || publicationId;
        const savedPost = await this.saveBeehiivPost(latestPost, internalPublicationId);
        
        return {
          success: true,
          message: `Successfully synced latest post from ${envPublication.name}`,
          post: savedPost,
        };
      }

      // Fallback: Get publication details from database
      const publication = await this.beehiivRepository.findPublicationByBeehiivId(publicationId);
      
      if (!publication) {
        return {
          success: false,
          message: `Publication ${publicationId} not configured`,
        };
      }

      console.log(`📡 Fetching latest post from ${publication.name}...`);

      // Fetch latest post
      const latestPost = await this.fetchLatestPost(publicationId, publication.apiToken);
      
      if (!latestPost) {
        return {
          success: true,
          message: `No posts found for ${publication.name}`,
        };
      }

      console.log(`📰 Found post: "${latestPost.title}" (ID: ${latestPost.id})`);

      // Check if post already exists
      const exists = await this.checkPostExists(latestPost);
      
      if (exists) {
        return {
          success: true,
          message: `Post "${latestPost.title}" already exists, skipping`,
        };
      }

      console.log(`💾 Saving new post: "${latestPost.title}"`);

      // Save BeehIiv post
      const savedPost = await this.saveBeehiivPost(latestPost, publication.id);

      // Convert to article and save (this will be done in the next step)
      console.log(`✅ Successfully synced: "${latestPost.title}"`);

      return {
        success: true,
        message: `Successfully synced latest post: "${latestPost.title}"`,
        post: savedPost,
      };

    } catch (error) {
      console.error(`❌ Sync failed for publication ${publicationId}:`, error);
      return {
        success: false,
        message: `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Sync latest posts from all configured publications
   */
  async syncLatestFromAllPublications(): Promise<{
    success: boolean;
    results: Array<{
      publicationId: string;
      publicationName: string;
      success: boolean;
      message: string;
    }>;
  }> {
    console.log(`🚀 Starting sync from all publications...`);

    // Get publications from environment variable only
    const publications = await this.getPublicationsFromEnv();
    
    if (publications.length === 0) {
      return {
        success: false,
        results: [{
          publicationId: 'none',
          publicationName: 'No publications configured',
          success: false,
          message: 'No BeehIiv publications configured',
        }],
      };
    }

    const results = [];

    for (const publication of publications) {
      console.log(`📡 Processing publication: ${publication.name}`);
      
      const result = await this.syncLatestFromPublication(publication.beehiivId);
      
      results.push({
        publicationId: publication.beehiivId,
        publicationName: publication.name,
        success: result.success,
        message: result.message,
      });

      // Small delay between publications to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const successCount = results.filter(r => r.success).length;
    
    console.log(`✅ Sync completed: ${successCount}/${results.length} publications successful`);

    return {
      success: successCount > 0,
      results,
    };
  }

  /**
   * Save BeehIV post to database
   */
  async saveBeehiivPost(post: BeehiivPostResponse, publicationId: string) {
    try {
      console.log(`💾 Saving BeehIV post: ${post.title} (ID: ${post.id})`);
      
      // Extract RSS content from the post structure
      const rssContent = post.content?.free?.rss || null;
      console.log(`📰 RSS Content length: ${rssContent ? rssContent.length : 0} characters`);
      
      // Simplified data structure focusing on RSS
      const beehiivPostData = {
        beehiivId: post.id,
        publicationId: publicationId,
        title: post.title || 'Untitled',
        subtitle: post.subtitle || null,
        subjectLine: post.subject_line || null,
        previewText: post.preview_text || null,
        slug: post.slug || null,
        status: post.status || 'draft',
        audience: post.audience || null,
        platform: post.platform || null,
        publishDate: post.publish_date ? new Date(post.publish_date * 1000) : null,
        displayedDate: post.displayed_date ? new Date(post.displayed_date * 1000) : null,
        createdTimestamp: post.created || null,
        thumbnailUrl: post.thumbnail_url || null,
        webUrl: post.web_url || null,
        splitTested: post.split_tested || false,
        hiddenFromFeed: post.hidden_from_feed || false,
        authors: post.authors || null,
        contentTags: post.content_tags || null,
        metaTitle: post.meta_default_title || null,
        metaDescription: post.meta_default_description || null,
        rawContent: post.content || null,
        rssContent: rssContent, // Focus on RSS content
      };

      console.log(`📊 Post data prepared - RSS: ${rssContent ? 'YES' : 'NO'}`);
      
      const result = await this.beehiivRepository.createPost(beehiivPostData);
      console.log(`✅ Post saved successfully:`, result.id);
      
      // Convert to article
      try {
        const article = await this.convertBeehiivPostToArticle(post, result.id);
        console.log(`📝 Article created from BeehIV post:`, article.id);
      } catch (articleError) {
        console.error(`⚠️ Error creating article from BeehIV post:`, articleError);
        // Don't throw - the post was saved successfully
      }
      
      return result;
    } catch (error) {
      console.error(`❌ Error saving BeehIV post:`, error);
      throw error;
    }
  }

  /**
   * Convert BeehIV post to article
   */
  async convertBeehiivPostToArticle(post: BeehiivPostResponse, beehiivPostId: string) {
    try {
      console.log(`🔄 Converting BeehIV post to article: ${post.title}`);
      
      // Parse RSS content to extract structured content
      const rssContent = post.content?.free?.rss || '';
      const parsedContent = this.contentParser.parseRssContent(rssContent);
      
      // Create article data
      const articleData = {
        id: generateId(),
        title: post.title || 'Untitled',
        slug: post.slug || this.generateSlug(post.title || 'untitled'),
        content: parsedContent.blocks,
        excerpt: post.preview_text || this.extractExcerpt(parsedContent.blocks),
        status: this.mapBeehiivStatus(post.status),
        source: 'beehiiv' as const,
        newsletter: post.subject_line || null,
        featuredImage: post.thumbnail_url || null,
        tags: post.content_tags || [],
        seoTitle: post.meta_default_title || null,
        seoDescription: post.meta_default_description || null,
        seoKeywords: post.content_tags || [],
        isFeatured: false,
        views: 0,
        shares: 0,
        likes: 0,
        // Link to BeehIV post
        beehiivPostId: beehiivPostId,
      };

      // Create article in database
      const article = await this.articleRepository.create(articleData);
      console.log(`✅ Article created successfully: ${article.id}`);
      
      return article;
    } catch (error) {
      console.error(`❌ Error converting BeehIV post to article:`, error);
      throw error;
    }
  }

  /**
   * Generate slug from title
   */
  private generateSlug(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  /**
   * Extract excerpt from content blocks
   */
  private extractExcerpt(blocks: any[]): string {
    // Find first text block and extract first 150 characters
    for (const block of blocks) {
      if (block.type === 'text' && block.content) {
        return block.content.substring(0, 150).trim() + '...';
      }
    }
    return '';
  }

  /**
   * Get API token for publication
   */
  async getPublicationApiToken(publicationBeehiivId: string): Promise<string | null> {
    const publication = await this.beehiivRepository.findPublicationByBeehiivId(publicationBeehiivId);
    return publication?.apiToken || null;
  }
}