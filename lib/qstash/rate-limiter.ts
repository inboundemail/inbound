/**
 * Redis-based rate limiting for email sending with QStash flow control
 * Provides both Redis storage and QStash flow control integration
 */

import { Redis } from '@upstash/redis';

// Redis client configuration
const redis = Redis.fromEnv();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime?: number;
  retryAfter?: number;
}

export class EmailRateLimiter {
  /**
   * Token bucket rate limiter using Redis
   */
  async checkTokenBucket(options: {
    key: string;
    capacity: number;
    refillRate: number; // tokens per second
    window?: number; // seconds (default 60)
  }): Promise<RateLimitResult> {
    const { key, capacity, refillRate, window = 60 } = options;
    const now = Math.floor(Date.now() / 1000);
    const bucketKey = `rate_limit:token_bucket:${key}`;
    
    try {
      // Get current bucket state
      const bucket = await redis.hgetall(bucketKey) as {
        tokens?: string;
        lastRefill?: string;
      } | null;

      let tokens = bucket?.tokens ? parseInt(bucket.tokens) : capacity;
      let lastRefill = bucket?.lastRefill ? parseInt(bucket.lastRefill) : now;

      // Calculate tokens to add based on elapsed time
      const elapsed = now - lastRefill;
      const tokensToAdd = Math.floor(elapsed * (refillRate / window));
      tokens = Math.min(capacity, tokens + tokensToAdd);

      if (tokens >= 1) {
        tokens -= 1;
        
        // Update bucket state atomically
        await redis.hset(bucketKey, {
          tokens: tokens.toString(),
          lastRefill: now.toString(),
        });
        await redis.expire(bucketKey, window * 2);
        
        return { 
          allowed: true, 
          remaining: tokens,
          resetTime: now + window,
        };
      }

      // Calculate when next token will be available
      const nextTokenIn = Math.ceil((1 - tokens) * (window / refillRate));
      
      return { 
        allowed: false, 
        remaining: 0,
        resetTime: now + nextTokenIn,
        retryAfter: nextTokenIn,
      };

    } catch (error) {
      console.error('Rate limiter error:', error);
      // Fail open - allow the request if Redis is down
      return { allowed: true, remaining: capacity - 1 };
    }
  }

  /**
   * Sliding window rate limiter using Redis sorted sets
   */
  async checkSlidingWindow(options: {
    key: string;
    limit: number;
    window?: number; // seconds (default 3600 = 1 hour)
  }): Promise<RateLimitResult> {
    const { key, limit, window = 3600 } = options;
    const now = Date.now();
    const windowStart = now - (window * 1000);
    const windowKey = `rate_limit:sliding:${key}`;
    
    try {
      // Use Redis pipeline for atomic operations
      const pipeline = redis.pipeline();
      
      // Remove old entries outside the window
      pipeline.zremrangebyscore(windowKey, 0, windowStart);
      
      // Count current entries
      pipeline.zcard(windowKey);
      
      // Add current request
      pipeline.zadd(windowKey, { 
        score: now, 
        member: `${now}-${Math.random()}` 
      });
      
      // Set expiration
      pipeline.expire(windowKey, window);
      
      const results = await pipeline.exec();
      const currentCount = results[1] as number;
      
      const remaining = Math.max(0, limit - currentCount - 1);
      const resetTime = Math.floor((now + window * 1000) / 1000);
      
      return {
        allowed: currentCount < limit,
        remaining,
        resetTime,
        retryAfter: currentCount >= limit ? Math.ceil(window / 2) : undefined,
      };

    } catch (error) {
      console.error('Sliding window rate limiter error:', error);
      // Fail open
      return { allowed: true, remaining: limit - 1 };
    }
  }

