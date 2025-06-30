"use client"

import { useState, useEffect } from 'react'
import { useSession } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { HiMail, HiGlobe, HiLightningBolt, HiCheckCircle, HiArrowRight, HiPlus } from 'react-icons/hi'
import { CustomInboundIcon } from '@/components/icons/customInbound'
import { useCreateEndpointMutation, useEndpointsQuery } from '@/features/endpoints/hooks'
import type { CreateEndpointData } from '@/features/endpoints/types'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { completeOnboarding } from '@/app/actions/onboarding'

export default function OnboardingPage() {
  const { data: session, isPending } = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isCompleting, setIsCompleting] = useState(false)
  const [isCreatingEndpoint, setIsCreatingEndpoint] = useState(false)
  const [endpointCreated, setEndpointCreated] = useState(false)
  
  const createEndpointMutation = useCreateEndpointMutation()
  const { data: endpoints = [], isLoading: endpointsLoading } = useEndpointsQuery()
  
  // Check if user already has endpoints
  const hasExistingEndpoints = endpoints.length > 0

  // Redirect if not authenticated
  useEffect(() => {
    if (!isPending && !session?.user) {
      router.push('/login')
    }
  }, [session, isPending, router])

  const handleCreateEndpoint = async () => {
    if (!session?.user?.email) return

    setIsCreatingEndpoint(true)
    try {
      const userName = session.user.name || session.user.email.split('@')[0] || 'User'
      const endpointData: CreateEndpointData = {
        name: `${userName} Email Endpoint`,
        type: 'email',
        description: 'Default email forwarding endpoint created during onboarding',
        config: {
          forwardTo: session.user.email,
          includeAttachments: true,
          subjectPrefix: ''
        }
      }

      await createEndpointMutation.mutateAsync(endpointData)
      setEndpointCreated(true)
      toast.success('Email endpoint created successfully!')
    } catch (error) {
      console.error('Error creating endpoint:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create endpoint')
    } finally {
      setIsCreatingEndpoint(false)
    }
  }

  const handleCompleteOnboarding = async () => {
    if (!session?.user?.id) return

    setIsCompleting(true)
    try {
      const result = await completeOnboarding(session.user.id)
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to complete onboarding')
      }
      
      // Invalidate onboarding status to update the cache
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] })
      
      toast.success('Welcome to Inbound! 🎉')
      router.push('/add?onboarding=true')
    } catch (error) {
      console.error('Error completing onboarding:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to complete onboarding')
    } finally {
      setIsCompleting(false)
    }
  }

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!session?.user) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100/50 p-4 font-outfit">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-1 tracking-tight">
            Welcome to Inbound, {session.user.name || session.user.email?.split('@')[0]}!
          </h2>
          <p className="text-gray-600 text-sm font-medium">Transform any domain into a powerful email infrastructure</p>
        </div>

        {/* How it Works */}
        <Card className="bg-blue-50 border-blue-200 rounded-xl mb-6">
          <CardContent className="p-6">
            <h3 className="font-semibold text-blue-900 mb-3">How Inbound Works</h3>
            <div className="space-y-2 text-sm text-blue-800">
              <p>• <strong>Add your domain</strong> - Connect any domain you own (example.com)</p>
              <p>• <strong>Configure DNS</strong> - Simple DNS setup to route emails to Inbound</p>
              <p>• <strong>Create endpoints</strong> - Set up email forwarding, webhooks, or groups</p>
              <p>• <strong>Receive emails</strong> - Get emails at any address @yourdomain.com</p>
            </div>
          </CardContent>
        </Card>

        {/* Steps Cards */}
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          {/* Add Domain */}
          <Card className="bg-white/95 backdrop-blur-sm shadow-sm border border-gray-200/60 rounded-xl">
            <CardContent className="p-6 text-center">
              <CustomInboundIcon 
                Icon={HiGlobe} 
                size={40} 
                backgroundColor="#3b82f6" 
                className="mx-auto mb-3" 
              />
              <h3 className="font-semibold text-gray-900 mb-2">Add Domain</h3>
              <p className="text-sm text-gray-600">Connect your domain to start receiving emails</p>
            </CardContent>
          </Card>

          {/* Create Endpoint */}
          <Card className="bg-white/95 backdrop-blur-sm shadow-sm border border-gray-200/60 rounded-xl">
            <CardContent className="p-6 text-center">
              <CustomInboundIcon 
                Icon={HiMail} 
                size={40} 
                backgroundColor="#10b981" 
                className="mx-auto mb-3" 
              />
                             <h3 className="font-semibold text-gray-900 mb-2">Create Endpoint</h3>
               <p className="text-sm text-gray-600 mb-3">Set up email forwarding or webhooks</p>
               {hasExistingEndpoints || endpointCreated ? (
                 <Badge className="bg-green-100 text-green-800">
                   <HiCheckCircle className="h-3 w-3 mr-1" />
                   {hasExistingEndpoints ? 'Already Created' : 'Created'}
                 </Badge>
               ) : (
                 <Button 
                   onClick={handleCreateEndpoint}
                   disabled={isCreatingEndpoint || endpointsLoading}
                   size="sm"
                   className="bg-blue-600 hover:bg-blue-700 text-white"
                 >
                   <HiPlus className="h-3 w-3 mr-1" />
                   {isCreatingEndpoint ? 'Creating...' : 'Create'}
                 </Button>
               )}
            </CardContent>
          </Card>

          {/* Advanced */}
          <Card className="bg-white/95 backdrop-blur-sm shadow-sm border border-gray-200/60 rounded-xl">
            <CardContent className="p-6 text-center">
              <CustomInboundIcon 
                Icon={HiLightningBolt} 
                size={40} 
                backgroundColor="#8b5cf6" 
                className="mx-auto mb-3" 
              />
              <h3 className="font-semibold text-gray-900 mb-2">Advanced</h3>
              <p className="text-sm text-gray-600">Webhooks, groups, and integrations</p>
            </CardContent>
          </Card>
        </div>

        {/* Next Steps */}
        <Card className="bg-white/95 backdrop-blur-sm shadow-sm border border-gray-200/60 rounded-xl mb-6">
          <CardContent className="p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Next Steps</h3>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${hasExistingEndpoints || endpointCreated ? 'bg-green-500' : 'bg-blue-500'}`}></div>
                <span className={hasExistingEndpoints || endpointCreated ? 'line-through text-gray-400' : ''}>
                  Create your first endpoint above
                </span>
                {(hasExistingEndpoints || endpointCreated) && <span className="text-green-600 text-xs">✓ Done</span>}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Add and verify your domain</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                <span>Configure email addresses</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                <span>Start receiving emails at your domain</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Button */}
        <div className="text-center">
          <Button 
            onClick={handleCompleteOnboarding}
            disabled={isCompleting}
            size="lg"
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isCompleting ? 'Completing setup...' : (
              <>
                Continue to Domain Setup
                <HiArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
          <p className="text-xs text-gray-500 mt-2">
            This will mark your onboarding as complete and take you to add your first domain.
          </p>
        </div>


      </div>
    </div>
  )
} 