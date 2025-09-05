'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { formatDistanceToNow } from 'date-fns'
import Crown from '@/components/icons/crown'
import { toggleVipStatus, updateVipConfig, updateAccountStripeKey } from '@/app/actions/vip'
import { toast } from 'sonner'
import { CustomInboundIcon } from '@/components/icons/customInbound'
import Envelope2 from '@/components/icons/envelope-2'
import ChevronDown from '@/components/icons/chevron-down'
import Gear2 from '@/components/icons/gear-2'
import CircleCheck from '@/components/icons/circle-check'
import Clock2 from '@/components/icons/clock-2'
import Link from 'next/link'
import { useAutumn, useCustomer } from 'autumn-js/react'
import ProductChangeDialog from '@/components/autumn/product-change-dialog'
import { trackVipPurchaseConversion } from '@/lib/utils/twitter-tracking'
import { useRouter, useSearchParams } from 'next/navigation'

interface VipPageClientProps {
  addresses: Array<{
    emailAddress: any
    domain: any
    vipConfig: any
  }>
  recentSessions: Array<{
    session: any
    config: any
    emailAddress: any
  }>
  allowedCountMap: Record<string, number>
  hasVipByok: boolean
  accountStripeKey: string | null
  emailAttempts: Array<{
    attempt: any
    paymentSession: any
    vipConfig: any
    emailAddress: any
  }>
}

