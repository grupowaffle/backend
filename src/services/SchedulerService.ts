/**
 * Serviço de agendamento para sync automático
 * Implementa cron jobs para sincronização periódica com BeehIiv
 */

import { BeehiivService } from './BeehiivService';
import { DatabaseType } from '../repositories/BaseRepository';

export interface ScheduleConfig {
  intervalHours: number; // Intervalo em horas
  enabled: boolean;
  maxRetries: number;
  retryDelayMinutes: number;
}

export interface SyncJob {
  id: string;
  scheduledAt: Date;
  executedAt?: Date;
  completedAt?: Date;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying';
  results?: any;
  error?: string;
  retryCount: number;
}

export class SchedulerService {
  private beehiivService: BeehiivService;
  private config: ScheduleConfig;
  private jobs: Map<string, SyncJob> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();

  constructor(db: DatabaseType, config: Partial<ScheduleConfig> = {}) {
    this.beehiivService = new BeehiivService(db);
    this.config = {
      intervalHours: 6, // Default: sync every 6 hours
      enabled: true,
      maxRetries: 3,
      retryDelayMinutes: 30,
      ...config,
    };

    console.log(`📅 Scheduler initialized: sync every ${this.config.intervalHours} hours`);
  }

  /**
   * Start the automatic sync scheduler
   */
  start(): void {
    if (!this.config.enabled) {
      console.log('⏸️ Scheduler is disabled');
      return;
    }

    console.log(`🚀 Starting BeehIiv sync scheduler...`);
    
    // Schedule initial sync after 1 minute
    setTimeout(() => {
      this.executeSync();
    }, 60000);

    // Schedule recurring sync
    const intervalMs = this.config.intervalHours * 60 * 60 * 1000;
    const mainTimer = setInterval(() => {
      this.executeSync();
    }, intervalMs);

    this.timers.set('main', mainTimer);
    
    console.log(`✅ Scheduler started: next sync in ${this.config.intervalHours} hours`);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    console.log('🛑 Stopping scheduler...');
    
    this.timers.forEach((timer, name) => {
      clearTimeout(timer);
      clearInterval(timer);
      console.log(`⏹️ Stopped timer: ${name}`);
    });
    
    this.timers.clear();
    console.log('✅ Scheduler stopped');
  }

  /**
   * Execute sync job
   */
  private async executeSync(): Promise<void> {
    const jobId = `sync_${Date.now()}`;
    
    const job: SyncJob = {
      id: jobId,
      scheduledAt: new Date(),
      status: 'pending',
      retryCount: 0,
    };

    this.jobs.set(jobId, job);
    
    console.log(`🔄 Starting scheduled sync job: ${jobId}`);
    
    try {
      // Update job status
      job.status = 'running';
      job.executedAt = new Date();
      
      // Execute sync
      const results = await this.beehiivService.syncLatestFromAllPublications();
      
      // Update job with results
      job.status = 'completed';
      job.completedAt = new Date();
      job.results = results;
      
      console.log(`✅ Scheduled sync completed: ${jobId}`);
      console.log(`📊 Results: ${results.results.filter(r => r.success).length}/${results.results.length} publications successful`);
      
      // Log individual results
      results.results.forEach(result => {
        const icon = result.success ? '✅' : '❌';
        console.log(`${icon} ${result.publicationName}: ${result.message}`);
      });
      
    } catch (error) {
      console.error(`❌ Scheduled sync failed: ${jobId}`, error);
      
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      job.completedAt = new Date();
      
      // Schedule retry if under max retries
      if (job.retryCount < this.config.maxRetries) {
        this.scheduleRetry(job);
      } else {
        console.error(`🚨 Max retries exceeded for job: ${jobId}`);
      }
    }
    
    // Cleanup old jobs (keep last 50)
    this.cleanupOldJobs();
  }

