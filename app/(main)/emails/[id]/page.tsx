"use client"

import { useState } from 'react'
import { useSession } from '@/lib/auth/auth-client'
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
import Clock2 from "@/components/icons/clock-2"
import CircleWarning2 from "@/components/icons/circle-warning-2"
import ArrowBoldLeft from "@/components/icons/arrow-bold-left"
import ChartTrendUp from "@/components/icons/chart-trend-up"
import Clipboard2 from "@/components/icons/clipboard-2"
import Trash2 from "@/components/icons/trash-2"
import Gear2 from "@/components/icons/gear-2"
import ExternalLink2 from "@/components/icons/external-link-2"
import { CustomInboundIcon } from '@/components/icons/customInbound'
import CircleCheck from '@/components/icons/circle-check'
import Globe2 from '@/components/icons/globe-2'
import Envelope2 from '@/components/icons/envelope-2'
import CirclePlus from '@/components/icons/circle-plus'
import Refresh2 from '@/components/icons/refresh-2'
import ObjRemove from '@/components/icons/obj-remove'
import BoltLightning from '@/components/icons/bolt-lightning'
import UserGroup from '@/components/icons/user-group'
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

// React Query hooks for v2 API
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEndpointsQuery } from '@/features/endpoints/hooks'
import {
    useDomainDetailsV2Query,
    useDomainVerificationCheckV2,
    useDeleteDomainV2Mutation,
    useAddEmailAddressV2Mutation,
    useDeleteEmailAddressV2Mutation,
    useUpdateEmailEndpointV2Mutation,
    useUpdateDomainCatchAllV2Mutation,
    domainV2Keys
} from '@/features/domains/hooks/useDomainV2Hooks'

// v2 API types
import type { 
    GetDomainByIdResponse,
    PutDomainByIdRequest
} from '@/app/api/v2/domains/[id]/route'
import type {
    GetEmailAddressesResponse,
    EmailAddressWithDomain
} from '@/app/api/v2/email-addresses/route'

