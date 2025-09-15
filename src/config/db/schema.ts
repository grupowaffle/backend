import { pgTable, text, timestamp, integer, boolean, primaryKey, unique, json, serial, index } from 'drizzle-orm/pg-core';
import { generateId } from '../../lib/cuid';

// Users table (using pgTable for public schema by default)
export const users = pgTable('users', {
  id: integer('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  
  // Authentication & Security
  passwordHash: text('passwordHash'), // bcrypt hash
  isActive: boolean('isActive').notNull().default(true),
  emailVerified: boolean('emailVerified').notNull().default(false),
  emailVerifiedAt: timestamp('emailVerifiedAt', { withTimezone: true }),
  
  // Multi-Factor Authentication
  twoFactorEnabled: boolean('twoFactorEnabled').notNull().default(false),
  twoFactorSecret: text('twoFactorSecret'), // TOTP secret
  backupCodes: json('backupCodes'), // Array of backup codes
  
  // Role & Permissions
  role: text('role').notNull().default('editor'), // 'admin', 'editor-chefe', 'editor', 'revisor', 'user'
  permissions: json('permissions'), // Array of specific permissions
  brandId: text('brandId'),
  brandName: text('brandName'),
  
  // Profile Information
  firstName: text('firstName'),
  lastName: text('lastName'),
  bio: text('bio'),
  avatar: text('avatar'), // URL to profile image
  phone: text('phone'),
  timezone: text('timezone').default('America/Sao_Paulo'),
  language: text('language').default('pt-BR'),
  
  // Access Control
  lastLoginAt: timestamp('lastLoginAt', { withTimezone: true }),
  lastLoginIp: text('lastLoginIp'),
  loginCount: integer('loginCount').default(0),
  failedLoginAttempts: integer('failedLoginAttempts').default(0),
  lockedUntil: timestamp('lockedUntil', { withTimezone: true }),
  
  // Invitation & Onboarding
  invitedBy: text('invitedBy').references(() => users.id),
  invitedAt: timestamp('invitedAt', { withTimezone: true }),
  onboardingCompleted: boolean('onboardingCompleted').notNull().default(false),
  onboardingCompletedAt: timestamp('onboardingCompletedAt', { withTimezone: true }),
  
  // Metadata
  metadata: json('metadata'), // Additional custom data
  
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueEmail: unique('users_unique_email').on(table.email),
}));

