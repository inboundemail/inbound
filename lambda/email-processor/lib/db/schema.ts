import { mysqlTable, varchar, text, timestamp, boolean, int } from 'drizzle-orm/mysql-core';

// Import Better Auth tables
export { user, session, account, verification } from '../../auth-schema';

// Additional app-specific tables
export const subscriptions = mysqlTable('subscriptions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  plan: varchar('plan', { length: 255 }).notNull(),
  referenceId: varchar('reference_id', { length: 255 }).notNull(),
  stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
  status: varchar('status', { length: 255 }).notNull(),
  periodStart: timestamp('period_start'),
  periodEnd: timestamp('period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  seats: int('seats'),
  trialStart: timestamp('trial_start'),
  trialEnd: timestamp('trial_end'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// You can add more app-specific tables here
export const emailDomains = mysqlTable('email_domains', {
  id: varchar('id', { length: 255 }).primaryKey(),
  domain: varchar('domain', { length: 255 }).notNull().unique(),
  status: varchar('status', { length: 50 }).notNull(), // 'pending', 'verified', 'failed'
  verificationToken: varchar('verification_token', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
  userId: varchar('user_id', { length: 255 }).notNull(),
});

export const emailAddresses = mysqlTable('email_addresses', {
  id: varchar('id', { length: 255 }).primaryKey(),
  address: varchar('address', { length: 255 }).notNull().unique(),
  domainId: varchar('domain_id', { length: 255 }),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  userId: varchar('user_id', { length: 255 }).notNull(),
});

export const receivedEmails = mysqlTable('received_emails', {
  id: varchar('id', { length: 255 }).primaryKey(),
  messageId: varchar('message_id', { length: 255 }).notNull().unique(),
  from: varchar('from', { length: 255 }).notNull(),
  to: text('to').notNull(), // JSON string for multiple recipients
  subject: text('subject'),
  receivedAt: timestamp('received_at').notNull(),
  processedAt: timestamp('processed_at'),
  status: varchar('status', { length: 50 }).notNull(), // 'received', 'processing', 'forwarded', 'failed'
  metadata: text('metadata'), // JSON string
  userId: varchar('user_id', { length: 255 }).notNull(),
});

export const webhookDeliveries = mysqlTable('webhook_deliveries', {
  id: varchar('id', { length: 255 }).primaryKey(),
  emailId: varchar('email_id', { length: 255 }),
  endpoint: varchar('endpoint', { length: 500 }).notNull(),
  status: varchar('status', { length: 50 }).notNull(), // 'pending', 'success', 'failed'
  attempts: int('attempts').default(0),
  lastAttemptAt: timestamp('last_attempt_at'),
  responseCode: int('response_code'),
  error: text('error'),
  createdAt: timestamp('created_at').defaultNow(),
});

// Export types for Better Auth tables (using the imported tables)
import { user, session, account, verification } from '../../auth-schema';

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;
export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;
export type Verification = typeof verification.$inferSelect;
export type NewVerification = typeof verification.$inferInsert;

// Export types for app-specific tables
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type EmailDomain = typeof emailDomains.$inferSelect;
export type NewEmailDomain = typeof emailDomains.$inferInsert;
export type EmailAddress = typeof emailAddresses.$inferSelect;
export type NewEmailAddress = typeof emailAddresses.$inferInsert;
export type ReceivedEmail = typeof receivedEmails.$inferSelect;
export type NewReceivedEmail = typeof receivedEmails.$inferInsert;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;
