/**
 * Twitter Conversion Tracking Utilities
 * Helper functions for firing Twitter conversion events
 */

// Extend the global window object to include Twitter tracking function
declare global {
  interface Window {
    twq?: (command: string, eventId: string, parameters?: Record<string, any>) => void;
  }
}

interface TwitterEventParams {
  value?: number;
  currency?: string;
  contents?: string;
  conversion_id?: string;
  email_address?: string;
  phone_number?: string;
}

/**
 * Fire a Twitter conversion event
 * @param eventId - The Twitter Event ID (e.g., 'tw-q190x-q190y')
 * @param params - Event parameters like value, currency, email, etc.
 */
export function trackTwitterConversion(eventId: string, params: TwitterEventParams = {}) {
  // Check if Twitter tracking is available
  if (typeof window !== 'undefined' && window.twq) {
    try {
      window.twq('event', eventId, params);
      console.log('Twitter conversion tracked:', { eventId, params });
    } catch (error) {
      console.error('Error tracking Twitter conversion:', error);
    }
  } else {
    console.warn('Twitter tracking not available');
  }
}

/**
 * Track user signup conversion
 * @param email - User's email address
 * @param userId - User's ID for conversion tracking
 */
export function trackSignupConversion(email: string, userId?: string) {
  trackTwitterConversion('tw-q190x-q190y', {
    email_address: email,
    conversion_id: userId,
    contents: 'user_signup'
  });
}

/**
 * Track Autumn plan purchase conversion
 * @param productId - The purchased product ID (e.g., 'pro', 'scale')
 * @param email - User's email address
 * @param value - Purchase value in cents
 * @param currency - Purchase currency (default: 'USD')
 */
export function trackPurchaseConversion(
  productId: string, 
  email: string, 
  value?: number, 
  currency: string = 'USD'
) {
  trackTwitterConversion('tw-q190x-q191y', {
    email_address: email,
    value: value,
    currency: currency,
    contents: productId,
    conversion_id: `purchase_${productId}`
  });
}

/**
 * Track VIP plan purchase conversion
 * @param email - User's email address
 * @param value - Purchase value in cents
 */
export function trackVipPurchaseConversion(email: string, value?: number) {
  trackTwitterConversion('tw-q190x-q192y', {
    email_address: email,
    value: value,
    currency: 'USD',
    contents: 'inbound_vip',
    conversion_id: 'vip_purchase'
  });
}
