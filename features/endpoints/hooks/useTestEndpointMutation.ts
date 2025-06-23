import { useMutation } from '@tanstack/react-query'

type TestEndpointResponse = {
  success: boolean
  message: string
  responseTime?: number
  statusCode?: number
}

async function testEndpoint(id: string): Promise<TestEndpointResponse> {
  const response = await fetch(`/api/v1/endpoints/${id}/test`, {
    method: 'POST',
  })
  
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