export default function DomainDetailPage() {
    const { data: session } = useSession()
    const params = useParams()
    const router = useRouter()
    const domainId = params.id as string
    const queryClient = useQueryClient()

    // React Query hooks for data fetching
    const {
        data: domainDetailsData,
        isLoading: isDomainLoading,
        error: domainError,
        refetch: refetchDomainDetails
    } = useDomainDetailsV2Query(domainId)

    // Get email addresses for this domain
    const {
        data: emailAddressesData,
        isLoading: isEmailAddressesLoading,
        refetch: refetchEmailAddresses
    } = useQuery<GetEmailAddressesResponse>({
        queryKey: [...domainV2Keys.emailAddresses(domainId)],
        queryFn: async () => {
            const response = await fetch(`/api/v2/email-addresses?domainId=${domainId}`)
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to fetch email addresses')
            }
            return response.json()
        },
        enabled: !!domainId && domainDetailsData?.status === 'verified',
        staleTime: 2 * 60 * 1000, // 2 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes
    })

    // Get DNS records for pending domains
    const {
        data: dnsRecordsData,
        isLoading: isDnsRecordsLoading
    } = useQuery<{ records: Array<{ recordType: string; name: string; value: string; isVerified: boolean }> }>({
        queryKey: ['dnsRecords', domainId],
        queryFn: async () => {
            const response = await fetch(`/api/v2/domains/${domainId}/dns-records`)
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to fetch DNS records')
            }
            return response.json()
        },
        enabled: !!domainId && domainDetailsData?.status === 'pending',
        staleTime: 2 * 60 * 1000, // 2 minutes
        gcTime: 10 * 60 * 1000, // 10 minutes
    })

    const {
        data: userEndpoints = [],
        isLoading: isEndpointsLoading
    } = useEndpointsQuery()

    // React Query mutations
    const domainVerificationMutation = useDomainVerificationCheckV2(domainId)
    const domainDeletionMutation = useDeleteDomainV2Mutation()
    const addEmailMutation = useAddEmailAddressV2Mutation()
    const deleteEmailMutation = useDeleteEmailAddressV2Mutation()
    const updateEmailWebhookMutation = useUpdateEmailEndpointV2Mutation()
    const updateCatchAllMutation = useUpdateDomainCatchAllV2Mutation()

    // Local state for UI interactions
    const [newEmailAddress, setNewEmailAddress] = useState('')
    const [selectedEndpointId, setSelectedEndpointId] = useState<string>('none')
    const [emailError, setEmailError] = useState<string | null>(null)
    const [isRefreshingVerification, setIsRefreshingVerification] = useState(false)

    // Multi-select state for email addresses
    const [selectedEmailIds, setSelectedEmailIds] = useState<Set<string>>(new Set())
    const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false)

    // Domain deletion state
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
    const [deleteConfirmText, setDeleteConfirmText] = useState('')

    // Endpoint management dialog state
    const [isEndpointDialogOpen, setIsEndpointDialogOpen] = useState(false)
    const [selectedEmailForEndpoint, setSelectedEmailForEndpoint] = useState<EmailAddressWithDomain | null>(null)
    const [endpointDialogSelectedId, setEndpointDialogSelectedId] = useState<string>('none')

    // Catch-all state
    const [catchAllEndpointId, setCatchAllEndpointId] = useState<string>('none')

    // Set catch-all endpoint ID when data loads
    useState(() => {
        if (domainDetailsData?.catchAllEndpointId) {
            setCatchAllEndpointId(domainDetailsData.catchAllEndpointId)
        }
    })

    // Get email addresses from the query result
    const emailAddresses = emailAddressesData?.data || []

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
        if (emailAddresses.length === 0) return

        if (selectedEmailIds.size === emailAddresses.length) {
            setSelectedEmailIds(new Set())
        } else {
            setSelectedEmailIds(new Set(emailAddresses.map(email => email.id)))
        }
    }

    const clearSelection = () => {
        setSelectedEmailIds(new Set())
    }

    const refreshVerification = async () => {
        console.log('🔄 Forcing domain verification check...')
        setIsRefreshingVerification(true)
        try {
            // Use check=true to force a fresh verification check
            const response = await fetch(`/api/v2/domains/${domainId}?check=true`)
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to check domain verification')
            }
            
            const updatedDomain = await response.json()
            
            // Manually update the query cache with the fresh data
            queryClient.setQueryData(domainV2Keys.detail(domainId), updatedDomain)
            
            // Check if status changed from pending to verified
            if (domainDetailsData?.status === 'pending' && updatedDomain.status === 'verified') {
                toast.success('Domain verified successfully!')
                // Refetch email addresses since domain is now verified
                await refetchEmailAddresses()
            } else if (updatedDomain.status === 'verified') {
                toast.success('Domain is already verified')
            } else if (updatedDomain.status === 'failed') {
                toast.error('Domain verification failed. Please check your DNS records.')
            } else {
                // Still pending - check if we have verification details
                if (updatedDomain.verificationCheck) {
                    const { dnsRecords, sesStatus } = updatedDomain.verificationCheck
                    const unverifiedRecords = dnsRecords?.filter((r: any) => !r.isVerified) || []
                    
                    if (unverifiedRecords.length > 0) {
                        // Check for specific MX record issues
                        const mxRecord = unverifiedRecords.find((r: any) => r.type === 'MX')
                        if (mxRecord && mxRecord.error) {
                            // Check if the MX record has the domain appended
                            const expectedMx = mxRecord.value
                            const actualValues = mxRecord.error.match(/but found: \[(.*?)\]/)?.[1]
                            
                            if (actualValues && actualValues.includes(`.${domainDetailsData?.domain || ''}`)) {
                                toast.error(
                                    `MX record issue: Remove ".${domainDetailsData?.domain || ''}" from the end of your MX record value. It should be just "${expectedMx.split(' ')[1]}"`,
                                    { duration: 8000 }
                                )
                            } else {
                                toast.warning(`${unverifiedRecords.length} DNS record(s) still pending verification`)
                            }
                        } else {
                            // List which records are not verified
                            const recordTypes = unverifiedRecords.map((r: any) => r.type).join(', ')
                            toast.warning(`DNS records not verified: ${recordTypes}`)
                        }
                    } else if (sesStatus !== 'Success') {
                        toast.info(`DNS records verified. AWS SES status: ${sesStatus}`)
                    } else {
                        toast.info('Verification in progress...')
                    }
                } else {
                    toast.info('Verification status refreshed')
                }
            }
        } catch (err) {
            console.error('Error refreshing verification:', err)
            toast.error('Failed to refresh verification status')
        } finally {
            setIsRefreshingVerification(false)
        }
    }

    const addEmailAddressHandler = async () => {
        if (!domainDetailsData || !newEmailAddress.trim()) return

        setEmailError(null)

        try {
            const fullEmailAddress = newEmailAddress.includes('@')
                ? newEmailAddress
                : `${newEmailAddress}@${domainDetailsData.domain}`

            await addEmailMutation.mutateAsync({
                address: fullEmailAddress,
                domainId: domainId,
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
        if (!domainDetailsData) return

        if (!confirm(`Are you sure you want to delete ${emailAddress}?`)) {
            return
        }

        try {
            await deleteEmailMutation.mutateAsync({ emailAddressId, domainId })
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to delete email address')
        }
    }

    const bulkDeleteEmailAddresses = async () => {
        if (!domainDetailsData || selectedEmailIds.size === 0) return

        try {
            // Delete all selected emails
            const deletePromises = Array.from(selectedEmailIds).map(emailId =>
                deleteEmailMutation.mutateAsync({ emailAddressId: emailId, domainId })
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
        if (!domainDetailsData) return

        if (deleteConfirmText !== domainDetailsData.domain) {
            toast.error('Please type the domain name exactly to confirm deletion')
            return
        }

        try {
            await domainDeletionMutation.mutateAsync(domainId)

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
                emailAddressId: selectedEmailForEndpoint.id,
                endpointId: endpointDialogSelectedId === 'none' ? null : endpointDialogSelectedId,
                domainId: domainId
            })

            toast.success('Endpoint updated successfully')
            setIsEndpointDialogOpen(false)
            setSelectedEmailForEndpoint(null)
            setEndpointDialogSelectedId('none')
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to update endpoint')
        }
    }

    const openEndpointDialog = (email: EmailAddressWithDomain) => {
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
        if (!domainDetailsData) return

        try {
            if (domainDetailsData.isCatchAllEnabled) {
                await updateCatchAllMutation.mutateAsync({ 
                    domainId,
                    isCatchAllEnabled: false,
                    catchAllEndpointId: null
                })
                toast.success('Catch-all disabled successfully')
            } else {
                if (catchAllEndpointId === 'none') {
                    toast.error('Please select an endpoint for catch-all emails')
                    return
                }

                await updateCatchAllMutation.mutateAsync({
                    domainId,
                    isCatchAllEnabled: true,
                    catchAllEndpointId: catchAllEndpointId
                })
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
    if (domainError || !domainDetailsData) {
        return (
            <div className="flex flex-1 flex-col gap-6 p-6">
                <div className="flex items-center gap-4">
                    <Link href="/emails">
                        <Button variant="ghost" size="sm">
                            <ArrowBoldLeft width="16" height="16" className="mr-2" />
                            Back to Domains
                        </Button>
                    </Link>
                </div>
                <Card className="border-destructive/50 bg-destructive/10">
                    <CardContent className="pt-6">
                        <div className="flex items-center gap-2 text-destructive">
                            <ObjRemove width="16" height="16" />
                            <span>{domainError instanceof Error ? domainError.message : 'Domain not found'}</span>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => refetchDomainDetails()}
                                className="ml-auto text-destructive hover:text-destructive"
                            >
                                Try Again
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        )
    }

    const { domain, status, stats = { totalEmailAddresses: 0, activeEmailAddresses: 0, emailsLast24h: 0, emailsLast7d: 0, emailsLast30d: 0 } } = domainDetailsData

    // Helper functions for endpoint icons and colors
    const getEndpointIcon = (endpoint: any) => {
        switch (endpoint?.type) {
            case 'webhook':
                return BoltLightning
            case 'email':
                return Envelope2
            case 'email_group':
                return UserGroup
            default:
                return Envelope2
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
    const showEmailSection = status === DOMAIN_STATUS.VERIFIED

    // Get selected emails for display
    const selectedEmails = emailAddresses.filter(email => selectedEmailIds.has(email.id))

    return (
        <div className="h-full p-4 font-outfit">
            <div className="max-w-4xl mx-auto space-y-4">
                {/* Back Button */}
                <div className="flex items-center">
                    <Link href="/emails" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                        <ArrowBoldLeft width="16" height="16" />
                        Back to Domains
                    </Link>
                </div>

                {/* Header */}
                <div className="flex items-center justify-between bg-card text-card-foreground rounded-lg p-4 border border-border">
                    <div className="flex items-center gap-4">
                        <CustomInboundIcon
                            Icon={Globe2}
                            size={40}
                            backgroundColor="#3b82f6"
                        />
                        <div>
                            <h1 className="text-xl font-semibold mb-1">{domain}</h1>
                            <div className="text-sm text-muted-foreground">
                                {status === DOMAIN_STATUS.PENDING && "Add DNS records to complete verification"}
                                {status === DOMAIN_STATUS.VERIFIED && "Domain verified - manage email addresses below"}
                                {status === DOMAIN_STATUS.FAILED && "Domain verification failed - please check your DNS records"}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {status === DOMAIN_STATUS.VERIFIED ? (
                            <Badge className="bg-emerald-500 text-white rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm pointer-events-none">
                                <CircleCheck width="12" height="12" className="mr-1" />
                                Verified
                            </Badge>
                        ) : status === DOMAIN_STATUS.PENDING ? (
                            <Badge className="bg-amber-500 text-white rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm pointer-events-none">
                                <Clock2 width="12" height="12" className="mr-1" />
                                Pending
                            </Badge>
                        ) : (
                            <Badge className="bg-red-500 text-white rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm pointer-events-none">
                                <ObjRemove width="12" height="12" className="mr-1" />
                                Failed
                            </Badge>
                        )}
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            onClick={refreshVerification}
                            disabled={isRefreshingVerification}
                            className="flex items-center gap-2"
                        >
                            <Refresh2 
                                width="16" 
                                height="16" 
                                className={isRefreshingVerification ? "animate-spin" : ""} 
                            />
                            {isRefreshingVerification ? 'Checking...' : 'Refresh'}
                        </Button>

                        {/* Delete Domain Button */}
                        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setIsDeleteDialogOpen(true)}
                            >
                                <Trash2 width="16" height="16" className="mr-2" />
                                Delete
                            </Button>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>Delete Domain</DialogTitle>
                                    <DialogDescription>
                                        This action cannot be undone. This will permanently delete the domain "{domain}"
                                        and all associated email addresses and data.
                                    </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4">
                                    <div>
                                        <Label htmlFor="delete-confirm">
                                            Type <strong>{domain}</strong> to confirm deletion:
                                        </Label>
                                        <Input
                                            id="delete-confirm"
                                            value={deleteConfirmText}
                                            onChange={(e) => setDeleteConfirmText(e.target.value)}
                                            placeholder={domain}
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
                                        disabled={deleteConfirmText !== domain}
                                    >
                                        Delete Domain
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {/* Show AddDomainForm for pending domains */}
                {status === DOMAIN_STATUS.PENDING && (
                    <AddDomainForm
                        preloadedDomain={domain}
                        preloadedDomainId={domainDetailsData.id}
                        preloadedDnsRecords={dnsRecordsData?.records?.map(record => ({
                            type: record.recordType as "TXT" | "MX",
                            name: record.name,
                            value: record.value,
                            isVerified: record.isVerified
                        })) || []}
                        preloadedStep={1}
                        preloadedProvider={domainDetailsData.domainProvider || undefined}
                        overrideRefreshFunction={refreshVerification}
                        onSuccess={(domainId) => {
                            refetchDomainDetails()
                        }}
                    />
                )}

                {/* Email Management Section - Only show for verified domains */}
                {showEmailSection && (
                    <Card className="bg-card border-border rounded-xl">
                        <CardHeader className="pb-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2 text-foreground text-lg">
                                        Email Management
                                    </CardTitle>
                                    <CardDescription className="text-muted-foreground">
                                        {domainDetailsData?.isCatchAllEnabled
                                            ? `Catch-all enabled - all emails to @${domain} are captured`
                                            : `Manage individual email addresses for @${domain}`
                                        }
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Envelope2 width="16" height="16" />
                                    {stats.totalEmailAddresses} addresses
                                    <span className="text-muted-foreground/60">•</span>
                                    <ChartTrendUp width="16" height="16" />
                                    {stats.emailsLast24h} emails (24h)
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Individual email addresses - only show if catch-all is disabled */}
                            {!domainDetailsData?.isCatchAllEnabled && (
                                <div className="space-y-4">
                                    {/* Add Email Form */}
                                    <div className="flex flex-col sm:flex-row gap-3 w-full">
                                        <div className="w-full sm:flex-1">
                                            <div className="flex items-center border border-input rounded-xl bg-background h-10 w-full">
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
                                                <div className="px-3 bg-muted border-l border-border text-sm text-muted-foreground rounded-r-lg flex items-center h-full whitespace-nowrap">
                                                    @{domain}
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
                                                            <CirclePlus width="16" height="16" />
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
                                                <CirclePlus width="16" height="16" />
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
                                            <Envelope2 width="32" height="32" className="text-muted-foreground mx-auto mb-2" />
                                            <p className="text-muted-foreground">No email addresses configured</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {/* Select All Checkbox with Bulk Actions */}
                                            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border">
                                                <div className="flex items-center gap-3">
                                                    <Checkbox
                                                        checked={emailAddresses.length > 0 && selectedEmailIds.size === emailAddresses.length}
                                                        onCheckedChange={toggleSelectAll}
                                                        className="h-4 w-4"
                                                    />
                                                    <span className="text-sm font-medium text-foreground">
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
                                                            className="text-muted-foreground hover:text-foreground h-8 px-3"
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
                                                        <Trash2 width="16" height="16" className="mr-2" />
                                                        Delete Selected
                                                    </Button>
                                                </div>
                                            </div>

                                            {emailAddresses.map((email) => (
                                                <div
                                                    key={email.id}
                                                    className={`flex items-center justify-between p-3 rounded-lg border border-border transition-colors ${selectedEmailIds.has(email.id)
                                                            ? 'bg-accent/50 border-accent'
                                                            : 'bg-muted/30 border-border'
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
                                                            <Clipboard2 width="12" height="12" />
                                                        </Button>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className="text-sm text-muted-foreground">
                                                            {(() => {
                                                                // Use the routing information from the email
                                                                const routing = email.routing

                                                                if (routing.type === 'endpoint' && routing.id) {
                                                                    const endpoint = userEndpoints.find(ep => ep.id === routing.id)
                                                                    if (endpoint) {
                                                                        const EndpointIcon = getEndpointIcon(endpoint)
                                                                        return (
                                                                            <div className="flex items-center gap-1.5">
                                                                                <CustomInboundIcon
                                                                                    Icon={EndpointIcon}
                                                                                    size={25}
                                                                                    backgroundColor={getEndpointIconColor(endpoint)}
                                                                                />
                                                                                <span className={`font-medium`} style={{ color: getEndpointIconColor(endpoint) }}>
                                                                                    {routing.name}
                                                                                </span>
                                                                            </div>
                                                                        )
                                                                    }
                                                                } else if (routing.type === 'webhook' && routing.id) {
                                                                    return (
                                                                        <div className="flex items-center gap-1.5">
                                                                            <CustomInboundIcon
                                                                                Icon={BoltLightning}
                                                                                size={14}
                                                                                backgroundColor="#8b5cf6"
                                                                            />
                                                                            <span className="text-amber-600 font-medium">
                                                                                {routing.name || 'Legacy Webhook'}
                                                                            </span>
                                                                        </div>
                                                                    )
                                                                }
                                                                
                                                                return <span className="text-muted-foreground">Store in Inbound</span>
                                                            })()}
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => openEndpointDialog(email)}
                                                            className="h-8 w-8 p-0"
                                                        >
                                                            <Gear2 width="16" height="16" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => deleteEmailAddressHandler(email.id, email.address)}
                                                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                                        >
                                                            <Trash2 width="16" height="16" />
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
                                            <ExternalLink2 width="12" height="12" />
                                            Manage all endpoints
                                        </Link>
                                    </div>
                                </div>
                            )}

                            {/* Catch-all toggle and configuration - moved below individual emails */}
                            {domainDetailsData && (
                                <>
                                    {!domainDetailsData.isCatchAllEnabled && <Separator />}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="font-medium text-foreground">Catch-all Configuration</div>
                                                <div className="text-sm text-muted-foreground">
                                                    {domainDetailsData.isCatchAllEnabled
                                                        ? 'All emails to any address are captured'
                                                        : 'Capture emails to any address on this domain'
                                                    }
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col sm:flex-row gap-3">
                                            {!domainDetailsData.isCatchAllEnabled && (
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
                                                                                                                                    <CirclePlus width="16" height="16" />
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
                                            <div className={domainDetailsData.isCatchAllEnabled ? "w-full" : "w-full sm:w-auto sm:min-w-[140px]"}>
                                                <Button
                                                    variant={domainDetailsData.isCatchAllEnabled ? "destructive" : "secondary"}
                                                    className="h-10 w-full"
                                                    onClick={toggleCatchAll}
                                                    disabled={!domainDetailsData.isCatchAllEnabled && catchAllEndpointId === 'none'}
                                                >
                                                    {domainDetailsData.isCatchAllEnabled ? 'Disable Catch-all' : 'Enable Catch-all'}
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
                                                <CirclePlus width="16" height="16" />
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
                                <p className="text-sm font-medium text-foreground">Email addresses to be deleted:</p>
                                <div className="max-h-32 overflow-y-auto space-y-1">
                                    {selectedEmails.map((email) => (
                                        <div key={email.id} className="text-sm text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
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