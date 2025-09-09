import { pgTable, serial, text, timestamp, integer, boolean } from 'drizzle-orm/pg-core';

// Users table (using pgTable for public schema by default)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  role: text('role').notNull().default('user'),
  brandId: integer('brandId'),
  brandName: text('brandName'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
});

// Subscribers table
export const subscribers = pgTable('subscribers', {
  id: serial('id').primaryKey(),
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
  id: serial('id').primaryKey(),
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
  id: text('id').primaryKey(),
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
  id: text('id').primaryKey(),
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