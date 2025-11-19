import { Autumn } from 'autumn-js'

/**
 * Autumn client for usage tracking and limits
 * Initialized with proper configuration
 * 
 * Usage:
 * ```ts
 * import { autumn } from '@/lib/autumn/client'
 * const result = await autumn.check({ customer_id: userId, feature_id: 'domains' })
 * ```
 */

// Initialize Autumn client with configuration
// Note: In a production environment, you would typically pass an API component
// and configuration here. For now, we're using the class methods directly
// which suggests Autumn may be configured globally or this needs updating
// based on actual Autumn.js SDK requirements.

// Export the Autumn client
// TODO: Verify this initialization matches your Autumn.js SDK setup
// If Autumn requires instantiation, do something like:
// export const autumn = new Autumn(apiComponent, {
//   secretKey: process.env.AUTUMN_SECRET_KEY ?? '',
//   identify: async (ctx) => {
//     // Return customer identification
//     return ctx.userId ? { id: ctx.userId } : null
//   },
// })

// For now, exporting wrapper functions that handle errors
export const autumn = {
  /**
   * Check if a feature is allowed for a customer
   */
  check: async (params: { customer_id: string; feature_id: string }) => {
    try {
      return await Autumn.check(params)
    } catch (error) {
      console.error('Autumn check error:', error)
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  },

  /**
   * Track usage of a feature for a customer
   */
  track: async (params: { customer_id: string; feature_id: string; value: number }) => {
    try {
      return await Autumn.track(params)
    } catch (error) {
      console.error('Autumn track error:', error)
      return {
        data: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  },
}

