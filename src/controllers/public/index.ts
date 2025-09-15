import { Hono } from 'hono';
import { PublicAPIController } from './PublicAPIController';
import { Env } from '../../config/types/common';

/**
 * Create public API routes for the news portal
 * These routes are consumed by the frontend to display published content
 */
export function createPublicRoutes(env: Env) {
  console.log('🌐 Initializing Public API routes...');
  
  const publicApp = new Hono();

  try {
    // Initialize public API controller
    console.log('📡 Creating Public API controller...');
    const publicAPIController = new PublicAPIController(env);
    console.log('✅ Public API controller created');

    // Mount all public routes under /api/public
    publicApp.route('/', publicAPIController.getApp());
    
    console.log('✅ Public API routes mounted successfully');
    console.log('📋 Available public endpoints:');
    console.log('   GET /api/public/health - Service health check');
    console.log('   GET /api/public/articles - List published articles');
    console.log('   GET /api/public/articles/featured - Featured articles');
    console.log('   GET /api/public/articles/:slug - Get article by slug');
    console.log('   GET /api/public/categories - List categories');
    console.log('   GET /api/public/categories/:slug/articles - Articles by category');
    console.log('   GET /api/public/search - Search articles');
    console.log('   POST /api/public/articles/:slug/like - Like article');
    console.log('   POST /api/public/articles/:slug/share - Track share');
    console.log('   GET /api/public/stats - Site statistics');

  } catch (error) {
    console.error('❌ Error initializing Public API routes:', error);
    throw error;
  }

  return publicApp;
}