"use client"

import { useState } from 'react'
import { useSession } from '@/lib/auth-client'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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
} from '@/components/ui/dialog'
import {
    CheckCircleIcon,
    XCircleIcon,
    ClockIcon,
    AlertTriangleIcon,
    ArrowLeftIcon,
    PlusIcon,
    MailIcon,
    TrendingUpIcon,
    RefreshCwIcon,
    CopyIcon,
    TrashIcon,
    SettingsIcon,
    ExternalLinkIcon
} from 'lucide-react'
import { CustomInboundIcon } from '@/components/icons/customInbound'
import { HiCheckCircle, HiGlobeAlt, HiMail, HiPlus, HiRefresh, HiX, HiLightningBolt, HiUserGroup } from 'react-icons/hi'
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
import AddDomainForm from '@/components/add-domain-form'

// React Query hooks
import { 
    useDomainDetailsQuery,
    useCatchAllStatusQuery,
    useDomainVerificationMutation,
    useDomainDeletionMutation,
    useAddEmailAddressMutation,
    useDeleteEmailAddressMutation,
    useUpdateEmailWebhookMutation,
    useEnableCatchAllMutation,
    useDisableCatchAllMutation
} from '@/features/domains/hooks/useDomainDetailsQuery'
import { useEndpointsQuery } from '@/features/endpoints/hooks'

