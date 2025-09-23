import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { BeehiivService } from '../../services/BeehiivService';
import { SchedulerService } from '../../services/SchedulerService';
import { BeehiivRepository, ArticleRepository } from '../../repositories';
import { getDrizzleClient } from '../../config/db';
import { Env } from '../../config/types/common';
import { generateId } from '../../lib/cuid';

// Mapping of all available newsletters
const NEWSLETTERS: Record<string, { id: string; name: string; description: string }> = {
  thebizness: {
    id: 'pub_98577126-2994-4111-bc86-f60974108b94',
    name: 'The Bizness',
    description: 'Business insights and market trends'
  },
  thenews: {
    id: 'pub_ce78b549-5923-439b-be24-3f24c454bc12',
    name: 'The News',
    description: 'Latest news and current events'
  },
  thestories: {
    id: 'pub_e6f2edcf-0484-47ad-b6f2-89a866ccadc8',
    name: 'The Stories',
    description: 'Compelling stories and narratives'
  },
  thejobs: {
    id: 'pub_b0f0dc48-5946-40a5-b2b6-b245a1a0e680',
    name: 'The Jobs',
    description: 'Career opportunities and job market insights'
  },
  thechamps: {
    id: 'pub_72a981c0-3a09-4a7c-b374-dbea5b69925c',
    name: 'The Champs',
    description: 'Champions and success stories'
  },
  rising: {
    id: 'pub_89324c54-1b5f-4200-85e7-e199d56c76e3',
    name: 'Rising',
    description: 'Emerging trends and rising stars'
  },
  goget: {
    id: 'pub_3f18517c-9a0b-487e-b1c3-804c71fa6285',
    name: 'GoGet',
    description: 'Productivity and achievement tips'
  },
  healthtimes: {
    id: 'pub_f11d861b-9b39-428b-a381-af3f07ef96c9',
    name: 'Health Times',
    description: 'Health and wellness insights'
  },
  dollarbill: {
    id: 'pub_87b5253f-5fac-42d9-bb03-d100f7d434aa',
    name: 'Dollar Bill',
    description: 'Financial advice and money management'
  },
  trendreport: {
    id: 'pub_f41c4c52-beb8-4cc0-b8c0-02bb6ac2353c',
    name: 'Trend Report',
    description: 'Market trends and analysis'
  }
};

// Validation schemas
const syncPublicationSchema = z.object({
  publicationId: z.string().min(1, 'Publication ID is required'),
});

const syncLatestSchema = z.object({
  publicationId: z.string().min(1, 'Publication ID is required').optional(),
});

const createPublicationSchema = z.object({
  beehiivId: z.string().min(1, 'BeehIV ID is required'),
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required'),
  apiToken: z.string().min(1, 'API Token is required'),
  isActive: z.boolean().default(true),
});

const processPostSchema = z.object({
  postId: z.string().min(1, 'Post ID is required'),
  createArticle: z.boolean().default(true),
  autoPublish: z.boolean().default(false),
});

const schedulerConfigSchema = z.object({
  intervalHours: z.number().min(1).max(24).optional(),
  enabled: z.boolean().optional(),
  maxRetries: z.number().min(0).max(10).optional(),
  retryDelayMinutes: z.number().min(1).max(120).optional(),
});

export class BeehiivController {
  private app: Hono;
  private env: Env;
  private beehiivService: BeehiivService;
  private schedulerService: SchedulerService;
  private beehiivRepository: BeehiivRepository;
  private articleRepository: ArticleRepository;

  constructor(env: Env) {
    this.app = new Hono();
    this.env = env;
    
    // Initialize database connection using getDrizzleClient (same as health service)
    const db = getDrizzleClient(env);
    
    this.beehiivService = new BeehiivService(db, env);
    this.beehiivRepository = new BeehiivRepository(db);
    this.articleRepository = new ArticleRepository(db);
    
    // Initialize scheduler (auto-sync every 6 hours by default)
    this.schedulerService = new SchedulerService(db, {
      intervalHours: 6,
      enabled: true, // Enable by default
      maxRetries: 3,
      retryDelayMinutes: 30,
    });
    
    this.setupRoutes();
    
    // Start scheduler
    this.startScheduler();
  }