// Subscribers table
export const subscribers = pgTable('subscribers', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  email: text('email').notNull().unique(),
  name: text('name'),
  status: text('status').notNull().default('active'),
  source: text('source'),
  tags: text('tags'),
  subscribedAt: timestamp('subscribedAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

// Tickets table
export const tickets = pgTable('tickets', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('open'),
  priority: text('priority').notNull().default('medium'),
  assignedTo: text('assignedTo'),
  createdBy: text('createdBy').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

// Acquisitions table
export const acquisitions = pgTable('acquisitions', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  subscriberId: text('subscriberId').notNull(),
  automationId: text('automationId'),
  journeyId: text('journeyId'),
  source: text('source'),
  campaign: text('campaign'),
  acquisitionDate: timestamp('acquisitionDate', { withTimezone: true }).notNull().defaultNow(),
  isTest: boolean('isTest').notNull().default(false),
});

// URL Tracking table
export const urlTracking = pgTable('url_tracking', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  originalUrl: text('originalUrl').notNull(),
  shortCode: text('shortCode').notNull().unique(),
  clicks: integer('clicks').notNull().default(0),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

// Export types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Subscriber = typeof subscribers.$inferSelect;
export type NewSubscriber = typeof subscribers.$inferInsert;

export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;

export type Acquisition = typeof acquisitions.$inferSelect;
export type NewAcquisition = typeof acquisitions.$inferInsert;

export type UrlTracking = typeof urlTracking.$inferSelect;
export type NewUrlTracking = typeof urlTracking.$inferInsert;

// ===========================================
// CMS TABLES
// ===========================================

// Categories table
export const categories = pgTable('categories', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  parentId: text('parentId').references(() => categories.id),
  color: text('color'),
  icon: text('icon'),
  order: integer('order').default(0),
  isActive: boolean('isActive').default(true),
  featuredOnHomepage: boolean('featuredOnHomepage').default(false),
  seoTitle: text('seoTitle'),
  seoDescription: text('seoDescription'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

// Authors table
export const authors = pgTable('authors', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  bio: text('bio'),
  avatar: text('avatar'),
  email: text('email'),
  socialLinks: json('socialLinks'),
  expertise: text('expertise'),
  location: text('location'),
  isActive: boolean('isActive').default(true),
  featuredAuthor: boolean('featuredAuthor').default(false),
  articleCount: integer('articleCount').default(0),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

// Media table
export const media = pgTable('media', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  filename: text('filename').notNull(),
  originalName: text('originalName'),
  mimeType: text('mimeType').notNull(),
  size: integer('size'),
  width: integer('width'),
  height: integer('height'),
  
  // URLs and storage
  url: text('url').notNull(),
  storagePath: text('storagePath'),
  externalUrl: text('externalUrl'),
  
  // Metadata
  alt: text('alt'),
  caption: text('caption'),
  description: text('description'),
  
  // Organization
  folder: text('folder').default('general'),
  tags: json('tags'),
  
  // Hybrid system - Origin tracking
  source: text('source').notNull().default('upload'), // 'upload', 'beehiiv_link', 'external'
  sourceMetadata: json('sourceMetadata'),
  
  // For BeehIV images
  beehiivOriginalUrl: text('beehiivOriginalUrl'),
  isCached: boolean('isCached').default(false),
  cachePath: text('cachePath'),
  
  // Processing
  processedVersions: json('processedVersions'),
  optimizationStatus: text('optimizationStatus').default('pending'),
  
  // Control
  uploadedBy: text('uploadedBy').references(() => users.id),
  isActive: boolean('isActive').default(true),
  
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

// Articles table
export const articles = pgTable('articles', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  content: json('content'), // Structured blocks
  excerpt: text('excerpt'),
  
  // Status and publication
  status: text('status').notNull().default('draft'), // draft, beehiiv_pending, published, etc
  publishedAt: timestamp('publishedAt', { withTimezone: true }),
  scheduledFor: timestamp('scheduledFor', { withTimezone: true }),
  
  // SEO
  seoTitle: text('seoTitle'),
  seoDescription: text('seoDescription'),
  seoKeywords: json('seoKeywords'),
  
  // Categorization
  categoryId: text('categoryId').references(() => categories.id),
  tags: json('tags'),
  
  // HYBRID SYSTEM - Origin tracking
  source: text('source').notNull().default('manual'), // 'manual', 'beehiiv'
  sourceId: text('sourceId'), // ID from original source
  sourceUrl: text('sourceUrl'), // URL from source
  newsletter: text('newsletter'), // For BeehIV content
  
  // FEATURED SYSTEM
  isFeatured: boolean('isFeatured').default(false),
  featuredPosition: integer('featuredPosition'),
  featuredUntil: timestamp('featuredUntil', { withTimezone: true }),
  featuredCategory: text('featuredCategory'),
  featuredBy: text('featuredBy').references(() => users.id),
  featuredAt: timestamp('featuredAt', { withTimezone: true }),
  
  // Images
  featuredImageId: text('featuredImageId').references(() => media.id),
  featuredImage: text('featuredImage'), // Direct URL for BeehIV compatibility
  galleryIds: json('galleryIds'), // Array of media IDs
  
  // Authorship
  authorId: text('authorId').references(() => authors.id),
  editorId: text('editorId').references(() => users.id),
  
  // Analytics
  views: integer('views').default(0),
  shares: integer('shares').default(0),
  likes: integer('likes').default(0),
  
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

// BeehIV Publications table
export const beehiivPublications = pgTable('beehiiv_publications', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  beehiivId: text('beehiiv_id').unique().notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  apiToken: text('api_token'),
  webhookSecret: text('webhook_secret'),
  isActive: boolean('is_active').default(true),
  lastSync: timestamp('last_sync', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// BeehIV Posts table
export const beehiivPosts = pgTable('beehiiv_posts', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  beehiivId: text('beehiiv_id').unique().notNull(),
  publicationId: text('publication_id').references(() => beehiivPublications.id),
  title: text('title').notNull(),
  subtitle: text('subtitle'),
  subjectLine: text('subject_line'),
  previewText: text('preview_text'),
  slug: text('slug'),
  status: text('status'),
  audience: text('audience'),
  platform: text('platform'),
  publishDate: timestamp('publish_date', { withTimezone: true }),
  displayedDate: timestamp('displayed_date', { withTimezone: true }),
  createdTimestamp: integer('created_timestamp'),
  thumbnailUrl: text('thumbnail_url'),
  webUrl: text('web_url'),
  splitTested: boolean('split_tested').default(false),
  hiddenFromFeed: boolean('hidden_from_feed').default(false),
  authors: json('authors'),
  contentTags: json('content_tags'),
  metaTitle: text('meta_title'),
  metaDescription: text('meta_description'),
  rawContent: json('raw_content'), // Full API content
  rssContent: text('rss_content'), // RSS content for article creation
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Editorial Workflow table
export const editorialWorkflow = pgTable('editorial_workflow', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  articleId: text('articleId').references(() => articles.id),
  beehiivPostId: text('beehiivPostId').references(() => beehiivPosts.id),
  
  // Status and control
  currentStatus: text('currentStatus').notNull(),
  previousStatus: text('previousStatus'),
  
  // People involved
  assignedEditor: text('assignedEditor').references(() => users.id),
  reviewedBy: text('reviewedBy').references(() => users.id),
  approvedBy: text('approvedBy').references(() => users.id),
  
  // Timestamps
  importedAt: timestamp('importedAt', { withTimezone: true }),
  assignedAt: timestamp('assignedAt', { withTimezone: true }),
  submittedForReviewAt: timestamp('submittedForReviewAt', { withTimezone: true }),
  reviewedAt: timestamp('reviewedAt', { withTimezone: true }),
  approvedAt: timestamp('approvedAt', { withTimezone: true }),
  publishedAt: timestamp('publishedAt', { withTimezone: true }),
  rejectedAt: timestamp('rejectedAt', { withTimezone: true }),
  
  // Feedback
  editorNotes: text('editorNotes'),
  rejectionReason: text('rejectionReason'),
  approvalNotes: text('approvalNotes'),
  
  // Priority and deadline
  priority: text('priority').default('medium'),
  deadline: timestamp('deadline', { withTimezone: true }),
  
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

// Featured Content table
export const featuredContent = pgTable('featured_content', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  articleId: text('articleId').references(() => articles.id),
  
  // Type and position
  featuredType: text('featuredType').notNull(), // 'hero_main', 'hero_secondary', 'trending_now', etc
  position: text('position').notNull(), // 'homepage_main', 'homepage_secondary', 'category_header', etc
  priority: integer('priority').notNull().default(0),
  categoryId: text('categoryId').references(() => categories.id),
  
  // Time control
  startDate: timestamp('startDate', { withTimezone: true }).notNull().defaultNow(),
  endDate: timestamp('endDate', { withTimezone: true }),
  
  // Customization
  customTitle: text('customTitle'),
  customDescription: text('customDescription'),
  customImageUrl: text('customImageUrl'),
  metadata: json('metadata'), // Additional custom data
  
  // Editorial control
  createdBy: text('createdBy').references(() => users.id).notNull(),
  updatedBy: text('updatedBy').references(() => users.id).notNull(),
  
  isActive: boolean('isActive').default(true),
  
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // Prevent conflicts in same type/position/priority
  uniqueTypePosition: unique('featured_unique_type_position').on(table.featuredType, table.position, table.priority),
}));

// Featured Positions Configuration
export const featuredPositions = pgTable('featured_positions', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  positionKey: text('positionKey').notNull().unique(), // 'homepage_main', 'category_header', etc
  displayName: text('displayName').notNull(),
  description: text('description'),
  maxItems: integer('maxItems').default(10),
  allowedTypes: json('allowedTypes'), // Array of allowed featured types
  isActive: boolean('isActive').default(true),
  sortOrder: integer('sortOrder').default(0),
  
  // Layout configuration
  layoutConfig: json('layoutConfig'), // Grid, carousel, list, etc
  
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

// Notifications table
export const notifications = pgTable('notifications', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  userId: text('user_id').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  priority: text('priority').notNull().default('medium'),
  data: json('data'),
  actionUrl: text('action_url'),
  actionText: text('action_text'),
  isRead: boolean('is_read').notNull().default(false),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});

// BeehIV Sync Logs table
export const beehiivSyncLogs = pgTable('beehiiv_sync_logs', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  publicationId: text('publication_id').references(() => beehiivPublications.id),
  syncStartedAt: timestamp('sync_started_at', { withTimezone: true }).notNull().defaultNow(),
  syncCompletedAt: timestamp('sync_completed_at', { withTimezone: true }),
  postsFound: integer('posts_found').default(0),
  postsProcessed: integer('posts_processed').default(0),
  postsFailed: integer('posts_failed').default(0),
  errorDetails: json('error_details'),
  status: text('status').notNull().default('in_progress'), // 'success', 'partial', 'failed'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// User Sessions table
export const userSessions = pgTable('user_sessions', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  userId: text('userId').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  token: text('token').notNull().unique(), // JWT token ID or session token
  deviceInfo: text('deviceInfo'), // User agent, device type
  ipAddress: text('ipAddress'),
  location: text('location'), // City, Country
  isActive: boolean('isActive').notNull().default(true),
  lastActivityAt: timestamp('lastActivityAt', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueToken: unique('sessions_unique_token').on(table.token),
}));

// User Invitations table
export const userInvitations = pgTable('user_invitations', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  email: text('email').notNull(),
  role: text('role').notNull().default('editor'),
  permissions: json('permissions'),
  
  // Invitation details
  invitedBy: text('invitedBy').references(() => users.id).notNull(),
  inviteToken: text('inviteToken').notNull().unique(),
  message: text('message'), // Custom invitation message
  
  // Status and timing
  status: text('status').notNull().default('pending'), // 'pending', 'accepted', 'expired', 'revoked'
  acceptedAt: timestamp('acceptedAt', { withTimezone: true }),
  acceptedBy: text('acceptedBy').references(() => users.id),
  revokedAt: timestamp('revokedAt', { withTimezone: true }),
  revokedBy: text('revokedBy').references(() => users.id),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  
  // Brand association
  brandId: text('brandId'),
  brandName: text('brandName'),
  
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueToken: unique('invitations_unique_token').on(table.inviteToken),
  uniqueEmailPending: unique('invitations_unique_email_pending').on(table.email, table.status),
}));

// Audit Logs table
export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  
  // User and session info
  userId: text('userId').references(() => users.id),
  userName: text('userName'),
  userEmail: text('userEmail'),
  sessionId: text('sessionId').references(() => userSessions.id),
  
  // Action details
  action: text('action').notNull(), // 'login', 'logout', 'create_user', 'update_article', etc.
  resource: text('resource'), // 'user', 'article', 'category', etc.
  resourceId: text('resourceId'),
  
  // Request details
  method: text('method'), // HTTP method
  endpoint: text('endpoint'), // API endpoint
  userAgent: text('userAgent'),
  ipAddress: text('ipAddress').notNull(),
  location: text('location'),
  
  // Change tracking
  oldValues: json('oldValues'), // Previous state
  newValues: json('newValues'), // New state
  changes: json('changes'), // Summary of changes
  
  // Result
  success: boolean('success').notNull(),
  errorMessage: text('errorMessage'),
  statusCode: integer('statusCode'),
  
  // Metadata
  metadata: json('metadata'), // Additional context
  tags: json('tags'), // Array of tags for categorization
  
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // Indexes for common queries
  userActionIdx: table.userId,
  actionIdx: table.action,
  resourceIdx: table.resource,
  createdAtIdx: table.createdAt,
}));

// Security Events table (separate from audit logs for high-priority security events)
export const securityEvents = pgTable('security_events', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  
  // Event classification
  eventType: text('eventType').notNull(), // 'failed_login', 'account_locked', 'suspicious_activity', etc.
  severity: text('severity').notNull().default('medium'), // 'low', 'medium', 'high', 'critical'
  category: text('category').notNull(), // 'authentication', 'authorization', 'data_access', etc.
  
  // User and session
  userId: text('userId').references(() => users.id),
  userEmail: text('userEmail'),
  sessionId: text('sessionId').references(() => userSessions.id),
  
  // Location and device
  ipAddress: text('ipAddress').notNull(),
  userAgent: text('userAgent'),
  location: text('location'),
  deviceFingerprint: text('deviceFingerprint'),
  
  // Event details
  description: text('description').notNull(),
  additionalData: json('additionalData'),
  
  // Response
  resolved: boolean('resolved').notNull().default(false),
  resolvedAt: timestamp('resolvedAt', { withTimezone: true }),
  resolvedBy: text('resolvedBy').references(() => users.id),
  resolution: text('resolution'),
  
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // Indexes for security monitoring
  eventTypeIdx: table.eventType,
  severityIdx: table.severity,
  createdAtIdx: table.createdAt,
  resolvedIdx: table.resolved,
}));

// User Permissions Definitions
export const permissionDefinitions = pgTable('permission_definitions', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  key: text('key').notNull().unique(), // 'articles:create', 'users:manage', etc.
  name: text('name').notNull(),
  description: text('description'),
  category: text('category').notNull(), // 'content', 'users', 'system', etc.
  resource: text('resource'), // 'articles', 'users', 'settings', etc.
  action: text('action'), // 'create', 'read', 'update', 'delete', 'manage', etc.
  isSystemPermission: boolean('isSystemPermission').notNull().default(false),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
});

// Analytics Tables
export const articleAnalytics = pgTable('article_analytics', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  articleId: text('articleId').references(() => articles.id).notNull(),
  
  // Basic metrics
  views: integer('views').default(0),
  uniqueViews: integer('uniqueViews').default(0),
  likes: integer('likes').default(0),
  shares: integer('shares').default(0),
  comments: integer('comments').default(0),
  
  // Engagement metrics
  avgTimeOnPage: integer('avgTimeOnPage').default(0), // seconds
  bounceRate: integer('bounceRate').default(0), // percentage * 100
  clickThroughRate: integer('clickThroughRate').default(0), // percentage * 100
  conversionRate: integer('conversionRate').default(0), // percentage * 100
  
  // Social metrics
  facebookShares: integer('facebookShares').default(0),
  twitterShares: integer('twitterShares').default(0),
  linkedinShares: integer('linkedinShares').default(0),
  whatsappShares: integer('whatsappShares').default(0),
  
  // Traffic sources
  organicTraffic: integer('organicTraffic').default(0),
  socialTraffic: integer('socialTraffic').default(0),
  directTraffic: integer('directTraffic').default(0),
  referralTraffic: integer('referralTraffic').default(0),
  
  // Performance metrics
  loadTime: integer('loadTime').default(0), // milliseconds
  mobileViews: integer('mobileViews').default(0),
  desktopViews: integer('desktopViews').default(0),
  tabletViews: integer('tabletViews').default(0),
  
  // Date tracking
  date: timestamp('date', { withTimezone: true }).notNull().defaultNow(),
  lastUpdated: timestamp('lastUpdated', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  articleDateIdx: table.articleId,
  dateIdx: table.date,
}));

// Real-time Analytics Events
export const analyticsEvents = pgTable('analytics_events', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  
  // Event details
  eventType: text('eventType').notNull(), // 'page_view', 'click', 'share', 'like', 'time_spent', etc.
  eventCategory: text('eventCategory').notNull(), // 'article', 'navigation', 'social', etc.
  eventAction: text('eventAction').notNull(), // 'view', 'click_link', 'share_facebook', etc.
  eventLabel: text('eventLabel'), // Additional context
  
  // Resource references
  articleId: text('articleId').references(() => articles.id),
  categoryId: text('categoryId').references(() => categories.id),
  userId: text('userId').references(() => users.id),
  
  // Session and user tracking
  sessionId: text('sessionId').notNull(),
  visitorId: text('visitorId').notNull(), // Anonymous visitor tracking
  
  // Technical details
  userAgent: text('userAgent'),
  ipAddress: text('ipAddress'),
  deviceType: text('deviceType'), // 'mobile', 'desktop', 'tablet'
  browser: text('browser'),
  os: text('os'),
  country: text('country'),
  city: text('city'),
  
  // Referrer information
  referrer: text('referrer'),
  referrerDomain: text('referrerDomain'),
  utmSource: text('utmSource'),
  utmMedium: text('utmMedium'),
  utmCampaign: text('utmCampaign'),
  
  // Event data
  value: integer('value'), // Numeric value associated with event
  duration: integer('duration'), // Duration in seconds (for time-based events)
  metadata: json('metadata'), // Additional event data
  
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  eventTypeIdx: table.eventType,
  articleIdIdx: table.articleId,
  createdAtIdx: table.createdAt,
  sessionIdIdx: table.sessionId,
}));

