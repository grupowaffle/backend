import { AnalyticsRepository } from '../repositories';
import { DrizzleClient } from '../config/db';

export interface EngagementEvent {
  articleId: string;
  eventType: 'view' | 'like' | 'share' | 'time_on_page' | 'bounce' | 'click_through';
  value?: number; // Para time_on_page em segundos
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
    referrer?: string;
    device?: 'mobile' | 'desktop' | 'tablet';
    browser?: string;
    os?: string;
  };
}

export class EngagementTrackingService {
  private analyticsRepository: AnalyticsRepository;

  constructor(db: DrizzleClient) {
    this.analyticsRepository = new AnalyticsRepository(db);
  }

  async trackEvent(event: EngagementEvent): Promise<void> {
    try {
      console.log('📊 Tracking engagement event:', event);

      const currentAnalytics = await this.analyticsRepository.getArticleAnalytics(event.articleId);
      
      const updates: any = {};

      switch (event.eventType) {
        case 'view':
          updates.views = (currentAnalytics?.views || 0) + 1;
          break;
        
        case 'like':
          updates.likes = (currentAnalytics?.likes || 0) + 1;
          break;
        
        case 'share':
          updates.shares = (currentAnalytics?.shares || 0) + 1;
          break;
        
        case 'time_on_page':
          if (event.value) {
            const currentTime = currentAnalytics?.avgTimeOnPage || 0;
            const currentViews = currentAnalytics?.views || 1;
            // Calculate new average time on page
            updates.avgTimeOnPage = Math.round(
              (currentTime * (currentViews - 1) + event.value) / currentViews
            );
          }
          break;
        
        case 'bounce':
          const currentBounces = currentAnalytics?.bounceRate || 0;
          const bounceViews = currentAnalytics?.views || 1;
          // Calculate new bounce rate percentage
          updates.bounceRate = Math.round(
            (currentBounces * (bounceViews - 1) + 100) / bounceViews
          );
          break;
        
        case 'click_through':
          const currentCTR = currentAnalytics?.clickThroughRate || 0;
          const ctrViews = currentAnalytics?.views || 1;
          // Calculate new click-through rate percentage
          updates.clickThroughRate = Math.round(
            (currentCTR * (ctrViews - 1) + 100) / ctrViews
          );
          break;
      }

      // Track device-specific metrics
      if (event.metadata?.device) {
        if (event.metadata.device === 'mobile') {
          updates.mobileViews = (currentAnalytics?.mobileViews || 0) + 1;
        } else if (event.metadata.device === 'desktop') {
          updates.desktopViews = (currentAnalytics?.desktopViews || 0) + 1;
        }
      }

      // Track traffic sources
      if (event.metadata?.referrer) {
        if (event.metadata.referrer.includes('facebook.com')) {
          updates.facebookShares = (currentAnalytics?.facebookShares || 0) + 1;
        } else if (event.metadata.referrer.includes('twitter.com')) {
          updates.twitterShares = (currentAnalytics?.twitterShares || 0) + 1;
        } else if (event.metadata.referrer.includes('linkedin.com')) {
          updates.linkedinShares = (currentAnalytics?.linkedinShares || 0) + 1;
        } else if (event.metadata.referrer.includes('whatsapp')) {
          updates.whatsappShares = (currentAnalytics?.whatsappShares || 0) + 1;
        }
      }

      // Determine traffic source
      if (event.metadata?.referrer) {
        if (event.metadata.referrer.includes('google') || event.metadata.referrer.includes('bing')) {
          updates.organicTraffic = (currentAnalytics?.organicTraffic || 0) + 1;
        } else if (event.metadata.referrer.includes('facebook') || 
                   event.metadata.referrer.includes('twitter') || 
                   event.metadata.referrer.includes('linkedin')) {
          updates.socialTraffic = (currentAnalytics?.socialTraffic || 0) + 1;
        } else if (event.metadata.referrer === 'direct') {
          updates.directTraffic = (currentAnalytics?.directTraffic || 0) + 1;
        } else {
          updates.referralTraffic = (currentAnalytics?.referralTraffic || 0) + 1;
        }
      }

      await this.analyticsRepository.createOrUpdateAnalytics(event.articleId, updates);

    } catch (error) {
      console.error('❌ Error tracking engagement event:', error);
      // Don't throw error to avoid breaking the main flow
    }
  }

  async trackView(articleId: string, metadata?: EngagementEvent['metadata']): Promise<void> {
    await this.trackEvent({
      articleId,
      eventType: 'view',
      metadata,
    });
  }

  async trackLike(articleId: string, metadata?: EngagementEvent['metadata']): Promise<void> {
    await this.trackEvent({
      articleId,
      eventType: 'like',
      metadata,
    });
  }

  async trackShare(articleId: string, metadata?: EngagementEvent['metadata']): Promise<void> {
    await this.trackEvent({
      articleId,
      eventType: 'share',
      metadata,
    });
  }

  async trackTimeOnPage(articleId: string, seconds: number, metadata?: EngagementEvent['metadata']): Promise<void> {
    await this.trackEvent({
      articleId,
      eventType: 'time_on_page',
      value: seconds,
      metadata,
    });
  }

  async trackBounce(articleId: string, metadata?: EngagementEvent['metadata']): Promise<void> {
    await this.trackEvent({
      articleId,
      eventType: 'bounce',
      metadata,
    });
  }

  async trackClickThrough(articleId: string, metadata?: EngagementEvent['metadata']): Promise<void> {
    await this.trackEvent({
      articleId,
      eventType: 'click_through',
      metadata,
    });
  }

  // Helper method to detect device type from user agent
  detectDevice(userAgent: string): 'mobile' | 'desktop' | 'tablet' {
    const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
    const tabletRegex = /iPad|Android(?=.*\bMobile\b)/i;
    
    if (tabletRegex.test(userAgent)) {
      return 'tablet';
    } else if (mobileRegex.test(userAgent)) {
      return 'mobile';
    } else {
      return 'desktop';
    }
  }

  // Helper method to detect browser from user agent
  detectBrowser(userAgent: string): string {
    if (userAgent.includes('Chrome')) return 'Chrome';
    if (userAgent.includes('Firefox')) return 'Firefox';
    if (userAgent.includes('Safari')) return 'Safari';
    if (userAgent.includes('Edge')) return 'Edge';
    if (userAgent.includes('Opera')) return 'Opera';
    return 'Unknown';
  }

  // Helper method to detect OS from user agent
  detectOS(userAgent: string): string {
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Mac OS')) return 'macOS';
    if (userAgent.includes('Linux')) return 'Linux';
    if (userAgent.includes('Android')) return 'Android';
    if (userAgent.includes('iOS')) return 'iOS';
    return 'Unknown';
  }
}
