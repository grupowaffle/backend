import { Context, Next } from 'hono';

interface RateLimitOptions {
  windowMs?: number; // Time window in milliseconds
  maxRequests?: number; // Max requests per window
  message?: string; // Error message
  keyGenerator?: (c: Context) => string; // Function to generate unique key
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

// In-memory store (should be replaced with Redis in production)
const store: RateLimitStore = {};

// Lazy initialization for cleanup
let cleanupInitialized = false;

function ensureCleanupInitialized() {
  if (!cleanupInitialized) {
    // Clean up expired entries periodically
    setInterval(() => {
      const now = Date.now();
      for (const key in store) {
        if (store[key].resetTime < now) {
          delete store[key];
        }
      }
    }, 60000); // Clean every minute
    cleanupInitialized = true;
  }
}

export const rateLimit = (options: RateLimitOptions = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes default
    maxRequests = 100, // 100 requests default
    message = 'Too many requests, please try again later',
    keyGenerator = (c) => {
      // Default: use IP address or fallback to 'anonymous'
      const forwarded = c.req.header('x-forwarded-for');
      const ip = forwarded ? forwarded.split(',')[0] : c.req.header('x-real-ip');
      return ip || 'anonymous';
    },
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;

  return async (c: Context, next: Next) => {
    ensureCleanupInitialized(); // Lazy initialization
    const key = keyGenerator(c);
    const now = Date.now();
    const resetTime = now + windowMs;

    // Get or create entry
    if (!store[key] || store[key].resetTime < now) {
      store[key] = {
        count: 0,
        resetTime,
      };
    }

    const entry = store[key];

    // Check if limit exceeded
    if (entry.count >= maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      
      c.header('X-RateLimit-Limit', maxRequests.toString());
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());
      c.header('Retry-After', retryAfter.toString());

      return c.json({
        success: false,
        error: {
          message,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter,
        },
      }, 429);
    }

    // Increment counter before processing
    entry.count++;

    // Set rate limit headers
    c.header('X-RateLimit-Limit', maxRequests.toString());
    c.header('X-RateLimit-Remaining', (maxRequests - entry.count).toString());
    c.header('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());

    try {
      await next();

      // Decrement if successful and skipSuccessfulRequests is true
      if (skipSuccessfulRequests && c.res.status < 400) {
        entry.count--;
      }
    } catch (error) {
      // Decrement if failed and skipFailedRequests is true
      if (skipFailedRequests) {
        entry.count--;
      }
      throw error;
    }
  };
};

/**
 * Stricter rate limit for authentication endpoints
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 attempts
  message: 'Too many authentication attempts, please try again later',
  keyGenerator: (c) => {
    // Use combination of IP and email/username if available
    const forwarded = c.req.header('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : c.req.header('x-real-ip') || 'anonymous';
    
    // Try to get email from request body (for login/register)
    const body = c.req.body;
    const email = body && typeof body === 'object' && 'email' in body ? body.email : '';
    
    return `${ip}:${email}`;
  },
});

/**
 * API rate limit for public endpoints
 */
export const apiRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  maxRequests: 60, // 60 requests per minute
  message: 'API rate limit exceeded, please slow down',
});

/**
 * Upload rate limit for media endpoints
 */
export const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 20, // 20 uploads per hour
  message: 'Upload limit exceeded, please try again later',
});