// User Behavior Analytics
export const userBehaviorAnalytics = pgTable('user_behavior_analytics', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  
  // User identification
  userId: text('userId').references(() => users.id),
  visitorId: text('visitorId').notNull(), // For anonymous users
  sessionId: text('sessionId').notNull(),
  
  // Behavior metrics
  pagesVisited: integer('pagesVisited').default(0),
  sessionDuration: integer('sessionDuration').default(0), // seconds
  articlesRead: integer('articlesRead').default(0),
  interactionEvents: integer('interactionEvents').default(0),
  
  // Reading patterns
  avgReadingTime: integer('avgReadingTime').default(0), // seconds per article
  completionRate: integer('completionRate').default(0), // percentage * 100
  scrollDepth: integer('scrollDepth').default(0), // percentage * 100
  
  // Engagement patterns
  likesGiven: integer('likesGiven').default(0),
  sharesPerformed: integer('sharesPerformed').default(0),
  commentsPosted: integer('commentsPosted').default(0),
  
  // Navigation patterns
  bounceRate: integer('bounceRate').default(0), // percentage * 100
  returnVisitor: boolean('returnVisitor').default(false),
  deviceSwitching: boolean('deviceSwitching').default(false),
  
  // Preferences (inferred)
  preferredCategories: json('preferredCategories'), // Array of category IDs
  readingTimePreference: text('readingTimePreference'), // 'morning', 'afternoon', 'evening', 'night'
  devicePreference: text('devicePreference'), // 'mobile', 'desktop', 'tablet'
  
  // Session info
  entryPage: text('entryPage'),
  exitPage: text('exitPage'),
  
  date: timestamp('date', { withTimezone: true }).notNull().defaultNow(),
  lastActivity: timestamp('lastActivity', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  visitorIdIdx: table.visitorId,
  dateIdx: table.date,
  sessionIdIdx: table.sessionId,
}));

