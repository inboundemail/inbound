// Simple feature flags using environment variables for minimal implementation
export const showSyncWithAWSButton = {
  key: 'sync-with-aws-button',
  decide: () => process.env.SHOW_SYNC_WITH_AWS_BUTTON === 'true'
}

// Helper function to check if sync button should be shown
export function shouldShowSyncButton(): boolean {
  try {
    return showSyncWithAWSButton.decide()
  } catch (error) {
    console.error('Error checking sync button feature flag:', error)
    return false // Default to hidden if there's an error
  }
}

// You can add more feature flags here
export const enableAdvancedAnalytics = {
  key: 'advanced-analytics',
  decide: () => process.env.ENABLE_ADVANCED_ANALYTICS === 'true'
}

export const enableBetaFeatures = {
  key: 'beta-features', 
  decide: () => process.env.ENABLE_BETA_FEATURES === 'true'
} 