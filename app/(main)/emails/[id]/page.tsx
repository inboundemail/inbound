"use client"

import { useEffect, useState } from 'react'
import { useSession } from '@/lib/auth-client'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import {
    CheckCircleIcon,
    XCircleIcon,
    ClockIcon,
    AlertTriangleIcon,
    ArrowLeftIcon,
    PlusIcon,
    MailIcon,
    GlobeIcon,
    TrendingUpIcon,
    CalendarIcon,
    RefreshCwIcon,
    CopyIcon,
    CheckIcon,
    TrashIcon,
    ServerIcon,
    InfoIcon,
    SettingsIcon,
    LinkIcon,
    ExternalLinkIcon
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { DOMAIN_STATUS } from '@/lib/db/schema'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

interface DnsRecord {
    type: string
    name: string
    value: string
    isVerified: boolean
    isRequired: boolean
    lastChecked?: string
}

interface EmailAddress {
    id: string
    address: string
    isActive: boolean
    isReceiptRuleConfigured: boolean
    receiptRuleName?: string
    webhookId?: string
    webhookName?: string
    createdAt: string
    emailsLast24h: number
}

interface Webhook {
    id: string
    name: string
    url: string
    isActive: boolean
    description?: string
    createdAt: string
}

interface DomainDetails {
    domain: {
        id: string
        domain: string
        status: string
        sesVerificationStatus?: string
        verificationToken?: string
        canReceiveEmails: boolean
        hasMxRecords: boolean
        domainProvider?: string
        providerConfidence?: string
        lastDnsCheck?: string
        lastSesCheck?: string
        createdAt: string
        updatedAt: string
        canProceed: boolean
    }
    dnsRecords: DnsRecord[]
    emailAddresses: EmailAddress[]
    stats: {
        totalEmailAddresses: number
        activeEmailAddresses: number
        configuredEmailAddresses: number
        totalEmailsLast24h: number
    }
}

export default function DomainDetailPage() {
    const { data: session } = useSession()
    const params = useParams()
    const router = useRouter()
    const domainId = params.id as string

    const [domainDetails, setDomainDetails] = useState<DomainDetails | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [copiedValues, setCopiedValues] = useState<Record<string, boolean>>({})
    const [isRefreshing, setIsRefreshing] = useState(false)

    // Email address management state
    const [newEmailAddress, setNewEmailAddress] = useState('')
    const [selectedWebhookId, setSelectedWebhookId] = useState<string>('none')
    const [isAddingEmail, setIsAddingEmail] = useState(false)
    const [emailError, setEmailError] = useState<string | null>(null)

    // Webhook management state
    const [userWebhooks, setUserWebhooks] = useState<Webhook[]>([])
    const [isLoadingWebhooks, setIsLoadingWebhooks] = useState(false)

    // Domain deletion state
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [deleteConfirmText, setDeleteConfirmText] = useState('')

    // Background polling state
    const [isBackgroundPolling, setIsBackgroundPolling] = useState(false)

    // Webhook management dialog state
    const [isWebhookDialogOpen, setIsWebhookDialogOpen] = useState(false)
    const [selectedEmailForWebhook, setSelectedEmailForWebhook] = useState<EmailAddress | null>(null)
    const [webhookDialogSelectedId, setWebhookDialogSelectedId] = useState<string>('none')
    const [isUpdatingWebhook, setIsUpdatingWebhook] = useState(false)

    // Create webhook dialog state
    const [isCreateWebhookOpen, setIsCreateWebhookOpen] = useState(false)
    const [isCreatingWebhook, setIsCreatingWebhook] = useState(false)
    const [createWebhookForm, setCreateWebhookForm] = useState({
        name: '',
        url: '',
        description: '',
        timeout: 30,
        retryAttempts: 3
    })
    const [createWebhookError, setCreateWebhookError] = useState<string | null>(null)

    useEffect(() => {
        if (session?.user && domainId) {
            fetchDomainDetails()
            fetchWebhooks()
        }
    }, [session, domainId])

    // Background polling for status changes
    useEffect(() => {
        if (!session?.user || !domainId || !domainDetails) return

        // Don't poll if domain is already fully verified
        if (domainDetails.domain.status === DOMAIN_STATUS.VERIFIED) {
            setIsBackgroundPolling(false)
            return
        }

        let pollInterval: NodeJS.Timeout

        const pollForStatusChanges = async () => {
            // Skip if tab is not visible to be server-friendly
            if (document.hidden) return

            try {
                // Silently fetch domain details without showing loading states
                const response = await fetch(`/api/domains/${domainId}?refreshProvider=true`)
                
                if (response.ok) {
                    const data: DomainDetails = await response.json()
                    
                    // Only update UI if there's been a meaningful change
                    const hasStatusChanged = data.domain.status !== domainDetails.domain.status
                    const hasSesStatusChanged = data.domain.sesVerificationStatus !== domainDetails.domain.sesVerificationStatus
                    
                    // Check for DNS records changes more robustly
                    const currentDnsMap = new Map(domainDetails.dnsRecords.map(r => [`${r.type}-${r.name}`, r.isVerified]))
                    const newDnsMap = new Map(data.dnsRecords.map(r => [`${r.type}-${r.name}`, r.isVerified]))
                    
                    let hasDnsRecordsChanged = false
                    // Check if any verification status changed
                    for (const [key, isVerified] of newDnsMap) {
                        if (currentDnsMap.get(key) !== isVerified) {
                            hasDnsRecordsChanged = true
                            break
                        }
                    }
                    // Check if any records were added or removed
                    if (!hasDnsRecordsChanged && currentDnsMap.size !== newDnsMap.size) {
                        hasDnsRecordsChanged = true
                    }
                    
                    if (hasStatusChanged || hasSesStatusChanged || hasDnsRecordsChanged) {
                        console.log(`🔄 Status change detected for ${data.domain.domain}:`, {
                            statusChanged: hasStatusChanged ? `${domainDetails.domain.status} → ${data.domain.status}` : 'No change',
                            sesStatusChanged: hasSesStatusChanged ? `${domainDetails.domain.sesVerificationStatus} → ${data.domain.sesVerificationStatus}` : 'No change',
                            dnsChanged: hasDnsRecordsChanged
                        })
                        
                        // Update the UI state
                        setDomainDetails(data)
                        
                        // Show appropriate toast notification
                        if (hasStatusChanged) {
                            if (data.domain.status === DOMAIN_STATUS.VERIFIED) {
                                toast.success(`🎉 Domain ${data.domain.domain} is now fully verified!`)
                            } else if (data.domain.status === DOMAIN_STATUS.VERIFIED) {
                                toast.success(`✅ DNS verification complete! SES verification in progress...`)
                            } else if (data.domain.status === DOMAIN_STATUS.FAILED) {
                                toast.error(`❌ Domain verification failed. Please check your DNS records.`)
                            }
                        } else if (hasDnsRecordsChanged) {
                            const verifiedCount = data.dnsRecords.filter(r => r.isVerified).length
                            const totalCount = data.dnsRecords.length
                            toast.success(`📋 DNS records updated (${verifiedCount}/${totalCount} verified)`)
                        }
                        
                        // Stop polling if domain is now fully verified
                        if (data.domain.status === DOMAIN_STATUS.VERIFIED) {
                            clearInterval(pollInterval)
                            setIsBackgroundPolling(false)
                            console.log(`✅ Stopping background polling - domain fully verified`)
                        }
                    }
                }
            } catch (error) {
                // Silently handle errors in background polling to avoid disrupting the UI
                console.error('Background polling error (silent):', error)
            }
        }

        // Start polling every 10 seconds
        setIsBackgroundPolling(true)
        pollInterval = setInterval(pollForStatusChanges, 10000)
        console.log(`🔄 Started background polling for domain status changes every 10 seconds`)

        // Cleanup on unmount
        return () => {
            if (pollInterval) {
                clearInterval(pollInterval)
                setIsBackgroundPolling(false)
                console.log(`🛑 Stopped background polling`)
            }
        }
    }, [session, domainId, domainDetails?.domain.status, domainDetails?.domain.sesVerificationStatus])

    const fetchDomainDetails = async () => {
        try {
            setIsLoading(true)
            setError(null)
            const response = await fetch(`/api/domains/${domainId}?refreshProvider=true`)

            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Domain not found')
                }
                throw new Error('Failed to fetch domain details')
            }

            const data: DomainDetails = await response.json()
            setDomainDetails(data)
        } catch (error) {
            console.error('Error fetching domain details:', error)
            setError(error instanceof Error ? error.message : 'Failed to load domain details')
            toast.error('Failed to load domain details')
        } finally {
            setIsLoading(false)
        }
    }

    const fetchWebhooks = async () => {
        try {
            setIsLoadingWebhooks(true)
            const response = await fetch('/api/webhooks')
            
            if (response.ok) {
                const data = await response.json()
                setUserWebhooks(data.webhooks || [])
            }
        } catch (error) {
            console.error('Error fetching webhooks:', error)
        } finally {
            setIsLoadingWebhooks(false)
        }
    }

    const copyToClipboard = async (text: string, key: string) => {
        try {
            await navigator.clipboard.writeText(text)
            setCopiedValues(prev => ({ ...prev, [key]: true }))
            setTimeout(() => {
                setCopiedValues(prev => ({ ...prev, [key]: false }))
            }, 2000)
        } catch (err) {
            console.error('Failed to copy text: ', err)
        }
    }

    const performFullRefresh = async () => {
        if (!domainDetails) return

        setIsRefreshing(true)
        try {
            // First check DNS records
            toast.loading('Checking DNS records...', { id: 'refresh-toast' })
            const dnsResponse = await fetch('/api/inbound/check-dns-records', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain: domainDetails.domain.domain,
                    domainId: domainDetails.domain.id
                })
            })

            if (dnsResponse.ok) {
                // Then refresh all domain details (which includes comprehensive SES status check)
                toast.loading('Checking AWS SES verification status...', { id: 'refresh-toast' })
                await fetchDomainDetails()
                toast.success('Domain status refreshed successfully', { id: 'refresh-toast' })
            } else {
                toast.error('Failed to refresh domain status', { id: 'refresh-toast' })
            }
        } catch (error) {
            console.error('Error refreshing domain status:', error)
            toast.error('Failed to refresh domain status', { id: 'refresh-toast' })
        } finally {
            setIsRefreshing(false)
        }
    }

    const addEmailAddress = async () => {
        if (!domainDetails || !newEmailAddress.trim()) return

        setIsAddingEmail(true)
        setEmailError(null)

        try {
            const fullEmailAddress = newEmailAddress.includes('@')
                ? newEmailAddress
                : `${newEmailAddress}@${domainDetails.domain.domain}`

            const response = await fetch(`/api/domains/${domainId}/email-addresses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    emailAddress: fullEmailAddress,
                    webhookId: selectedWebhookId === 'none' ? null : selectedWebhookId
                })
            })

            const result = await response.json()

            if (response.ok) {
                setNewEmailAddress('')
                setSelectedWebhookId('none')
                await fetchDomainDetails() // Refresh the data
                toast.success('Email address added successfully')
                if (result.warning) {
                    toast.warning(result.warning)
                }
            } else {
                setEmailError(result.error || 'Failed to add email address')
                toast.error(result.error || 'Failed to add email address')
            }
        } catch (error) {
            console.error('Error adding email address:', error)
            setEmailError('Network error occurred')
            toast.error('Network error occurred')
        } finally {
            setIsAddingEmail(false)
        }
    }

    const deleteEmailAddress = async (emailAddressId: string, emailAddress: string) => {
        if (!domainDetails) return

        if (!confirm(`Are you sure you want to delete ${emailAddress}?`)) {
            return
        }

        try {
            const response = await fetch(`/api/domains/${domainId}/email-addresses`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emailAddressId })
            })

            if (response.ok) {
                await fetchDomainDetails() // Refresh the data
                toast.success('Email address deleted successfully')
            } else {
                const result = await response.json()
                toast.error(result.error || 'Failed to delete email address')
            }
        } catch (error) {
            console.error('Error deleting email address:', error)
            toast.error('Network error occurred')
        }
    }

    const deleteDomain = async () => {
        if (!domainDetails) return

        // Verify the user typed the domain name correctly
        if (deleteConfirmText !== domainDetails.domain.domain) {
            toast.error('Please type the domain name exactly to confirm deletion')
            return
        }

        setIsDeleting(true)
        try {
            const response = await fetch(`/api/domains/${domainId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            })

            const result = await response.json()

            if (response.ok) {
                toast.success('Domain deleted successfully')
                setIsDeleteDialogOpen(false)
                // Redirect to domains list
                router.push('/emails')
            } else {
                toast.error(result.error || 'Failed to delete domain')
                console.error('Delete domain error:', result)
            }
        } catch (error) {
            console.error('Error deleting domain:', error)
            toast.error('Network error occurred')
        } finally {
            setIsDeleting(false)
        }
    }

    const updateEmailWebhook = async () => {
        if (!selectedEmailForWebhook) return

        setIsUpdatingWebhook(true)
        try {
            const response = await fetch(`/api/domains/${domainId}/email-addresses/${selectedEmailForWebhook.id}/webhook`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ webhookId: webhookDialogSelectedId === 'none' ? null : webhookDialogSelectedId })
            })

            const result = await response.json()

            if (response.ok) {
                toast.success(result.message)
                setIsWebhookDialogOpen(false)
                setSelectedEmailForWebhook(null)
                setWebhookDialogSelectedId('none')
                await fetchDomainDetails() // Refresh the data
            } else {
                toast.error(result.error || 'Failed to update webhook assignment')
            }
        } catch (error) {
            console.error('Error updating webhook assignment:', error)
            toast.error('Network error occurred')
        } finally {
            setIsUpdatingWebhook(false)
        }
    }

    const openWebhookDialog = (email: EmailAddress) => {
        setSelectedEmailForWebhook(email)
        setWebhookDialogSelectedId(email.webhookId || 'none')
        setIsWebhookDialogOpen(true)
    }

    const createWebhook = async () => {
        if (!createWebhookForm.name.trim() || !createWebhookForm.url.trim()) {
            setCreateWebhookError('Name and URL are required')
            return
        }

        setIsCreatingWebhook(true)
        setCreateWebhookError(null)

        try {
            const response = await fetch('/api/webhooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(createWebhookForm)
            })

            const result = await response.json()

            if (response.ok) {
                toast.success('Webhook created successfully!')
                setIsCreateWebhookOpen(false)
                setCreateWebhookForm({
                    name: '',
                    url: '',
                    description: '',
                    timeout: 30,
                    retryAttempts: 3
                })
                setCreateWebhookError(null)
                
                // Refresh webhooks and auto-select the new one
                await fetchWebhooks()
                
                // Auto-select the new webhook in the appropriate form
                const newWebhookId = result.webhook.id
                setSelectedWebhookId(newWebhookId)
                
                // If we're in the management dialog, also update that selection
                if (isWebhookDialogOpen) {
                    setWebhookDialogSelectedId(newWebhookId)
                }
            } else {
                setCreateWebhookError(result.error || 'Failed to create webhook')
            }
        } catch (error) {
            console.error('Error creating webhook:', error)
            setCreateWebhookError('Network error occurred')
        } finally {
            setIsCreatingWebhook(false)
        }
    }

    const handleWebhookSelection = (value: string) => {
        if (value === 'create-new') {
            setIsCreateWebhookOpen(true)
        } else {
            setSelectedWebhookId(value)
        }
    }

    const handleWebhookDialogSelection = (value: string) => {
        if (value === 'create-new') {
            setIsCreateWebhookOpen(true)
        } else {
            setWebhookDialogSelectedId(value)
        }
    }

    const getStatusBadge = (status: string, sesStatus?: string) => {
        if (status === DOMAIN_STATUS.VERIFIED) {
            return (
                <Badge className="bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200 transition-colors">
                    <CheckCircleIcon className="h-3 w-3 mr-1" />
                    Verified
                </Badge>
            )
        }

        switch (status) {
            case DOMAIN_STATUS.PENDING:
                return (
                    <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 transition-colors">
                        <ClockIcon className="h-3 w-3 mr-1" />
                        Pending
                    </Badge>
                )
            case DOMAIN_STATUS.VERIFIED:
                return (
                    <Badge className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200 transition-colors">
                        <ClockIcon className="h-3 w-3 mr-1" />
                        SES Pending
                    </Badge>
                )
            case DOMAIN_STATUS.FAILED:
                return (
                    <Badge className="bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-200 transition-colors">
                        <XCircleIcon className="h-3 w-3 mr-1" />
                        Failed
                    </Badge>
                )
            default:
                return (
                    <Badge className="bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 transition-colors">
                        <ClockIcon className="h-3 w-3 mr-1" />
                        {status}
                    </Badge>
                )
        }
    }

    if (isLoading) {
        return (
            <div className="flex flex-1 flex-col gap-6 p-6">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="sm" disabled>
                        <ArrowLeftIcon className="h-4 w-4 mr-2" />
                        Back to Domains
                    </Button>
                    <div>
                        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
                        <div className="h-4 w-32 bg-muted animate-pulse rounded mt-2" />
                    </div>
                </div>

                <div className="flex items-center justify-center py-12">
                    <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        <span className="text-muted-foreground">Loading domain details...</span>
                    </div>
                </div>
            </div>
        )
    }

    if (error || !domainDetails) {
        return (
            <div className="flex flex-1 flex-col gap-6 p-6">
                <div className="flex items-center gap-4">
                    <Link href="/emails">
                        <Button variant="ghost" size="sm">
                            <ArrowLeftIcon className="h-4 w-4 mr-2" />
                            Back to Domains
                        </Button>
                    </Link>
                </div>

                <Card className="border-red-200 bg-red-50">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 text-red-600">
                            <XCircleIcon className="h-4 w-4" />
                            <span>{error || 'Domain not found'}</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={fetchDomainDetails}
                                className="ml-auto text-red-600 hover:text-red-700"
                            >
                                Try Again
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    const { domain, dnsRecords, emailAddresses, stats } = domainDetails

    // Determine what to show based on domain status
    const showEmailSection = domain.status === DOMAIN_STATUS.VERIFIED

    return (
        <div className="flex flex-1 flex-col gap-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div>
                        <Link href="/emails" className="flex items-center gap-2 text-sm text-muted-foreground">
                            <ArrowLeftIcon className="h-4 w-4" />
                            Back to Domains
                        </Link>
                        <h1 className="text-3xl font-bold tracking-tight">{domain.domain}</h1>
                        <p className="text-muted-foreground">
                            {domain.status === DOMAIN_STATUS.PENDING && "Add DNS records to complete verification"}
                            {domain.status === DOMAIN_STATUS.VERIFIED && "Domain verified - manage email addresses below"}
                            {domain.status === DOMAIN_STATUS.FAILED && "Domain verification failed - please check your DNS records"}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {getStatusBadge(domain.status, domain.sesVerificationStatus)}
                    {isBackgroundPolling && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                            <span>Auto-checking</span>
                        </div>
                    )}
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={performFullRefresh}
                        disabled={isRefreshing}
                    >
                        <RefreshCwIcon className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    
                    {/* Delete Domain Button */}
                    <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                        <DialogTrigger asChild>
                            <Button
                                variant="destructive"
                                size="sm"
                            >
                                <TrashIcon className="h-4 w-4 mr-2" />
                                Delete Domain
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Delete Domain</DialogTitle>
                                <DialogDescription>
                                    This action cannot be undone. This will permanently delete the domain "{domain.domain}" 
                                    and all associated email addresses, DNS records, and email data from both AWS SES and our database.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                                    <h4 className="font-semibold text-red-800 mb-2">What will be deleted:</h4>
                                    <ul className="text-sm text-red-700 space-y-1">
                                        <li>• Domain identity from AWS SES</li>
                                        <li>• All SES receipt rules for this domain</li>
                                        <li>• {stats.totalEmailAddresses} email address(es)</li>
                                        <li>• All DNS verification records</li>
                                        <li>• All email history and statistics</li>
                                    </ul>
                                </div>
                                <div>
                                    <Label htmlFor="delete-confirm">
                                        Type <strong>{domain.domain}</strong> to confirm deletion:
                                    </Label>
                                    <Input
                                        id="delete-confirm"
                                        value={deleteConfirmText}
                                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && deleteConfirmText === domain.domain && !isDeleting) {
                                                deleteDomain()
                                            }
                                        }}
                                        placeholder={domain.domain}
                                        className="mt-2"
                                        disabled={isDeleting}
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button
                                    variant="secondary"
                                    onClick={() => {
                                        setIsDeleteDialogOpen(false)
                                        setDeleteConfirmText('')
                                    }}
                                    disabled={isDeleting}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="destructive"
                                    onClick={deleteDomain}
                                    disabled={isDeleting || deleteConfirmText !== domain.domain}
                                >
                                    {isDeleting ? (
                                        <>
                                            <RefreshCwIcon className="h-4 w-4 mr-2 animate-spin" />
                                            Deleting...
                                        </>
                                    ) : (
                                        <>
                                            <TrashIcon className="h-4 w-4 mr-2" />
                                            Delete Domain
                                        </>
                                    )}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Stats Cards - Only show for SES verified domains */}
            {showEmailSection && (
                <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Email Addresses</CardTitle>
                            <MailIcon className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.totalEmailAddresses}</div>
                            <p className="text-xs text-muted-foreground">
                                {stats.configuredEmailAddresses} configured
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Emails (24h)</CardTitle>
                            <TrendingUpIcon className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{stats.totalEmailsLast24h}</div>
                            <p className="text-xs text-muted-foreground">
                                received today
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Provider</CardTitle>
                            <GlobeIcon className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{domain.domainProvider || 'Unknown'}</div>
                            <p className="text-xs text-muted-foreground">
                                {domain.providerConfidence || 'unknown'} confidence
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Created</CardTitle>
                            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">
                                {formatDistanceToNow(new Date(domain.createdAt), { addSuffix: true })}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                domain added
                            </p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* MX Records Warning - Show if domain has MX records */}
            {domain.hasMxRecords && (
                <Alert className="border-amber-200 bg-amber-50">
                    <AlertTriangleIcon className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-800">
                        <strong>Warning:</strong> This domain has existing MX records for email receiving. 
                        This may conflict with other email services. If you experience issues, consider using a subdomain instead.
                    </AlertDescription>
                </Alert>
            )}

            {/* SES Verification Status - Show for DNS verified domains */}
            {(domain.status === DOMAIN_STATUS.PENDING || domain.status === DOMAIN_STATUS.VERIFIED || domain.status === DOMAIN_STATUS.FAILED) && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <ClockIcon className="h-5 w-5 text-blue-600" />
                                    {domain.status === DOMAIN_STATUS.PENDING && "Domain Verification Required"}
                                    {domain.status === DOMAIN_STATUS.VERIFIED && "SES Verification in Progress"}
                                    {domain.status === DOMAIN_STATUS.FAILED && "Domain Verification Failed"}
                                </CardTitle>
                                <CardDescription>
                                    {domain.status === DOMAIN_STATUS.PENDING && "Add the DNS records below to complete domain verification for email receiving."}
                                    {domain.status === DOMAIN_STATUS.VERIFIED && "DNS records verified. Waiting for SES to complete domain verification."}
                                    {domain.status === DOMAIN_STATUS.FAILED && "DNS verification failed. Please check and update your DNS records below."}
                                </CardDescription>
                            </div>
                            <div className="flex items-center gap-2">
                                {domain.domainProvider && (
                                    <div className="text-sm text-muted-foreground">
                                        Provider: {domain.domainProvider}
                                    </div>
                                )}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {dnsRecords.length === 0 ? (
                            <Alert>
                                <AlertTriangleIcon className="h-4 w-4" />
                                <AlertDescription>
                                    No DNS records found. Please refresh to load verification records.
                                </AlertDescription>
                            </Alert>
                        ) : (
                            <div className="space-y-4">

                                <Alert className="border-blue-200 bg-blue-50">
                                    <AlertDescription className="text-blue-800">
                                        <strong>Add these DNS records to your domain:</strong> Once added, use the "Refresh" button above to verify DNS records and check AWS SES status.
                                    </AlertDescription>
                                </Alert>

                                {dnsRecords.map((record, index) => (
                                    <div key={index} className="p-4 bg-gray-50 rounded-lg border">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="secondary" className="text-sm font-medium">{record.type}</Badge>
                                                {record.isVerified ? (
                                                    <CheckCircleIcon className="h-4 w-4 text-green-600" />
                                                ) : (
                                                    <XCircleIcon className="h-4 w-4 text-red-600" />
                                                )}
                                            </div>
                                            <span className="text-sm text-muted-foreground">
                                                {record.isVerified ? 'Verified' : 'Not Found'}
                                            </span>
                                        </div>

                                        <div className="space-y-3">
                                            {/* Name Field */}
                                            <div>
                                                <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Name</label>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <div className="flex-1 p-2 bg-white border rounded font-mono text-sm break-all">
                                                        {record.name}
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={() => copyToClipboard(record.name, `name-${index}`)}
                                                        className="shrink-0"
                                                    >
                                                        {copiedValues[`name-${index}`] ? (
                                                            <CheckIcon className="h-3 w-3" />
                                                        ) : (
                                                            <CopyIcon className="h-3 w-3" />
                                                        )}
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* MX Record - Special handling for priority and value */}
                                            {record.type === 'MX' ? (
                                                <>
                                                    <div>
                                                        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Priority</label>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <div className="flex-1 p-2 bg-white border rounded font-mono text-sm break-all">
                                                                {record.value.split(' ')[0]}
                                                            </div>
                                                            <Button
                                                                size="sm"
                                                                variant="secondary"
                                                                onClick={() => copyToClipboard(record.value.split(' ')[0], `priority-${index}`)}
                                                                className="shrink-0"
                                                            >
                                                                {copiedValues[`priority-${index}`] ? (
                                                                    <CheckIcon className="h-3 w-3" />
                                                                ) : (
                                                                    <CopyIcon className="h-3 w-3" />
                                                                )}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Value</label>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <div className="flex-1 p-2 bg-white border rounded font-mono text-sm break-all">
                                                                {record.value.split(' ').slice(1).join(' ')}
                                                            </div>
                                                            <Button
                                                                size="sm"
                                                                variant="secondary"
                                                                onClick={() => copyToClipboard(record.value.split(' ').slice(1).join(' '), `mx-value-${index}`)}
                                                                className="shrink-0"
                                                            >
                                                                {copiedValues[`mx-value-${index}`] ? (
                                                                    <CheckIcon className="h-3 w-3" />
                                                                ) : (
                                                                    <CopyIcon className="h-3 w-3" />
                                                                )}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </>
                                            ) : (
                                                /* Non-MX Record - Standard Value Field */
                                                <div>
                                                    <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Value</label>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <div className="flex-1 p-2 bg-white border rounded font-mono text-sm break-all">
                                                            {record.value}
                                                        </div>
                                                        <Button
                                                            size="sm"
                                                            variant="secondary"
                                                            onClick={() => copyToClipboard(record.value, `value-${index}`)}
                                                            className="shrink-0"
                                                        >
                                                            {copiedValues[`value-${index}`] ? (
                                                                <CheckIcon className="h-3 w-3" />
                                                            ) : (
                                                                <CopyIcon className="h-3 w-3" />
                                                            )}
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
                                    <p className="text-sm text-blue-800">
                                        <strong>Instructions:</strong> Add these DNS records to your domain registrar or DNS provider.
                                        Use the copy buttons to easily copy each value. DNS changes may take up to 24 hours to propagate.
                                    </p>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* SES Verification Complete - Show when all DNS records are verified */}
            {domain.status === DOMAIN_STATUS.VERIFIED && dnsRecords.every(record => record.isVerified) && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <CheckCircleIcon className="h-5 w-5 text-green-600" />
                            SES Verification Complete
                        </CardTitle>
                        <CardDescription>
                            All DNS records have been verified. AWS SES is finalizing domain verification.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Alert className="border-green-200 bg-green-50">
                            <CheckCircleIcon className="h-4 w-4 text-green-600" />
                            <AlertDescription className="text-green-800">
                                <strong>Almost ready!</strong> SES verification is completing automatically. You'll be able to add email addresses shortly.
                            </AlertDescription>
                        </Alert>
                    </CardContent>
                </Card>
            )}

            {/* Email Addresses Section - Only show for SES verified domains */}
            {showEmailSection && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <MailIcon className="h-5 w-5" />
                                    Email Addresses
                                </CardTitle>
                                <CardDescription>
                                    Manage email addresses that can receive emails for this domain
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-4">
                            {/* Add Email Form */}
                            <div className="p-4 border rounded-lg bg-gray-50">
                                <Label htmlFor="new-email">Add New Email Address</Label>
                                <div className="space-y-3 mt-2">
                                    <div className="flex gap-2">
                                        <div className="flex-1 flex items-center border rounded-md bg-white">
                                            <Input
                                                id="new-email"
                                                type="text"
                                                placeholder="user"
                                                value={newEmailAddress}
                                                onChange={(e) => setNewEmailAddress(e.target.value)}
                                                className="border-0 rounded-r-none focus:ring-0 focus:border-0"
                                                disabled={isAddingEmail}
                                            />
                                            <div className="px-3 py-2 bg-gray-50 border-l text-sm text-gray-600 rounded-r-md">
                                                @{domain.domain}
                                            </div>
                                        </div>
                                        <Button
                                            onClick={addEmailAddress}
                                            disabled={isAddingEmail || !newEmailAddress.trim()}
                                        >
                                            {isAddingEmail ? (
                                                <RefreshCwIcon className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <PlusIcon className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </div>
                                    
                                    {/* Webhook Selection */}
                                    <div>
                                        <Label htmlFor="webhook-select" className="text-sm">
                                            Webhook (optional)
                                        </Label>
                                        <Select 
                                            value={selectedWebhookId} 
                                            onValueChange={handleWebhookSelection}
                                            disabled={isAddingEmail || isLoadingWebhooks}
                                        >
                                            <SelectTrigger className="mt-1">
                                                <SelectValue placeholder="No webhook - emails stored only" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">No webhook - emails stored only</SelectItem>
                                                <SelectItem value="create-new" className="text-blue-600 font-medium">
                                                    <div className="flex items-center gap-2">
                                                        <PlusIcon className="h-4 w-4" />
                                                        Create New Webhook
                                                    </div>
                                                </SelectItem>
                                                {userWebhooks.length > 0 && (
                                                    <>
                                                        <div className="px-2 py-1 text-xs font-medium text-muted-foreground border-t">
                                                            Existing Webhooks
                                                        </div>
                                                        {userWebhooks.map((webhook) => (
                                                            <SelectItem key={webhook.id} value={webhook.id}>
                                                                <div className="flex items-center gap-2">
                                                                    <div className={`w-2 h-2 rounded-full ${webhook.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                                                                    {webhook.name}
                                                                </div>
                                                            </SelectItem>
                                                        ))}
                                                    </>
                                                )}
                                            </SelectContent>
                                        </Select>
                                        {selectedWebhookId && selectedWebhookId !== 'none' && (
                                            <p className="text-xs text-muted-foreground mt-1">
                                                Emails received will be sent to this webhook URL
                                            </p>
                                        )}
                                        {userWebhooks.length > 0 && (
                                            <div className="flex items-center gap-1 mt-2">
                                                <ExternalLinkIcon className="h-3 w-3 text-muted-foreground" />
                                                <a 
                                                    href="/webhooks" 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-blue-600 hover:text-blue-700 underline"
                                                >
                                                    Manage all webhooks
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {emailError && (
                                    <p className="text-sm text-red-600 mt-2">{emailError}</p>
                                )}
                            </div>

                            <Separator />
                        </div>

                        {/* Email Addresses Table */}
                        {emailAddresses.length === 0 ? (
                            <div className="text-center py-8">
                                <MailIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                <h3 className="text-lg font-semibold mb-2">No email addresses</h3>
                                <p className="text-muted-foreground">
                                    Add your first email address to start receiving emails.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Email Address</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Webhook</TableHead>
                                            <TableHead>Emails (24h)</TableHead>
                                            <TableHead>Created</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {emailAddresses.map((email) => {
                                            return (
                                                <TableRow key={email.id}>
                                                    <TableCell>
                                                        <div className="font-mono">{email.address}</div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            {email.isReceiptRuleConfigured ? (
                                                                <Badge className="bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200 transition-colors">
                                                                    <CheckCircleIcon className="h-3 w-3 mr-1" />
                                                                    Active
                                                                </Badge>
                                                            ) : (
                                                                <Badge className="bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 transition-colors">
                                                                    <ClockIcon className="h-3 w-3 mr-1" />
                                                                    Pending
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            {email.webhookId && email.webhookName ? (
                                                                <>
                                                                    <LinkIcon className="h-4 w-4 text-blue-600" />
                                                                    <div className="flex items-center gap-1">
                                                                        <div className="w-2 h-2 rounded-full bg-green-500" />
                                                                        <span className="text-sm font-medium">{email.webhookName}</span>
                                                                    </div>
                                                                </>
                                                            ) : (
                                                                <span className="text-sm text-muted-foreground">No webhook</span>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-2">
                                                            <TrendingUpIcon className="h-4 w-4 text-muted-foreground" />
                                                            <span className="font-medium">{email.emailsLast24h}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <span className="text-sm">
                                                            {formatDistanceToNow(new Date(email.createdAt), { addSuffix: true })}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex items-center gap-1 justify-end">
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => openWebhookDialog(email)}
                                                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                            >
                                                                <SettingsIcon className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => deleteEmailAddress(email.id, email.address)}
                                                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                            >
                                                                <TrashIcon className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Webhook Management Dialog */}
            <Dialog open={isWebhookDialogOpen} onOpenChange={setIsWebhookDialogOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Manage Webhook</DialogTitle>
                        <DialogDescription>
                            Configure webhook delivery for {selectedEmailForWebhook?.address}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="webhook-assignment">Webhook Assignment</Label>
                            <Select 
                                value={webhookDialogSelectedId} 
                                onValueChange={handleWebhookDialogSelection}
                                disabled={isUpdatingWebhook || isLoadingWebhooks}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="No webhook - emails stored only" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No webhook - emails stored only</SelectItem>
                                    <SelectItem value="create-new" className="text-blue-600 font-medium">
                                        <div className="flex items-center gap-2">
                                            <PlusIcon className="h-4 w-4" />
                                            Create New Webhook
                                        </div>
                                    </SelectItem>
                                    {userWebhooks.length > 0 && (
                                        <>
                                            <div className="px-2 py-1 text-xs font-medium text-muted-foreground border-t">
                                                Existing Webhooks
                                            </div>
                                            {userWebhooks.map((webhook) => (
                                                <SelectItem key={webhook.id} value={webhook.id}>
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-2 h-2 rounded-full ${webhook.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                                                        <span>{webhook.name}</span>
                                                        {!webhook.isActive && <span className="text-xs text-muted-foreground">(disabled)</span>}
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </>
                                    )}
                                </SelectContent>
                            </Select>
                            {webhookDialogSelectedId && webhookDialogSelectedId !== 'none' && (
                                <p className="text-xs text-muted-foreground">
                                    Emails received at this address will be sent to the selected webhook URL
                                </p>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setIsWebhookDialogOpen(false)
                                setSelectedEmailForWebhook(null)
                                setWebhookDialogSelectedId('none')
                            }}
                            disabled={isUpdatingWebhook}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={updateEmailWebhook}
                            disabled={isUpdatingWebhook}
                        >
                            {isUpdatingWebhook ? (
                                <>
                                    <RefreshCwIcon className="h-4 w-4 mr-2 animate-spin" />
                                    Updating...
                                </>
                            ) : (
                                'Update Webhook'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Create Webhook Dialog */}
            <Dialog open={isCreateWebhookOpen} onOpenChange={setIsCreateWebhookOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Create New Webhook</DialogTitle>
                        <DialogDescription>
                            Enter the details for the new webhook
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="webhook-name">Webhook Name</Label>
                            <Input
                                id="webhook-name"
                                value={createWebhookForm.name}
                                onChange={(e) => setCreateWebhookForm(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="My Email Webhook"
                                disabled={isCreatingWebhook}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="webhook-url">Webhook URL</Label>
                            <Input
                                id="webhook-url"
                                value={createWebhookForm.url}
                                onChange={(e) => setCreateWebhookForm(prev => ({ ...prev, url: e.target.value }))}
                                placeholder="https://api.example.com/webhooks/email"
                                disabled={isCreatingWebhook}
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="webhook-description">Description (optional)</Label>
                            <Textarea
                                id="webhook-description"
                                value={createWebhookForm.description}
                                onChange={(e) => setCreateWebhookForm(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Optional description for this webhook"
                                disabled={isCreatingWebhook}
                                rows={3}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-2">
                                <Label htmlFor="webhook-timeout">Timeout (seconds)</Label>
                                <Input
                                    id="webhook-timeout"
                                    type="number"
                                    min="1"
                                    max="300"
                                    value={createWebhookForm.timeout}
                                    onChange={(e) => setCreateWebhookForm(prev => ({ ...prev, timeout: parseInt(e.target.value) || 30 }))}
                                    disabled={isCreatingWebhook}
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="webhook-retry-attempts">Retry Attempts</Label>
                                <Input
                                    id="webhook-retry-attempts"
                                    type="number"
                                    min="0"
                                    max="10"
                                    value={createWebhookForm.retryAttempts}
                                    onChange={(e) => setCreateWebhookForm(prev => ({ ...prev, retryAttempts: parseInt(e.target.value) || 3 }))}
                                    disabled={isCreatingWebhook}
                                />
                            </div>
                        </div>
                        {createWebhookError && (
                            <div className="flex items-center gap-2 text-red-600 text-sm">
                                <AlertTriangleIcon className="h-4 w-4" />
                                <span>{createWebhookError}</span>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="secondary"
                            onClick={() => {
                                setIsCreateWebhookOpen(false)
                                setCreateWebhookForm({
                                    name: '',
                                    url: '',
                                    description: '',
                                    timeout: 30,
                                    retryAttempts: 3
                                })
                            }}
                            disabled={isCreatingWebhook}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={createWebhook}
                            disabled={isCreatingWebhook}
                        >
                            {isCreatingWebhook ? (
                                <>
                                    <RefreshCwIcon className="h-4 w-4 mr-2 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                'Create Webhook'
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
} 