// Content Performance Analytics
export const contentPerformanceAnalytics = pgTable('content_performance_analytics', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  
  // Content identification
  articleId: text('articleId').references(() => articles.id).notNull(),
  categoryId: text('categoryId').references(() => categories.id),
  authorId: text('authorId').references(() => authors.id),
  
  // Performance metrics
  performanceScore: integer('performanceScore').default(0), // 0-100 calculated score
  engagementRate: integer('engagementRate').default(0), // percentage * 100
  shareVelocity: integer('shareVelocity').default(0), // shares per hour in first 24h
  
  // Content analysis
  wordCount: integer('wordCount').default(0),
  readingTime: integer('readingTime').default(0), // estimated minutes
  readabilityScore: integer('readabilityScore').default(0), // 0-100
  
  // SEO metrics
  seoScore: integer('seoScore').default(0), // 0-100
  organicClickThroughRate: integer('organicClickThroughRate').default(0), // percentage * 100
  avgPosition: integer('avgPosition').default(0), // average SERP position * 10
  impressions: integer('impressions').default(0),
  organicClicks: integer('organicClicks').default(0),
  
  // Timing analysis
  publishedAt: timestamp('publishedAt', { withTimezone: true }),
  firstView: timestamp('firstView', { withTimezone: true }),
  peakTrafficTime: timestamp('peakTrafficTime', { withTimezone: true }),
  
  // Comparative metrics
  categoryAvgPerformance: integer('categoryAvgPerformance').default(0),
  authorAvgPerformance: integer('authorAvgPerformance').default(0),
  siteAvgPerformance: integer('siteAvgPerformance').default(0),
  
  calculatedAt: timestamp('calculatedAt', { withTimezone: true }).notNull().defaultNow(),
  nextRecalculationAt: timestamp('nextRecalculationAt', { withTimezone: true }),
}, (table) => ({
  articleIdIdx: table.articleId,
  performanceScoreIdx: table.performanceScore,
  calculatedAtIdx: table.calculatedAt,
}));