  /**
   * Check email sending limits for a user
   * Combines multiple rate limiting strategies
   */
  async checkEmailSendingLimits(userId: string, options?: {
    burst?: { limit: number; window?: number };
    daily?: { limit: number };
    perDomain?: { domain: string; limit: number; window?: number };
  }): Promise<{
    allowed: boolean;
    limitType?: 'burst' | 'daily' | 'domain';
    retryAfter?: number;
    details: Record<string, RateLimitResult>;
  }> {
    const checks: Record<string, RateLimitResult> = {};
    
    // Burst rate limiting (default: 10 emails per minute)
    if (options?.burst) {
      checks.burst = await this.checkTokenBucket({
        key: `user:${userId}:burst`,
        capacity: options.burst.limit,
        refillRate: options.burst.limit,
        window: options.burst.window || 60,
      });
      
      if (!checks.burst.allowed) {
        return {
          allowed: false,
          limitType: 'burst',
          retryAfter: checks.burst.retryAfter,
          details: checks,
        };
      }
    }

    // Daily rate limiting
    if (options?.daily) {
      checks.daily = await this.checkSlidingWindow({
        key: `user:${userId}:daily`,
        limit: options.daily.limit,
        window: 86400, // 24 hours
      });
      
      if (!checks.daily.allowed) {
        return {
          allowed: false,
          limitType: 'daily',
          retryAfter: checks.daily.retryAfter,
          details: checks,
        };
      }
    }

    // Per-domain rate limiting
    if (options?.perDomain) {
      checks.domain = await this.checkSlidingWindow({
        key: `domain:${options.perDomain.domain}:user:${userId}`,
        limit: options.perDomain.limit,
        window: options.perDomain.window || 3600,
      });
      
      if (!checks.domain.allowed) {
        return {
          allowed: false,
          limitType: 'domain',
          retryAfter: checks.domain.retryAfter,
          details: checks,
        };
      }
    }

    return { allowed: true, details: checks };
  }

  /**
   * Store failed email processing attempts for retry logic
   */
  async recordEmailFailure(scheduledEmailId: string, error: string) {
    const failureKey = `email_failures:${scheduledEmailId}`;
    
    await redis.lpush(failureKey, JSON.stringify({
      error,
      timestamp: Date.now(),
    }));
    
    await redis.expire(failureKey, 86400); // Keep for 24 hours
  }

  /**
   * Get email failure history
   */
  async getEmailFailures(scheduledEmailId: string) {
    const failureKey = `email_failures:${scheduledEmailId}`;
    const failures = await redis.lrange(failureKey, 0, -1);
    
    return failures.map(f => {
      try {
        return JSON.parse(f);
      } catch {
        return { error: f, timestamp: Date.now() };
      }
    });
  }

  /**
   * Cache email sending statistics for monitoring
   */
  async updateEmailStats(userId: string, status: 'sent' | 'failed') {
    const today = new Date().toISOString().split('T')[0];
    const statsKey = `email_stats:${userId}:${today}`;
    
    await redis.hincrby(statsKey, status, 1);
    await redis.expire(statsKey, 86400 * 7); // Keep for 7 days
  }

  /**
   * Get email sending statistics for a user
   */
  async getEmailStats(userId: string, days = 7) {
    const stats: Record<string, { sent: number; failed: number }> = {};
    
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      const statsKey = `email_stats:${userId}:${dateKey}`;
      
      const dayStats = await redis.hgetall(statsKey) as {
        sent?: string;
        failed?: string;
      } | null;
      
      stats[dateKey] = {
        sent: dayStats?.sent ? parseInt(dayStats.sent) : 0,
        failed: dayStats?.failed ? parseInt(dayStats.failed) : 0,
      };
    }
    
    return stats;
  }

  /**
   * Cleanup old rate limiting data
   */
  async cleanupOldData() {
    const pattern = 'rate_limit:*';
    const keys = await redis.keys(pattern);
    
    for (const key of keys) {
      // Check if key has expired naturally, if not set a reasonable TTL
      const ttl = await redis.ttl(key);
      if (ttl === -1) { // No expiration set
        await redis.expire(key, 86400); // 24 hours
      }
    }
  }

  private extractDomain(email: string): string {
    const match = email.match(/@([^>]+)/);
    return match ? match[1] : '';
  }
}

// Export singleton instance
export const emailRateLimiter = new EmailRateLimiter();