export default function DomainDetailPage() {
    const { data: session } = useSession()
    const params = useParams()
    const router = useRouter()
    const domainId = params.id as string

    // React Query hooks for data fetching
    const {
        data: domainDetailsData,
        isLoading: isDomainLoading,
        error: domainError,
        refetch: refetchDomainDetails
    } = useDomainDetailsQuery(domainId)

    const {
        data: catchAllStatus,
        isLoading: isCatchAllLoading,
        refetch: refetchCatchAllStatus
    } = useCatchAllStatusQuery(domainId)

    const {
        data: userEndpoints = [],
        isLoading: isEndpointsLoading
    } = useEndpointsQuery()

    // React Query mutations
    const domainVerificationMutation = useDomainVerificationMutation()
    const domainDeletionMutation = useDomainDeletionMutation()
    const addEmailMutation = useAddEmailAddressMutation()
    const deleteEmailMutation = useDeleteEmailAddressMutation()
    const updateEmailWebhookMutation = useUpdateEmailWebhookMutation()
    const enableCatchAllMutation = useEnableCatchAllMutation()
    const disableCatchAllMutation = useDisableCatchAllMutation()

    // Local state for UI interactions
    const [newEmailAddress, setNewEmailAddress] = useState('')
    const [selectedEndpointId, setSelectedEndpointId] = useState<string>('none')
    const [emailError, setEmailError] = useState<string | null>(null)

    // Multi-select state for email addresses
    const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set())
    const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false)

    // Domain deletion state
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
    const [deleteConfirmText, setDeleteConfirmText] = useState('')

    // Endpoint management dialog state
    const [isEndpointDialogOpen, setIsEndpointDialogOpen] = useState(false)
    const [selectedEmailForEndpoint, setSelectedEmailForEndpoint] = useState<any>(null)
    const [endpointDialogSelectedId, setEndpointDialogSelectedId] = useState<string>('none')

    // Catch-all state
    const [catchAllEndpointId, setCatchAllEndpointId] = useState<string>('none')

    // Set catch-all endpoint ID when data loads
    useState(() => {
        if (catchAllStatus?.catchAllEndpointId) {
            setCatchAllEndpointId(catchAllStatus.catchAllEndpointId)
        } else if (catchAllStatus?.catchAllWebhookId) {
            setCatchAllEndpointId('legacy-webhook')
        }
    })

    // Multi-select helper functions
    const toggleEmailSelection = (emailId: string) => {
        const newSelected = new Set(selectedEmailIds)
        if (newSelected.has(emailId)) {
            newSelected.delete(emailId)
        } else {
            newSelected.add(emailId)
        }
        setSelectedEmailIds(newSelected)
    }

    const toggleSelectAll = () => {
        if (!domainDetailsData?.emailAddresses) return
        
        if (selectedEmailIds.size === domainDetailsData.emailAddresses.length) {
            setSelectedEmailIds(new Set())
        } else {
            setSelectedEmailIds(new Set(domainDetailsData.emailAddresses.map(email => email.id)))
        }
    }

    const clearSelection = () => {
        setSelectedEmailIds(new Set())
    }

    const refreshVerification = async () => {
        if (!domainDetailsData?.domain) return

        try {
            const result = await domainVerificationMutation.mutateAsync({
                domain: domainDetailsData.domain.domain,
                domainId: domainDetailsData.domain.id
            })

            if (result.allVerified) {
                toast.success('Domain fully verified! You can now manage email addresses.')
            } else if (result.dnsVerified && !result.sesVerified) {
                toast.success('DNS records verified! SES verification in progress.')
            } else if (!result.dnsVerified) {
                toast.warning('DNS records not yet propagated. Please wait and try again.')
            } else {
                toast.info('Verification status updated.')
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to check verification')
        }
    }

    const addEmailAddressHandler = async () => {
        if (!domainDetailsData?.domain || !newEmailAddress.trim()) return

        setEmailError(null)

        try {
            const fullEmailAddress = newEmailAddress.includes('@')
                ? newEmailAddress
                : `${newEmailAddress}@${domainDetailsData.domain.domain}`

            await addEmailMutation.mutateAsync({
                domainId,
                emailAddress: fullEmailAddress,
                endpointId: selectedEndpointId === 'none' ? undefined : selectedEndpointId
            })

            setNewEmailAddress('')
            setSelectedEndpointId('none')
            toast.success('Email address added successfully')
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to add email address'
            setEmailError(errorMessage)
            toast.error(errorMessage)
        }
    }

    const deleteEmailAddressHandler = async (emailAddressId: string, emailAddress: string) => {
        if (!domainDetailsData?.domain) return

        if (!confirm(`Are you sure you want to delete ${emailAddress}?`)) {
            return
        }

        try {
            await deleteEmailMutation.mutateAsync({
                domainId,
                emailAddressId
            })
            toast.success('Email address deleted successfully')
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to delete email address')
        }
    }

    const bulkDeleteEmailAddresses = async () => {
        if (!domainDetailsData?.domain || selectedEmailIds.size === 0) return

        try {
            // Delete all selected emails
            const deletePromises = Array.from(selectedEmailIds).map(emailId => 
                deleteEmailMutation.mutateAsync({
                    domainId,
                    emailAddressId: emailId
                })
            )

            await Promise.all(deletePromises)
            
            toast.success(`Successfully deleted ${selectedEmailIds.size} email address${selectedEmailIds.size > 1 ? 'es' : ''}`)
            setSelectedEmailIds(new Set())
            setIsBulkDeleteDialogOpen(false)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to delete some email addresses')
        }
    }

    const deleteDomainHandler = async () => {
        if (!domainDetailsData?.domain) return

        if (deleteConfirmText !== domainDetailsData.domain.domain) {
            toast.error('Please type the domain name exactly to confirm deletion')
            return
        }

        try {
            await domainDeletionMutation.mutateAsync({
                domain: domainDetailsData.domain.domain,
                domainId: domainDetailsData.domain.id
            })

            toast.success('Domain deleted successfully')
            setIsDeleteDialogOpen(false)
            router.push('/emails')
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to delete domain')
        }
    }

    const updateEmailEndpointHandler = async () => {
        if (!selectedEmailForEndpoint) return

        try {
            await updateEmailWebhookMutation.mutateAsync({
                domainId,
                emailAddressId: selectedEmailForEndpoint.id,
                endpointId: endpointDialogSelectedId === 'none' ? undefined : endpointDialogSelectedId
            })

            toast.success('Endpoint updated successfully')
            setIsEndpointDialogOpen(false)
            setSelectedEmailForEndpoint(null)
            setEndpointDialogSelectedId('none')
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to update endpoint')
        }
    }

    const openEndpointDialog = (email: any) => {
        setSelectedEmailForEndpoint(email)
        // Prioritize endpointId over webhookId (for migrated webhooks)
        setEndpointDialogSelectedId(email.endpointId || email.webhookId || 'none')
        setIsEndpointDialogOpen(true)
    }

    const handleEndpointSelection = (value: string) => {
        if (value === 'create-new') {
            router.push('/endpoints')
        } else {
            setSelectedEndpointId(value)
        }
    }

    const handleEndpointDialogSelection = (value: string) => {
        if (value === 'create-new') {
            router.push('/endpoints')
        } else {
            setEndpointDialogSelectedId(value)
        }
    }

    const handleCatchAllEndpointSelection = (value: string) => {
        if (value === 'create-new') {
            router.push('/endpoints')
        } else {
            setCatchAllEndpointId(value)
        }
    }

    const toggleCatchAll = async () => {
        if (!catchAllStatus) return

        try {
            if (catchAllStatus.isCatchAllEnabled) {
                await disableCatchAllMutation.mutateAsync({ domainId })
                toast.success('Catch-all disabled successfully')
            } else {
                if (catchAllEndpointId === 'none') {
                    toast.error('Please select an endpoint for catch-all emails')
                    return
                }

                // Check if it's a legacy webhook or an endpoint
                if (catchAllEndpointId === 'legacy-webhook') {
                    await enableCatchAllMutation.mutateAsync({ 
                        domainId, 
                        webhookId: catchAllStatus.catchAllWebhookId || ''
                    })
                } else {
                    await enableCatchAllMutation.mutateAsync({ 
                        domainId, 
                        endpointId: catchAllEndpointId
                    })
                }
                toast.success('Catch-all enabled successfully')
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to toggle catch-all')
        }
    }

    // Loading state
    if (isDomainLoading) {
        return (
            <div className="flex flex-1 flex-col gap-6 p-6">
                <div className="flex items-center gap-4">
                    <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                </div>
                <div className="h-32 bg-muted animate-pulse rounded-lg" />
                <div className="h-64 bg-muted animate-pulse rounded-lg" />
            </div>
        )
    }

    // Error state
    if (domainError || !domainDetailsData?.domain) {
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
                            <span>{domainError instanceof Error ? domainError.message : 'Domain not found'}</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => refetchDomainDetails()}
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

    const { domain, dnsRecords = [], emailAddresses = [], stats = { totalEmailAddresses: 0, activeEmailAddresses: 0, configuredEmailAddresses: 0, totalEmailsLast24h: 0 } } = domainDetailsData

    // Helper functions for endpoint icons and colors
    const getEndpointIcon = (endpoint: any) => {
        switch (endpoint?.type) {
            case 'webhook':
                return HiLightningBolt
            case 'email':
                return HiMail
            case 'email_group':
                return HiUserGroup
            default:
                return HiMail
        }
    }

    const getEndpointIconColor = (endpoint: any) => {
        if (!endpoint?.isActive) return '#64748b'
        
        switch (endpoint?.type) {
            case 'webhook':
                return '#8b5cf6'
            case 'email':
                return '#3b82f6'
            case 'email_group':
                return '#10b981'
            default:
                return '#6b7280'
        }
    }

    // Determine what to show based on domain status
    const showEmailSection = domain.status === DOMAIN_STATUS.VERIFIED

    // Get selected emails for display
    const selectedEmails = emailAddresses.filter(email => selectedEmailIds.has(email.id))

    return (
        <div className="h-full bg-gradient-to-br from-slate-50 to-gray-100/50 p-4 font-outfit">
            <div className="max-w-4xl mx-auto space-y-4">
                {/* Back Button */}
                <div className="flex items-center">
                    <Link href="/emails" className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
                        <ArrowLeftIcon className="h-4 w-4" />
                        Back to Domains
                    </Link>
                </div>

                {/* Header */}
                <div className="flex items-center justify-between bg-slate-900 text-white rounded-lg p-4">
                    <div className="flex items-center gap-4">
                        <CustomInboundIcon 
                            Icon={HiGlobeAlt} 
                            size={40} 
                            backgroundColor="#3b82f6" 
                        />
                        <div>
                            <h1 className="text-xl font-semibold mb-1">{domain.domain}</h1>
                            <div className="text-sm text-slate-300">
                                {domain.status === DOMAIN_STATUS.PENDING && "Add DNS records to complete verification"}
                                {domain.status === DOMAIN_STATUS.VERIFIED && "Domain verified - manage email addresses below"}
                                {domain.status === DOMAIN_STATUS.FAILED && "Domain verification failed - please check your DNS records"}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {domain.status === DOMAIN_STATUS.VERIFIED ? (
                            <Badge className="bg-emerald-500 text-white rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm pointer-events-none">
                                <HiCheckCircle className="w-3 h-3 mr-1" />
                                Verified
                            </Badge>
                        ) : domain.status === DOMAIN_STATUS.PENDING ? (
                            <Badge className="bg-amber-500 text-white rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm pointer-events-none">
                                <ClockIcon className="w-3 h-3 mr-1" />
                                Pending
                            </Badge>
                        ) : (
                            <Badge className="bg-red-500 text-white rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm pointer-events-none">
                                <HiX className="w-3 h-3 mr-1" />
                                Failed
                            </Badge>
                        )}
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={refreshVerification}
                            className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                        >
                            <HiRefresh className="h-3 w-3 mr-1" />
                            Refresh
                        </Button>
                        
                        {/* Delete Domain Button */}
                        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setIsDeleteDialogOpen(true)}
                            >
                                <TrashIcon className="h-4 w-4 mr-2" />
                                Delete
                            </Button>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Delete Domain</DialogTitle>
                                    <DialogDescription>
                                        This action cannot be undone. This will permanently delete the domain "{domain.domain}" 
                                        and all associated email addresses and data.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4">
                                    <div>
                                        <Label htmlFor="delete-confirm">
                                            Type <strong>{domain.domain}</strong> to confirm deletion:
                                        </Label>
                                        <Input
                                            id="delete-confirm"
                                            value={deleteConfirmText}
                                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                                            placeholder={domain.domain}
                                            className="mt-2"
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
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        onClick={deleteDomainHandler}
                                        disabled={deleteConfirmText !== domain.domain}
                                    >
                                        Delete Domain
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {/* Show AddDomainForm for pending domains */}
                {domain.status === DOMAIN_STATUS.PENDING && (
                    <AddDomainForm
                        preloadedDomain={domain.domain}
                        preloadedDomainId={domain.id}
                        preloadedDnsRecords={dnsRecords.map(record => ({
                            name: record.name,
                            type: record.type as "TXT" | "MX",
                            value: record.value,
                            isVerified: record.isVerified
                        }))}
                        preloadedStep={1}
                        preloadedProvider={domain.domainProvider}
                        overrideRefreshFunction={refreshVerification}
                        onSuccess={(domainId) => {
                            refetchDomainDetails()
                        }}
                    />
                )}

                {/* Email Management Section - Only show for verified domains */}
                {showEmailSection && (
                    <Card className="bg-white/95 backdrop-blur-sm shadow-sm border border-gray-200/60 rounded-xl">
                        <CardHeader className="pb-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2 text-gray-900 text-lg">
                                        Email Management
                                    </CardTitle>
                                    <CardDescription className="text-gray-600">
                                        {catchAllStatus?.isCatchAllEnabled 
                                            ? `Catch-all enabled - all emails to @${domain.domain} are captured`
                                            : `Manage individual email addresses for @${domain.domain}`
                                        }
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <MailIcon className="h-4 w-4" />
                                    {stats.totalEmailAddresses} addresses
                                    <span className="text-gray-400">•</span>
                                    <TrendingUpIcon className="h-4 w-4" />
                                    {stats.totalEmailsLast24h} emails (24h)
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Individual email addresses - only show if catch-all is disabled */}
                            {!catchAllStatus?.isCatchAllEnabled && (
                                <div className="space-y-4">
                                    {/* Add Email Form */}
                                    <div className="flex flex-col sm:flex-row gap-3 w-full">
                                        <div className="w-full sm:flex-1">
                                            <div className="flex items-center border rounded-md bg-white h-10 w-full">
                                                <Input
                                                    type="text"
                                                    placeholder="username"
                                                    value={newEmailAddress}
                                                    onChange={(e) => setNewEmailAddress(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' && newEmailAddress.trim()) {
                                                            addEmailAddressHandler()
                                                        }
                                                    }}
                                                    className="border-0 rounded-r-none focus:ring-0 flex-1 h-full"
                                                />
                                                <div className="px-3 bg-gray-50 border-l text-sm text-gray-600 rounded-r-md flex items-center h-full whitespace-nowrap">
                                                    @{domain.domain}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 w-full sm:flex-1">
                                            <Select 
                                                value={selectedEndpointId} 
                                                onValueChange={handleEndpointSelection}
                                                disabled={isEndpointsLoading}
                                            >
                                                <SelectTrigger className="flex-1 h-10 min-w-0">
                                                    <SelectValue placeholder="Endpoint (optional)" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">Store in Inbound</SelectItem>
                                                    <SelectItem value="create-new" className="text-blue-600 font-medium">
                                                        <div className="flex items-center gap-2">
                                                            <PlusIcon className="h-4 w-4" />
                                                            Create Endpoint
                                                        </div>
                                                    </SelectItem>
                                                    {userEndpoints.length > 0 && (
                                                        <>
                                                            <div className="px-2 py-1 text-xs font-medium text-muted-foreground border-t">
                                                                Endpoints
                                                            </div>
                                                            {userEndpoints.map((endpoint) => (
                                                                <SelectItem key={endpoint.id} value={endpoint.id}>
                                                                    <div className="flex items-center gap-2">
                                                                        <CustomInboundIcon 
                                                                            Icon={getEndpointIcon(endpoint)} 
                                                                            size={16} 
                                                                            backgroundColor={getEndpointIconColor(endpoint)} 
                                                                        />
                                                                        {endpoint.name} ({endpoint.type})
                                                                    </div>
                                                                </SelectItem>
                                                            ))}
                                                        </>
                                                    )}
                                                </SelectContent>
                                            </Select>
                                            <Button
                                                onClick={addEmailAddressHandler}
                                                disabled={!newEmailAddress.trim()}
                                                className="shrink-0 h-10 w-10"
                                            >
                                                <PlusIcon className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    {emailError && (
                                        <p className="text-sm text-red-600">{emailError}</p>
                                    )}

                                    <Separator />

                                    {/* Email Addresses List */}
                                    {emailAddresses.length === 0 ? (
                                        <div className="text-center py-8">
                                            <MailIcon className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                                            <p className="text-muted-foreground">No email addresses configured</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {/* Select All Checkbox with Bulk Actions */}
                                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                                                <div className="flex items-center gap-3">
                                                    <Checkbox
                                                        checked={emailAddresses.length > 0 && selectedEmailIds.size === emailAddresses.length}
                                                        onCheckedChange={toggleSelectAll}
                                                        className="h-4 w-4"
                                                    />
                                                    <span className="text-sm font-medium text-gray-700">
                                                        Select all ({emailAddresses.length})
                                                        {selectedEmailIds.size > 0 && (
                                                            <span className="text-blue-600 ml-2">
                                                                • {selectedEmailIds.size} selected
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {selectedEmailIds.size > 0 && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={clearSelection}
                                                            className="text-gray-600 hover:text-gray-800 h-8 px-3"
                                                        >
                                                            Clear
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="destructive"
                                                        size="sm"
                                                        onClick={() => setIsBulkDeleteDialogOpen(true)}
                                                        disabled={selectedEmailIds.size === 0}
                                                        className="h-8"
                                                    >
                                                        <TrashIcon className="h-4 w-4 mr-2" />
                                                        Delete Selected
                                                    </Button>
                                                </div>
                                            </div>

                                            {emailAddresses.map((email) => (
                                                <div 
                                                    key={email.id} 
                                                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                                                        selectedEmailIds.has(email.id) 
                                                            ? 'bg-blue-50 border-blue-200' 
                                                            : 'bg-gray-50 border-gray-200'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <Checkbox
                                                            checked={selectedEmailIds.has(email.id)}
                                                            onCheckedChange={() => toggleEmailSelection(email.id)}
                                                            className="h-4 w-4"
                                                        />
                                                        <div className="font-mono text-sm">{email.address}</div>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(email.address)
                                                                toast.success('Copied to clipboard')
                                                            }}
                                                            className="h-6 w-6 p-0"
                                                        >
                                                            <CopyIcon className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className="text-sm text-gray-600">
                                                            {(() => {
                                                                // Find the configured endpoint
                                                                const configuredEndpoint = email.endpointId 
                                                                    ? userEndpoints.find(endpoint => endpoint.id === email.endpointId)
                                                                    : null

                                                                if (configuredEndpoint) {
                                                                    const EndpointIcon = getEndpointIcon(configuredEndpoint)
                                                                    return (
                                                                        <div className="flex items-center gap-1.5">
                                                                            <CustomInboundIcon 
                                                                                Icon={EndpointIcon} 
                                                                                size={25} 
                                                                                backgroundColor={getEndpointIconColor(configuredEndpoint)} 
                                                                            />
                                                                            <span className={`font-medium ${getEndpointIconColor(configuredEndpoint)}`}>
                                                                                {configuredEndpoint.name}
                                                                            </span>
                                                                        </div>
                                                                    )
                                                                } else if (email.webhookId) {
                                                                    // Legacy webhook configuration
                                                                    return (
                                                                        <div className="flex items-center gap-1.5">
                                                                            <CustomInboundIcon 
                                                                                Icon={HiLightningBolt} 
                                                                                size={14} 
                                                                                backgroundColor="#8b5cf6" 
                                                                            />
                                                                            <span className="text-amber-600 font-medium">
                                                                                Legacy Webhook
                                                                            </span>
                                                                        </div>
                                                                    )
                                                                } else {
                                                                    return <span className="text-gray-500">Store in Inbound</span>
                                                                }
                                                            })()}
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            {email.emailsLast24h} emails
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => openEndpointDialog(email)}
                                                            className="h-8 w-8 p-0"
                                                        >
                                                            <SettingsIcon className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => deleteEmailAddressHandler(email.id, email.address)}
                                                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                                        >
                                                            <TrashIcon className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Link to manage endpoints */}
                                    <div className="flex items-center justify-center pt-2">
                                        <Link 
                                            href="/endpoints" 
                                            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                                        >
                                            <ExternalLinkIcon className="h-3 w-3" />
                                            Manage all endpoints
                                        </Link>
                                    </div>
                                </div>
                            )}

                            {/* Catch-all toggle and configuration - moved below individual emails */}
                            {catchAllStatus && (
                                <>
                                    {!catchAllStatus.isCatchAllEnabled && <Separator />}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="font-medium text-gray-900">Catch-all Configuration</div>
                                                <div className="text-sm text-gray-600">
                                                    {catchAllStatus.isCatchAllEnabled 
                                                        ? 'All emails to any address are captured'
                                                        : 'Capture emails to any address on this domain'
                                                    }
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-col sm:flex-row gap-3">
                                            {!catchAllStatus.isCatchAllEnabled && (
                                                <div className="flex-1">
                                                    <Select 
                                                        value={catchAllEndpointId} 
                                                        onValueChange={handleCatchAllEndpointSelection}
                                                        disabled={isEndpointsLoading}
                                                    >
                                                        <SelectTrigger className="w-full h-10">
                                                            <SelectValue placeholder="Select endpoint" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="none">Store in Inbound</SelectItem>
                                                            <SelectItem value="create-new" className="text-blue-600 font-medium">
                                                                <div className="flex items-center gap-2">
                                                                    <PlusIcon className="h-4 w-4" />
                                                                    Create Endpoint
                                                                </div>
                                                            </SelectItem>
                                                            {userEndpoints.length > 0 && (
                                                                <>
                                                                    <div className="px-2 py-1 text-xs font-medium text-muted-foreground border-t">
                                                                        Endpoints
                                                                    </div>
                                                                    {userEndpoints.map((endpoint) => (
                                                                        <SelectItem key={endpoint.id} value={endpoint.id}>
                                                                            <div className="flex items-center gap-2">
                                                                                <CustomInboundIcon 
                                                                                    Icon={getEndpointIcon(endpoint)} 
                                                                                    size={16} 
                                                                                    backgroundColor={getEndpointIconColor(endpoint)} 
                                                                                />
                                                                                {endpoint.name} ({endpoint.type})
                                                                            </div>
                                                                        </SelectItem>
                                                                    ))}
                                                                </>
                                                            )}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            )}
                                            <div className={catchAllStatus.isCatchAllEnabled ? "w-full" : "w-full sm:w-auto sm:min-w-[140px]"}>
                                                <Button
                                                    variant={catchAllStatus.isCatchAllEnabled ? "destructive" : "secondary"}
                                                    className="h-10 w-full"
                                                    onClick={toggleCatchAll}
                                                    disabled={!catchAllStatus.isCatchAllEnabled && catchAllEndpointId === 'none'}
                                                >
                                                    {catchAllStatus.isCatchAllEnabled ? 'Disable Catch-all' : 'Enable Catch-all'}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                )}

                {/* Endpoint Management Dialog */}
                <Dialog open={isEndpointDialogOpen} onOpenChange={setIsEndpointDialogOpen}>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Configure Endpoint</DialogTitle>
                            <DialogDescription>
                                Configure endpoint for {selectedEmailForEndpoint?.address}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="endpoint-assignment">Endpoint Assignment</Label>
                                <Select 
                                    value={endpointDialogSelectedId} 
                                    onValueChange={handleEndpointDialogSelection}
                                    disabled={isEndpointsLoading}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Store in Inbound" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Store in Inbound</SelectItem>
                                        <SelectItem value="create-new" className="text-blue-600 font-medium">
                                            <div className="flex items-center gap-2">
                                                <PlusIcon className="h-4 w-4" />
                                                Create New Endpoint
                                            </div>
                                        </SelectItem>
                                        {userEndpoints.length > 0 && (
                                            <>
                                                <div className="px-2 py-1 text-xs font-medium text-muted-foreground border-t">
                                                    Existing Endpoints
                                                </div>
                                                {userEndpoints.map((endpoint) => (
                                                    <SelectItem key={endpoint.id} value={endpoint.id}>
                                                        <div className="flex items-center gap-2">
                                                            <CustomInboundIcon 
                                                                Icon={getEndpointIcon(endpoint)} 
                                                                size={16} 
                                                                backgroundColor={getEndpointIconColor(endpoint)} 
                                                            />
                                                            <span>{endpoint.name} ({endpoint.type})</span>
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                variant="secondary"
                                onClick={() => {
                                    setIsEndpointDialogOpen(false)
                                    setSelectedEmailForEndpoint(null)
                                    setEndpointDialogSelectedId('none')
                                }}
                            >
                                Cancel
                            </Button>
                            <Button onClick={updateEmailEndpointHandler}>
                                Update Endpoint
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Bulk Delete Confirmation Dialog */}
                <Dialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Delete Email Addresses</DialogTitle>
                            <DialogDescription>
                                Are you sure you want to delete {selectedEmailIds.size} email address{selectedEmailIds.size > 1 ? 'es' : ''}? 
                                This action cannot be undone.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="py-4">
                            <div className="space-y-2">
                                <p className="text-sm font-medium text-gray-900">Email addresses to be deleted:</p>
                                <div className="max-h-32 overflow-y-auto space-y-1">
                                    {selectedEmails.map((email) => (
                                        <div key={email.id} className="text-sm text-gray-600 font-mono bg-gray-50 px-2 py-1 rounded">
                                            {email.address}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                variant="secondary"
                                onClick={() => setIsBulkDeleteDialogOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="destructive"
                                onClick={bulkDeleteEmailAddresses}
                                disabled={deleteEmailMutation.isPending}
                            >
                                {deleteEmailMutation.isPending ? 'Deleting...' : `Delete ${selectedEmailIds.size} Address${selectedEmailIds.size > 1 ? 'es' : ''}`}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    )
} 