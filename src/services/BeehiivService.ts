import { BeehiivRepository, ArticleRepository, CategoryRepository } from '../repositories';
import { DatabaseType } from '../repositories/BaseRepository';
import { ContentParser } from './ContentParser';
import { TheNewsContentParser, IndividualNews } from './TheNewsContentParser';
import { extrairNoticiasNewsletter, type NewsletterData, type Noticia } from './NewsletterParser';
import { generateId } from '../lib/cuid';
import { NotificationService } from './NotificationService';

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

// Newsletter mapping - must match NEWSLETTERS in BeehiivController
const NEWSLETTER_NAMES: Record<string, string> = {
  'pub_98577126-2994-4111-bc86-f60974108b94': 'The Bizness',
  'pub_ce78b549-5923-439b-be24-3f24c454bc12': 'The News',
  'pub_e6f2edcf-0484-47ad-b6f2-89a866ccadc8': 'The Stories',
  'pub_b0f0dc48-5946-40a5-b2b6-b245a1a0e680': 'The Jobs',
  'pub_72a981c0-3a09-4a7c-b374-dbea5b69925c': 'The Champs',
  'pub_89324c54-1b5f-4200-85e7-e199d56c76e3': 'Rising',
  'pub_3f18517c-9a0b-487e-b1c3-804c71fa6285': 'GoGet',
  'pub_f11d861b-9b39-428b-a381-af3f07ef96c9': 'Health Times',
  'pub_87b5253f-5fac-42d9-bb03-d100f7d434aa': 'Dollar Bill',
  'pub_f41c4c52-beb8-4cc0-b8c0-02bb6ac2353c': 'Trend Report'
};

export class BeehiivService {
  private beehiivRepository: BeehiivRepository;
  private articleRepository: ArticleRepository;
  private categoryRepository: CategoryRepository;
  private contentParser: ContentParser;
  private theNewsParser: TheNewsContentParser;
  private notificationService: NotificationService;
  private baseUrl = 'https://api.beehiiv.com/v2';
  private env: any;

  constructor(db: DatabaseType, env?: any) {
    this.beehiivRepository = new BeehiivRepository(db);
    this.articleRepository = new ArticleRepository(db);
    this.categoryRepository = new CategoryRepository(db);
    this.contentParser = new ContentParser();
    this.theNewsParser = new TheNewsContentParser();
    this.notificationService = new NotificationService(db);
    this.env = env;
  }

  /**
   * Fetch the latest PUBLISHED post from BeehIV API (updated to get confirmed posts only)
   */
  async fetchLatestPost(
    publicationId: string,
    apiToken: string,
    expand: string = 'free_rss_content'
  ): Promise<BeehiivPostResponse | null> {
    const url = new URL(`${this.baseUrl}/publications/${publicationId}/posts`);

    // Parameters to fetch only published/confirmed posts (like curl example)
    url.searchParams.append('expand', expand);
    url.searchParams.append('order_by', 'publish_date');
    url.searchParams.append('limit', '2'); // Fetch 2 to have some options
    url.searchParams.append('page', '1');
    url.searchParams.append('direction', 'desc');
    url.searchParams.append('status', 'confirmed'); // Only confirmed/published posts
    url.searchParams.append('hidden_from_feed', 'all');

    console.log(`📰 Fetching latest PUBLISHED BeehIV post: ${url.toString()}`);

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

    if (apiResponse.data && apiResponse.data.length > 0) {
      console.log(`✅ Found ${apiResponse.data.length} published posts`);
      console.log(`📅 Latest post: "${apiResponse.data[0].title}" (${apiResponse.data[0].status})`);
      return apiResponse.data[0]; // Return first (latest) published post
    }

    console.log(`⚠️ No published posts found for publication ${publicationId}`);
    return null;
  }

