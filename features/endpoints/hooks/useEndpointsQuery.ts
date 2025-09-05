import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { checkMigrationNeeded, migrateWebhooksToEndpoints } from '@/app/actions/endpoints'
import type { Endpoint } from '../types'

async function fetchEndpoints(): Promise<Endpoint[]> {
  const response = await fetch('/api/v2/endpoints')
  
  if (!response.ok) {
    throw new Error('Failed to fetch endpoints')
  }
  
  const data = await response.json()
  return data.data || []
}

export const useEndpointsQuery = () => {
  const queryClient = useQueryClient()
  const [migrationChecked, setMigrationChecked] = useState(false)
  const [migrationInProgress, setMigrationInProgress] = useState(false)

  const endpointsQuery = useQuery({
    queryKey: ['endpoints'],
    queryFn: fetchEndpoints,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Check for migration needs when the query succeeds and returns empty results
  useEffect(() => {
    const checkAndMigrate = async () => {
      // Only check migration if:
      // 1. Query has succeeded
      // 2. No endpoints found
      // 3. Migration hasn't been checked yet
      // 4. Migration is not already in progress
      if (
        endpointsQuery.isSuccess &&
        endpointsQuery.data?.length === 0 &&
        !migrationChecked &&
        !migrationInProgress
      ) {
        try {
          console.log('🔍 Checking if webhook migration is needed...')
          
          const migrationCheck = await checkMigrationNeeded()
          
          if (migrationCheck.success && migrationCheck.migrationNeeded) {
            // Only set migration in progress if we actually need to migrate
            setMigrationInProgress(true)
            
            console.log('🚀 Starting automatic webhook migration...')
            
            const migrationResult = await migrateWebhooksToEndpoints()
            
            if (migrationResult.success) {
              console.log(`✅ Migration completed: ${migrationResult.migratedCount} webhooks migrated`)
              
              // Invalidate and refetch endpoints to show the migrated data
              queryClient.invalidateQueries({ queryKey: ['endpoints'] })
            } else {
              console.error('❌ Migration failed:', migrationResult.error)
            }
          } else {
            console.log('ℹ️ No migration needed')
          }
        } catch (error) {
          console.error('❌ Error during migration check/process:', error)
        } finally {
          setMigrationChecked(true)
          setMigrationInProgress(false)
        }
      }
    }

    checkAndMigrate()
  }, [endpointsQuery.isSuccess, endpointsQuery.data, migrationChecked, migrationInProgress, queryClient])

  // Return the query with additional migration state
  return {
    ...endpointsQuery,
    migrationInProgress,
    migrationChecked
  }
} 