// Workflow History table
export const workflowHistory = pgTable('workflow_history', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  articleId: text('articleId').references(() => articles.id),
  fromStatus: text('fromStatus').notNull(),
  toStatus: text('toStatus').notNull(),
  userId: text('userId').references(() => users.id),
  userName: text('userName').notNull(),
  userRole: text('userRole').notNull(),
  reason: text('reason'),
  feedback: text('feedback'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  articleIdIdx: table.articleId,
  createdAtIdx: table.createdAt,
}));

// ===========================================
// CMS TYPES
// ===========================================

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type Author = typeof authors.$inferSelect;
export type NewAuthor = typeof authors.$inferInsert;

export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;

export type Article = typeof articles.$inferSelect;
export type NewArticle = typeof articles.$inferInsert;

export type BeehiivPublication = typeof beehiivPublications.$inferSelect;
export type NewBeehiivPublication = typeof beehiivPublications.$inferInsert;

export type BeehiivPost = typeof beehiivPosts.$inferSelect;
export type NewBeehiivPost = typeof beehiivPosts.$inferInsert;

export type EditorialWorkflow = typeof editorialWorkflow.$inferSelect;
export type NewEditorialWorkflow = typeof editorialWorkflow.$inferInsert;

export type FeaturedContent = typeof featuredContent.$inferSelect;
export type NewFeaturedContent = typeof featuredContent.$inferInsert;

