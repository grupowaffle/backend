import { pgTable, serial, integer, varchar, text, date, time, boolean, timestamp, index } from 'drizzle-orm/pg-core';

export const calendarEvents = pgTable('calendar_events', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  category: varchar('category', { length: 50 }).notNull().default('custom'),
  eventDate: date('event_date').notNull(),
  eventTime: time('event_time'),
  isAllDay: boolean('is_all_day').default(false),
  reminderMinutes: integer('reminder_minutes').default(0),
  isRecurring: boolean('is_recurring').default(false),
  recurrencePattern: varchar('recurrence_pattern', { length: 100 }),
  priority: varchar('priority', { length: 20 }).default('medium'),
  status: varchar('status', { length: 20 }).default('active'),
  newsletters: text('newsletters'), // JSON array of newsletter IDs
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow()
}, (table) => ({
  userIdIdx: index('idx_user_id').on(table.userId),
  eventDateIdx: index('idx_event_date').on(table.eventDate),
  categoryIdx: index('idx_category').on(table.category),
  statusIdx: index('idx_status').on(table.status),
  userDateIdx: index('idx_user_date').on(table.userId, table.eventDate)
}));

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type NewCalendarEvent = typeof calendarEvents.$inferInsert;
