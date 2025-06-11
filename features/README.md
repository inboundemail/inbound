# Features Directory Structure

This directory follows the react-query best practices outlined in the project rules. Each feature is organized with a consistent structure that promotes maintainability, reusability, and proper separation of concerns.

## Directory Structure

```
features/
├── analytics/
│   ├── hooks/
│   │   └── useAnalyticsQuery.ts # React Query hooks (uses server actions)
│   └── components/              # Feature-specific components (optional)
├── domains/
│   ├── api/
│   │   └── domainsApi.ts
│   ├── hooks/
│   │   └── useDomainsQuery.ts
│   └── components/
└── README.md                    # This file
```

## Key Principles

### 1. Feature-Based Organization
- Each feature has its own directory with `api/`, `hooks/`, and optionally `components/`
- This improves modularity and makes features easy to find and maintain

### 2. Server Actions Integration
- Features can use either API service layers or Next.js server actions
- Server actions provide type-safe server-side logic with automatic serialization
- API service layers still useful for external APIs or complex client-side logic

### 3. Custom Hooks for Data Fetching
- Encapsulate react-query logic within custom hooks
- Promote reusability and separation of concerns
- Centralize query configuration (stale time, refetch intervals, etc.)

### 4. Consistent Query Key Structure
- Use hierarchical query keys for better cache management
- Follow the pattern: `[feature, type, ...identifiers]`
- Example: `['domains', 'details', domainId]`

## Usage Examples

### Basic Query Hook with Server Actions

```typescript
// features/analytics/hooks/useAnalyticsQuery.ts
import { useQuery } from '@tanstack/react-query'
import { getAnalytics } from '@/app/actions/analytics'

export const useAnalyticsQuery = () => {
  return useQuery({
    queryKey: ['analytics', 'data'],
    queryFn: async () => {
      const result = await getAnalytics()
      if (!result.success) {
        throw new Error(result.error)
      }
      return result.data
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })
}
```

### Using in Components

```typescript
// app/(main)/analytics/page.tsx
import { useAnalyticsQuery } from '@/features/analytics/hooks/useAnalyticsQuery'

export default function AnalyticsPage() {
  const { 
    data: analyticsData, 
    isLoading, 
    error, 
    refetch 
  } = useAnalyticsQuery()

  if (isLoading) return <LoadingSpinner />
  if (error) return <ErrorMessage error={error} onRetry={refetch} />
  
  return <AnalyticsContent data={analyticsData} />
}
```

### Mutation Hook with Cache Invalidation

```typescript
// features/domains/hooks/useDomainsQuery.ts
export const useDomainVerifyMutation = () => {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: domainsApi.verifyDomain,
    onSuccess: (data, domainId) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['domains', 'stats'] })
      queryClient.invalidateQueries({ queryKey: ['domains', 'details', domainId] })
    },
  })
}
```

## Configuration Guidelines

### Query Configuration
- **staleTime**: How long data is considered fresh (no refetch needed)
- **refetchInterval**: Automatic refetch interval for real-time data
- **placeholderData**: Keep previous data while refetching to prevent loading states
- **enabled**: Conditional query execution based on dependencies

### Common Patterns
- **Real-time data**: Short stale time (1-2 minutes) with refetch intervals (30 seconds)
- **Static data**: Long stale time (10+ minutes) with no refetch interval
- **User-specific data**: Refetch on window focus enabled
- **Dependent queries**: Use `enabled` option to wait for prerequisites

## Error Handling

### Server Action Layer
```typescript
// app/actions/analytics.ts
export async function getAnalytics(): Promise<{ success: true; data: AnalyticsData } | { success: false; error: string }> {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) {
      return { success: false, error: 'Unauthorized' }
    }
    
    // Database queries...
    const analyticsData = { /* ... */ }
    
    return { success: true, data: analyticsData }
  } catch (error) {
    return { success: false, error: 'Failed to fetch analytics data' }
  }
}
```

### Component Layer
```typescript
const { data, error, refetch } = useAnalyticsQuery()

useEffect(() => {
  if (error) {
    toast.error('Failed to load analytics data')
  }
}, [error])
```

## Performance Optimizations

1. **Placeholder Data**: Use previous data while refetching
2. **Stale While Revalidate**: Show cached data immediately, fetch fresh data in background
3. **Query Invalidation**: Surgically update cache after mutations
4. **Dependent Queries**: Only fetch when prerequisites are met
5. **Background Refetching**: Keep data fresh without user interaction

## Testing

### Mock Server Actions
```typescript
// __tests__/analytics.test.ts
import { getAnalytics } from '@/app/actions/analytics'

jest.mock('@/app/actions/analytics')
const mockGetAnalytics = getAnalytics as jest.MockedFunction<typeof getAnalytics>

test('should fetch analytics data', async () => {
  mockGetAnalytics.mockResolvedValue({ success: true, data: mockData })
  // Test component using useAnalyticsQuery
})
```

### Test Query Hooks
```typescript
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAnalyticsQuery } from '@/features/analytics/hooks/useAnalyticsQuery'

test('useAnalyticsQuery hook', async () => {
  const queryClient = new QueryClient()
  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  
  const { result } = renderHook(() => useAnalyticsQuery(), { wrapper })
  // Test hook behavior
})
```

## Migration from Manual State Management

When converting existing components:

1. **Remove manual state**: `useState` for data, loading, error
2. **Remove useEffect**: Data fetching logic
3. **Replace with query hook**: Import and use the appropriate hook
4. **Update error handling**: Use error from hook instead of manual state
5. **Update refresh logic**: Use `refetch` from hook

### Before (Manual)
```typescript
const [data, setData] = useState(null)
const [isLoading, setIsLoading] = useState(true)
const [error, setError] = useState(null)

useEffect(() => {
  fetchData()
}, [])

const fetchData = async () => {
  try {
    setIsLoading(true)
    const response = await fetch('/api/data')
    const data = await response.json()
    setData(data)
  } catch (error) {
    setError(error)
  } finally {
    setIsLoading(false)
  }
}
```

### After (React Query)
```typescript
const { data, isLoading, error, refetch } = useDataQuery()
```

## DevTools

The React Query DevTools are automatically included in development mode. Access them via the floating icon in the bottom-left corner of your browser to:

- Inspect query cache
- Monitor query states
- Debug refetch behavior
- View query timelines

## Best Practices Summary

1. ✅ Use feature-based directory structure
2. ✅ Abstract API calls into service layers
3. ✅ Create custom hooks for each query/mutation
4. ✅ Use hierarchical query keys
5. ✅ Configure appropriate stale times and refetch intervals
6. ✅ Handle errors gracefully with user feedback
7. ✅ Invalidate cache after mutations
8. ✅ Use placeholder data to prevent loading flickers
9. ✅ Test hooks and API services separately
10. ✅ Leverage DevTools for debugging 