  /**
   * Schedule retry for failed job
   */
  private scheduleRetry(job: SyncJob): void {
    job.retryCount++;
    job.status = 'retrying';
    
    const retryDelayMs = this.config.retryDelayMinutes * 60 * 1000;
    
    console.log(`⏳ Scheduling retry ${job.retryCount}/${this.config.maxRetries} for job ${job.id} in ${this.config.retryDelayMinutes} minutes`);
    
    const retryTimer = setTimeout(async () => {
      try {
        console.log(`🔄 Retrying sync job: ${job.id} (attempt ${job.retryCount})`);
        
        job.status = 'running';
        job.executedAt = new Date();
        
        const results = await this.beehiivService.syncLatestFromAllPublications();
        
        job.status = 'completed';
        job.completedAt = new Date();
        job.results = results;
        
        console.log(`✅ Retry successful: ${job.id}`);
        
      } catch (error) {
        console.error(`❌ Retry failed: ${job.id}`, error);
        
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'Unknown error';
        job.completedAt = new Date();
        
        // Schedule another retry if under max
        if (job.retryCount < this.config.maxRetries) {
          this.scheduleRetry(job);
        }
      }
    }, retryDelayMs);

    this.timers.set(`retry_${job.id}`, retryTimer);
  }

  /**
   * Cleanup old jobs to prevent memory leaks
   */
  private cleanupOldJobs(): void {
    const jobs = Array.from(this.jobs.values()).sort((a, b) => 
      b.scheduledAt.getTime() - a.scheduledAt.getTime()
    );
    
    // Keep only the 50 most recent jobs
    if (jobs.length > 50) {
      const toDelete = jobs.slice(50);
      toDelete.forEach(job => {
        this.jobs.delete(job.id);
        
        // Clear any pending retry timers
        const retryTimer = this.timers.get(`retry_${job.id}`);
        if (retryTimer) {
          clearTimeout(retryTimer);
          this.timers.delete(`retry_${job.id}`);
        }
      });
      
      console.log(`🧹 Cleaned up ${toDelete.length} old jobs`);
    }
  }

  /**
   * Get job history
   */
  getJobHistory(limit = 20): SyncJob[] {
    const jobs = Array.from(this.jobs.values()).sort((a, b) => 
      b.scheduledAt.getTime() - a.scheduledAt.getTime()
    );
    
    return jobs.slice(0, limit);
  }

  /**
   * Get current job status
   */
  getStatus(): {
    enabled: boolean;
    config: ScheduleConfig;
    activeJobs: number;
    totalJobs: number;
    lastJob?: SyncJob;
    nextSyncIn?: number; // minutes
  } {
    const activeJobs = Array.from(this.jobs.values()).filter(job => 
      job.status === 'running' || job.status === 'retrying'
    ).length;
    
    const jobs = Array.from(this.jobs.values()).sort((a, b) => 
      b.scheduledAt.getTime() - a.scheduledAt.getTime()
    );
    
    const lastJob = jobs[0];
    
    // Calculate next sync time (approximate)
    let nextSyncIn: number | undefined;
    if (this.config.enabled && lastJob) {
      const nextSync = new Date(lastJob.scheduledAt.getTime() + (this.config.intervalHours * 60 * 60 * 1000));
      const now = new Date();
      nextSyncIn = Math.max(0, Math.ceil((nextSync.getTime() - now.getTime()) / (60 * 1000)));
    }
    
    return {
      enabled: this.config.enabled,
      config: this.config,
      activeJobs,
      totalJobs: this.jobs.size,
      lastJob,
      nextSyncIn,
    };
  }

  /**
   * Manually trigger sync
   */
  async triggerManualSync(): Promise<any> {
    console.log('🔄 Manual sync triggered');
    await this.executeSync();
    
    const jobs = Array.from(this.jobs.values()).sort((a, b) => 
      b.scheduledAt.getTime() - a.scheduledAt.getTime()
    );
    
    return jobs[0]; // Return the most recent job
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ScheduleConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    console.log('⚙️ Scheduler config updated:', {
      from: oldConfig,
      to: this.config,
    });
    
    // Restart if interval changed
    if (oldConfig.intervalHours !== this.config.intervalHours && this.config.enabled) {
      console.log('🔄 Restarting scheduler with new interval...');
      this.stop();
      this.start();
    }
  }
}