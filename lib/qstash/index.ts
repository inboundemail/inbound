/**
 * QStash email scheduling library
 * Core functionality for QStash-powered email scheduling
 */

export { qstashClient } from './client';
export { emailScheduler, QStashEmailScheduler } from './email-scheduler';
export { emailRateLimiter, EmailRateLimiter } from './rate-limiter';

// Re-export useful types
export type { QStashEmailScheduleOptions } from './client';
export type { RateLimitResult } from './rate-limiter';
