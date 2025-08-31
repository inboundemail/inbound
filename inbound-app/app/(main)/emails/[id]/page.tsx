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
import { cn } from '@/lib/utils'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import AddDomainForm from '@/components/add-domain-form'
import { DeleteConfirmationDialog } from '@/components/ui/delete-confirmation-dialog'

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
    useDomainAuthVerifyV2Mutation,
    useUpgradeDomainMailFromV2Mutation,
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
import { updateDomainDmarcSettings } from '@/app/actions/domains'

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

    // Get auth recommendations for verified domains
    const {
        data: authRecommendationsData,
        isLoading: isAuthRecommendationsLoading,
        refetch: refetchAuthRecommendations
    } = useDomainDetailsV2Query(domainId, { check: true })

    // Auth verification mutation
    const authVerifyMutation = useDomainAuthVerifyV2Mutation()

    // React Query mutations
    const domainVerificationMutation = useDomainVerificationCheckV2(domainId)
    const domainDeletionMutation = useDeleteDomainV2Mutation()
    const addEmailMutation = useAddEmailAddressV2Mutation()
    const deleteEmailMutation = useDeleteEmailAddressV2Mutation()
    const updateEmailWebhookMutation = useUpdateEmailEndpointV2Mutation()
    const updateCatchAllMutation = useUpdateDomainCatchAllV2Mutation()
    const upgradeMailFromMutation = useUpgradeDomainMailFromV2Mutation()

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
    const [isDomainCopied, setIsDomainCopied] = useState(false)

    // Endpoint management dialog state
    const [isEndpointDialogOpen, setIsEndpointDialogOpen] = useState(false)
    const [selectedEmailForEndpoint, setSelectedEmailForEndpoint] = useState<EmailAddressWithDomain | null>(null)
    const [endpointDialogSelectedId, setEndpointDialogSelectedId] = useState<string>('none')

    // Catch-all state
    const [catchAllEndpointId, setCatchAllEndpointId] = useState<string>('none')

    // Email deletion confirmation state
    const [emailToDelete, setEmailToDelete] = useState<{ id: string; address: string } | null>(null)
    // Copy feedback for DNS table
    const [copiedKey, setCopiedKey] = useState<string | null>(null)

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

    const handleDomainCopy = async () => {
        if (!domainDetailsData?.domain) return

        try {
            await navigator.clipboard.writeText(domainDetailsData.domain)
            setIsDomainCopied(true)
            toast.success('Domain copied to clipboard')

            // Reset the checkmark after 2 seconds
            setTimeout(() => {
                setIsDomainCopied(false)
            }, 2000)
        } catch (error) {
            toast.error('Failed to copy domain')
        }
    }

    const refreshVerification = async () => {
        console.log('🔄 Forcing domain verification check...')
        setIsRefreshingVerification(true)
        try {
            // For verified domains, also run auth verification
            if (domainDetailsData?.status === 'verified') {
                try {
                    await authVerifyMutation.mutateAsync(domainId)
                    console.log('✅ Auth verification completed')
                } catch (authError) {
                    console.warn('⚠️ Auth verification failed:', authError)
                    // Continue with regular verification check even if auth fails
                }
            }

            // Use check=true to force a fresh verification check
            const response = await fetch(`/api/v2/domains/${domainId}?check=true`)
            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.error || 'Failed to check domain verification')
            }

            const updatedDomain = await response.json()

            // Manually update the query cache with the fresh data
            queryClient.setQueryData(domainV2Keys.detail(domainId), updatedDomain)

            // Refresh auth recommendations for verified domains
            if (domainDetailsData?.status === 'verified') {
                refetchAuthRecommendations()
            }

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
                        toast.info(`DNS records verified. Email status: ${sesStatus}`)
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

    // Auth verification handler
    const handleAuthVerification = async () => {
        if (!domainId) return

        try {
            await authVerifyMutation.mutateAsync(domainId)
            toast.success('Authentication records verified successfully')
            // Refresh auth recommendations
            refetchAuthRecommendations()
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to verify authentication records'
            toast.error(errorMessage)
        }
    }

    // Copy DNS record value to clipboard
    const copyToClipboard = async (value: string, recordType: string) => {
        try {
            await navigator.clipboard.writeText(value)
            toast.success(`${recordType} record copied to clipboard`)
        } catch (error) {
            toast.error('Failed to copy to clipboard')
        }
    }

    const copyWithFeedback = async (key: string, value: string, label: string) => {
        try {
            await navigator.clipboard.writeText(value)
            setCopiedKey(key)
            setTimeout(() => {
                setCopiedKey(prev => (prev === key ? null : prev))
            }, 1200)
            toast.success(`${label} copied to clipboard`)
        } catch (error) {
            toast.error('Failed to copy to clipboard')
        }
    }

    const CopyIcon = ({ active = false, className = '' }: { active?: boolean; className?: string }) => {
        if (active) {
            return <CircleCheck width="15" height="14" className={className} />
        }
        return (
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="14" viewBox="0 0 15 14" fill="none" className={className}>
                <path d="M4.80446 1.5708C3.51898 1.5708 2.47754 2.54051 2.47754 3.73745V11.2223C2.47754 12.4192 3.51898 13.3889 4.80446 13.3889H11.1506C12.4361 13.3889 13.4775 12.4192 13.4775 11.2223V3.73745C13.4775 2.54051 12.4361 1.5708 11.1506 1.5708H4.80446Z" fill="var(--copy-icon-box)"/>
                <path fillRule="evenodd" clipRule="evenodd" d="M5.01611 1.7677C5.01611 1.00644 5.67932 0.388916 6.49688 0.388916H9.45842C10.276 0.388916 10.9392 1.00644 10.9392 1.7677C10.9392 2.52895 10.276 3.14647 9.45842 3.14647H6.49688C5.67932 3.14647 5.01611 2.52895 5.01611 1.7677Z" fill="var(--copy-icon-bar)"/>
            </svg>
        )
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

    const deleteEmailAddressHandler = (emailAddressId: string, emailAddress: string) => {
        setEmailToDelete({ id: emailAddressId, address: emailAddress })
    }

    const confirmDeleteEmail = async () => {
        if (!emailToDelete || !domainDetailsData) return

        try {
            await deleteEmailMutation.mutateAsync({ emailAddressId: emailToDelete.id, domainId })
            setEmailToDelete(null)
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

        console.log('🔄 Updating email endpoint:', {
            emailId: selectedEmailForEndpoint.id,
            currentEndpointId: selectedEmailForEndpoint.endpointId,
            newEndpointId: endpointDialogSelectedId === 'none' ? null : endpointDialogSelectedId,
            domainId: domainId
        })

        try {
            const result = await updateEmailWebhookMutation.mutateAsync({
                emailAddressId: selectedEmailForEndpoint.id,
                endpointId: endpointDialogSelectedId === 'none' ? null : endpointDialogSelectedId,
                domainId: domainId
            })

            console.log('✅ Update result:', result)

            toast.success('Endpoint updated successfully')
            setIsEndpointDialogOpen(false)
            setSelectedEmailForEndpoint(null)
            setEndpointDialogSelectedId('none')

            // Force refetch to ensure UI updates
            await refetchEmailAddresses()
        } catch (error) {
            console.error('❌ Update failed:', error)
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

    const toggleDmarcEmails = async () => {
        if (!domainDetailsData) return

        try {
            const newValue = !domainDetailsData.receiveDmarcEmails
            const result = await updateDomainDmarcSettings(domainId, newValue)
            
            if (result.success) {
                toast.success(result.message || 'DMARC email settings updated successfully')
                // Refresh domain details to get updated data
                refetchDomainDetails()
            } else {
                toast.error(result.error || 'Failed to update DMARC settings')
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to update DMARC settings')
        }
    }

    const handleUpgradeDomain = async () => {
        try {
            const result = await upgradeMailFromMutation.mutateAsync({ domainId })
            toast.success(
                result.alreadyConfigured
                    ? 'Domain already has MAIL FROM configured'
                    : 'Domain upgraded! Additional DNS records have been added for mail.' + domainDetailsData?.domain,
                { duration: 6000 }
            )
        } catch (error) {
            toast.error(
                error instanceof Error ? error.message : 'Failed to upgrade domain'
            )
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
    const createdDistance = domainDetailsData.createdAt ? formatDistanceToNow(new Date(domainDetailsData.createdAt), { addSuffix: true }) : null

    // Type assertion for MAIL FROM properties (until TypeScript cache refreshes)
    const domainWithMailFrom = domainDetailsData as GetDomainByIdResponse & {
        mailFromDomain?: string | null
        mailFromDomainStatus?: string | null
        mailFromDomainVerifiedAt?: Date | null
    }

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
            <div className="space-y-4">
                {/* Back Button */}
                <div className="flex items-center">
                    <Link href="/emails" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                        <ArrowBoldLeft width="16" height="16" />
                        Back to Domains
                    </Link>
                </div>

                {/* Header (no card) */}
                <div className="flex items-center justify-between p-2">
                    <div className="flex items-center gap-4">
                        <div className="flex w-[46px] h-[46px] p-2 justify-center items-center gap-2.5 rounded-[10px] bg-[var(--badge-default-bg)]">
                            <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 31 30" fill="none">
                                <path d="M15.5327 2.66663C22.344 2.66663 27.8665 8.18839 27.8667 14.9996C27.8667 21.811 22.3441 27.3336 15.5327 27.3336C8.72147 27.3334 3.19971 21.8109 3.19971 14.9996C3.19988 8.18849 8.72157 2.6668 15.5327 2.66663Z" fill="var(--purple-primary)" fillOpacity="0.4" stroke="var(--purple-dark)" strokeWidth="2" />
                                <path d="M27.897 10C28.22 10.7979 28.468 11.6341 28.6323 12.5H2.43359C2.59786 11.6341 2.84584 10.7979 3.16883 10H27.897Z" fill="var(--purple-dark)" />
                                <path d="M3.53998 20.8333C3.15376 20.0408 2.8438 19.2043 2.61963 18.3333H28.4462C28.222 19.2043 27.912 20.0408 27.5258 20.8333H3.53998Z" fill="var(--purple-dark)" />
                                <path fillRule="evenodd" clipRule="evenodd" d="M12.6182 2.93898C13.4304 2.20468 14.4261 1.66663 15.5331 1.66663C16.64 1.66663 17.6357 2.20468 18.4479 2.93898C19.2677 3.68018 19.995 4.70164 20.5994 5.88873C21.8097 8.26639 22.6164 11.4842 22.6164 15C22.6164 18.5158 21.8097 21.7335 20.5994 24.1111C19.995 25.2983 19.2677 26.3198 18.4479 27.061C17.6357 27.7953 16.64 28.3333 15.5331 28.3333C14.4261 28.3333 13.4304 27.7953 12.6182 27.061C11.7984 26.3198 11.0711 25.2983 10.4668 24.1111C9.25642 21.7335 8.44971 18.5158 8.44971 15C8.44971 11.4842 9.25642 8.26639 10.4668 5.88873C11.0711 4.70164 11.7984 3.68018 12.6182 2.93898ZM12.6947 7.02286C11.6788 9.01853 10.9497 11.8424 10.9497 15C10.9497 18.1575 11.6788 20.9815 12.6947 22.9771C13.2036 23.9766 13.762 24.7248 14.2948 25.2065C14.8353 25.6951 15.2592 25.8333 15.5331 25.8333C15.8069 25.8333 16.2308 25.6951 16.7713 25.2065C17.304 24.7248 17.8625 23.9766 18.3714 22.9771C19.3874 20.9815 20.1164 18.1575 20.1164 15C20.1164 11.8424 19.3874 9.01853 18.3714 7.02286C17.8625 6.02328 17.304 5.27516 16.7713 4.79344C16.2308 4.30483 15.8069 4.16663 15.5331 4.16663C15.2592 4.16663 14.8353 4.30483 14.2948 4.79344C13.762 5.27516 13.2036 6.02328 12.6947 7.02286Z" fill="var(--purple-dark)" />
                            </svg>
                        </div>
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
                            <Badge className="px-2.5 py-0.5 text-xs" variant="default">
                                <CircleCheck width="12" height="12" className="mr-1" />
                                Verified
                            </Badge>
                        ) : status === DOMAIN_STATUS.PENDING ? (
                            <Badge className="px-2.5 py-0.5 text-xs" variant="secondary">
                                <Clock2 width="12" height="12" className="mr-1" />
                                Pending
                            </Badge>
                        ) : (
                            <Badge className="px-2.5 py-0.5 text-xs" variant="destructive">
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
                                        <Label htmlFor="delete-confirm" >
                                            Type <strong className="cursor-pointer hover:bg-muted px-1 py-0.5 rounded transition-colors inline-flex items-center gap-1 p-1 bg-muted" onClick={handleDomainCopy}>{domain} {isDomainCopied ? <CircleCheck width="16" height="16" className="text-green-600" /> : <Clipboard2 width="16" height="16" />}</strong> to confirm deletion:
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

                {/* Meta row (no card) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-2">
                    <div>
                        <div className="text-[10px] tracking-wide text-muted-foreground/80">CREATED</div>
                        <div className="text-sm text-foreground mt-1">{createdDistance || '—'}</div>
                    </div>
                </div>

                {/* Success banner when all DNS records are verified */}
                {status === DOMAIN_STATUS.VERIFIED && authRecommendationsData?.verificationCheck?.dnsRecords && authRecommendationsData.verificationCheck.dnsRecords.length > 0 && authRecommendationsData.verificationCheck.dnsRecords.every((r: any) => r.isVerified) && (
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-primary">
                        Well done! All the DNS records are verified. You are ready to start building and sending emails with this domain.
                    </div>
                )}

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

                {/* MAIL FROM Configuration - no card */}
                {status === DOMAIN_STATUS.VERIFIED && !domainWithMailFrom?.mailFromDomain && (
                    <div className="p-2">
                        <div className="flex items-center justify-between">
                            <div className="flex-1">
                                <div className="text-foreground text-lg font-medium mb-2">Enhanced Email Identity</div>
                                <div className="text-sm text-muted-foreground">
                                    Eliminate "via amazonses.com" attribution and improve deliverability
                                </div>
                            </div>
                            <Button
                                onClick={handleUpgradeDomain}
                                disabled={upgradeMailFromMutation.isPending}
                                className="ml-4"
                            >
                                {upgradeMailFromMutation.isPending ? 'Upgrading...' : 'Upgrade Identity'}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Auth Recommendations - no card */}
                {status === DOMAIN_STATUS.VERIFIED && authRecommendationsData?.authRecommendations && Object.values(authRecommendationsData.authRecommendations).some(rec => rec !== undefined) && (
                    <div className="space-y-2">
                        <div className="pb-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <BoltLightning width="20" height="20" className="text-primary" />
                                    <div className="text-foreground text-lg font-medium">Improve Deliverability</div>
                                </div>
                                {(() => {
                                    const allVerified = Object.entries(authRecommendationsData.authRecommendations).every(([_, recommendation]) => {
                                        const recordName = recommendation.name
                                        const verificationData = authRecommendationsData?.verificationCheck?.dnsRecords?.find(
                                            (record: any) => record.name === recordName && record.type === 'TXT'
                                        )
                                        return verificationData?.isVerified
                                    })
                                    if (allVerified) {
                                        return (
                                            <Badge variant="default">
                                                <CircleCheck width="12" height="12" className="mr-1" />
                                                Fully Verified
                                            </Badge>
                                        )
                                    }
                                    return null
                                })()}
                            </div>
                            <div className="text-sm text-muted-foreground">
                                Add these DNS records to improve email delivery rates and authentication
                            </div>
                        </div>
                        {/* DNS Records Table Header */}
                        <div className="overflow-hidden">
                            <div className="bg-muted/50 px-4 py-3 border-b border-border">
                                <div className="flex">
                                    <div className="w-[20%] pr-4">
                                        <span className="text-sm font-medium text-muted-foreground">Name</span>
                                    </div>
                                    <div className="w-[10%] pr-4">
                                        <span className="text-sm font-medium text-muted-foreground">Type</span>
                                    </div>
                                    <div className="w-[30%] pr-4">
                                        <span className="text-sm font-medium text-muted-foreground">Value</span>
                                    </div>
                                    <div className="w-[10%] pr-4">
                                        <span className="text-sm font-medium text-muted-foreground">TTL</span>
                                    </div>
                                    <div className="w-[15%] pr-4">
                                        <span className="text-sm font-medium text-muted-foreground">Priority</span>
                                    </div>
                                    <div className="w-[15%]">
                                        <span className="text-sm font-medium text-muted-foreground">Status</span>
                                    </div>
                                </div>
                            </div>
                            {/* DNS Records Body */}
                            <div className="">
                                {Object.entries(authRecommendationsData.authRecommendations).map(([type, recommendation], index) => (
                                    <div key={index} className={cn(
                                        "flex items-center transition-colors px-4 py-3 hover:bg-muted/50",
                                        {
                                            "border-b border-border/50": index < Object.keys(authRecommendationsData.authRecommendations || {}).length - 1
                                        }
                                    )}>
                                        <div className="w-[20%] pr-4">
                                            <div className="flex items-center justify-between">
                                                <span className="font-mono text-sm truncate">
                                                    {recommendation.name}
                                                </span>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => copyToClipboard(recommendation.name, `${type} name`)}
                                                    className="h-8 w-8 p-0 hover:bg-muted border border-border rounded flex-shrink-0 ml-2"
                                                >
                                                    <Clipboard2 width="16" height="16" className="text-muted-foreground" />
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="w-[10%] pr-4">
                                            <div className="flex items-center justify-between">
                                                <Badge variant="outline" className="text-xs font-mono">
                                                    TXT
                                                </Badge>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => copyToClipboard("TXT", "DNS record type")}
                                                    className="h-8 w-8 p-0 hover:bg-muted border border-border rounded flex-shrink-0 ml-2"
                                                >
                                                    <Clipboard2 width="16" height="16" className="text-muted-foreground" />
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="w-[30%] pr-4 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <span className="font-mono text-sm truncate text-foreground min-w-0 flex-1">
                                                    {recommendation.value}
                                                </span>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => copyToClipboard(recommendation.value, type)}
                                                    className="h-8 w-8 p-0 hover:bg-muted border border-border rounded flex-shrink-0 ml-2"
                                                >
                                                    <Clipboard2 width="16" height="16" className="text-muted-foreground" />
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="w-[10%] pr-4">
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm text-muted-foreground">Auto</span>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => copyToClipboard("Auto", "TTL")}
                                                    className="h-8 w-8 p-0 hover:bg-muted border border-border rounded flex-shrink-0 ml-2"
                                                >
                                                    <Clipboard2 width="16" height="16" className="text-muted-foreground" />
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="w-[15%] pr-4">
                                            <span className="text-sm text-muted-foreground">-</span>
                                        </div>
                                        <div className="w-[15%]">
                                            {(() => {
                                                const recordName = recommendation.name
                                                const verificationData = authRecommendationsData?.verificationCheck?.dnsRecords?.find(
                                                    (record: any) => record.name === recordName && record.type === 'TXT'
                                                )
                                                if (verificationData?.isVerified) {
                                                    return (
                                                        <Badge variant="default" className="text-xs">
                                                            Verified
                                                        </Badge>
                                                    )
                                                } else if (verificationData && !verificationData.isVerified) {
                                                    return (
                                                        <Badge variant="destructive" className="text-xs">
                                                            Failed
                                                        </Badge>
                                                    )
                                                } else {
                                                    return (
                                                        <Badge variant="secondary" className="text-xs">
                                                            Pending
                                                        </Badge>
                                                    )
                                                }
                                            })()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Email Management Section - Only show for verified domains (no card) */}
                {showEmailSection && (
                    <div className="">
                        <div className="pb-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-2 text-foreground text-lg font-medium">
                                        Email Management
                                    </div>
                                    <div className="text-muted-foreground text-sm">
                                        {domainDetailsData?.isCatchAllEnabled
                                            ? `Mixed routing: specific addresses + catch-all for @${domain}`
                                            : `Manage individual email addresses for @${domain}`
                                        }
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Envelope2 width="16" height="16" />
                                    {stats.totalEmailAddresses} addresses
                                    <span className="text-muted-foreground/60">•</span>
                                    <ChartTrendUp width="16" height="16" />
                                    {stats.emailsLast24h} emails (24h)
                                </div>
                            </div>
                        </div>
                        <div className="space-y-4">
                            {/* Individual email addresses - now supports mixed mode with catch-all */}
                            <div className="space-y-4">
                                {/* Add Email Form */}
                                <div className="flex flex-col sm:flex-row gap-3 w-full">
                                    <div className="w-full sm:flex-1">
                                        <div className="flex items-center border border-border rounded-xl bg-background h-10 w-full">
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
                                            <div className="px-3 border-l border-l-[var(--badge-outline-border)] text-sm rounded-r-lg flex items-center h-full whitespace-nowrap bg-[var(--badge-outline-bg)] text-[var(--badge-outline-text)]">
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
                                                            console.log('🔍 Routing:', email.routing)
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

                            {/* Catch-all toggle and configuration */}
                            {domainDetailsData && (
                                <>
                                    <Separator />
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="font-medium text-foreground">Catch-all Configuration</div>
                                                <div className="text-sm text-muted-foreground">
                                                    {domainDetailsData.isCatchAllEnabled
                                                        ? 'Fallback for emails not matching specific addresses above'
                                                        : 'Capture emails to any address on this domain (works with specific addresses)'
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
                        </div>
                    </div>
                )}

                {/* DMARC Configuration - Only show for verified domains */}
                {showEmailSection && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between border border-border rounded-xl p-4">
                            <div>
                                <div className="font-medium text-foreground">DMARC Email Delivery</div>
                                <div className="text-sm text-muted-foreground">
                                    {domainDetailsData?.receiveDmarcEmails
                                        ? 'DMARC reports (dmarc@' + domain + ') will be processed and routed like normal emails'
                                        : 'DMARC reports (dmarc@' + domain + ') will be stored but not delivered to endpoints'
                                    }
                                </div>
                            </div>
                            <div className="w-full sm:w-auto sm:min-w-[140px]">
                                <Button
                                    variant={domainDetailsData?.receiveDmarcEmails ? "destructive" : "secondary"}
                                    className="h-10 w-full sm:w-auto"
                                    onClick={toggleDmarcEmails}
                                >
                                    {domainDetailsData?.receiveDmarcEmails ? 'Disable Routing' : 'Enable Routing'}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* DNS Records Overview - Show all DNS records for verified domains */}
                {status === DOMAIN_STATUS.VERIFIED && authRecommendationsData?.verificationCheck?.dnsRecords && (
                    <Card className="bg-card border-border rounded-xl">
                        <CardHeader className="pb-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Globe2 width="20" height="20" className="text-primary" />
                                    <CardTitle className="text-foreground text-lg">DNS Records</CardTitle>
                                </div>
                                {(() => {
                                    const allRecords = authRecommendationsData.verificationCheck.dnsRecords || []
                                    const verifiedCount = allRecords.filter((r: any) => r.isVerified).length
                                    const totalCount = allRecords.length
                                    const allVerified = totalCount > 0 && verifiedCount === totalCount
                                    const anyFailed = totalCount > 0 && verifiedCount < totalCount

                                    if (allVerified) {
                                        return (
                                            <Badge variant="default">
                                                <CircleCheck width="12" height="12" className="mr-1" />
                                                Fully Verified
                                            </Badge>
                                        )
                                    }
                                    if (anyFailed) {
                                        return (
                                            <Badge variant="destructive">Failed to verify records</Badge>
                                        )
                                    }
                                    return (
                                        <Badge variant="outline">No records</Badge>
                                    )
                                })()}
                            </div>
                            <CardDescription className="text-muted-foreground">
                                All DNS records managed for {domain}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="rounded-[11px] md:rounded-[13px] overflow-hidden bg-[var(--dns-table-bg)]">
                                <div className="px-4 py-3">
                                    <div className="flex">
                                        <div className="w-[20%] pr-4">
                                            <span className="text-sm font-medium text-muted-foreground">Name</span>
                                        </div>
                                        <div className="w-[35%] pr-4">
                                            <span className="text-sm font-medium text-muted-foreground">Value</span>
                                        </div>
                                        <div className="w-[10%] pr-4">
                                            <span className="text-sm font-medium text-muted-foreground">Type</span>
                                        </div>
                                        <div className="w-[15%] pr-4">
                                            <span className="text-sm font-medium text-muted-foreground">Purpose</span>
                                        </div>
                                        <div className="w-[10%] pr-4">
                                            <span className="text-sm font-medium text-muted-foreground">Required</span>
                                        </div>
                                        <div className="w-[10%]">
                                            <span className="text-sm font-medium text-muted-foreground">Status</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="px-4 py-2">
                                    {authRecommendationsData.verificationCheck.dnsRecords.map((record: any, index: number) => {
                                        // Determine the purpose of the record
                                        const getPurpose = () => {
                                            if (record.name === domain) {
                                                if (record.value?.includes('v=spf1')) return 'SPF'
                                                if (record.value?.includes('amazonses')) return 'SES Verify'
                                                return 'Domain'
                                            }
                                            if (record.name.includes('_dmarc')) return 'DMARC'
                                            if (record.name.includes('_domainkey')) return 'DKIM'
                                            if (record.name.includes('mail.')) return 'MAIL FROM'
                                            if (record.type === 'MX') return 'Receive Mail'
                                            return 'Other'
                                        }

                                        const purpose = getPurpose()
                                        const isRequired = record.type === 'MX' || record.type === 'TXT' && record.value?.includes('amazonses')

                                        return (
                                            <div key={index} className="flex items-center transition-colors py-3">
                                                <div className="w-[20%] pr-4">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-mono text-sm truncate">
                                                            {record.name}
                                                        </span>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => copyWithFeedback(`dns-name-${index}`, record.name, `${purpose} name`)}
                                                            className="h-8 w-8 p-0 flex items-center justify-center ml-2"
                                                        >
                                                            <CopyIcon active={copiedKey === `dns-name-${index}`} />
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="w-[35%] pr-4 min-w-0">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-mono text-sm truncate text-foreground min-w-0 flex-1">
                                                            {record.value}
                                                        </span>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => copyWithFeedback(`dns-value-${index}`, record.value, record.type)}
                                                            className="h-8 w-8 p-0 flex items-center justify-center ml-2"
                                                        >
                                                            <CopyIcon active={copiedKey === `dns-value-${index}`} />
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="w-[10%] pr-4">
                                                    <Badge variant="outline" className="text-xs font-mono">
                                                        {record.type}
                                                    </Badge>
                                                </div>
                                                <div className="w-[15%] pr-4">
                                                    <Badge variant="outline" className="text-xs">
                                                        {purpose}
                                                    </Badge>
                                                </div>
                                                <div className="w-[10%] pr-4">
                                                    <span className="text-sm text-muted-foreground">
                                                        {isRequired ? 'Yes' : 'No'}
                                                    </span>
                                                </div>
                                                <div className="w-[10%]">
                                                    {record.isVerified ? (
                                                        <Badge variant="default" className="text-xs">
                                                            Verified
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="secondary" className="text-xs">
                                                            Pending
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
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

                {/* Email Delete Confirmation Dialog */}
                <DeleteConfirmationDialog
                    open={!!emailToDelete}
                    onOpenChange={(open) => !open && setEmailToDelete(null)}
                    onConfirm={confirmDeleteEmail}
                    title="Delete Email Address"
                    itemName={emailToDelete?.address}
                    itemType="email address"
                    isLoading={deleteEmailMutation.isPending}
                />
            </div>
        </div>
    )
} 