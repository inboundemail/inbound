"use client"

import { useSession } from '@/lib/auth/auth-client'
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
  useBillingPortalMutation
} from '@/features/settings/hooks'
import {
  Customer,
  DomainStatsResponse,
} from '@/features/settings/types'
import CreditCard2 from "@/components/icons/credit-card-2"
import ChartTrendUp from "@/components/icons/chart-trend-up"
import CircleCheck from "@/components/icons/circle-check"
import { PricingTable } from '@/components/autumn/pricing-table-format'
import { useRouter, useSearchParams } from 'next/navigation'
import { trackPurchaseConversion } from '@/lib/utils/twitter-tracking'
// removed unused feature icons after layout merge
// Types are now imported from @/features/settings/types

export default function SettingsPage() {
  const { data: session, isPending } = useSession()
  const [isLoading, setIsLoading] = useState(false)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isUpgradeSuccessOpen, setIsUpgradeSuccessOpen] = useState(false)
  
  // React Query hooks
  const { 
    data: customerData, 
    isLoading: isLoadingCustomer,
    error: customerError,
    refetch: refetchCustomer 
  } = useCustomerQuery()
  
  const { 
    data: domainStats, 
    isLoading: isLoadingDomainStats,
    error: domainStatsError
  } = useDomainStatsQuery()
  
  // Mutations
  const billingPortalMutation = useBillingPortalMutation()
  
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
    const productParam = searchParams.get('product') // Get product ID if available
    if (upgradeParam === 'true') {
      setIsUpgradeSuccessOpen(true)
      
      // Track Twitter conversion for plan purchase
      if (session?.user?.email) {
        const productId = productParam || 'pro' // Default to 'pro' if not specified
        trackPurchaseConversion(productId, session.user.email)
      }
      
      // Remove the parameter from URL
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.delete('upgrade')
      newUrl.searchParams.delete('product')
      router.replace(newUrl.pathname + newUrl.search)
    }
  }, [searchParams, router, session?.user?.email])

  if (isPending) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center py-20">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        </div>
      </div>
    )
  }

  if (!session) {
    router.push('/login')
    return null
  }

  const activeProduct = customerData?.products?.find(p => p.status === 'active')
  const domainsFeature = customerData?.features?.['domains']
  const inboundTriggersFeature = customerData?.features?.['inbound_triggers']
  const emailRetentionFeature = customerData?.features?.['email_retention']
  const vipByokFeature = customerData?.features?.['vip_byok']
  const emailsSentFeature = customerData?.features?.['emails_sent']

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
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto p-4">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground mb-1 tracking-tight">
                Settings
              </h2>
              <p className="text-muted-foreground text-sm font-medium">
                Manage your account, billing, and preferences
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleManageBilling}
                disabled={!customerData || billingPortalMutation.isPending}
              >
                {billingPortalMutation.isPending ? 'Loading…' : 'Manage Billing'}
              </Button>
              {showUpgradeButton && (
                <Button 
                  size="sm"
                  onClick={handleOpenUpgrade}
                  variant="primary"
                >
                  <ChartTrendUp width="16" height="16" className="mr-2" />
                  Upgrade
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        
        <div className="space-y-6">
        <div className="h-4 border-b border-slate-800"></div>
        {/* Subscription Management */}
        <Card className="border-none p-0 w-full bg-transparent">
          <CardContent className="p-0">
            {isLoadingCustomer ? (
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Skeleton className="h-6 w-32 mb-2" />
                  <Skeleton className="h-4 w-64" />
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-12 w-32" />
                  <Skeleton className="h-12 w-32" />
                </div>
              </div>
            ) : customerData ? (
              <div>
                {/* Plan Info */}
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold">
                        {activeProduct?.name || 'Free'}
                      </h3>
                      <Badge 
                        variant={activeProduct?.status === 'active' ? 'default' : 'secondary'}
                        className="capitalize"
                      >
                        {activeProduct?.status || 'Inactive'}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-sm max-w-md">
                      {activeProduct?.name === 'Pro' 
                        ? 'Advanced email processing with unlimited triggers and extended retention.'
                        : activeProduct?.name === 'Scale'
                        ? 'Enterprise-grade email infrastructure with maximum limits and priority support.'
                        : 'Get started with basic email forwarding and domain management.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      onClick={handleManageBilling}
                      disabled={!customerData || billingPortalMutation.isPending}
                    >
                      {billingPortalMutation.isPending ? 'Loading...' : 'Manage'}
                    </Button>
                    {showUpgradeButton && (
                      <Button 
                        onClick={handleOpenUpgrade}
                        variant="primary"
                      >
                        <ChartTrendUp width="16" height="16" className="mr-2" />
                        Upgrade
                      </Button>
                    )}
                  </div>
                </div>

                {/* Features & Usage */}
                <div className="mt-6 space-y-4">
                  {domainsFeature && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm font-medium">Domains</div>
                        <div className="text-xs text-muted-foreground">
                          {domainsFeature.unlimited ? 'unlimited' : `${currentDomainCount} / ${maxDomains.toLocaleString()}`}
                        </div>
                      </div>
                      {!domainsFeature.unlimited && maxDomains > 0 && (
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-1.5 rounded-full bg-blue-500"
                            style={{ width: `${Math.min((currentDomainCount / maxDomains) * 100, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {inboundTriggersFeature && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm font-medium">Emails Received</div>
                        <div className="text-xs text-muted-foreground">
                          {inboundTriggersFeature.unlimited ? 'unlimited' : `${(inboundTriggersFeature.usage || 0).toLocaleString()} / ${(inboundTriggersFeature.balance || 0).toLocaleString()}`}
                        </div>
                      </div>
                      {!inboundTriggersFeature.unlimited && (inboundTriggersFeature.balance || 0) > 0 && (
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-1.5 rounded-full bg-green-500"
                            style={{ width: `${Math.min((((inboundTriggersFeature.usage || 0) / (inboundTriggersFeature.balance || 0)) * 100), 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {emailsSentFeature && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm font-medium">Emails Sent</div>
                        <div className="text-xs text-muted-foreground">
                          {emailsSentFeature.unlimited ? 'unlimited' : `${(emailsSentFeature.usage || 0).toLocaleString()} / ${(emailsSentFeature.balance || 0).toLocaleString()}`}
                        </div>
                      </div>
                      {!emailsSentFeature.unlimited && (emailsSentFeature.balance || 0) > 0 && (
                        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-1.5 rounded-full bg-purple-500"
                            style={{ width: `${Math.min((((emailsSentFeature.usage || 0) / (emailsSentFeature.balance || 0)) * 100), 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {emailRetentionFeature && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm font-medium">Email Retention</div>
                        <div className="text-xs text-muted-foreground">{emailRetentionFeature.unlimited ? 'unlimited' : `${emailRetentionFeature.balance?.toLocaleString()} days`}</div>
                      </div>
                    </div>
                  )}

                  {vipByokFeature && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm font-medium">VIP BYOK</div>
                        <div className="text-xs text-muted-foreground">{(vipByokFeature.unlimited || vipByokFeature.balance) ? 'Enabled' : 'Disabled'}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : customerError ? (
              <div className="text-center py-8 text-muted-foreground">
                <CreditCard2 width="32" height="32" className="mx-auto mb-2 opacity-50" />
                <p>Unable to load subscription data</p>
                <p className="text-sm text-destructive mt-1">
                  {customerError instanceof Error ? customerError.message : 'Unknown error'}
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => refetchCustomer()}
                  className="mt-2"
                >
                  Retry
                </Button>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CreditCard2 width="32" height="32" className="mx-auto mb-2 opacity-50" />
                <p>No subscription data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="h-4 border-b border-slate-800"></div>

        <Card className="border-none bg-transparent">
          <CardHeader className="p-0 mb-4">
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>
              Update your profile details and personal information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-0">
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
              {/* <div className="space-y-2">
                <Label htmlFor="image">Profile Image URL</Label>
                <Input 
                  id="image" 
                  name="image" 
                  type="url" 
                  defaultValue={session.user.image || ''} 
                  placeholder="https://example.com/avatar.jpg"
                />
              </div> */}
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Updating...' : 'Update Profile'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="h-4 border-b border-slate-800"></div>

        <Card className="border-none bg-transparent">
          <CardHeader className="p-0 mb-4">
            <CardTitle>Account Status</CardTitle>
            <CardDescription>
              Your account verification and status information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-0">
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
      </div>


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
              <CircleCheck width="24" height="24" className="text-green-600" />
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