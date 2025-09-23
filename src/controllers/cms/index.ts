import { Hono } from 'hono';
import { ArticleController } from './ArticleController';
import { CategoryController } from './CategoryController';
import { BeehiivController } from './BeehiivController';
// import { MediaController } from './MediaController';
import { MediaControllerSimple } from './MediaControllerSimple';
import { TagController } from './TagController';
import { WorkflowController } from './WorkflowController';
import { NotificationController } from './NotificationController';
import { DashboardController } from './DashboardController';
// Removed FeaturedContentController - using articles API with isFeatured parameter instead
import { UserController } from './UserController';
import { TwoFactorController } from './TwoFactorController';
import { InvitationController } from './InvitationController';
import { AuditController } from './AuditController';
import { AnalyticsController } from './AnalyticsController';
import { DatabaseController } from './DatabaseController';
import { createSEOController } from './SEOController';
import { ArticleRepository, CategoryRepository } from '../../repositories';
import { getDrizzleClient } from '../../config/db';
import { Env } from '../../config/types/common';
import { authMiddleware, requireRole } from '../../middlewares/auth';

/**
 * Create CMS routes with all controllers
 */
export function createCMSRoutes(env: Env) {
  console.log('🔧 Initializing CMS routes...');
  
  const cmsApp = new Hono();

  try {
    // Initialize database connection using getDrizzleClient (same as health service)
    console.log('🔌 Creating database connection...');
    const db = getDrizzleClient(env);
    console.log('✅ Database connection created');

    // Initialize repositories
    console.log('📂 Creating repositories...');
    const articleRepository = new ArticleRepository(db);
    const categoryRepository = new CategoryRepository(db);
    console.log('✅ Repositories created');

    // Initialize controllers
    console.log('🎮 Creating controllers...');
    const articleController = new ArticleController(articleRepository, env);
    const categoryController = new CategoryController(categoryRepository);
    const beehiivController = new BeehiivController(env);
    // const mediaController = new MediaController(env);
    const mediaControllerSimple = new MediaControllerSimple(env);
    const tagController = new TagController(env);
    const workflowController = new WorkflowController(env);
    const notificationController = new NotificationController(env);
    const dashboardController = new DashboardController(env);
    // Removed featured controllers - using articles API with isFeatured parameter instead
    const userController = new UserController(env);
    const twoFactorController = new TwoFactorController(env);
    const invitationController = new InvitationController(env);
    const auditController = new AuditController(env);
    const analyticsController = new AnalyticsController(env);
    const databaseController = new DatabaseController(env);
    const seoController = createSEOController(env);
    console.log('✅ Controllers created');

    // Add test route first (public)
    cmsApp.get('/test', (c) => {
      return c.json({
        success: true,
        message: 'CMS is working',
        timestamp: new Date().toISOString(),
        database: 'connected'
      });
    });

    // Mount media routes BEFORE authentication middleware (for public file serving)
    cmsApp.route('/media', mediaControllerSimple.getApp());

    // Apply authentication middleware to all CMS routes except test and media/serve/*
    cmsApp.use('/*', authMiddleware);

    // Mount routes with authentication
    console.log('🛤️  Mounting CMS routes...');
    cmsApp.route('/articles', articleController.getApp());
    cmsApp.route('/categories', categoryController.getApp());
    cmsApp.route('/beehiiv', beehiivController.getApp());
    // cmsApp.route('/media', mediaController.getApp());
    // cmsApp.route('/media', mediaControllerSimple.getApp()); // Moved above auth middleware
    cmsApp.route('/tags', tagController.getApp());
    cmsApp.route('/workflow', workflowController.getApp());
    cmsApp.route('/notifications', notificationController.getApp());
    cmsApp.route('/dashboard', dashboardController.getApp());
    // Removed featured routes - use /articles?isFeatured=true instead
    cmsApp.route('/users', userController.getApp());
    cmsApp.route('/2fa', twoFactorController.getApp());
    cmsApp.route('/invitations', invitationController.getApp());
    cmsApp.route('/audit', auditController.getApp());
  cmsApp.route('/analytics', analyticsController.getApp());
  
  // Mount SEO AI routes
  cmsApp.route('/seo', seoController.getApp());
  
  // Mount database management routes
  cmsApp.route('/database', databaseController.getApp());
  
  console.log('✅ CMS routes mounted successfully');

  } catch (error) {
    console.error('❌ Error initializing CMS routes:', error);
    throw error;
  }

  return cmsApp;
}