export default function VipPageClient({
  addresses,
  recentSessions,
  allowedCountMap,
  hasVipByok,
  accountStripeKey,
  emailAttempts,
}: VipPageClientProps) {
  const [isUpdating, setIsUpdating] = useState<string | null>(null)
  const [expandedConfigs, setExpandedConfigs] = useState<Record<string, boolean>>({})
  const { attach } = useAutumn()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { customer } = useCustomer()  
  const handleToggleVip = async (emailAddressId: string, isEnabled: boolean) => {
    setIsUpdating(emailAddressId)
    try {
      const result = await toggleVipStatus(emailAddressId, isEnabled)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(isEnabled ? 'VIP protection enabled' : 'VIP protection disabled')
      }
    } catch (error) {
      toast.error('Failed to update VIP status')
    } finally {
      setIsUpdating(null)
    }
  }

  const handleUpdateConfig = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const vipConfigId = formData.get('vipConfigId') as string
    
    setIsUpdating(vipConfigId)
    try {
      const result = await updateVipConfig(vipConfigId, {
        price: formData.get('price') as string,
        expirationHours: formData.get('expirationHours') as string,
        allowAfterPayment: formData.get('allowAfterPayment') === 'on',
        customMessage: formData.get('customMessage') as string,
        destinationEmail: formData.get('destinationEmail') as string,
      })
      
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('VIP configuration updated')
      }
    } catch (error) {
      toast.error('Failed to update VIP configuration')
    } finally {
      setIsUpdating(null)
    }
  }

  const handleUpdateAccountStripeKey = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const stripeKey = formData.get('accountStripeKey') as string
    
    setIsUpdating('account-stripe-key')
    try {
      const result = await updateAccountStripeKey(stripeKey)
      
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success('Account Stripe key updated')
        // Close the form if we're replacing a key
        setExpandedConfigs(prev => ({ ...prev, 'stripe-key-form': false }))
        // Reset the form
        e.currentTarget.reset()
      }
    } catch (error) {
      toast.error('Failed to update account Stripe key')
    } finally {
      setIsUpdating(null)
    }
  }

  const toggleExpanded = (configId: string) => {
    setExpandedConfigs(prev => ({
      ...prev,
      [configId]: !prev[configId]
    }))
  }

  const handleUpgradeToVipByok = async () => {
    try {
      await attach({
        productId: "inbound_vip",
        successUrl: `${window.location.origin}/vip?upgrade=true`,
        metadata: {
          dubCustomerId: customer?.id || "",
        },
        dialog: ProductChangeDialog,
      })
    } catch (error) {
      console.error('Error upgrading to VIP BYOK:', error)
      toast.error('Failed to start upgrade process')
    }
  }

  // Check for upgrade success parameter
  useEffect(() => {
    const upgradeParam = searchParams.get('upgrade')
    if (upgradeParam === 'true') {
      toast.success('Successfully upgraded to VIP BYOK! You can now use your own Stripe key.')
      
      // Track Twitter conversion for VIP purchase
      // Note: We don't have access to session here, so we'll track without email for now
      trackVipPurchaseConversion('') // Email will be empty, but conversion_id will still track
      
      // Remove the parameter from URL without reloading
      const newUrl = new URL(window.location.href)
      newUrl.searchParams.delete('upgrade')
      router.replace(newUrl.pathname + newUrl.search)
    }
  }, [searchParams, router])

  return (
    <div className="min-h-screen font-outfit">
      <div className="max-w-6xl mx-auto p-4">
        {/* Header Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground mb-1 tracking-tight">
                VIP Email Management
              </h2>
              <p className="text-muted-foreground text-sm font-medium">
                Require payment from new senders to reach your inbox
              </p>
            </div>
            <div className="flex items-center space-x-3">
              {/* Stripe Key Status Indicator */}
              {hasVipByok && accountStripeKey && (
                <div className="flex items-center space-x-2 px-3 py-2 bg-accent border border-border rounded-lg">
                  <CircleCheck width="16" height="16" className="text-green-600 dark:text-green-400" />
                  <div className="text-sm">
                    <span className="font-medium text-foreground">Stripe Key Loaded: </span>
                    <span className="text-muted-foreground">{accountStripeKey.substring(0, 5)}•••••</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setExpandedConfigs(prev => ({ ...prev, 'stripe-key-form': !prev['stripe-key-form'] }))}
                  >
                    Replace
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="h-6 px-2 text-xs text-destructive hover:text-destructive/80"
                    onClick={async () => {
                      if (confirm('Are you sure you want to remove your Stripe key? Future VIP payments will be processed through Inbound\'s account.')) {
                        setIsUpdating('account-stripe-key')
                        try {
                          const result = await updateAccountStripeKey('')
                          if (result.error) {
                            toast.error(result.error)
                          } else {
                            toast.success('Stripe key removed. Using Inbound\'s account for VIP payments.')
                          }
                        } catch (error) {
                          toast.error('Failed to remove Stripe key')
                        } finally {
                          setIsUpdating(null)
                        }
                      }
                    }}
                    disabled={isUpdating === 'account-stripe-key'}
                  >
                    Remove
                  </Button>
                </div>
              )}
              {!hasVipByok && (
                <Button variant="outline" size="sm" onClick={handleUpgradeToVipByok}>
                  <Crown className="h-3 w-3 mr-1.5 text-yellow-500" />
                  Upgrade to VIP BYOK
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Collapsible Stripe Key Replacement Form */}
        {hasVipByok && accountStripeKey && expandedConfigs['stripe-key-form'] && (
          <Card className="bg-card border-border rounded-xl mb-6">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-foreground tracking-tight">
                Replace Stripe Key
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                Update your Stripe restricted key for VIP payments
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateAccountStripeKey} className="space-y-4">
                <div>
                  <Label htmlFor="accountStripeKey" className="text-sm font-medium">
                    New Stripe Restricted Key
                  </Label>
                  <Input
                    id="accountStripeKey"
                    name="accountStripeKey"
                    type="password"
                    placeholder="rk_live_..."
                    className="mt-1"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Enter your new Stripe restricted key
                    </p>
                    <Button 
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs p-0 h-auto text-primary hover:text-primary/80"
                      onClick={() => window.open('https://dashboard.stripe.com/apikeys/create?name=Inbound%20VIP&permissions%5B%5D=rak_charge_write&permissions%5B%5D=rak_checkout_session_write&permissions%5B%5D=rak_payment_link_write', '_blank')}
                    >
                      Create in Stripe →
                    </Button>
                  </div>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button 
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setExpandedConfigs(prev => ({ ...prev, 'stripe-key-form': false }))}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    size="sm"
                    disabled={isUpdating === 'account-stripe-key'}
                  >
                    {isUpdating === 'account-stripe-key' ? 'Saving...' : 'Update Key'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Account Settings - Only show when no Stripe key is configured */}
        {hasVipByok && !accountStripeKey && (
          <Card className="bg-card border-border rounded-xl mb-6">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-foreground tracking-tight">
                Account Settings
              </CardTitle>
              <CardDescription className="text-sm text-muted-foreground">
                Configure your account-level VIP settings
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 bg-muted border border-border rounded-lg">
                  <div className="flex items-start space-x-3">
                    <Clock2 width="20" height="20" className="text-orange-600 dark:text-orange-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Using Inbound's Stripe Account
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        VIP payments are currently processed through Inbound's Stripe account. Add your own Stripe restricted key to collect payments directly.
                      </p>
                    </div>
                  </div>
                </div>
                
                <form onSubmit={handleUpdateAccountStripeKey} className="space-y-4">
                  <div>
                    <Label htmlFor="accountStripeKey" className="text-sm font-medium">
                      Account Stripe Restricted Key (Optional)
                    </Label>
                    <Input
                      id="accountStripeKey"
                      name="accountStripeKey"
                      type="password"
                      placeholder="rk_live_..."
                      className="mt-1"
                    />
                    <div className="mt-2 flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        Use your own Stripe account to collect VIP payments directly
                      </p>
                      <Button 
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs p-0 h-auto text-primary hover:text-primary/80"
                        onClick={() => window.open('https://dashboard.stripe.com/apikeys/create?name=Inbound%20VIP&permissions%5B%5D=rak_charge_write&permissions%5B%5D=rak_checkout_session_write&permissions%5B%5D=rak_payment_link_write', '_blank')}
                      >
                        Create Restricted Key in Stripe →
                      </Button>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button 
                      type="submit" 
                      size="sm"
                      disabled={isUpdating === 'account-stripe-key'}
                    >
                      {isUpdating === 'account-stripe-key' ? 'Saving...' : 'Add Stripe Key'}
                    </Button>
                  </div>
                </form>
              </div>
            </CardContent>
          </Card>
        )}

        {/* VIP Email Addresses */}
        <div className="space-y-2 mb-6">
          {addresses.length === 0 ? (
            <Card className="bg-card border-border rounded-xl">
              <CardContent className="p-8">
                <div className="text-center">
                  <CustomInboundIcon
                    Icon={Crown}
                    size={48}
                    backgroundColor="#eab308"
                    className="mx-auto mb-4"
                  />
                  <p className="text-sm text-muted-foreground mb-4">
                    No email addresses configured. Add email addresses in the Domains section first.
                  </p>
                  <Button variant="secondary" asChild>
                    <Link href="/emails">
                      Go to Domains
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            addresses.map(({ emailAddress, domain, vipConfig }) => (
              <Card key={emailAddress.id} className="bg-card border-border hover:bg-accent/5 transition-all duration-300 rounded-xl overflow-hidden group">
                <CardContent className="p-0">
                  {/* Email Address Header */}
                  <div className="p-4 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <CustomInboundIcon
                          Icon={Envelope2}
                          size={36}
                          backgroundColor={emailAddress.isVipEnabled ? '#eab308' : '#64748b'}
                        />
                        <div>
                          <h3 className="text-base font-semibold text-foreground tracking-tight">
                            {emailAddress.address}
                          </h3>
                          <div className="flex items-center space-x-2 mt-0.5">
                            <span className="text-xs text-muted-foreground font-medium">
                              {domain?.domain || 'Unknown domain'}
                            </span>
                            {emailAddress.isVipEnabled && vipConfig && (
                              <>
                                <span className="text-xs text-muted-foreground font-medium">•</span>
                                <span className="text-xs text-muted-foreground font-medium">
                                  ${(vipConfig.priceInCents / 100).toFixed(2)} per email
                                </span>
                                <span className="text-xs text-muted-foreground font-medium">•</span>
                                <span className="text-xs text-muted-foreground font-medium">
                                  {allowedCountMap[vipConfig.id] || 0} allowed senders
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {emailAddress.isVipEnabled && vipConfig && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleExpanded(vipConfig.id)}
                            className="h-8 px-2"
                          >
                            <Gear2 width="14" height="14" className="mr-1" />
                            Config
                            <ChevronDown 
                              width="14" 
                              height="14" 
                              className={`ml-1 transition-transform duration-200 ${
                                expandedConfigs[vipConfig.id] ? 'rotate-180' : ''
                              }`}
                            />
                          </Button>
                        )}
                        <Switch
                          checked={emailAddress.isVipEnabled || false}
                          disabled={isUpdating === emailAddress.id}
                          onCheckedChange={(checked) => handleToggleVip(emailAddress.id, checked)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Expandable Configuration */}
                  {emailAddress.isVipEnabled && vipConfig && (
                    <div
                      className="bg-muted/50 overflow-hidden transition-all duration-300 ease-in-out"
                      style={{
                        maxHeight: expandedConfigs[vipConfig.id] ? '400px' : '0px',
                        opacity: expandedConfigs[vipConfig.id] ? 1 : 0
                      }}
                    >
                      <form onSubmit={handleUpdateConfig} className="p-4 space-y-4">
                        <input type="hidden" name="vipConfigId" value={vipConfig.id} />
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor={`price-${vipConfig.id}`} className="text-xs">Price (USD)</Label>
                            <div className="relative mt-1">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                              <Input
                                id={`price-${vipConfig.id}`}
                                name="price"
                                type="number"
                                step="0.01"
                                min="0.01"
                                defaultValue={(vipConfig.priceInCents / 100).toFixed(2)}
                                className="pl-7 h-8 text-sm"
                              />
                            </div>
                          </div>
                          
                          <div>
                            <Label htmlFor={`expiration-${vipConfig.id}`} className="text-xs">Link Expiration (hours)</Label>
                            <Input
                              id={`expiration-${vipConfig.id}`}
                              name="expirationHours"
                              type="number"
                              min="1"
                              max="168"
                              defaultValue={vipConfig.paymentLinkExpirationHours || 24}
                              className="h-8 text-sm mt-1"
                            />
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Switch
                            id={`allow-future-${vipConfig.id}`}
                            name="allowAfterPayment"
                            defaultChecked={vipConfig.allowAfterPayment || false}
                          />
                          <Label htmlFor={`allow-future-${vipConfig.id}`} className="text-sm">
                            Allow all future emails after payment
                          </Label>
                        </div>

                        <div>
                          <Label htmlFor={`message-${vipConfig.id}`} className="text-xs">Custom Message (optional)</Label>
                          <Textarea
                            id={`message-${vipConfig.id}`}
                            name="customMessage"
                            placeholder="Add a custom message to the payment request email..."
                            defaultValue={vipConfig.customMessage || ''}
                            rows={2}
                            className="text-sm mt-1"
                          />
                        </div>

                        <div>
                          <Label htmlFor={`destination-${vipConfig.id}`} className="text-xs">Destination Email (optional)</Label>
                          <Input
                            id={`destination-${vipConfig.id}`}
                            name="destinationEmail"
                            type="email"
                            placeholder="Where to forward emails after payment (defaults to your account email)"
                            defaultValue={vipConfig.destinationEmail || ''}
                            className="h-8 text-sm mt-1"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Leave empty to use your account email
                          </p>
                        </div>

                        <div className="flex justify-end pt-2">
                          <Button 
                            type="submit" 
                            size="sm"
                            disabled={isUpdating === vipConfig.id}
                          >
                            {isUpdating === vipConfig.id ? 'Saving...' : 'Save Changes'}
                          </Button>
                        </div>
                      </form>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* VIP Email Attempts Log */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold text-foreground mb-3">VIP Email Log</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Track all emails that hit your VIP protection and their payment status
          </p>
          {emailAttempts.length > 0 ? (
            <Card className="bg-card border-border rounded-xl">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border">
                    <TableHead className="text-xs">Sender</TableHead>
                    <TableHead className="text-xs">Recipient</TableHead>
                    <TableHead className="text-xs">Subject</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Payment Status</TableHead>
                    <TableHead className="text-xs text-right">Received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emailAttempts.map(({ attempt, paymentSession }) => (
                    <TableRow key={attempt.id} className="border-b border-border">
                      <TableCell className="text-sm py-3">
                        <div className="max-w-[150px] truncate">
                          {attempt.senderEmail}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm py-3">
                        <div className="max-w-[150px] truncate">
                          {attempt.recipientEmail}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm py-3">
                        <div className="max-w-[200px] truncate">
                          {attempt.emailSubject || 'No subject'}
                        </div>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge
                          variant={
                            attempt.status === 'allowed' 
                              ? 'secondary' 
                              : attempt.status === 'payment_required'
                              ? 'outline'
                              : 'secondary'
                          }
                          className="text-xs"
                        >
                          {attempt.status === 'allowed' && <CircleCheck width="10" height="10" className="mr-1" />}
                          {attempt.status === 'payment_required' && <Clock2 width="10" height="10" className="mr-1" />}
                          {attempt.status === 'allowed' ? 'Allowed' : 
                           attempt.status === 'payment_required' ? 'Payment Required' : 
                           attempt.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3">
                        {paymentSession ? (
                          <Badge
                            variant={
                              paymentSession.status === 'paid' 
                                ? 'secondary' 
                                : paymentSession.status === 'pending'
                                ? 'outline'
                                : paymentSession.status === 'expired'
                                ? 'destructive'
                                : 'secondary'
                            }
                            className="text-xs"
                          >
                            {paymentSession.status === 'paid' && <CircleCheck width="10" height="10" className="mr-1" />}
                            {paymentSession.status === 'pending' && <Clock2 width="10" height="10" className="mr-1" />}
                            {paymentSession.status}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground text-right py-3">
                        {formatDistanceToNow(new Date(attempt.createdAt), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <Card className="bg-card border-border rounded-xl">
              <CardContent className="p-8">
                <div className="text-center">
                  <CustomInboundIcon
                    Icon={Envelope2}
                    size={48}
                    backgroundColor="#64748b"
                    className="mx-auto mb-4"
                  />
                  <p className="text-sm text-muted-foreground mb-4">
                    No VIP email attempts yet. Once you enable VIP protection on your email addresses, all incoming emails will be logged here.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
} 