export type FeaturedPosition = typeof featuredPositions.$inferSelect;
export type NewFeaturedPosition = typeof featuredPositions.$inferInsert;

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

export type BeehiivSyncLog = typeof beehiivSyncLogs.$inferSelect;
export type NewBeehiivSyncLog = typeof beehiivSyncLogs.$inferInsert;

// User Management Types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type UserSession = typeof userSessions.$inferSelect;
export type NewUserSession = typeof userSessions.$inferInsert;

export type UserInvitation = typeof userInvitations.$inferSelect;
export type NewUserInvitation = typeof userInvitations.$inferInsert;

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

export type SecurityEvent = typeof securityEvents.$inferSelect;
export type NewSecurityEvent = typeof securityEvents.$inferInsert;

export type PermissionDefinition = typeof permissionDefinitions.$inferSelect;
export type NewPermissionDefinition = typeof permissionDefinitions.$inferInsert;

// Analytics Types
export type ArticleAnalytics = typeof articleAnalytics.$inferSelect;
export type NewArticleAnalytics = typeof articleAnalytics.$inferInsert;

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert;

export type UserBehaviorAnalytics = typeof userBehaviorAnalytics.$inferSelect;
export type NewUserBehaviorAnalytics = typeof userBehaviorAnalytics.$inferInsert;

