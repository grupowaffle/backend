import { Hono } from 'hono';
import { getDrizzleClient } from '../../config/db';
import { Env } from '../../config/types/common';

export class DatabaseController {
  private app: Hono;
  private env: Env;

  constructor(env: Env) {
    this.app = new Hono();
    this.env = env;
    
    this.setupRoutes();
  }

  private setupRoutes() {
    // Create analytics table
    this.app.post('/create-analytics-table', async (c) => {
      try {
        console.log('🔧 Creating article_analytics table...');
        
        const db = getDrizzleClient(this.env);
        
        // Create the article_analytics table
        const createTableSQL = `
          CREATE TABLE IF NOT EXISTS article_analytics (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            "articleId" TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
            
            -- Basic metrics
            views INTEGER DEFAULT 0,
            "uniqueViews" INTEGER DEFAULT 0,
            likes INTEGER DEFAULT 0,
            shares INTEGER DEFAULT 0,
            comments INTEGER DEFAULT 0,
            
            -- Engagement metrics
            "avgTimeOnPage" INTEGER DEFAULT 0,
            "bounceRate" INTEGER DEFAULT 0,
            "clickThroughRate" INTEGER DEFAULT 0,
            "conversionRate" INTEGER DEFAULT 0,
            
            -- Social metrics
            "facebookShares" INTEGER DEFAULT 0,
            "twitterShares" INTEGER DEFAULT 0,
            "linkedinShares" INTEGER DEFAULT 0,
            "whatsappShares" INTEGER DEFAULT 0,
            
            -- Traffic sources
            "organicTraffic" INTEGER DEFAULT 0,
            "socialTraffic" INTEGER DEFAULT 0,
            "directTraffic" INTEGER DEFAULT 0,
            "referralTraffic" INTEGER DEFAULT 0,
            
            -- Performance metrics
            "loadTime" INTEGER DEFAULT 0,
            "mobileViews" INTEGER DEFAULT 0,
            "desktopViews" INTEGER DEFAULT 0,
            "tabletViews" INTEGER DEFAULT 0,
            
            -- Timestamps
            date DATE DEFAULT CURRENT_DATE,
            "lastUpdated" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `;
        
        await db.execute(createTableSQL);
        console.log('✅ article_analytics table created successfully');
        
        // Create indexes for better performance
        const createIndexesSQL = `
          CREATE INDEX IF NOT EXISTS idx_article_analytics_article_id ON article_analytics("articleId");
          CREATE INDEX IF NOT EXISTS idx_article_analytics_date ON article_analytics(date);
          CREATE INDEX IF NOT EXISTS idx_article_analytics_views ON article_analytics(views DESC);
          CREATE INDEX IF NOT EXISTS idx_article_analytics_likes ON article_analytics(likes DESC);
          CREATE INDEX IF NOT EXISTS idx_article_analytics_shares ON article_analytics(shares DESC);
        `;
        
        await db.execute(createIndexesSQL);
        console.log('✅ Indexes created successfully');
        
        return c.json({
          success: true,
          message: 'article_analytics table created successfully',
        });

      } catch (error) {
        console.error('❌ Error creating analytics table:', error);
        return c.json({
          success: false,
          error: 'Failed to create analytics table',
          details: error.message,
        }, 500);
      }
    });

    // Verify table exists
    this.app.get('/verify-analytics-table', async (c) => {
      try {
        console.log('🔍 Verifying article_analytics table...');
        
        const db = getDrizzleClient(this.env);
        
        const verifySQL = `
          SELECT column_name, data_type, is_nullable 
          FROM information_schema.columns 
          WHERE table_name = 'article_analytics' 
          ORDER BY ordinal_position;
        `;
        
        const columns = await db.execute(verifySQL);
        
        return c.json({
          success: true,
          data: {
            tableExists: columns.length > 0,
            columns: columns,
          },
        });

      } catch (error) {
        console.error('❌ Error verifying analytics table:', error);
        return c.json({
          success: false,
          error: 'Failed to verify analytics table',
          details: error.message,
        }, 500);
      }
    });
  }

  getApp() {
    return this.app;
  }
}
