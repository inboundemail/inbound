"use client"

import { useSession } from '@/lib/auth-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import {
  useCustomerQuery,
  useDomainStatsQuery,
  useApiKeysQuery,
  useCreateApiKeyMutation,
  useUpdateApiKeyMutation,
  useDeleteApiKeyMutation,
  useBillingPortalMutation
} from '@/features/settings/hooks'
import { 
  CreditCardIcon, 
  TrendingUpIcon, 
  CheckCircleIcon, 
  KeyIcon, 
  PlusIcon, 
  CopyIcon, 
  TrashIcon
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { PricingTable } from '@/components/autumn/pricing-table'
import { useRouter, useSearchParams } from 'next/navigation'




interface DomainStatsResponse {
  totalDomains: number
  verifiedDomains: number
  totalEmailAddresses: number
  totalEmailsLast24h: number
  limits?: {
    allowed: boolean
    unlimited: boolean
    balance: number | null
    current: number
    remaining: number | null
  } | null
}

interface CreateApiKeyForm {
  name: string
  prefix: string
}

// Circular Progress Component
interface CircularProgressProps {
  value: number
  max: number
  size?: number
  strokeWidth?: number
  className?: string
  children?: React.ReactNode
}

function CircularProgress({ value, max, size = 60, strokeWidth = 6, className = "", children }: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const percentage = max > 0 ? (value / max) * 100 : 0
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-slate-700"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="text-purple-400 transition-all duration-300 ease-in-out"
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { data: session, isPending } = useSession()
  const [isLoading, setIsLoading] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isUpgradeSuccessOpen, setIsUpgradeSuccessOpen] = useState(false)
  
  // React Query hooks
  const { 
    data: customerData, 
    isLoading: isLoadingCustomer, 
    refetch: refetchCustomer 
  } = useCustomerQuery()
  
  const { 
    data: domainStats, 
    isLoading: isLoadingDomainStats 
  } = useDomainStatsQuery()
  
  const { 
    data: apiKeys = [], 
    isLoading: isLoadingApiKeys 
  } = useApiKeysQuery()
  
  // Mutations
  const createApiKeyMutation = useCreateApiKeyMutation()
  const updateApiKeyMutation = useUpdateApiKeyMutation()
  const deleteApiKeyMutation = useDeleteApiKeyMutation()
  const billingPortalMutation = useBillingPortalMutation()
  
  // API Key state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newApiKey, setNewApiKey] = useState<string | null>(null)
  const [showNewApiKey, setShowNewApiKey] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState<CreateApiKeyForm>({
    name: '',
    prefix: ''
  })
  
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleUpdateProfile = async (formData: FormData) => {
    setIsLoading(true)
    try {
      // Implementation would go here
      toast.success('Profile updated successfully')
    } catch (error) {
      toast.error('Failed to update profile')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateApiKey = async () => {
    try {
      const createData = {
        name: createForm.name || undefined,
        prefix: createForm.prefix || undefined,
      }
      
      const result = await createApiKeyMutation.mutateAsync(createData)
      
      if (result?.key) {
        setNewApiKey(result.key)
        setShowNewApiKey(true)
        toast.success('API key created successfully')
        
        // Reset form
        setCreateForm({
          name: '',
          prefix: ''
        })
      }
    } catch (error) {
      console.error('Error creating API key:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create API key')
    }
  }

  const handleDeleteApiKey = async (keyId: string) => {
    try {
      await deleteApiKeyMutation.mutateAsync(keyId)
      toast.success('API key deleted successfully')
    } catch (error) {
      console.error('Error deleting API key:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to delete API key')
    }
  }

  const handleUpdateApiKey = async (keyId: string, updates: { name?: string; enabled?: boolean }) => {
    try {
      await updateApiKeyMutation.mutateAsync({ keyId, ...updates })
      toast.success('API key updated successfully')
    } catch (error) {
      console.error('Error updating API key:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to update API key')
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard')
    } catch (error) {
      toast.error('Failed to copy to clipboard')
    }
  }

  const handleManageBilling = async () => {
    try {
      const url = await billingPortalMutation.mutateAsync()
      window.open(url, '_blank')
    } catch (error) {
      console.error('Error creating billing portal session:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to open billing portal')
    }
  }

  // Check for upgrade success parameter
  useEffect(() => {
    const upgradeParam = searchParams.get('upgrade')
    if (upgradeParam === 'true') {
      setIsUpgradeSuccessOpen(true)
      // Remove the parameter from URL
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.delete('upgrade')
      router.replace(newUrl.pathname + newUrl.search)
    }
  }, [searchParams, router])

  if (isPending) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="flex items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="flex items-center justify-center">
          <div className="text-muted-foreground">Please sign in to access settings</div>
        </div>
      </div>
    )
  }

  const activeProduct = customerData?.products?.find(p => p.status === 'active')
  const domainsFeature = customerData?.features?.['domains']
  const inboundTriggersFeature = customerData?.features?.['inbound_triggers']
  const emailRetentionFeature = customerData?.features?.['email_retention']

  // For domains, use actual domain count from domain stats
  const currentDomainCount = domainStats?.totalDomains || 0
  const maxDomains = domainsFeature?.balance || 0

  // Show upgrade button for all users except Scale plan
  const showUpgradeButton = !activeProduct || 
    !activeProduct.name?.toLowerCase().includes('scale')

  const handleOpenUpgrade = () => {
    setIsDialogOpen(true)
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-10">
      <div className="space-y-6">
        {/* Subscription Management */}
        <Card className="bg-slate-900 text-white border-slate-800">
          <CardContent className="p-6">
            {isLoadingCustomer ? (
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Skeleton className="h-6 w-32 bg-slate-800 mb-2" />
                  <Skeleton className="h-4 w-64 bg-slate-800" />
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-12 w-32 bg-slate-800" />
                  <Skeleton className="h-12 w-32 bg-slate-800" />
                </div>
              </div>
            ) : customerData ? (
              <div className="flex items-center justify-between">
                {/* Left side - Plan Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-semibold">
                      {activeProduct?.name || 'Free'}
                    </h3>
                    <Badge 
                      variant={activeProduct?.status === 'active' ? 'default' : 'secondary'}
                      className="capitalize bg-slate-700 text-slate-200"
                    >
                      {activeProduct?.status || 'Inactive'}
                    </Badge>
                  </div>
                  <p className="text-slate-300 text-sm mb-4 max-w-md">
                    {activeProduct?.name === 'Pro' 
                      ? 'Advanced email processing with unlimited triggers and extended retention.'
                      : activeProduct?.name === 'Scale'
                      ? 'Enterprise-grade email infrastructure with maximum limits and priority support.'
                      : 'Get started with basic email forwarding and domain management.'}
                  </p>
                  <div className="flex items-center gap-3">
                    <Button 
                      variant="secondary" 
                      onClick={handleManageBilling}
                      disabled={!customerData}
                      className='bg-slate-800 hover:bg-slate-700 text-white border-slate-600'
                    >
                      Manage
                    </Button>
                    {showUpgradeButton && (
                      <Button 
                        onClick={handleOpenUpgrade}
                        variant="primary"
                      >
                        <TrendingUpIcon className="h-4 w-4 mr-2" />
                        Upgrade
                      </Button>
                    )}
                  </div>
                </div>

                {/* Right side - Usage Metrics */}
                <div className="space-y-4">
                  {/* Domains */}
                  {domainsFeature && (
                    <div className="flex items-center gap-3">
                      <CircularProgress 
                        value={currentDomainCount} 
                        max={domainsFeature.unlimited ? 100 : maxDomains}
                        size={40}
                        strokeWidth={4}
                      />
                      <div>
                        <div className="text-sm font-medium text-white">Domains</div>
                        <div className="text-xs text-slate-400">
                          {domainsFeature.unlimited ? (
                            'unlimited'
                          ) : (
                            `${currentDomainCount} / ${maxDomains.toLocaleString()}`
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Inbound Triggers */}
                  {inboundTriggersFeature && (
                    <div className="flex items-center gap-3">
                      <CircularProgress 
                        value={inboundTriggersFeature.unlimited ? 0 : inboundTriggersFeature.usage || 0} 
                        max={inboundTriggersFeature.unlimited ? 100 : inboundTriggersFeature.balance || 0}
                        size={40}
                        strokeWidth={4}
                      />
                      <div>
                        <div className="text-sm font-medium text-white">Triggers</div>
                        <div className="text-xs text-slate-400">
                          {inboundTriggersFeature.unlimited ? (
                            'unlimited'
                          ) : (
                            `${inboundTriggersFeature.usage?.toLocaleString()} / ${inboundTriggersFeature.balance?.toLocaleString()}`
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Email Retention */}
                  {emailRetentionFeature && (
                    <div className="flex items-center gap-3">
                      <div 
                        className={`w-10 h-10 rounded-full border-2 flex items-center justify-center ${
                          emailRetentionFeature.balance && emailRetentionFeature.balance >= 30 
                            ? 'border-green-500 bg-green-500/10' 
                            : emailRetentionFeature.balance && emailRetentionFeature.balance >= 8
                            ? 'border-yellow-500 bg-yellow-500/10'
                            : 'border-red-500 bg-red-500/10'
                        }`}
                      >
                        <div 
                          className={`w-2 h-2 rounded-full ${
                            emailRetentionFeature.balance && emailRetentionFeature.balance >= 30 
                              ? 'bg-green-500' 
                              : emailRetentionFeature.balance && emailRetentionFeature.balance >= 8
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                          }`}
                        ></div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">Retention</div>
                        <div className="text-xs text-slate-400">
                          {emailRetentionFeature.balance?.toLocaleString()} days
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <CreditCardIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Unable to load subscription data</p>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => refetchCustomer()}
                  className="mt-2 bg-slate-800 hover:bg-slate-700 text-white border-slate-600"
                >
                  Retry
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* API Keys Management */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <KeyIcon className="h-5 w-5 text-purple-600" />
                  API Keys
                </CardTitle>
                <CardDescription>
                  Manage API keys for programmatic access to your account
                </CardDescription>
              </div>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <PlusIcon className="h-4 w-4 mr-2" />
                    Create API Key
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create New API Key</DialogTitle>
                    <DialogDescription>
                      Create a new API key for programmatic access to your account.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4" onKeyDown={(e) => {
                    if (e.key === 'Enter' && !createApiKeyMutation.isPending) {
                      e.preventDefault()
                      handleCreateApiKey()
                    }
                  }}>
                    <div className="space-y-2">
                      <Label htmlFor="name">Name (optional)</Label>
                      <Input
                        id="name"
                        placeholder="My API Key"
                        value={createForm.name}
                        onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="prefix">Prefix (optional)</Label>
                      <Input
                        id="prefix"
                        placeholder="myapp"
                        value={createForm.prefix}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\s+/g, '-')
                          setCreateForm(prev => ({ ...prev, prefix: value }))
                        }}
                      />
                    </div>
                                         <div className="flex justify-end gap-2">
                       <Button
                         variant="secondary"
                         onClick={() => setIsCreateDialogOpen(false)}
                       >
                         Cancel
                       </Button>
                       <Button
                         onClick={handleCreateApiKey}
                         disabled={createApiKeyMutation.isPending}
                       >
                         {createApiKeyMutation.isPending ? 'Creating...' : 'Create API Key'}
                       </Button>
                     </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingApiKeys ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-8 h-8 rounded-md" />
                      <div>
                        <Skeleton className="h-4 w-32 mb-1" />
                        <Skeleton className="h-3 w-40" />
                      </div>
                    </div>
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            ) : apiKeys.length === 0 ? (
              <div className="text-center py-8">
                <KeyIcon className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground mb-3">No API keys created yet</p>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => setIsCreateDialogOpen(true)}
                >
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Create Your First API Key
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {apiKeys.map((apiKey) => (
                  <div 
                    key={apiKey.id}
                    className={`flex items-center justify-between p-1 ${apiKeys.length > 1 ? 'border-b' : ''}`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-purple-100 border border-purple-200">
                        <KeyIcon className="h-4 w-4 text-purple-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="font-medium text-sm truncate">
                            {apiKey.name || 'Unnamed API Key'}
                          </div>
                          <Badge variant={apiKey.enabled ? "default" : "secondary"}>
                            {apiKey.enabled ? 'Active' : 'Disabled'}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div className="flex items-center gap-4">
                            <span>Key: {apiKey.prefix ? `${apiKey.prefix}_` : ''}***{apiKey.start}</span>
                            {apiKey.remaining !== null && (
                              <span>Remaining: {apiKey.remaining.toLocaleString()}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-4">
                            <span>Created: {formatDistanceToNow(new Date(apiKey.createdAt), { addSuffix: true })}</span>
                            {apiKey.expiresAt && (
                              <span className={new Date(apiKey.expiresAt) < new Date() ? 'text-red-500' : ''}>
                                Expires: {formatDistanceToNow(new Date(apiKey.expiresAt), { addSuffix: true })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                                             <Button
                         variant="ghost"
                         size="sm"
                         onClick={() => handleUpdateApiKey(apiKey.id, { enabled: !apiKey.enabled })}
                       >
                         {apiKey.enabled ? 'Disable' : 'Enable'}
                       </Button>
                       <Button 
                         variant="ghost" 
                         size="sm" 
                         className="text-red-600 hover:text-red-700"
                         onClick={() => {
                           setKeyToDelete(apiKey.id)
                           setDeleteConfirmOpen(true)
                         }}
                       >
                         <TrashIcon className="h-4 w-4" />
                       </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>
              Update your profile details and personal information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={handleUpdateProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input 
                    id="name" 
                    name="name" 
                    defaultValue={session.user.name || ''} 
                    placeholder="Enter your full name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input 
                    id="email" 
                    name="email" 
                    type="email" 
                    defaultValue={session.user.email} 
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="image">Profile Image URL</Label>
                <Input 
                  id="image" 
                  name="image" 
                  type="url" 
                  defaultValue={session.user.image || ''} 
                  placeholder="https://example.com/avatar.jpg"
                />
              </div>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Updating...' : 'Update Profile'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account Status</CardTitle>
            <CardDescription>
              Your account verification and status information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span>Email Verification</span>
              <Badge variant={session.user.emailVerified ? "default" : "destructive"}>
                {session.user.emailVerified ? 'Verified' : 'Unverified'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Account Created</span>
              <span className="text-sm text-muted-foreground">
                {new Date(session.user.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Last Updated</span>
              <span className="text-sm text-muted-foreground">
                {new Date(session.user.updatedAt).toLocaleDateString()}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete API Key</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this API key? This action cannot be undone and will immediately revoke access for any applications using this key.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setDeleteConfirmOpen(false)
                setKeyToDelete(null)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (keyToDelete) {
                  handleDeleteApiKey(keyToDelete)
                  setDeleteConfirmOpen(false)
                  setKeyToDelete(null)
                }
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New API Key Display Dialog */}
      <Dialog open={showNewApiKey} onOpenChange={setShowNewApiKey}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircleIcon className="h-5 w-5 text-green-600" />
              API Key Created
            </DialogTitle>
            <DialogDescription>
              Your new API key has been created. Make sure to copy it now as you won't be able to see it again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={newApiKey || ''}
                  readOnly
                  className="font-mono text-sm"
                />
                                 <Button
                   variant="secondary"
                   size="sm"
                   onClick={() => copyToClipboard(newApiKey || '')}
                 >
                   <CopyIcon className="h-4 w-4" />
                 </Button>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <div className="w-4 h-4 rounded-full bg-amber-500 mt-0.5 flex-shrink-0"></div>
                <div className="text-sm text-amber-800">
                  <strong>Important:</strong> This is the only time you'll see this API key. Make sure to copy and store it securely.
                </div>
              </div>
            </div>
            <Button 
              onClick={() => {
                setShowNewApiKey(false)
                setNewApiKey(null)
                setIsCreateDialogOpen(false)
              }}
              className="w-full"
            >
              I've Saved My API Key
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upgrade Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-center">Upgrade Your Plan</DialogTitle>
            <DialogDescription className="text-center">
              Choose the plan that best fits your needs and unlock more features
            </DialogDescription>
          </DialogHeader>
          <div className="mt-6">
            <PricingTable />
          </div>
        </DialogContent>
      </Dialog>

      {/* Upgrade Success Dialog */}
      <Dialog open={isUpgradeSuccessOpen} onOpenChange={setIsUpgradeSuccessOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircleIcon className="h-6 w-6 text-green-600" />
            </div>
            <DialogTitle className="text-2xl font-bold text-center">Upgrade Successful!</DialogTitle>
            <DialogDescription className="text-center">
              Thank you for upgrading your plan! Your new features and limits are now active.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-6 flex justify-center">
            <Button 
              onClick={() => {
                setIsUpgradeSuccessOpen(false)
                // Refresh customer data to show updated plan
                refetchCustomer()
              }}
              className="w-full"
            >
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
} 