export type ContentPerformanceAnalytics = typeof contentPerformanceAnalytics.$inferSelect;
export type NewContentPerformanceAnalytics = typeof contentPerformanceAnalytics.$inferInsert;

export type WorkflowHistory = typeof workflowHistory.$inferSelect;
export type NewWorkflowHistory = typeof workflowHistory.$inferInsert;

// ===========================================
// MEDIA STORAGE TABLES (R2 Integration)
// ===========================================

// Tabela principal de arquivos de mídia
export const mediaFiles = pgTable('media_files', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  fileName: text('fileName').notNull(),
  originalFileName: text('originalFileName').notNull(),
  fileType: text('fileType').notNull(), // MIME type
  fileSize: integer('fileSize').notNull(), // em bytes
  r2Key: text('r2Key').notNull().unique(), // Chave no R2
  r2Url: text('r2Url').notNull(), // URL interna do R2
  internalUrl: text('internalUrl').notNull(), // URL servida pelo Worker
  module: text('module').notNull(), // 'articles', 'profiles', etc.
  entityId: text('entityId'), // ID da entidade relacionada
  uploadedBy: text('uploadedBy').references(() => users.id),
  description: text('description'),
  alt: text('alt'), // Texto alternativo para acessibilidade
  tags: json('tags'), // Array de tags
  metadata: json('metadata'), // Metadados adicionais
  isActive: boolean('isActive').notNull().default(true),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  r2KeyIdx: index('media_files_r2_key_idx').on(table.r2Key),
  moduleIdx: index('media_files_module_idx').on(table.module),
  entityIdIdx: index('media_files_entity_id_idx').on(table.entityId),
  uploadedByIdx: index('media_files_uploaded_by_idx').on(table.uploadedBy),
  createdAtIdx: index('media_files_created_at_idx').on(table.createdAt),
  isActiveIdx: index('media_files_is_active_idx').on(table.isActive),
}));

