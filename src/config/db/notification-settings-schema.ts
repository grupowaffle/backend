import { pgTable, text, boolean, timestamp, json } from 'drizzle-orm/pg-core';

export const notificationSettings = pgTable('notification_settings', {
  id: text('id').primaryKey(),
  webhookUrl: text('webhook_url').notNull(),
  enabled: boolean('enabled').default(false),
  notifications: json('notifications').$type<{
    newArticle: boolean;
    statusChange: boolean;
    changeRequest: boolean;
    approval: boolean;
    publication: boolean;
    rejection: boolean;
    beehiivSync: boolean;
    archive: boolean;
  }>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