  private startScheduler() {
    try {
      this.schedulerService.start();
      console.log('✅ BeehIiv auto-sync scheduler started');
    } catch (error) {
      console.error('❌ Failed to start scheduler:', error);
    }
  }

  private setupRoutes() {
    // Get all available newsletters
    this.app.get('/newsletters', async (c) => {
      try {
        console.log('📰 Getting all available newsletters...');

        // Transform newsletters object to array
        const newsletters = Object.entries(NEWSLETTERS).map(([key, newsletter]) => ({
          key,
          id: newsletter.id,
          name: newsletter.name,
          description: newsletter.description,
          configured: !!this.env.BEEHIIV_API_KEY,
          status: 'available'
        }));

        console.log(`✅ Found ${newsletters.length} newsletters`);

        return c.json({
          success: true,
          data: newsletters,
          total: newsletters.length,
        });
      } catch (error) {
        console.error('❌ Error listing newsletters:', error);
        return c.json({
          success: false,
          error: 'Failed to list newsletters',
        }, 500);
      }
    });

    // Get newsletter details with live stats
    this.app.get('/newsletters/:key', async (c) => {
      try {
        const key = c.req.param('key');
        const newsletter = NEWSLETTERS[key];

        if (!newsletter) {
          return c.json({
            success: false,
            error: 'Newsletter not found',
          }, 404);
        }

        if (!this.env.BEEHIIV_API_KEY) {
          return c.json({
            success: true,
            data: {
              key,
              ...newsletter,
              configured: false,
              status: 'not_configured',
              stats: { subscribers: 0, openRate: 0, clickRate: 0 }
            },
          });
        }

        // Fetch live stats from Beehiiv API
        try {
          const response = await fetch(`https://api.beehiiv.com/v2/publications/${newsletter.id}`, {
            headers: {
              'Authorization': `Bearer ${this.env.BEEHIIV_API_KEY}`,
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            const data = await response.json();
            const pub = data.data;

            return c.json({
              success: true,
              data: {
                key,
                id: newsletter.id,
                name: newsletter.name,
                description: newsletter.description,
                configured: true,
                status: pub.status === 'active' ? 'active' : 'paused',
                subscribers: pub.stats?.active_subscribers || 0,
                stats: {
                  openRate: pub.stats?.average_open_rate || 0,
                  clickRate: pub.stats?.average_click_rate || 0,
                },
                lastSync: new Date().toISOString(),
              },
            });
          }
        } catch (apiError) {
          console.error(`❌ Error fetching ${newsletter.name}:`, apiError);
        }

        // Return basic info if API fails
        return c.json({
          success: true,
          data: {
            key,
            ...newsletter,
            configured: true,
            status: 'error',
            stats: { subscribers: 0, openRate: 0, clickRate: 0 }
          },
        });

      } catch (error) {
        console.error('❌ Error getting newsletter details:', error);
        return c.json({
          success: false,
          error: 'Failed to get newsletter details',
        }, 500);
      }
    });

    // Test newsletter connection
    this.app.get('/newsletters/:key/test', async (c) => {
      try {
        const key = c.req.param('key');
        const newsletter = NEWSLETTERS[key];

        if (!newsletter) {
          return c.json({
            success: false,
            message: 'Newsletter not found',
          });
        }

        if (!this.env.BEEHIIV_API_KEY) {
          return c.json({
            success: false,
            message: 'API key not configured in backend',
          });
        }

        // Test connection to specific newsletter
        const response = await fetch(`https://api.beehiiv.com/v2/publications/${newsletter.id}`, {
          headers: {
            'Authorization': `Bearer ${this.env.BEEHIIV_API_KEY}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          return c.json({
            success: false,
            message: `Failed to connect to ${newsletter.name}: ${response.statusText}`,
          });
        }

        const data = await response.json();
        const pub = data.data;

        return c.json({
          success: true,
          message: `✅ Connected to ${newsletter.name} - ${pub.stats?.active_subscribers || 0} subscribers`,
        });

      } catch (error) {
        console.error('❌ Error testing newsletter:', error);
        return c.json({
          success: false,
          message: 'Connection test failed',
        });
      }
    });

    // Get all publications
    this.app.get('/publications', async (c) => {
      try {
        console.log('🔍 BeehiivController: Getting all publications...');
        
        const publications = await this.beehiivRepository.listActivePublications();

        console.log('✅ BeehiivController: Successfully retrieved publications:', publications.length);

        return c.json({
          success: true,
          data: publications,
        });
      } catch (error) {
        console.error('❌ BeehiivController Error listing publications:', error);
        return c.json({
          success: false,
          error: 'Failed to list publications',
        }, 500);
      }
    });

    // Note: Publications are now automatically created from BEEHIIV_PUBLICATIONS environment variable
    // No need for manual creation endpoint

    // Sync posts from BeehIV
    // Note: Use /sync/latest instead for simplified synchronization

    // Note: Posts are now accessible via /api/cms/articles?source=beehiiv
    // This provides a unified interface for both manual and BeehIV articles




    // Get sync logs
    this.app.get('/sync-logs', async (c) => {
      try {
        const limit = parseInt(c.req.query('limit') || '10');
        const logs = await this.beehiivRepository.getRecentSyncLogs(limit);

        return c.json({
          success: true,
          data: logs,
        });
      } catch (error) {
        console.error('Error fetching sync logs:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch sync logs',
        }, 500);
      }
    });

    // Get sync statistics
    this.app.get('/stats', async (c) => {
      try {
        const publicationId = c.req.query('publicationId');
        const stats = await this.beehiivRepository.getSyncStats(publicationId);

        return c.json({
          success: true,
          data: stats,
        });
      } catch (error) {
        console.error('Error fetching sync stats:', error);
        return c.json({
          success: false,
          error: 'Failed to fetch sync stats',
        }, 500);
      }
    });

    // Sync latest post from specific publication
    this.app.post('/sync/latest', zValidator('json', syncLatestSchema), async (c) => {
      try {
        const { publicationId } = c.req.valid('json');

        if (publicationId) {
          // Sync from specific publication
          console.log(`🔄 Syncing latest from publication: ${publicationId}`);
          const result = await this.beehiivService.syncLatestFromPublication(publicationId);
          
          return c.json({
            success: result.success,
            message: result.message,
            data: result.post || null,
          });
        } else {
          // Sync from all publications
          console.log('🚀 Syncing latest from all publications');
          const result = await this.beehiivService.syncLatestFromAllPublications();
          
          return c.json({
            success: result.success,
            data: {
              results: result.results,
              summary: {
                total: result.results.length,
                successful: result.results.filter(r => r.success).length,
                failed: result.results.filter(r => !r.success).length,
              },
            },
          });
        }

      } catch (error) {
        console.error('❌ Error in latest sync endpoint:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Sync failed',
        }, 500);
      }
    });

    // Note: Test endpoints removed - use /sync/latest for testing synchronization

    // Scheduler management endpoints
    
    // Get scheduler status
    this.app.get('/scheduler/status', async (c) => {
      try {
        const status = this.schedulerService.getStatus();
        
        return c.json({
          success: true,
          data: status,
        });
      } catch (error) {
        console.error('Error getting scheduler status:', error);
        return c.json({
          success: false,
          error: 'Failed to get scheduler status',
        }, 500);
      }
    });

    // Get scheduler job history
    this.app.get('/scheduler/jobs', async (c) => {
      try {
        const limit = parseInt(c.req.query('limit') || '20');
        const jobs = this.schedulerService.getJobHistory(limit);
        
        return c.json({
          success: true,
          data: jobs,
        });
      } catch (error) {
        console.error('Error getting scheduler jobs:', error);
        return c.json({
          success: false,
          error: 'Failed to get scheduler jobs',
        }, 500);
      }
    });

    // Update scheduler configuration
    this.app.put('/scheduler/config', zValidator('json', schedulerConfigSchema), async (c) => {
      try {
        const config = c.req.valid('json');
        
        this.schedulerService.updateConfig(config);
        
        const newStatus = this.schedulerService.getStatus();
        
        return c.json({
          success: true,
          message: 'Scheduler configuration updated',
          data: newStatus,
        });
      } catch (error) {
        console.error('Error updating scheduler config:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update scheduler config',
        }, 500);
      }
    });

    // Manually trigger sync
    this.app.post('/scheduler/trigger', async (c) => {
      try {
        console.log('🔄 Manual sync triggered via API');
        
        const job = await this.schedulerService.triggerManualSync();
        
        return c.json({
          success: true,
          message: 'Manual sync triggered',
          data: job,
        });
      } catch (error) {
        console.error('Error triggering manual sync:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to trigger sync',
        }, 500);
      }
    });

    // Stop scheduler
    this.app.post('/scheduler/stop', async (c) => {
      try {
        this.schedulerService.stop();
        
        return c.json({
          success: true,
          message: 'Scheduler stopped',
        });
      } catch (error) {
        console.error('Error stopping scheduler:', error);
        return c.json({
          success: false,
          error: 'Failed to stop scheduler',
        }, 500);
      }
    });

    // Start/restart scheduler
    this.app.post('/scheduler/start', async (c) => {
      try {
        // Stop first if running
        this.schedulerService.stop();

        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Start
        this.schedulerService.start();

        return c.json({
          success: true,
          message: 'Scheduler started',
        });
      } catch (error) {
        console.error('Error starting scheduler:', error);
        return c.json({
          success: false,
          error: 'Failed to start scheduler',
        }, 500);
      }
    });

    // Test conversion endpoint for debugging
    this.app.post('/test-conversion', async (c) => {
      try {
        const { beehiivPostId } = await c.req.json();

        if (!beehiivPostId) {
          return c.json({
            success: false,
            error: 'beehiivPostId is required'
          }, 400);
        }

        console.log(`🧪 Testing conversion for BeehIV post: ${beehiivPostId}`);

        // Get the BeehIV post from database
        const beehiivPost = await this.beehiivRepository.findPostByBeehiivId(beehiivPostId);

        if (!beehiivPost) {
          return c.json({
            success: false,
            error: 'BeehIV post not found'
          }, 404);
        }

        // Convert RSS content to BeehiivPostResponse format
        const postResponse = {
          id: beehiivPost.beehiivId,
          title: beehiivPost.title,
          subtitle: beehiivPost.subtitle,
          subject_line: beehiivPost.subjectLine,
          preview_text: beehiivPost.previewText,
          slug: beehiivPost.slug,
          status: beehiivPost.status,
          content: {
            free: {
              rss: beehiivPost.rssContent || ''
            }
          },
          thumbnail_url: beehiivPost.thumbnailUrl,
          web_url: beehiivPost.webUrl,
          content_tags: beehiivPost.contentTags,
          meta_default_title: beehiivPost.metaTitle,
          meta_default_description: beehiivPost.metaDescription
        };

        console.log(`📊 Converting post "${postResponse.title}" with RSS length: ${postResponse.content.free.rss.length}`);

        // Force conversion to article
        const article = await this.beehiivService.convertBeehiivPostToArticle(postResponse, beehiivPost.id);

        return c.json({
          success: true,
          message: 'Conversion test completed',
          data: {
            beehiivPost: {
              id: beehiivPost.id,
              title: beehiivPost.title,
              rssLength: beehiivPost.rssContent?.length || 0
            },
            article: {
              id: article.id,
              title: article.title,
              slug: article.slug,
              category: article.category,
              blocksCount: article.content?.length || 0
            }
          }
        });

      } catch (error) {
        console.error('❌ Error in test conversion:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Conversion test failed',
          details: error
        }, 500);
      }
    });

    // Sync all newsletters (simplified version)
    this.app.post('/sync-all', async (c) => {
      try {
        console.log('🚀 Manual sync-all triggered');

        // Use the existing sync/latest endpoint for all publications
        const result = await this.beehiivService.syncLatestFromAllPublications();

        return c.json({
          success: result.success,
          synced: result.results.filter(r => r.success).length,
          failed: result.results.filter(r => !r.success).length,
          message: `Sync completed: ${result.results.filter(r => r.success).length} successful, ${result.results.filter(r => !r.success).length} failed`,
          data: result.results,
        });
      } catch (error) {
        console.error('❌ Error in sync-all:', error);
        return c.json({
          success: false,
          synced: 0,
          failed: 0,
          message: error instanceof Error ? error.message : 'Sync failed',
        }, 500);
      }
    });
  }

  /**
   * Get the Hono app
   */
  getApp() {
    return this.app;
  }
}