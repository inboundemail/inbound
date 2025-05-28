# Feature Flags

This project implements a minimal feature flags system using environment variables.

## Available Feature Flags

### `SHOW_SYNC_WITH_AWS_BUTTON`
Controls whether the "Sync with AWS" button is shown on the domains page.

- **Default**: `false` (hidden)
- **To enable**: Set `SHOW_SYNC_WITH_AWS_BUTTON=true` in your environment

### `ENABLE_ADVANCED_ANALYTICS`
Controls advanced analytics features.

- **Default**: `false` (disabled)
- **To enable**: Set `ENABLE_ADVANCED_ANALYTICS=true` in your environment

### `ENABLE_BETA_FEATURES`
Controls beta features across the application.

- **Default**: `false` (disabled)
- **To enable**: Set `ENABLE_BETA_FEATURES=true` in your environment

## Usage

### In Development

1. Create a `.env.local` file in the project root
2. Add the feature flag environment variables:
   ```
   SHOW_SYNC_WITH_AWS_BUTTON=true
   ENABLE_ADVANCED_ANALYTICS=false
   ENABLE_BETA_FEATURES=false
   ```
3. Restart your development server

### In Production (Vercel)

1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Add the feature flag variables with their desired values
4. Redeploy your application

## Implementation

Feature flags are implemented in `lib/feature-flags.ts` and can be used throughout the application:

```typescript
import { shouldShowSyncButton } from '@/lib/feature-flags'

// Use in components
if (shouldShowSyncButton()) {
  // Show the sync button
}
```

## Adding New Feature Flags

1. Add the flag to `lib/feature-flags.ts`:
   ```typescript
   export const myNewFeature = {
     key: 'my-new-feature',
     decide: () => process.env.ENABLE_MY_NEW_FEATURE === 'true'
   }
   ```

2. Create a helper function:
   ```typescript
   export function shouldShowMyNewFeature(): boolean {
     try {
       return myNewFeature.decide()
     } catch (error) {
       console.error('Error checking my new feature flag:', error)
       return false // Default to disabled
     }
   }
   ```

3. Use it in your components:
   ```typescript
   import { shouldShowMyNewFeature } from '@/lib/feature-flags'
   
   {shouldShowMyNewFeature() && (
     <MyNewFeatureComponent />
   )}
   ```

## Benefits

- **Zero dependencies**: Uses only environment variables
- **Simple**: Easy to understand and implement
- **Safe**: Defaults to disabled state on errors
- **Flexible**: Can be toggled without code changes
- **Environment-specific**: Different values for dev/staging/production 