import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { BeehiivService } from '../../services/BeehiivService';
import { SchedulerService } from '../../services/SchedulerService';
import { BeehiivRepository, ArticleRepository } from '../../repositories';
import { getDrizzleClient } from '../../config/db';
import { Env } from '../../config/types/common';
import { generateId } from '../../lib/cuid';

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
  }

  /**
   * Get the Hono app
   */
  getApp() {
    return this.app;
  }
}