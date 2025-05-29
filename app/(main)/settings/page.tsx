"use client"

import { useSession } from '@/lib/auth-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { CreditCardIcon, CalendarIcon, InfinityIcon, DatabaseIcon, MailIcon, ClockIcon, TrendingUpIcon, CheckCircleIcon } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { PricingTable } from '@/components/autumn/pricing-table'
import { useRouter, useSearchParams } from 'next/navigation'

interface AutumnCustomer {
  id: string
  created_at: number
  name: string
  email: string
  stripe_id: string
  env: string
  products: Array<{
    id: string
    name: string
    group: string | null
    status: string
    canceled_at: number | null
    started_at: number
  }>
  features: {
    [key: string]: {
      id: string
      name: string
      unlimited: boolean
      balance: number
      usage: number
      included_usage: number
      next_reset_at: number | null
      interval: string
    }
  }
  metadata: any
}

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
  const [customerData, setCustomerData] = useState<AutumnCustomer | null>(null)
  const [isLoadingCustomer, setIsLoadingCustomer] = useState(true)
  const [domainStats, setDomainStats] = useState<DomainStatsResponse | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isUpgradeSuccessOpen, setIsUpgradeSuccessOpen] = useState(false)
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

  const fetchCustomerData = async () => {
    if (!session?.user?.id) return
    
    try {
      setIsLoadingCustomer(true)
      const [customerResponse, domainStatsResponse] = await Promise.all([
        fetch('/api/customer'),
        fetch('/api/domains/stats')
      ])
      
      if (customerResponse.ok) {
        const data = await customerResponse.json()
        setCustomerData(data.customer)
      } else {
        throw new Error('Failed to fetch customer data')
      }

      if (domainStatsResponse.ok) {
        const domainData = await domainStatsResponse.json()
        setDomainStats(domainData)
      }
    } catch (error) {
      console.error('Error fetching customer data:', error)
      toast.error('Failed to load subscription data')
    } finally {
      setIsLoadingCustomer(false)
    }
  }

  const handleManageBilling = async () => {
    try {
      const response = await fetch('/api/billing-portal', { method: 'POST' })
      if (response.ok) {
        const data = await response.json()
        if (data.url) {
          window.open(data.url, '_blank')
        }
      } else {
        throw new Error('Failed to create billing portal session')
      }
    } catch (error) {
      console.error('Error creating billing portal session:', error)
      toast.error('Failed to open billing portal')
    }
  }

  useEffect(() => {
    if (session?.user?.id) {
      fetchCustomerData()
    }
  }, [session?.user?.id])

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
                        value={inboundTriggersFeature.unlimited ? 0 : inboundTriggersFeature.usage} 
                        max={inboundTriggersFeature.unlimited ? 100 : inboundTriggersFeature.balance}
                        size={40}
                        strokeWidth={4}
                      />
                      <div>
                        <div className="text-sm font-medium text-white">Triggers</div>
                        <div className="text-xs text-slate-400">
                          {inboundTriggersFeature.unlimited ? (
                            'unlimited'
                          ) : (
                            `${inboundTriggersFeature.usage.toLocaleString()} / ${inboundTriggersFeature.balance.toLocaleString()}`
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
                          emailRetentionFeature.balance >= 30 
                            ? 'border-green-500 bg-green-500/10' 
                            : emailRetentionFeature.balance >= 8
                            ? 'border-yellow-500 bg-yellow-500/10'
                            : 'border-red-500 bg-red-500/10'
                        }`}
                      >
                        <div 
                          className={`w-2 h-2 rounded-full ${
                            emailRetentionFeature.balance >= 30 
                              ? 'bg-green-500' 
                              : emailRetentionFeature.balance >= 8
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                          }`}
                        ></div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white">Retention</div>
                        <div className="text-xs text-slate-400">
                          {emailRetentionFeature.balance} days
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
                  onClick={fetchCustomerData}
                  className="mt-2 bg-slate-800 hover:bg-slate-700 text-white border-slate-600"
                >
                  Retry
                </Button>
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
                fetchCustomerData()
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