  /**
   * Fetch posts from BeehIV API (updated to prefer published posts)
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
      status?: string;
    } = {}
  ): Promise<BeehiivApiResponse> {
    const {
      page = 1,
      limit = 2,
      orderBy = 'publish_date',
      direction = 'desc',
      expand = 'free_rss_content',
      status = 'confirmed' // Default to confirmed/published posts
    } = options;

    const url = new URL(`${this.baseUrl}/publications/${publicationId}/posts`);
    url.searchParams.append('expand', expand);
    url.searchParams.append('order_by', orderBy);
    url.searchParams.append('limit', limit.toString());
    url.searchParams.append('page', page.toString());
    url.searchParams.append('direction', direction);
    url.searchParams.append('status', status);
    url.searchParams.append('hidden_from_feed', 'all');

    console.log(`📰 Fetching BeehIV posts (${status}): ${url.toString()}`);

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
   * Always returns 'in_review' for articles synced from BeehIV
   */
  private mapBeehiivStatus(beehiivStatus: string): string {
    return 'draft';
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
        // Use friendly name from NEWSLETTER_NAMES mapping
        const friendlyName = NEWSLETTER_NAMES[existingPub.beehiivId] || existingPub.name;

        publications.push({
          id: existingPub.beehiivId, // Use beehiivId instead of internal id
          beehiivId: existingPub.beehiivId,
          name: friendlyName,
          apiToken: existingPub.apiToken || this.env.BEEHIIV_API_KEY || '',
        });
      } else {
        // Create publication in database if it doesn't exist
        console.log(`📝 Creating new publication: ${pubId}`);
        try {
          // Use friendly name from mapping if available
          const friendlyName = NEWSLETTER_NAMES[pubId] || `Publication ${pubId}`;

          const newPublication = await this.beehiivRepository.createPublication({
            id: generateId(),
            beehiivId: pubId,
            name: friendlyName,
            slug: pubId.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
            apiToken: this.env.BEEHIIV_API_KEY || '',
            isActive: true,
          });

          publications.push({
            id: newPublication.beehiivId, // Use beehiivId instead of internal id
            beehiivId: newPublication.beehiivId,
            name: friendlyName,
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
  async syncLatestFromPublication(publicationId: string, authorId?: string): Promise<{
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
          // Try to update articles from this post (upsert will check if they're protected)
          try {
            const postResponse = {
              id: latestPost.id,
              title: latestPost.title,
              subtitle: latestPost.subtitle,
              subject_line: latestPost.subject_line,
              preview_text: latestPost.preview_text,
              slug: latestPost.slug,
              status: latestPost.status,
              content: latestPost.content,
              thumbnail_url: latestPost.thumbnail_url,
              web_url: latestPost.web_url,
              content_tags: latestPost.content_tags,
              meta_default_title: latestPost.meta_default_title,
              meta_default_description: latestPost.meta_default_description,
              created: latestPost.created,
              publish_date: latestPost.publish_date,
              displayed_date: latestPost.displayed_date,
              split_tested: latestPost.split_tested,
              audience: latestPost.audience,
              platform: latestPost.platform,
              hidden_from_feed: latestPost.hidden_from_feed,
              authors: latestPost.authors || []
            };

            // Use the new method that extracts multiple articles
            const articles = await this.convertBeehiivPostToMultipleArticles(postResponse, existingPost.id, envPublication.name, authorId);

            return {
              success: true,
              message: `Post updated: ${latestPost.title} (${articles.length} articles)`,
              post: existingPost,
            };
          } catch (updateError) {
            console.log(`⚠️ Could not update articles for post ${latestPost.title}:`, updateError);
            return {
              success: true,
              message: `Post already exists (articles protected): ${latestPost.title}`,
              post: existingPost,
            };
          }
        }
        
        // Save the post to database
        // Find the internal publication ID
        const internalPublication = await this.beehiivRepository.findPublicationByBeehiivId(publicationId);
        const internalPublicationId = internalPublication?.id || publicationId;
        const savedPost = await this.saveBeehiivPost(latestPost, internalPublicationId, envPublication.name, authorId);
        
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

      // Use friendly name from mapping
      const pubFriendlyName = NEWSLETTER_NAMES[publication.beehiivId] || publication.name;
      console.log(`📡 Fetching latest post from ${pubFriendlyName}...`);

      // Fetch latest post
      const latestPost = await this.fetchLatestPost(publicationId, publication.apiToken);

      if (!latestPost) {
        return {
          success: true,
          message: `No posts found for ${pubFriendlyName}`,
        };
      }

      console.log(`📰 Found post: "${latestPost.title}" (ID: ${latestPost.id})`);

      // Check if post already exists
      const existingPost = await this.beehiivRepository.findPostByBeehiivId(latestPost.id);

      if (existingPost) {
        // Try to update the article anyway (upsert will check if it's protected)
        try {
          await this.convertBeehiivPostToArticle(latestPost, existingPost.id);

          return {
            success: true,
            message: `Post updated: "${latestPost.title}"`,
          };
        } catch (updateError) {
          console.log(`⚠️ Could not update article for post ${latestPost.title}:`, updateError);
          return {
            success: true,
            message: `Post "${latestPost.title}" already exists (article protected)`,
          };
        }
      }

      console.log(`💾 Saving new post: "${latestPost.title}"`);

      // Save BeehIiv post with friendly name
      const savedPost = await this.saveBeehiivPost(latestPost, publication.id, pubFriendlyName, authorId);

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
  async syncLatestFromAllPublications(authorId?: string): Promise<{
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
      
      const result = await this.syncLatestFromPublication(publication.beehiivId, authorId);
      
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
  async saveBeehiivPost(post: BeehiivPostResponse, publicationId: string, publicationName?: string, authorId?: string) {
    try {
      console.log(`💾 Saving BeehIV post: ${post.title} (ID: ${post.id})`);
      console.log(`📁 Publication Name received: "${publicationName}"`);

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
      
      // Convert to multiple articles
      try {
        console.log(`🔄 Converting BeehIV post "${post.title}" to multiple articles...`);
        const articles = await this.convertBeehiivPostToMultipleArticles(post, result.id, publicationName, authorId);
        console.log(`✅ ${articles.length} articles created from BeehIV post: ${articles.map(a => `${a.id} - "${a.title}"`).join(', ')}`);
      } catch (articleError) {
        console.error(`❌ CRITICAL ERROR: Failed to create articles from BeehIV post "${post.title}":`, {
          error: articleError,
          postId: result.id,
          beehiivId: post.id,
          postTitle: post.title
        });
        // Don't throw - the post was saved successfully
      }
      
      return result;
    } catch (error) {
      console.error(`❌ Error saving BeehIV post:`, error);
      throw error;
    }
  }

  /**
   * Convert Noticia from new parser to article
   */
  async convertNoticiaToArticle(
    noticia: Noticia,
    post: BeehiivPostResponse,
    beehiivPostId: string,
    newsIndex: number,
    publicationName?: string,
    authorId?: string
  ) {
    try {
      console.log(`🔄 Converting noticia to article: ${noticia.titulo}`);
      console.log(`📁 publicationName received: "${publicationName}"`);

      // Create unique slug for this news item
      const baseSlug = this.generateSlug(noticia.titulo || `noticia-${newsIndex}`);
      const uniqueSlug = await this.generateUniqueSlug(baseSlug, `${beehiivPostId}-${newsIndex}`);

      // Convert HTML content to rich blocks
      const blocks = this.htmlToRichBlocks(noticia.conteudo_html, noticia.titulo);

      // Get proper category ID from database
      const categoryId = await this.getCategoryId(noticia.categoria);

      // Get publication name if not provided
      const newsletterName = publicationName || await this.getPublicationNameFromPost(post.id);
      console.log(`📬 Newsletter name for article: "${newsletterName}" (from publicationName: "${publicationName}")`);

      const articleData = {
        id: generateId(),
        title: noticia.titulo || `Notícia ${newsIndex}`,
        slug: uniqueSlug,
        content: blocks,
        excerpt: noticia.resumo || this.extractExcerptFromHtml(noticia.conteudo_html),
        status: this.mapBeehiivStatus(post.status),
        categoryId: categoryId,
        authorId: authorId, // ✅ Adicionar authorId do usuário logado
        source: 'beehiiv' as const,
        sourceId: `${post.id}-${newsIndex}`, // Unique source ID for each news
        sourceUrl: post.web_url || null,
        newsletter: newsletterName,
        featuredImage: noticia.imagem_principal || post.thumbnail_url || null,
        tags: post.content_tags || [],
        seoTitle: noticia.titulo || null,
        seoDescription: noticia.resumo || this.extractExcerptFromHtml(noticia.conteudo_html),
        seoKeywords: post.content_tags || [],
        isFeatured: false,
        views: 0,
        shares: 0,
        likes: 0,
      };

      console.log(`💾 Creating noticia article:`, {
        id: articleData.id,
        title: articleData.title,
        slug: articleData.slug,
        source: articleData.source,
        sourceId: articleData.sourceId,
        blocksCount: articleData.content.length,
        categoryId: articleData.categoryId
      });

      // Create or update article in database using upsert
      const article = await this.articleRepository.upsert(articleData);
      console.log(`✅ Noticia article upserted successfully: ${article.id}`);

      return article;
    } catch (error) {
      console.error(`❌ Error converting noticia to article:`, {
        error: error,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        newsTitle: noticia.titulo,
        beehiivPostId: beehiivPostId
      });
      throw error;
    }
  }

  /**
   * Convert individual news to article (LEGACY)
   */
  async convertIndividualNewsToArticle(
    news: IndividualNews,
    post: BeehiivPostResponse,
    beehiivPostId: string,
    newsIndex: number,
    publicationName?: string
  ) {
    try {
      console.log(`🔄 Converting individual news to article: ${news.titulo}`);

      // Create unique slug for this news item
      const baseSlug = this.generateSlug(news.titulo || `noticia-${newsIndex}`);
      const uniqueSlug = await this.generateUniqueSlug(baseSlug, `${beehiivPostId}-${newsIndex}`);

      // Convert HTML content to rich blocks with better structure
      const blocks = this.htmlToRichBlocks(news.conteudo_html, news.titulo);

      // Get proper category ID from database
      const categoryId = await this.getCategoryId(news.categoria);

      const articleData = {
        id: generateId(),
        title: news.titulo || `Notícia ${newsIndex}`,
        slug: uniqueSlug,
        content: blocks,
        excerpt: news.resumo || this.extractExcerptFromHtml(news.conteudo_html),
        status: this.mapBeehiivStatus(post.status),
        categoryId: categoryId,
        source: 'beehiiv' as const,
        sourceId: `${post.id}-${newsIndex}`, // Unique source ID for each news
        sourceUrl: post.web_url || null,
        newsletter: publicationName || null,
        featuredImage: news.imagem_principal || post.thumbnail_url || null,
        tags: post.content_tags || [],
        seoTitle: news.titulo || null,
        seoDescription: news.resumo || this.extractExcerptFromHtml(news.conteudo_html),
        seoKeywords: post.content_tags || [],
        isFeatured: false,
        views: 0,
        shares: 0,
        likes: 0,
      };

      console.log(`💾 Creating individual news article:`, {
        id: articleData.id,
        title: articleData.title,
        slug: articleData.slug,
        source: articleData.source,
        sourceId: articleData.sourceId,
        blocksCount: articleData.content.length,
        categoryId: articleData.categoryId
      });

      // Create or update article in database using upsert
      const article = await this.articleRepository.upsert(articleData);
      console.log(`✅ Individual news article upserted successfully: ${article.id}`);

      return article;
    } catch (error) {
      console.error(`❌ Error converting individual news to article:`, {
        error: error,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        newsTitle: news.titulo,
        beehiivPostId: beehiivPostId
      });
      throw error;
    }
  }

  /**
   * Convert HTML content to blocks
   */
  private htmlToBlocks(html: string): any[] {
    if (!html || html.trim().length === 0) {
      return [];
    }

    const blocks = [];

    // Simple HTML to blocks conversion
    const lines = html
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    for (const line of lines) {
      if (line.length > 5) {
        blocks.push({
          id: generateId(),
          type: 'paragraph',
          data: {
            text: line
          }
        });
      }
    }

    return blocks;
  }

  /**
   * Convert HTML to rich blocks with better structure
   */
  private htmlToRichBlocks(html: string, title: string): any[] {
    if (!html || html.trim().length === 0) {
      return [];
    }

    const blocks = [];

    // Add title as header if provided
    if (title) {
      blocks.push({
        id: generateId(),
        type: 'header',
        data: {
          text: title,
          level: 2
        }
      });
    }

    // Extract images
    const imgPattern = /<img[^>]+src="([^"]+)"[^>]*(?:alt="([^"]*)")?[^>]*>/gi;
    let imgMatch;
    while ((imgMatch = imgPattern.exec(html)) !== null) {
      const src = imgMatch[1];
      const alt = imgMatch[2] || '';

      if (src && !src.includes('pixel') && !src.includes('tracking')) {
        blocks.push({
          id: generateId(),
          type: 'image',
          data: {
            file: {
              url: src
            },
            caption: alt,
            withBorder: false,
            stretched: true,
            withBackground: false
          }
        });
      }
    }

    // Extract paragraphs (with inner HTML tags preserved)
    const paragraphPattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let pMatch;
    while ((pMatch = paragraphPattern.exec(html)) !== null) {
      let text = pMatch[1]
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();

      // Clean up and normalize HTML tags
      text = text
        .replace(/<br\s*\/?>/gi, '<br>')
        .replace(/<b>/gi, '<strong>')  // Normalize bold
        .replace(/<\/b>/gi, '</strong>')
        .replace(/<i>/gi, '<em>')      // Normalize italic
        .replace(/<\/i>/gi, '</em>')
        .replace(/\s+/g, ' ')
        .trim();

      if (text && text.length > 5) {
        blocks.push({
          id: generateId(),
          type: 'paragraph',
          data: {
            text: text
          }
        });
      }
    }

    // Extract lists
    const listPattern = /<ul[^>]*>([\s\S]*?)<\/ul>/gi;
    let listMatch;
    while ((listMatch = listPattern.exec(html)) !== null) {
      const listContent = listMatch[1];
      const items = [];
      // Updated regex to capture content with inner tags
      const itemPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let itemMatch;

      while ((itemMatch = itemPattern.exec(listContent)) !== null) {
        let itemText = itemMatch[1]
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim();

        // Extract text from inner <p> tags if present and normalize HTML
        itemText = itemText
          .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1')
          .replace(/<br\s*\/?>/gi, '<br>')
          .replace(/<b>/gi, '<strong>')
          .replace(/<\/b>/gi, '</strong>')
          .replace(/<i>/gi, '<em>')
          .replace(/<\/i>/gi, '</em>')
          .replace(/\s+/g, ' ')
          .trim();

        if (itemText) {
          items.push(itemText);
        }
      }

      if (items.length > 0) {
        blocks.push({
          id: generateId(),
          type: 'list',
          data: {
            style: 'unordered',
            items: items
          }
        });
      }
    }

    // If no blocks were created, fall back to simple extraction
    if (blocks.length === 0 || (blocks.length === 1 && blocks[0].type === 'header')) {
      const fallbackBlocks = this.htmlToBlocks(html);
      blocks.push(...fallbackBlocks);
    }

    return blocks;
  }

  /**
   * Get category ID from name, find in database by slug
   */
  private async getCategoryId(categoryName: string): Promise<string | null> {
    try {
      // Map Portuguese category names to system categories
      const categoryMap: Record<string, string> = {
        'MUNDO': 'internacional',
        'BRASIL': 'brasil',
        'TECNOLOGIA': 'tecnologia',
        'ECONOMIA': 'economia',
        'VARIEDADES': 'entretenimento',
        'NEGÓCIOS': 'negocios',
        'ESPORTES': 'esportes',
        'SAÚDE': 'saude',
        'CULTURA': 'cultura',
        'APRESENTADO POR': 'patrocinado',
        'APRESENTADO_POR': 'patrocinado',
        'GERAL': 'geral'
      };

      const mappedSlug = categoryMap[categoryName.toUpperCase()];
      const slug = mappedSlug || this.generateSlug(categoryName);

      console.log(`📁 Looking for category: ${categoryName} -> ${slug}`);

      // Find category in database by slug
      const category = await this.categoryRepository.findBySlug(slug);

      if (category) {
        console.log(`✅ Found category: ${category.name} (ID: ${category.id})`);
        return category.id;
      }

      // If not found, try to find 'geral' as fallback
      console.log(`⚠️ Category '${slug}' not found, trying fallback 'geral'`);
      const geralCategory = await this.categoryRepository.findBySlug('geral');

      if (geralCategory) {
        console.log(`✅ Using fallback category: ${geralCategory.name} (ID: ${geralCategory.id})`);
        return geralCategory.id;
      }

      console.log(`⚠️ No category found, returning null`);
      return null;

    } catch (error) {
      console.error('Error getting category ID:', error);
      return null;
    }
  }

  /**
   * Extract excerpt from HTML content
   */
  private extractExcerptFromHtml(html: string): string {
    if (!html) return '';

    const text = html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return text.length > 150 ? text.substring(0, 150) + '...' : text;
  }

  /**
   * Map Portuguese category names to system categories
   */
  private mapCategoryFromPortugese(categoria: string): string {
    const categoryMap: Record<string, string> = {
      'MUNDO': 'internacional',
      'BRASIL': 'brasil',
      'TECNOLOGIA': 'tecnologia',
      'ECONOMIA': 'economia',
      'VARIEDADES': 'entretenimento',
      'NEGÓCIOS': 'negocios',
      'ESPORTES': 'esportes',
      'SAÚDE': 'saude',
      'CULTURA': 'cultura',
      'APRESENTADO POR': 'patrocinado',
      'APRESENTADO_POR': 'patrocinado',
      'GERAL': 'geral'
    };

    return categoryMap[categoria.toUpperCase()] || 'geral';
  }

  /**
   * Convert BeehIV post to multiple articles (NEW - extracts multiple news)
   */
  async convertBeehiivPostToMultipleArticles(post: BeehiivPostResponse, beehiivPostId: string, publicationName?: string, authorId?: string) {
    try {
      console.log(`🔄 Converting BeehIV post to multiple articles: ${post.title}`);

      // Extract RSS content
      const rssContent = post.content?.free?.rss || '';
      console.log(`📰 RSS Content length: ${rssContent.length} chars`);

      // Debug: Log sample of RSS content
      if (rssContent.length > 0) {
        console.log('📄 RSS Content sample (first 500 chars):');
        console.log(rssContent.substring(0, 500));

        // Check for h6 categories
        const h6Matches = rssContent.match(/<h6[^>]*id="[^"]*"[^>]*>[^<]+<\/h6>/gi) || [];
        console.log(`🏷️ Found ${h6Matches.length} h6 category tags:`);
        h6Matches.forEach(match => console.log(`  - ${match}`));

        // Check for h1 titles
        const h1Matches = rssContent.match(/<h1[^>]*>[^<]+<\/h1>/gi) || [];
        console.log(`📝 Found ${h1Matches.length} h1 title tags:`);
        h1Matches.slice(0, 5).forEach(match => console.log(`  - ${match}`));
      }

      if (!rssContent || rssContent.length === 0) {
        console.log('⚠️ No RSS content found, creating single article');
        return [await this.convertBeehiivPostToArticle(post, beehiivPostId, authorId, publicationName)];
      }

      // Extract individual news using new Newsletter Parser
      console.log('🚀 Using new Newsletter Parser...');

      const newsletterData: NewsletterData = {
        id: post.id,
        title: post.title,
        subject_line: post.subject_line,
        preview_text: post.preview_text,
        thumbnail_url: post.thumbnail_url,
        web_url: post.web_url,
        created: post.created,
        publish_date: post.publish_date,
        content: post.content
      };

      const parserResult = extrairNoticiasNewsletter(newsletterData);
      console.log(`📊 New parser extracted ${parserResult.noticias.length} individual news items`);

      if (parserResult.noticias.length === 0) {
        console.log('⚠️ No individual news found with new parser, creating single article');
        console.log('🔍 Falling back to single article creation...');
        return [await this.convertBeehiivPostToArticle(post, beehiivPostId, authorId, publicationName)];
      }

      // Convert each news item to an article
      const articles = [];
      for (let i = 0; i < parserResult.noticias.length; i++) {
        const news = parserResult.noticias[i];
        try {
          const article = await this.convertNoticiaToArticle(news, post, beehiivPostId, i + 1, publicationName, authorId);
          articles.push(article);
        } catch (error) {
          console.error(`❌ Failed to convert news ${i + 1}: ${news.titulo}`, error);
          // Continue with other news items
        }
      }

      console.log(`✅ Successfully converted ${articles.length}/${parserResult.noticias.length} news items to articles`);

      // Enviar notificação de sincronização BeehIV
      if (articles.length > 0) {
        try {
          await this.notificationService.notifyBeehiivSync(articles.length, publicationName || 'BeehIV');
          console.log(`📧 Notification sent: ${articles.length} articles synced from ${publicationName}`);
        } catch (notificationError) {
          console.error('❌ Error sending BeehIV sync notification:', notificationError);
          // Não falhar a sincronização por causa da notificação
        }
      }

      return articles;

    } catch (error) {
      console.error(`❌ Error converting BeehIV post to multiple articles:`, error);
      // Fallback to single article
      return [await this.convertBeehiivPostToArticle(post, beehiivPostId, authorId, publicationName)];
    }
  }

  /**
   * Convert BeehIV post to article (public method for testing)
   */
  async convertBeehiivPostToArticle(post: BeehiivPostResponse, beehiivPostId: string, authorId?: string, publicationName?: string) {
    try {
      console.log(`🔄 Converting BeehIV post to article: ${post.title}`);
      console.log(`📋 Post data:`, {
        beehiivId: post.id,
        title: post.title,
        hasRssContent: !!(post.content?.free?.rss),
        rssLength: post.content?.free?.rss?.length || 0
      });

      // Parse RSS content to extract structured content
      const rssContent = post.content?.free?.rss || '';
      console.log(`📰 RSS Content length: ${rssContent.length} chars`);

      let parsedContent;
      try {
        // Use The News specific parser
        const theNewsResult = this.theNewsParser.parseTheNewsContent(rssContent);
        parsedContent = {
          blocks: theNewsResult.blocks,
          metadata: theNewsResult.metadata,
          sections: theNewsResult.sections
        };
        console.log(`📊 The News parsed content: ${parsedContent.blocks.length} blocks, ${theNewsResult.sections.length} sections`);
        console.log(`📰 Sections found: ${theNewsResult.sections.map(s => s.category).join(', ')}`);
      } catch (parseError) {
        console.error(`❌ Error parsing RSS content with The News parser, falling back to general parser:`, parseError);
        try {
          parsedContent = this.contentParser.parseRssContent(rssContent);
          console.log(`📊 Fallback parsed content: ${parsedContent.blocks.length} blocks`);
        } catch (fallbackError) {
          console.error(`❌ Error with fallback parser:`, fallbackError);
          parsedContent = { blocks: [], sections: [], metadata: { wordCount: 0, readingTime: 1, hasImages: false, hasSections: false } };
        }
      }

      // Create article data
      const baseSlug = post.slug || this.generateSlug(post.title || 'untitled');
      const uniqueSlug = await this.generateUniqueSlug(baseSlug, beehiivPostId);

      // Auto-detect category from The News sections
      const detectedCategorySlug = parsedContent.sections && parsedContent.sections.length > 0 ?
        this.theNewsParser.detectMainCategory(parsedContent.sections) :
        this.detectCategoryFromContent(post.title, parsedContent.blocks);

      console.log(`📁 [CATEGORY DETECTION] Detected category slug: "${detectedCategorySlug}"`);
      console.log(`📁 [CATEGORY DETECTION] Sections available:`, parsedContent.sections?.length || 0);
      console.log(`📁 [CATEGORY DETECTION] Post title: "${post.title}"`);

      // Get category ID from database
      const categoryId = await this.getCategoryId(detectedCategorySlug);

      // Get publication name from NEWSLETTERS mapping in controller
      const publicationNameToUse = publicationName || await this.getPublicationNameByBeehiivId(post.id);

      const articleData = {
        id: generateId(),
        title: post.title || 'Untitled',
        slug: uniqueSlug,
        content: parsedContent.blocks,
        excerpt: post.preview_text || this.extractExcerpt(parsedContent.blocks),
        status: this.mapBeehiivStatus(post.status),
        categoryId: categoryId,
        authorId: authorId, // ✅ Adicionar authorId do usuário logado
        source: 'beehiiv' as const,
        sourceId: post.id, // Store BeehIV post ID in sourceId field
        sourceUrl: post.web_url || null,
        newsletter: publicationNameToUse,
        featuredImage: post.thumbnail_url || null,
        tags: post.content_tags || [],
        seoTitle: post.meta_default_title || null,
        seoDescription: post.meta_default_description || null,
        seoKeywords: post.content_tags || [],
        isFeatured: false,
        views: 0,
        shares: 0,
        likes: 0,
      };

      console.log(`💾 Creating article with data:`, {
        id: articleData.id,
        title: articleData.title,
        slug: articleData.slug,
        source: articleData.source,
        sourceId: articleData.sourceId,
        blocksCount: articleData.content.length
      });

      // Create or update article in database using upsert
      const article = await this.articleRepository.upsert(articleData);
      console.log(`✅ Article upserted successfully: ${article.id}`);

      // Enviar notificação de novo artigo
      try {
        await this.notificationService.notifyNewArticle(article);
        console.log(`📧 Notification sent: New article created from BeehIV`);
      } catch (notificationError) {
        console.error('❌ Error sending new article notification:', notificationError);
        // Não falhar a criação por causa da notificação
      }

      return article;
    } catch (error) {
      console.error(`❌ Error converting BeehIV post to article:`, {
        error: error,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        postTitle: post.title,
        beehiivPostId: beehiivPostId
      });
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
   * Generate unique slug by checking existing articles
   */
  private async generateUniqueSlug(baseSlug: string, beehiivPostId: string): Promise<string> {
    try {
      // First check if we're updating an existing article by BeehIV post ID
      const existingArticle = await this.articleRepository.findByBeehiivPostId(beehiivPostId);
      if (existingArticle) {
        // If updating, keep the same slug
        console.log(`🔄 Keeping existing slug for update: ${existingArticle.slug}`);
        return existingArticle.slug;
      }

      // Check if base slug is available
      const existingBySlug = await this.articleRepository.findBySlug(baseSlug);
      if (!existingBySlug) {
        console.log(`✅ Base slug available: ${baseSlug}`);
        return baseSlug;
      }

      // Generate unique slug by appending timestamp or counter
      let counter = 1;
      let uniqueSlug = `${baseSlug}-${Date.now()}`;

      // Fallback: try with incremental counter if timestamp fails
      while (await this.articleRepository.findBySlug(uniqueSlug)) {
        uniqueSlug = `${baseSlug}-${counter++}`;
        if (counter > 100) break; // Safety valve
      }

      console.log(`🔢 Generated unique slug: ${uniqueSlug}`);
      return uniqueSlug;
    } catch (error) {
      console.error('❌ Error generating unique slug, using fallback:', error);
      return `${baseSlug}-${Date.now()}`;
    }
  }

  /**
   * Extract excerpt from content blocks
   */
  private extractExcerpt(blocks: any[]): string {
    // Find first paragraph block and extract first 150 characters
    for (const block of blocks) {
      if ((block.type === 'paragraph' || block.type === 'text') && block.data?.text) {
        return block.data.text.substring(0, 150).trim() + '...';
      }
    }
    return '';
  }

  /**
   * Detect category from content as fallback
   */
  private detectCategoryFromContent(title: string, blocks: any[]): string {
    const content = (title + ' ' + blocks
      .filter(b => b.data?.text)
      .map(b => b.data.text)
      .join(' ')).toLowerCase();

    console.log(`🔍 [CATEGORY DETECTION] Analyzing content: "${content.substring(0, 200)}..."`);

    // Palavras-chave mais específicas para cada categoria
    const categoryKeywords = {
      'brasil': ['brasil', 'brasileiro', 'governo', 'política', 'lula', 'bolsonaro', 'congresso', 'senado', 'câmara', 'ministro', 'presidente'],
      'internacional': ['mundo', 'internacional', 'guerra', 'ucrânia', 'rússia', 'china', 'eua', 'europa', 'onu', 'nato', 'g20'],
      'economia': ['economia', 'mercado', 'dólar', 'real', 'inflação', 'juros', 'selic', 'bc', 'banco central', 'pib', 'desemprego'],
      'tecnologia': ['tecnologia', 'tech', 'ia', 'inteligência artificial', 'chatgpt', 'openai', 'google', 'meta', 'apple', 'microsoft', 'startup'],
      'esportes': ['futebol', 'copa', 'brasileirão', 'flamengo', 'palmeiras', 'corinthians', 'são paulo', 'santos', 'vasco', 'fluminense'],
      'saude': ['saúde', 'medicina', 'hospital', 'vacina', 'covid', 'pandemia', 'médico', 'enfermeiro', 'sus']
    };

    // Contar ocorrências de palavras-chave
    const scores: Record<string, number> = {};
    
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      scores[category] = keywords.reduce((score, keyword) => {
        return score + (content.includes(keyword) ? 1 : 0);
      }, 0);
    }

    console.log(`📊 [CATEGORY DETECTION] Scores:`, scores);

    // Encontrar categoria com maior score
    const bestCategory = Object.entries(scores).reduce((best, [category, score]) => {
      return score > best.score ? { category, score } : best;
    }, { category: 'geral', score: 0 });

    console.log(`🎯 [CATEGORY DETECTION] Best match: ${bestCategory.category} (score: ${bestCategory.score})`);

    return bestCategory.category;
  }

  /**
   * Get API token for publication
   */
  async getPublicationApiToken(publicationBeehiivId: string): Promise<string | null> {
    const publication = await this.beehiivRepository.findPublicationByBeehiivId(publicationBeehiivId);
    return publication?.apiToken || null;
  }

  /**
   * Get publication name by looking up the BeehIV post
   */
  async getPublicationNameByBeehiivId(beehiivPostId: string): Promise<string | null> {
    try {
      const beehiivPost = await this.beehiivRepository.findPostByBeehiivId(beehiivPostId);
      if (beehiivPost && beehiivPost.publicationId) {
        const publication = await this.beehiivRepository.findPublicationById(beehiivPost.publicationId);
        return publication?.name || null;
      }
      return null;
    } catch (error) {
      console.error('Error getting publication name:', error);
      return null;
    }
  }

  /**
   * Get publication name from BeehIV post ID
   * Uses the NEWSLETTERS mapping to get the friendly name
   */
  async getPublicationNameFromPost(postId: string): Promise<string | null> {
    try {
      // Try to find existing post in database
      const beehiivPost = await this.beehiivRepository.findPostByBeehiivId(postId);
      if (beehiivPost && beehiivPost.publicationId) {
        const publication = await this.beehiivRepository.findPublicationById(beehiivPost.publicationId);
        if (publication) {
          // First try to get name from NEWSLETTER_NAMES mapping
          const mappedName = NEWSLETTER_NAMES[publication.beehiivId];
          if (mappedName) {
            return mappedName;
          }
          // Fallback to publication name from database
          return publication.name;
        }
      }
      return null;
    } catch (error) {
      console.error('Error getting publication name from post:', error);
      return null;
    }
  }
}