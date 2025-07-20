import { useMutation } from '@tanstack/react-query'

type TestEndpointResponse = {
  success: boolean
  message: string
  responseTime?: number
  statusCode?: number
}

async function testEndpoint(id: string): Promise<TestEndpointResponse> {
  // Try v2 first, fallback to v1 if not available
  let response = await fetch(`/api/v2/endpoints/${id}/test`, {
    method: 'POST',
  })
  
  // If v2 doesn't exist (404), try v1
  if (response.status === 404) {
    response = await fetch(`/api/v1/endpoints/${id}/test`, {
      method: 'POST',
    })
  }
  
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to test endpoint')
  }
  
  return await response.json()
}

export const useTestEndpointMutation = () => {
  return useMutation({
    mutationFn: testEndpoint,
  })
} 