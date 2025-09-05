# Twitter Conversion Tracking Implementation

This document outlines the Twitter conversion tracking implementation for user signups and Autumn plan purchases.

## Overview

Twitter conversion tracking has been implemented to track two key events:
1. **User Signups** - When users complete onboarding
2. **Plan Purchases** - When users successfully purchase Autumn plans

## Event IDs

- **Signup Event**: `tw-q190x-q190y`
- **Plan Purchase Event**: `tw-q190x-q191y`  
- **VIP Purchase Event**: `tw-q190x-q192y`

## Implementation Details

### Base Pixel Installation
The Twitter base tracking pixel is already installed in `app/layout.tsx` (lines 42-58):

```javascript
!function(e,t,n,s,u,a){e.twq || (s = e.twq = function () {
  s.exe ? s.exe.apply(s, arguments) : s.queue.push(arguments);
}, s.version = '1.1', s.queue = [], u = t.createElement(n), u.async = !0, u.src = 'https://static.ads-twitter.com/uwt.js',
  a = t.getElementsByTagName(n)[0], a.parentNode.insertBefore(u, a))}(window,document,'script');
twq('config','q190x');
```

### Utility Functions
Created `lib/utils/twitter-tracking.ts` with helper functions:

- `trackTwitterConversion(eventId, params)` - Core tracking function
- `trackSignupConversion(email, userId)` - For user signups
- `trackPurchaseConversion(productId, email, value, currency)` - For plan purchases
- `trackVipPurchaseConversion(email, value)` - For VIP purchases

### Event Tracking Implementation

#### 1. User Signups
**Location**: `app/(main)/onboarding/page.tsx`
**Trigger**: When user completes onboarding
**Parameters**:
- `email_address`: User's email
- `conversion_id`: User's ID
- `contents`: 'user_signup'

#### 2. Autumn Plan Purchases
**Location**: `app/(main)/settings/page.tsx`
**Trigger**: When `upgrade=true` parameter is detected in URL
**Parameters**:
- `email_address`: User's email
- `value`: Purchase value (if available)
- `currency`: 'USD'
- `contents`: Product ID ('pro', 'scale', etc.)
- `conversion_id`: 'purchase_{productId}'

#### 3. VIP Plan Purchases
**Location**: `app/(main)/vip/vip-page-client.tsx`
**Trigger**: When `upgrade=true` parameter is detected in URL
**Parameters**:
- `email_address`: User's email (if available)
- `value`: Purchase value (if available)
- `currency`: 'USD'
- `contents`: 'inbound_vip'
- `conversion_id`: 'vip_purchase'

## Success URL Configuration

Updated the pricing table to include product information in success URLs:

```typescript
successUrl: `${process.env.NEXT_PUBLIC_BETTER_AUTH_URL}/settings?upgrade=true&product=${product.id}`
```

This allows us to track which specific plan was purchased.

## Testing

To test the implementation:

1. **Signup Tracking**: Complete the onboarding flow and check browser console for tracking logs
2. **Purchase Tracking**: Purchase a plan and verify tracking fires on the success page
3. **Console Logs**: All tracking events log to console for debugging

## Parameters Reference

### Available Parameters
- `value`: Purchase amount in cents
- `currency`: Currency code (e.g., 'USD')
- `contents`: Event content/description
- `conversion_id`: Unique identifier for the conversion
- `email_address`: User's email address
- `phone_number`: User's phone number (if available)

### Current Usage
- User signups: email, conversion_id, contents
- Plan purchases: email, value, currency, contents, conversion_id
- VIP purchases: email, value, currency, contents, conversion_id

## Browser Support

The tracking implementation includes proper error handling and graceful degradation:
- Checks for `window.twq` availability before firing events
- Logs warnings when tracking is unavailable
- Catches and logs tracking errors without breaking functionality

## Debugging

All tracking events log to the browser console:
- Successful tracking: `Twitter conversion tracked: {eventId, params}`
- Unavailable tracking: `Twitter tracking not available`
- Errors: `Error tracking Twitter conversion: {error}`