// Tabela de variantes de imagem (thumbnails, etc.)
export const imageVariants = pgTable('image_variants', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  mediaFileId: text('mediaFileId').references(() => mediaFiles.id).notNull(),
  variantName: text('variantName').notNull(), // 'thumbnail', 'medium', 'large'
  r2Key: text('r2Key').notNull().unique(),
  width: integer('width'),
  height: integer('height'),
  quality: integer('quality'),
  fileSize: integer('fileSize').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  mediaFileIdIdx: index('image_variants_media_file_id_idx').on(table.mediaFileId),
  variantNameIdx: index('image_variants_variant_name_idx').on(table.variantName),
  r2KeyIdx: index('image_variants_r2_key_idx').on(table.r2Key),
}));

// Tabela de uso de mídia (onde cada arquivo está sendo usado)
export const mediaUsage = pgTable('media_usage', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  mediaFileId: text('mediaFileId').references(() => mediaFiles.id).notNull(),
  entityType: text('entityType').notNull(), // 'article', 'category', 'user'
  entityId: text('entityId').notNull(),
  usage: text('usage').notNull(), // 'featured_image', 'content_image', 'avatar', etc.
  position: integer('position'), // Posição no conteúdo, se aplicável
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  mediaFileIdIdx: index('media_usage_media_file_id_idx').on(table.mediaFileId),
  entityIdx: index('media_usage_entity_idx').on(table.entityType, table.entityId),
  usageIdx: index('media_usage_usage_idx').on(table.usage),
}));

// Tabela de processamento de mídia (jobs de processamento assíncrono)
export const mediaProcessingJobs = pgTable('media_processing_jobs', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  mediaFileId: text('mediaFileId').references(() => mediaFiles.id).notNull(),
  jobType: text('jobType').notNull(), // 'resize', 'convert', 'optimize'
  status: text('status').notNull().default('pending'), // 'pending', 'processing', 'completed', 'failed'
  parameters: json('parameters'), // Parâmetros do job
  result: json('result'), // Resultado do processamento
  error: text('error'), // Mensagem de erro se falhou
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('maxAttempts').notNull().default(3),
  scheduledFor: timestamp('scheduledFor', { withTimezone: true }),
  startedAt: timestamp('startedAt', { withTimezone: true }),
  completedAt: timestamp('completedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  mediaFileIdIdx: index('media_processing_jobs_media_file_id_idx').on(table.mediaFileId),
  statusIdx: index('media_processing_jobs_status_idx').on(table.status),
  jobTypeIdx: index('media_processing_jobs_job_type_idx').on(table.jobType),
  scheduledForIdx: index('media_processing_jobs_scheduled_for_idx').on(table.scheduledFor),
}));

// Media Types
export type MediaFile = typeof mediaFiles.$inferSelect;
export type NewMediaFile = typeof mediaFiles.$inferInsert;

export type ImageVariant = typeof imageVariants.$inferSelect;
export type NewImageVariant = typeof imageVariants.$inferInsert;

export type MediaUsage = typeof mediaUsage.$inferSelect;
export type NewMediaUsage = typeof mediaUsage.$inferInsert;

export type MediaProcessingJob = typeof mediaProcessingJobs.$inferSelect;
export type NewMediaProcessingJob = typeof mediaProcessingJobs.$inferInsert;

// Tags table
export const tags = pgTable('tags', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  color: text('color'),
  description: text('description'),
  isActive: boolean('isActive').default(true),
  useCount: integer('useCount').default(0),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  slugIdx: index('tags_slug_idx').on(table.slug),
  nameIdx: index('tags_name_idx').on(table.name),
}));

// Article Tags junction table
export const articleTags = pgTable('article_tags', {
  id: text('id').primaryKey().$defaultFn(() => generateId()),
  articleId: text('articleId').references(() => articles.id, { onDelete: 'cascade' }).notNull(),
  tagId: text('tagId').references(() => tags.id, { onDelete: 'cascade' }).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  articleTagIdx: index('article_tags_article_tag_idx').on(table.articleId, table.tagId),
  articleIdx: index('article_tags_article_idx').on(table.articleId),
  tagIdx: index('article_tags_tag_idx').on(table.tagId),
  uniqueArticleTag: unique('article_tags_unique_article_tag').on(table.articleId, table.tagId),
}));

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

export type ArticleTag = typeof articleTags.$inferSelect;
export type NewArticleTag = typeof articleTags.$inferInsert;