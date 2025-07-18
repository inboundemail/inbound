"use client"

import React, { useState, useEffect, useMemo, FormEvent } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import ArrowBoldRight from "@/components/icons/arrow-bold-right"
import Clock2 from "@/components/icons/clock-2"
import CircleCheck from "@/components/icons/circle-check"
import CircleWarning2 from "@/components/icons/circle-warning-2"
import Loader from "@/components/icons/loader"
import Clipboard2 from "@/components/icons/clipboard-2"
import Download2 from "@/components/icons/download-2"
import Refresh2 from "@/components/icons/refresh-2"
import BadgeCheck2 from "@/components/icons/badge-check-2"
import Globe2 from "@/components/icons/globe-2"
import ExternalLink2 from "@/components/icons/external-link-2"
import ResendIcon from "@/components/ResendIcon"
import CheckList from "@/components/icons/check-list"
import { useRouter } from "next/navigation"
import Image from "next/image"
import type { 
  PostDomainsResponse, 
  DomainWithStats
} from "@/app/api/v2/domains/route"

interface StepConfig {
  id: string
  name: string
  description: string
}

const stepsConfig: StepConfig[] = [
  {
    id: "add-domain",
    name: "Add Domain",
    description: "Add a domain you own to send emails.",
  },
  {
    id: "configure-dns",
    name: "Configure DNS",
    description: "Add the following DNS records to your domain provider.",
  },
  {
    id: "verified",
    name: "Verified",
    description: "Start sending emails to your domain.",
  },
]

const stepVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
}

interface DnsRecord {
  type: 'TXT' | 'MX' | string  // Allow string for flexibility
  name: string
  value: string
  isVerified?: boolean
}

// Type for DNS records from verification check
type VerificationDnsRecord = {
  type: string
  name: string
  value: string
  isVerified: boolean
  error?: string
}

// Enhanced type for domain response with verification check
interface DomainResponseWithCheck extends Omit<DomainWithStats, 'stats' | 'catchAllEndpoint'> {
  stats: {
    totalEmailAddresses: number
    activeEmailAddresses: number
    hasCatchAll: boolean
  }
  catchAllEndpoint?: {
    id: string
    name: string
    type: string
    isActive: boolean
  } | null
  verificationCheck?: {
    dnsRecords?: Array<VerificationDnsRecord>
    sesStatus?: string
    isFullyVerified?: boolean
    lastChecked?: Date
  }
}

interface ApiResponse {
  success: boolean
  error?: string
  domain?: string
  domainId?: string
  status?: 'pending' | 'verified' | 'failed'
  dnsRecords?: DnsRecord[]
  verificationToken?: string
  provider?: {
    name: string
    confidence: 'high' | 'medium' | 'low'
  }
}

interface AddDomainFormProps {
  // Optional props for preloading existing domain data
  preloadedDomain?: string
  preloadedDomainId?: string
  preloadedDnsRecords?: DnsRecord[]
  preloadedStep?: number
  preloadedProvider?: string
  onRefresh?: () => void
  overrideRefreshFunction?: () => Promise<void>
  // Optional callback when domain is successfully added/verified
  onSuccess?: (domainId: string) => void
}

// Provider documentation mapping
const getProviderDocUrl = (provider: string): string | null => {
  const providerMap: Record<string, string> = {
    'route53': 'https://resend.com/docs/knowledge-base/route53',
    'amazon route 53': 'https://resend.com/docs/knowledge-base/route53',
    'aws': 'https://resend.com/docs/knowledge-base/route53',
    'cloudflare': 'https://resend.com/docs/knowledge-base/cloudflare',
    'namecheap': 'https://resend.com/docs/knowledge-base/namecheap',
    'vercel': 'https://resend.com/docs/knowledge-base/vercel',
    'squarespace': 'https://resend.com/docs/knowledge-base/squarespace',
    'hostzinger': 'https://resend.com/docs/knowledge-base/hostzinger',
    'ionos': 'https://resend.com/docs/knowledge-base/ionos',
    'gandi': 'https://resend.com/docs/knowledge-base/gandi',
    'porkbun': 'https://resend.com/docs/knowledge-base/porkbun'
  }

  const normalizedProvider = provider.toLowerCase().trim()
  return providerMap[normalizedProvider] || null
}

export default function AddDomainForm({
  preloadedDomain = "",
  preloadedDomainId = "",
  preloadedDnsRecords = [],
  preloadedStep = 0,
  preloadedProvider = "",
  onRefresh,
  overrideRefreshFunction,
  onSuccess
}: AddDomainFormProps) {
  const [currentStepIdx, setCurrentStepIdx] = useState(preloadedStep)
  const [domainName, setDomainName] = useState(preloadedDomain)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'verified' | 'failed' | null>(null)
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>(preloadedDnsRecords)
  const [domainId, setDomainId] = useState(preloadedDomainId)
  const [resendApiKey, setResendApiKey] = useState("")
  const [isImporting, setIsImporting] = useState(false)
  const [showDomainSelection, setShowDomainSelection] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [resendDomains, setResendDomains] = useState<any[]>([])
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set())
  const [importProgress, setImportProgress] = useState<{
    [key: string]: {
      status: 'pending' | 'processing' | 'success' | 'failed' | 'exists'
      message?: string
      domainId?: string
    }
  }>({})
  const [isProcessing, setIsProcessing] = useState(false)
  const [periodicCheckEnabled, setPeriodicCheckEnabled] = useState(false)
  const router = useRouter()
  const [showDnsWarning, setShowDnsWarning] = useState(true)

  // Memoize the DNS records to prevent unnecessary re-renders
  const memoizedPreloadedDnsRecords = useMemo(() => preloadedDnsRecords, [
    JSON.stringify(preloadedDnsRecords)
  ])

  // Update state when props change (for when component is reused with different data)
  useEffect(() => {
    setCurrentStepIdx(preloadedStep)
    setDomainName(preloadedDomain)
    setDnsRecords(memoizedPreloadedDnsRecords)
    setDomainId(preloadedDomainId)
  }, [preloadedStep, preloadedDomain, memoizedPreloadedDnsRecords, preloadedDomainId])

  // Lazy refresh status when component loads with preloaded data (pending domain)
  useEffect(() => {
    if (preloadedDomainId && preloadedDomain && preloadedStep === 1) {
      // Add a small delay to let the component fully mount
      const timer = setTimeout(() => {
        console.log("🔄 Auto-refreshing domain verification status for:", preloadedDomain)
        handleRefresh()
        // Enable periodic checks after initial refresh
        setPeriodicCheckEnabled(true)
      }, 500) // 500ms delay

      return () => clearTimeout(timer)
    }
  }, [preloadedDomainId, preloadedDomain, preloadedStep])

  // Fetch DNS records when we have a domainId but no DNS records
  useEffect(() => {
    if (domainId && dnsRecords.length === 0 && currentStepIdx === 1) {
      const fetchDnsRecords = async () => {
        try {
          const response = await fetch(`/api/v2/domains/${domainId}/dns-records`)
          if (response.ok) {
            const data = await response.json()
            const mappedRecords = data.records.map((record: any) => ({
              type: record.recordType,
              name: record.name,
              value: record.value,
              isVerified: record.isVerified || false
            }))
            setDnsRecords(mappedRecords)
          }
        } catch (error) {
          console.error('Error fetching DNS records:', error)
        }
      }
      fetchDnsRecords()
    }
  }, [domainId, dnsRecords.length, currentStepIdx])

  // Periodic verification check every 5 seconds
  useEffect(() => {
    if (!periodicCheckEnabled || !domainId || !domainName || verificationStatus === 'verified' || verificationStatus === 'failed') {
      return
    }

    console.log("🔄 Starting periodic verification checks every 5 seconds for:", domainName)

    const intervalId = setInterval(() => {
      console.log("⏰ Periodic verification check for:", domainName)
      handlePeriodicRefresh()
    }, 5000) // 5 seconds

    return () => {
      console.log("🛑 Stopping periodic verification checks for:", domainName)
      clearInterval(intervalId)
    }
  }, [periodicCheckEnabled, domainId, domainName, verificationStatus])

  // Handle periodic refresh (silent, no loading states)
  const handlePeriodicRefresh = async () => {
    if (!domainId || !domainName || isRefreshing) {
      return
    }

    // Use overrideRefreshFunction if provided
    if (overrideRefreshFunction) {
      try {
        await overrideRefreshFunction()
      } catch (err) {
        console.error('Error in periodic refresh:', err)
      }
      return
    }

    try {
      const response = await fetch(`/api/v2/domains?status=pending&check=true`)

      if (!response.ok) {
        console.error('Failed to check domain status:', response.status)
        return
      }

      const result = await response.json()
      
      // Find our domain in the response
      const ourDomain = result.data?.find((d: DomainResponseWithCheck) => d.id === domainId)
      
      if (!ourDomain) {
        console.error('Domain not found in response')
        return
      }

      // Update verification status based on domain status
      setVerificationStatus(ourDomain.status as 'pending' | 'verified' | 'failed')

      // Update DNS records if verification check is available
      if (ourDomain.verificationCheck?.dnsRecords) {
        setDnsRecords(ourDomain.verificationCheck.dnsRecords.map((record: VerificationDnsRecord) => ({
          type: record.type,
          name: record.name,
          value: record.value,
          isVerified: record.isVerified
        })))
      }

      if (ourDomain.status === 'verified') {
        console.log("✅ Domain verified! Redirecting to domain details page...")
        toast.success("Domain verified successfully! Redirecting...")
        setPeriodicCheckEnabled(false) // Stop periodic checks
        
        // Redirect to domain details page
        setTimeout(() => {
          router.push(`/emails/${domainId}`)
        }, 1500) // Small delay to show the success message
      }
    } catch (err) {
      console.error('Error in periodic verification check:', err)
      // Don't show error toast for periodic checks to avoid spamming
    }
  }

  const handleNext = () => {
    if (currentStepIdx === 0 && !domainName.trim()) {
      setError("Please enter a valid domain name.")
      return
    }
    if (currentStepIdx === 0 && domainName.trim()) {
      if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domainName)) {
        setError("Please enter a valid domain format (e.g., example.com).")
        return
      }
    }
    setError("")
    if (currentStepIdx < stepsConfig.length - 1) {
      setCurrentStepIdx((prev) => prev + 1)
    }
  }



  const handleSubmitDomain = async (e: FormEvent) => {
    e.preventDefault()
    if (!domainName.trim()) {
      setError("Please enter a valid domain name.")
      return
    }

    if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domainName)) {
      setError("Please enter a valid domain format (e.g., example.com).")
      return
    }

    setIsLoading(true)
    setError("")

    try {
      // Use v2 API to add domain
      const addResponse = await fetch('/api/v2/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domainName
        })
      })

      const addResult: PostDomainsResponse | { error: string } = await addResponse.json()

      if (!addResponse.ok) {
        const errorResult = addResult as { error: string }
        
        // Check for specific error types
        if (addResponse.status === 409) {
          setError('This domain already exists in your account.')
        } else if (addResponse.status === 403) {
          setError(errorResult.error || 'Domain limit reached. Please upgrade your plan.')
        } else if (addResponse.status === 400 && errorResult.error?.includes('conflicting DNS records')) {
          setError('This domain cannot be used. It may have conflicting DNS records (MX or CNAME). Please remove them before adding this domain.')
        } else {
          setError(errorResult.error || 'Failed to add domain')
        }
        return
      }

      const successResult = addResult as PostDomainsResponse
      console.log("Domain added successfully:", successResult)

      // Call success callback if provided
      if (onSuccess) {
        onSuccess(successResult.id)
      }

      // Redirect to domain details page
      toast.success("Domain added successfully! Redirecting...")
      setTimeout(() => {
        router.push(`/emails/${successResult.id}`)
      }, 1000) // Small delay to show the success message

    } catch (err) {
      console.error('Error adding domain:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRefresh = async () => {
    // Use overrideRefreshFunction if provided, otherwise fall back to onRefresh or default behavior
    if (overrideRefreshFunction) {
      setIsRefreshing(true)
      try {
        await overrideRefreshFunction()
      } catch (err) {
        console.error('Error in override refresh function:', err)
        toast.error("Failed to refresh status")
      } finally {
        setIsRefreshing(false)
      }
      return
    }

    if (onRefresh) {
      onRefresh()
      return
    }

    if (!domainId) {
      toast.error("No domain ID available for verification")
      return
    }

    setIsRefreshing(true)
    setError("")

    console.log("🔄 Manual refresh for domainId:", domainId)

    try {
      const response = await fetch(`/api/v2/domains?status=pending&check=true`)

      if (!response.ok) {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to check verification status')
        toast.error("Failed to refresh status")
        setPeriodicCheckEnabled(false) // Stop periodic checks on error
        return
      }

      const result = await response.json()
      
      // Find our domain in the response
      const ourDomain = result.data?.find((d: DomainResponseWithCheck) => d.id === domainId)
      
      if (!ourDomain) {
        setError('Domain not found')
        toast.error("Domain not found")
        setPeriodicCheckEnabled(false)
        return
      }

      console.log("🔍 Manual refresh result:", ourDomain)

      // Update verification status
      setVerificationStatus(ourDomain.status as 'pending' | 'verified' | 'failed')

      if (ourDomain.status === 'verified') {
        console.log("✅ Domain verified via manual refresh! Redirecting...")
        toast.success("Domain verified successfully! Redirecting...")
        setPeriodicCheckEnabled(false) // Stop periodic checks
        
        // Redirect to domain details page
        setTimeout(() => {
          router.push(`/emails/${domainId}`)
        }, 1500) // Small delay to show the success message
      } else if (ourDomain.status === 'failed') {
        toast.error("Domain verification failed")
        setPeriodicCheckEnabled(false) // Stop periodic checks on failure
      } else {
        toast.info("Domain verification still pending")
        // Enable periodic checks if not already enabled
        if (!periodicCheckEnabled) {
          setPeriodicCheckEnabled(true)
        }
      }

      // Update DNS records if verification check is available
      if (ourDomain.verificationCheck?.dnsRecords) {
        setDnsRecords(ourDomain.verificationCheck.dnsRecords.map((record: VerificationDnsRecord) => ({
          type: record.type,
          name: record.name,
          value: record.value,
          isVerified: record.isVerified
        })))
      }

    } catch (err) {
      console.error('Error checking verification:', err)
      setError('An unexpected error occurred while checking verification status.')
      toast.error("Failed to refresh status")
      setPeriodicCheckEnabled(false) // Stop periodic checks on error
    } finally {
      setIsRefreshing(false)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Copied to clipboard")
    } catch (err) {
      console.error("Failed to copy text: ", err)
      toast.error("Failed to copy to clipboard")
    }
  }

  const downloadZoneFile = (absolute: boolean = false) => {
    if (!domainName || dnsRecords.length === 0) {
      toast.error("No DNS records available to download")
      return
    }

    try {
      // Generate zone file content
      const zoneFileContent = generateZoneFile(domainName, dnsRecords, absolute)
      
      // Create blob and download
      const blob = new Blob([zoneFileContent], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${domainName}.txt`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      
      toast.success("Zone file downloaded successfully")
    } catch (err) {
      console.error("Failed to generate zone file:", err)
      toast.error("Failed to generate zone file")
    }
  }

  const generateZoneFile = (domain: string, records: DnsRecord[], absolute: boolean = false): string => {
    // Extract root domain (last two parts: domain.tld)
    const domainParts = domain.split('.')
    const rootDomain = domainParts.slice(-2).join('.')
    
    let zoneContent = `; Zone file for ${domain}\n`
    zoneContent += `; Generated by Inbound Email Service\n`
    zoneContent += `; \n`
    
    if (absolute) {
      zoneContent += `; This file uses ABSOLUTE domain names (full names).\n`
      zoneContent += `; Each record includes the complete domain name.\n`
      zoneContent += `; Use this format if your DNS provider requires full domain names.\n`
      zoneContent += `; \n`
    } else {
      zoneContent += `; IMPORTANT: This zone file uses relative names.\n`
      zoneContent += `; The $ORIGIN directive means all names are relative to ${rootDomain}\n`
      zoneContent += `; For example, '_amazonses' will become '_amazonses.${rootDomain}'\n`
      zoneContent += `; and '@' represents the root domain (${rootDomain})\n`
      zoneContent += `; \n`
      zoneContent += `; Some DNS providers may require you to enter the full domain name.\n`
      zoneContent += `; If so, use '_amazonses.${rootDomain}' instead of just '_amazonses'\n`
      zoneContent += `; \n`
      zoneContent += `$ORIGIN ${rootDomain}.\n`
    }
    
    zoneContent += `$TTL 3600\n\n`
    
    // Group records by type
    const txtRecords = records.filter(r => r.type === 'TXT')
    const mxRecords = records.filter(r => r.type === 'MX')
    
    // TXT Records
    if (txtRecords.length > 0) {
      zoneContent += `; TXT Records\n`
      txtRecords.forEach(record => {
        const recordName = extractRecordName(record.name, domain)
        const name = absolute 
          ? (recordName === '@' ? rootDomain : record.name)
          : (recordName === '@' ? '@' : recordName)
        zoneContent += `${name}\t\t3600\tTXT\t"${record.value}"\n`
      })
      zoneContent += `\n`
    }
    
    // MX Records
    if (mxRecords.length > 0) {
      zoneContent += `; MX Records\n`
      mxRecords.forEach(record => {
        const recordName = extractRecordName(record.name, domain)
        const name = absolute 
          ? (recordName === '@' ? rootDomain : record.name)
          : (recordName === '@' ? '@' : recordName)
        const [priority, mailServer] = record.value.split(' ')
        zoneContent += `${name}\t\t3600\tMX\t${priority}\t${mailServer}\n`
      })
      zoneContent += `\n`
    }
    
    return zoneContent
  }

  const handleResendImport = async () => {
    if (!resendApiKey.trim()) {
      toast.error("Please enter your Resend API key")
      return
    }

    if (!resendApiKey.startsWith('re_')) {
      toast.error("Invalid Resend API key format. It should start with 're_'")
      return
    }

    setIsImporting(true)
    setError("")

    try {
      // Fetch domains from Resend API via our server endpoint
      const response = await fetch('/api/resend/domains', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          apiKey: resendApiKey
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch domains from Resend')
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch domains from Resend')
      }

      if (data.domains && data.domains.length > 0) {
        toast.success(`Found ${data.domains.length} domain(s) in your Resend account`)

        // Set up domains for selection
        setResendDomains(data.domains)
        setSelectedDomains(new Set()) // Start with no domains selected

        // Show domain selection screen
        setShowDomainSelection(true)

        console.log('Resend domains:', data.domains)
      } else {
        toast.info("No domains found in your Resend account")
      }

      // Clear the API key for security
      setResendApiKey("")

    } catch (err) {
      console.error('Error importing from Resend:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to import domains from Resend. Please check your API key.')
    } finally {
      setIsImporting(false)
    }
  }

  const handleSelectAll = () => {
    const allDomainNames = new Set(resendDomains.map(domain => domain.name))
    setSelectedDomains(allDomainNames)
  }

  const handleSelectNone = () => {
    setSelectedDomains(new Set())
  }

  const handleDomainToggle = (domainName: string) => {
    const newSelected = new Set(selectedDomains)
    if (newSelected.has(domainName)) {
      newSelected.delete(domainName)
    } else {
      newSelected.add(domainName)
    }
    setSelectedDomains(newSelected)
  }

  const startBulkImport = () => {
    if (selectedDomains.size === 0) {
      toast.error("Please select at least one domain to import")
      return
    }

    // Initialize progress tracking for selected domains only
    const initialProgress: { [key: string]: { status: 'pending', message?: string } } = {}
    selectedDomains.forEach((domainName) => {
      initialProgress[domainName] = { status: 'pending' }
    })
    setImportProgress(initialProgress)

    // Show bulk import screen and start processing
    setShowDomainSelection(false)
    setShowBulkImport(true)
    processBulkImport()
  }

  const processBulkImport = async () => {
    setIsProcessing(true)

    // Only process selected domains
    const selectedDomainObjects = resendDomains.filter(domain => selectedDomains.has(domain.name))

    for (const domain of selectedDomainObjects) {
      const domainName = domain.name

      // Update status to processing
      setImportProgress(prev => ({
        ...prev,
        [domainName]: { status: 'processing', message: 'Adding domain...' }
      }))

      try {
        // Use v2 API to add domain
        const addResponse = await fetch('/api/v2/domains', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain: domainName
          })
        })

        const addResult = await addResponse.json()

        if (addResponse.ok) {
          const successResult = addResult as PostDomainsResponse
          setImportProgress(prev => ({
            ...prev,
            [domainName]: {
              status: 'success',
              message: `Successfully added. Status: ${successResult.status}`,
              domainId: successResult.id
            }
          }))
        } else {
          // Handle specific error cases
          let errorMessage = addResult.error || 'Failed to add domain'

          if (addResponse.status === 409) {
            setImportProgress(prev => ({
              ...prev,
              [domainName]: {
                status: 'exists',
                message: 'Domain already exists in your account'
              }
            }))
          } else if (addResponse.status === 403) {
            setImportProgress(prev => ({
              ...prev,
              [domainName]: {
                status: 'failed',
                message: 'Domain limit reached. Please upgrade your plan to add more domains.'
              }
            }))
            // Stop processing if limit reached
            break
          } else if (addResponse.status === 400 && errorMessage.includes('conflicting DNS records')) {
            setImportProgress(prev => ({
              ...prev,
              [domainName]: {
                status: 'failed',
                message: 'Domain cannot be used. May have conflicting DNS records or MX records already configured.'
              }
            }))
          } else {
            setImportProgress(prev => ({
              ...prev,
              [domainName]: {
                status: 'failed',
                message: errorMessage
              }
            }))
          }
        }

      } catch (err) {
        console.error(`Error processing domain ${domainName}:`, err)
        setImportProgress(prev => ({
          ...prev,
          [domainName]: {
            status: 'failed',
            message: 'Network error occurred while adding domain'
          }
        }))
      }

      // Small delay between requests to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    setIsProcessing(false)

    // Show completion summary
    const results = Object.values(importProgress)
    const successful = results.filter(r => r.status === 'success').length
    const existing = results.filter(r => r.status === 'exists').length
    const failed = results.filter(r => r.status === 'failed').length

    toast.success(`Import completed: ${successful} added, ${existing} already existed, ${failed} failed`)
  }

  const extractRecordName = (recordName: string, domainName: string) => {
    // Extract root domain from domainName (get last 2 parts: domain.tld)
    const domainParts = domainName.split('.')
    const rootDomain = domainParts.slice(-2).join('.')

    // If the record name is exactly the root domain, return "@"
    if (recordName === rootDomain) {
      return "@"
    }

    // If the record name ends with the root domain, extract the subdomain part
    if (recordName.endsWith(`.${rootDomain}`)) {
      return recordName.replace(`.${rootDomain}`, '')
    }

    // Fallback: if no match found, return the original record name
    return recordName
  }

  const isStepCompleted = (index: number) => index < currentStepIdx
  const isStepCurrent = (index: number) => index === currentStepIdx
  const isStepFuture = (index: number) => index > currentStepIdx

  return (
    <div className="flex flex-col">
      <div className="w-full max-w-4xl px-2  mx-auto">
        <header className="mb-8 flex items-center space-x-4">
          {/* <div className="rounded-lg bg-iconBg">
            <Image src="/domain-icon.png" alt="Logo" width={48} height={48} className="p-2" />
          </div> */}
          {/* <div>
            <h1 className="text-3xl font-semibold text-darkText">Add Domain</h1>
            <p className="text-base text-mediumText">Use a domain you own to send emails.</p>
          </div> */}
        </header>

        {/* Top Horizontal Stepper */}
        <div className="w-full mb-8">
          <nav className="flex items-center justify-center">
            {stepsConfig.map((step, index) => {
              const completed = isStepCompleted(index)
              const current = isStepCurrent(index)
              const future = isStepFuture(index)

              // Determine which icon to use based on step and state
              let iconSrc = ""
              if (index === 0) {
                iconSrc = "/domain-icon.png"
              } else if (index === 1) {
                iconSrc = completed || current ? "/dns-icon.png" : "/dns-icon-greyed.png"
              } else if (index === 2) {
                iconSrc = completed || current ? "/verified-icon.png" : "/verified-icon-greyed.png"
              }

              return (
                <div key={step.id} className="flex items-center">
                  <motion.div
                    className="flex h-10 w-10 items-center justify-center"
                    initial={{ scale: current ? 1.1 : 1 }}
                    animate={{ scale: current ? 1.1 : 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Image
                      src={iconSrc}
                      alt={step.name}
                      width={40}
                      height={40}
                      className="object-contain"
                    />
                  </motion.div>
                  {/* Arrow between steps */}
                  {index < stepsConfig.length - 1 && (
                    <div className="mx-8">
                      <ArrowBoldRight
                        className={cn("h-5 w-5 transition-colors duration-300", {
                          "text-brandPurple": completed,
                          "text-gray-400": !completed,
                        })}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </nav>
        </div>

        {/* Main Content Area */}
        <div className="w-full max-w-2xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStepIdx}
              variants={stepVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.3, type: "tween" }}
              className="pt-1"
            >
              {currentStepIdx > 0 && (
                <div className="mb-10 rounded-lg bg-accent/20 p-5 border border-accent">
                  <div className="flex items-center mb-1">
                    <h2 className="text-lg font-semibold text-foreground">{stepsConfig[0].name}</h2>
                    <CircleCheck width="18" height="18" className="ml-2 text-green-600" />
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{stepsConfig[0].description}</p>
                  <div className="flex items-center rounded-md border border-border bg-card px-3 py-2 shadow-sm">
                    {/* <Image src="/domain-icon.png" alt="Logo" width={16} height={16} /> */}
                    <span className="font-mono text-sm text-foreground">{domainName}</span>
                  </div>
                </div>
              )}

              {showDomainSelection && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Select Domains to Import</h2>
                      <p className="text-sm text-muted-foreground">
                        Choose which domains from your Resend account to import into Inbound
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setShowDomainSelection(false)
                        setResendDomains([])
                        setSelectedDomains(new Set())
                      }}
                    >
                      Cancel
                    </Button>
                  </div>

                  {/* Selection Controls */}
                  <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleSelectAll}
                      >
                        Select All
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleSelectNone}
                      >
                        Select None
                      </Button>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {selectedDomains.size} of {resendDomains.length} domains selected
                    </div>
                  </div>

                  {/* Domains Table */}
                  <div className="border border-border rounded-lg overflow-hidden">
                    {/* Table Header */}
                    <div className="bg-muted/30 border-b border-border">
                      <div className="flex items-center text-sm font-medium text-muted-foreground px-4 py-3">
                        <div className="w-12"></div>
                        <div className="flex-1">Domain</div>
                        <div className="w-24">Status</div>
                        <div className="w-32">Created</div>
                      </div>
                    </div>

                    {/* Table Body */}
                    <div className="bg-card">
                        {resendDomains.map((domain, index) => (
                            <div
                              key={domain.id}
                              className={cn(
                                "flex items-center px-4 py-3 hover:bg-muted/50 cursor-pointer",
                                {
                                  "border-b border-border/50": index < resendDomains.length - 1,
                                  "bg-accent/20": selectedDomains.has(domain.name)
                                }
                              )}
                              onClick={() => handleDomainToggle(domain.name)}
                            >
                              <div className="w-12">
                                <Checkbox
                                  checked={selectedDomains.has(domain.name)}
                                  onCheckedChange={() => handleDomainToggle(domain.name)}
                                />
                              </div>
                              <div className="flex-1">
                                <div className="font-mono text-sm font-medium">{domain.name}</div>
                                {domain.region && (
                                  <div className="text-xs text-muted-foreground">Region: {domain.region}</div>
                                )}
                              </div>
                              <div className="w-24">
                                <span className={cn(
                                  "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium",
                                  {
                                    "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400": domain.status === 'verified',
                                    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400": domain.status === 'pending',
                                    "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400": domain.status === 'failed',
                                    "bg-muted text-muted-foreground": !domain.status
                                  }
                                )}>
                                  {domain.status || 'unknown'}
                                </span>
                              </div>
                              <div className="w-32 text-sm text-muted-foreground">
                                {domain.created_at ? new Date(domain.created_at).toLocaleDateString() : 'N/A'}
                              </div>
                            </div>
                        ))}
                    </div>
                  </div>

                  {/* Import Button */}
                  <div className="flex justify-end">
                    <Button
                      onClick={startBulkImport}
                      variant="primary"
                      disabled={selectedDomains.size === 0}
                      className="min-w-32"
                    >
                      Import {selectedDomains.size} Domain{selectedDomains.size !== 1 ? 's' : ''}
                    </Button>
                  </div>
                </div>
              )}

              {showBulkImport && (
                                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-foreground">Import Domains from Resend</h2>
                        <p className="text-sm text-muted-foreground">
                          Processing {selectedDomains.size} selected domain(s) from your Resend account
                        </p>
                      </div>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setShowBulkImport(false)
                        setShowDomainSelection(true)
                      }}
                      disabled={isProcessing}
                    >
                      Cancel
                    </Button>
                  </div>

                  {/* Domain Processing List */}
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {resendDomains.filter(domain => selectedDomains.has(domain.name)).map((domain, index) => {
                      const progress = importProgress[domain.name]
                      const status = progress?.status || 'pending'

                      return (
                        <div
                          key={domain.name}
                          className={cn(
                            "flex items-center justify-between p-4 rounded-lg border",
                            {
                              "bg-muted/50 border-border": status === 'pending',
                              "bg-blue-500/10 border-blue-500/20 dark:bg-blue-500/5": status === 'processing',
                              "bg-green-500/10 border-green-500/20 dark:bg-green-500/5": status === 'success',
                              "bg-yellow-500/10 border-yellow-500/20 dark:bg-yellow-500/5": status === 'exists',
                              "bg-destructive/10 border-destructive/20 dark:bg-destructive/5": status === 'failed',
                            }
                          )}
                        >
                                                      <div className="flex items-center gap-3">
                              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-background border">
                                {status === 'pending' && (
                                  <span className="text-sm font-medium text-muted-foreground">{index + 1}</span>
                                )}
                                {status === 'processing' && (
                                  <Loader width="16" height="16" className="animate-spin text-blue-600" />
                                )}
                                {status === 'success' && (
                                  <CircleCheck width="16" height="16" className="text-green-600" />
                                )}
                                {status === 'exists' && (
                                  <CircleCheck width="16" height="16" className="text-yellow-600" />
                                )}
                                {status === 'failed' && (
                                  <CircleWarning2 width="16" height="16" className="text-destructive" />
                                )}
                              </div>
                              <div>
                                <div className="font-mono text-sm font-medium">{domain.name}</div>
                                {domain.status && (
                                  <div className="text-xs text-muted-foreground">
                                    Resend Status: {domain.status}
                                  </div>
                                )}
                              </div>
                            </div>

                                                      <div className="text-right">
                              <div className={cn(
                                "text-sm font-medium",
                                {
                                  "text-muted-foreground": status === 'pending',
                                  "text-blue-600": status === 'processing',
                                  "text-green-600": status === 'success',
                                  "text-yellow-600": status === 'exists',
                                  "text-destructive": status === 'failed',
                                }
                              )}>
                                {status === 'pending' && 'Waiting...'}
                                {status === 'processing' && 'Processing...'}
                                {status === 'success' && 'Added Successfully'}
                                {status === 'exists' && 'Already Exists'}
                                {status === 'failed' && 'Failed'}
                              </div>
                              {progress?.message && (
                                <div className="text-xs text-muted-foreground mt-1 max-w-xs">
                                  {progress.message}
                                </div>
                              )}
                            </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    {!isProcessing && Object.keys(importProgress).length === 0 && (
                      <Button
                        onClick={processBulkImport}
                        variant="primary"
                        className="flex-1"
                      >
                        Start Import
                      </Button>
                    )}

                    {isProcessing && (
                      <Button
                        variant="primary"
                        className="flex-1"
                        disabled
                      >
                        <Loader width="16" height="16" className="mr-2 animate-spin" />
                        Processing Domains...
                      </Button>
                    )}

                    {!isProcessing && Object.keys(importProgress).length > 0 && (
                      <>
                        <Button
                          onClick={() => router.push('/emails')}
                          variant="primary"
                          className="flex-1"
                        >
                          View All Domains
                        </Button>
                        <Button
                          onClick={() => {
                            setShowBulkImport(false)
                            setShowDomainSelection(false)
                            setResendDomains([])
                            setSelectedDomains(new Set())
                            setImportProgress({})
                          }}
                          variant="secondary"
                        >
                          Import More
                        </Button>
                      </>
                    )}
                  </div>

                                      {/* Summary Stats */}
                    {Object.keys(importProgress).length > 0 && (
                      <div className="grid grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
                        <div className="text-center">
                          <div className="text-lg font-semibold text-green-600">
                            {Object.values(importProgress).filter(p => p.status === 'success').length}
                          </div>
                          <div className="text-xs text-muted-foreground">Added</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-semibold text-yellow-600">
                            {Object.values(importProgress).filter(p => p.status === 'exists').length}
                          </div>
                          <div className="text-xs text-muted-foreground">Existing</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-semibold text-destructive">
                            {Object.values(importProgress).filter(p => p.status === 'failed').length}
                          </div>
                          <div className="text-xs text-muted-foreground">Failed</div>
                        </div>
                        <div className="text-center">
                          <div className="text-lg font-semibold text-muted-foreground">
                            {Object.values(importProgress).filter(p => p.status === 'pending').length}
                          </div>
                          <div className="text-xs text-muted-foreground">Pending</div>
                        </div>
                      </div>
                    )}
                </div>
              )}

              {!showDomainSelection && !showBulkImport && currentStepIdx === 0 && (
                <div className="">
                  <h2 className="mb-1 text-lg font-semibold text-foreground">{stepsConfig[0].name}</h2>
                  <p className="mb-5 text-sm text-muted-foreground">{stepsConfig[0].description}</p>
                  <form onSubmit={handleSubmitDomain}>
                    <label htmlFor="domainName" className="mb-1.5 block text-sm font-medium text-foreground">
                      Name
                    </label>
                    <Input
                      id="domainName"
                      type="text"
                      value={domainName}
                      onChange={(e) => {
                        setDomainName(e.target.value)
                        if (error) setError("")
                      }}
                      placeholder="0.email"
                      className="mb-2 w-full font-mono text-sm"
                      aria-label="Domain Name"
                      disabled={isLoading || !!preloadedDomain} // Disable if preloaded
                    />
                    {error && <p className="mb-4 text-sm text-destructive">{error}</p>}
                    
                    <Button type="submit" variant="primary" className="mt-4 w-full md:w-auto" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader width="16" height="16" className="mr-2 animate-spin" />
                          Adding Domain...
                        </>
                      ) : (
                        <>
                          Add Domain <ArrowBoldRight width="16" height="16" className="ml-1.5" />
                        </>
                      )}
                    </Button>
                  </form>

                  {/* Import from Resend Section */}
                  <div className="mt-8 rounded-lg border border-border bg-card p-6">
                    <div className="flex items-center gap-3 mb-4">

                      <h3 className="text-lg font-semibold text-foreground">Import from</h3>
                      <ResendIcon variant="black" className="h-12 w-16 -ml-1 dark:invert" />
                    </div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Already have domains in Resend? Paste your API key to import them for bulk processing.
                    </p>
                    <div className="space-y-3">
                      <Input
                        type="password"
                        value={resendApiKey}
                        onChange={(e) => setResendApiKey(e.target.value)}
                        placeholder="Paste your Resend API key (re_...)"
                        className="bg-transparent border-input"
                        disabled={isImporting}
                      />
                      <Button
                        variant="secondary"
                        className="w-full"
                        onClick={handleResendImport}
                        disabled={isImporting || !resendApiKey.trim()}
                      >
                        {isImporting ? (
                          <>
                            <Loader width="16" height="16" className="mr-2 animate-spin" />
                            Importing...
                          </>
                        ) : (
                          "Import Domains"
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-3">
                      Your API key is not stored and only used to fetch your domains.
                    </p>
                  </div>
                </div>
              )}

              {!showDomainSelection && !showBulkImport && currentStepIdx === 1 && (
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <h2 className="text-lg font-semibold text-foreground">{stepsConfig[1].name}</h2>
                        {preloadedProvider && (
                            <div className="flex items-center gap-2">
                                {getProviderDocUrl(preloadedProvider) ? (
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => window.open(getProviderDocUrl(preloadedProvider)!, '_blank')}
                                        className="flex items-center gap-2 text-sm border"
                                    >
                                        <Globe2 width="16" height="16" />
                                        <span>{preloadedProvider} Setup Guide</span>
                                        <ExternalLink2 width="12" height="12" />
                                    </Button>
                                ) : (
                                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                        <Globe2 width="16" height="16" />
                                        <span>Provider: <span className="font-medium">{preloadedProvider}</span></span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <p className="mb-6 text-sm text-muted-foreground">{stepsConfig[1].description}</p>

                    {/* Verification Status Indicator */}
                    {verificationStatus && (
                        <div className={cn(
                            "mb-6 rounded-lg p-4 border",
                            {
                                "bg-yellow-500/10 border-yellow-500/20 dark:bg-yellow-500/5": verificationStatus === 'pending',
                                "bg-green-500/10 border-green-500/20 dark:bg-green-500/5": verificationStatus === 'verified',
                                "bg-destructive/10 border-destructive/20 dark:bg-destructive/5": verificationStatus === 'failed',
                            }
                        )}>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                    {verificationStatus === 'pending' && (
                                        <>
                                            <Clock2 width="16" height="16" className="text-yellow-600 mr-2" />
                                            <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                                                Verification Pending
                                            </span>
                                            {isRefreshing && (
                                                <Loader width="16" height="16" className="ml-2 animate-spin text-yellow-600" />
                                            )}
                                        </>
                                    )}
                                    {verificationStatus === 'verified' && (
                                        <>
                                            <CircleCheck width="16" height="16" className="text-green-600 mr-2" />
                                            <span className="text-sm font-medium text-green-700 dark:text-green-400">
                                                Domain Verified
                                            </span>
                                        </>
                                    )}
                                    {verificationStatus === 'failed' && (
                                        <>
                                            <CircleWarning2 width="16" height="16" className="text-destructive mr-2" />
                                            <span className="text-sm font-medium text-destructive">
                                                Verification Failed
                                            </span>
                                        </>
                                    )}
                                </div>
                                
                                {/* Periodic Check Indicator */}
                                {periodicCheckEnabled && verificationStatus === 'pending' && (
                                    <div className="flex items-center text-xs text-yellow-600 dark:text-yellow-400">
                                        <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2 animate-pulse"></div>
                                        <span>Auto-checking every 5s</span>
                                    </div>
                                )}
                            </div>
                            
                            <p className="text-xs text-muted-foreground mt-1">
                                {verificationStatus === 'pending' && !periodicCheckEnabled && "DNS records are being verified. This may take a few hours."}
                                {verificationStatus === 'pending' && periodicCheckEnabled && "We're automatically checking your domain verification status. You'll be redirected once it's verified."}
                                {verificationStatus === 'verified' && "Your domain has been successfully verified and is ready to use."}
                                {verificationStatus === 'failed' && "Please check your DNS records and try again."}
                            </p>
                        </div>
                    )}

                    {/* Verification Status Summary */}
                    {dnsRecords.length > 0 && (
                        <div className="mb-4">
                            {(() => {
                                const verifiedCount = dnsRecords.filter(r => r.isVerified).length
                                const totalCount = dnsRecords.length
                                const allVerified = verifiedCount === totalCount
                                
                                return (
                                    <div className={cn(
                                        "rounded-lg p-4 border",
                                        allVerified 
                                            ? "bg-green-500/10 border-green-500/20 dark:bg-green-500/5"
                                            : verifiedCount > 0 
                                                ? "bg-yellow-500/10 border-yellow-500/20 dark:bg-yellow-500/5"
                                                : "bg-muted/50 border-border"
                                    )}>
                                        <div className="flex items-center gap-2">
                                            {allVerified ? (
                                                <>
                                                    <CircleCheck width="20" height="20" className="text-green-600" />
                                                    <div>
                                                        <p className="font-medium text-green-700 dark:text-green-400">
                                                            All DNS records verified!
                                                        </p>
                                                        <p className="text-sm text-green-600 dark:text-green-500">
                                                            {verificationStatus === 'verified' 
                                                                ? "Domain is fully verified and ready to receive emails."
                                                                : "DNS records are configured correctly. Waiting for AWS SES verification to complete."}
                                                        </p>
                                                    </div>
                                                </>
                                            ) : verifiedCount > 0 ? (
                                                <>
                                                    <Clock2 width="20" height="20" className="text-yellow-600" />
                                                    <div>
                                                        <p className="font-medium text-yellow-700 dark:text-yellow-400">
                                                            Partial verification ({verifiedCount}/{totalCount} records verified)
                                                        </p>
                                                        <p className="text-sm text-yellow-600 dark:text-yellow-500">
                                                            {dnsRecords.filter(r => !r.isVerified).map(r => r.type).join(', ')} record{dnsRecords.filter(r => !r.isVerified).length > 1 ? 's' : ''} still need{dnsRecords.filter(r => !r.isVerified).length > 1 ? '' : 's'} to be configured.
                                                        </p>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <CircleWarning2 width="20" height="20" className="text-muted-foreground" />
                                                    <div>
                                                        <p className="font-medium text-foreground">
                                                            DNS records not yet verified
                                                        </p>
                                                        <p className="text-sm text-muted-foreground">
                                                            Please add the DNS records below to your domain provider. Verification may take a few minutes after adding the records.
                                                        </p>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )
                            })()}
                        </div>
                    )}

                    <div className="overflow-hidden border border-border rounded-lg">
                        {/* DNS Configuration Warning */}
                        {showDnsWarning && (
                            <div className="bg-yellow-500/10 border-b border-yellow-500/20 p-4">
                                <div className="flex items-start gap-2">
                                    <CircleWarning2 width="16" height="16" className="text-yellow-600 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1 text-sm">
                                        <p className="font-medium text-yellow-700 dark:text-yellow-400 mb-1">
                                            Important DNS Configuration Note
                                        </p>
                                        <p className="text-yellow-600 dark:text-yellow-500 mb-2">
                                            When adding MX records, use only the mail server hostname without your domain appended. 
                                            For example, use <span className="font-mono">inbound-smtp.us-east-2.amazonaws.com</span> 
                                            NOT <span className="font-mono">inbound-smtp.us-east-2.amazonaws.com.{domainName}</span>
                                        </p>
                                        <p className="text-yellow-600 dark:text-yellow-500 text-xs">
                                            Note: TXT records may take longer to propagate than MX records. If TXT verification fails, 
                                            please wait a few minutes and try refreshing again.
                                        </p>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowDnsWarning(false)}
                                        className="h-6 w-6 p-0 hover:bg-yellow-500/20 rounded text-yellow-600 hover:text-yellow-700 dark:hover:text-yellow-400"
                                        aria-label="Dismiss DNS configuration note"
                                    >
                                        <span className="text-base font-medium leading-none">×</span>
                                    </Button>
                                </div>
                            </div>
                        )}
                        
                        {/* Table Header */}
                        <div className="bg-muted/30 border-b border-border">
                            <div className="flex text-sm font-medium text-muted-foreground px-4 py-3">
                                <span className="w-[25%]">Record name</span>
                                <span className="w-[15%]">Type</span>
                                <span className="w-[10%]">TTL</span>
                                <span className="w-[30%]">Value</span>
                                <span className="w-[15%] text-right">Priority</span>
                            </div>
                        </div>

                        {/* Table Body */}
                        <div className="bg-card">
                            {dnsRecords.map((record, idx) => (
                                <div key={`${record.type}-${idx}`} className={cn(
                                    "flex transition-colors px-4 py-3",
                                    {
                                        "bg-green-500/10 hover:bg-green-500/20 dark:bg-green-500/5 dark:hover:bg-green-500/10": record.isVerified,
                                        "bg-card hover:bg-muted/50": !record.isVerified,
                                        "border-b border-border/50": idx < dnsRecords.length - 1
                                    }
                                )}>
                                    <div className="w-[25%] pr-4">
                                        <div className="flex items-center justify-between">
                                            <span className="font-mono text-sm truncate">
                                                {extractRecordName(record.name, domainName)}
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => copyToClipboard(extractRecordName(record.name, domainName))}
                                                className="h-8 w-8 p-0 hover:bg-muted border border-border rounded flex-shrink-0 ml-2"
                                            >
                                                <Clipboard2 width="16" height="16" className="text-muted-foreground" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="w-[15%] pr-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm">{record.type}</span>
                                                {record.isVerified && (
                                                    <CircleCheck width="16" height="16" className="text-green-600" />
                                                )}
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => copyToClipboard(record.type)}
                                                className="h-8 w-8 p-0 hover:bg-muted border border-border rounded flex-shrink-0 ml-2"
                                            >
                                                <Clipboard2 width="16" height="16" className="text-muted-foreground" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="w-[10%] pr-4">
                                        <span className="text-sm">Auto</span>
                                    </div>
                                    <div className="w-[30%]">
                                        <div className="flex items-center justify-between">
                                            <span className={cn(
                                                "font-mono text-sm truncate",
                                                record.isVerified ? "text-green-700 dark:text-green-400" : "opacity-50"
                                            )}>
                                                {record.type === "MX" ? (
                                                    <>
                                                        {record.value.split(" ")[1]}
                                                        {!record.isVerified && record.value.split(" ")[1].endsWith(`.${domainName}`) && (
                                                            <span className="text-destructive ml-1">(Remove .{domainName})</span>
                                                        )}
                                                    </>
                                                ) : (
                                                    record.value
                                                )}
                                            </span>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => copyToClipboard(record.type === "MX" ? record.value.split(" ")[1] : record.value)}
                                                className="h-8 w-8 p-0 hover:bg-muted border border-border rounded flex-shrink-0 ml-2"
                                            >
                                                <Clipboard2 width="16" height="16" className="text-muted-foreground" />
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="w-[15%] text-right ml-2">
                                        <div className="flex items-center justify-end">
                                            <span className={cn(
                                                "text-sm",
                                                record.isVerified && record.type === "MX" ? "text-green-700 dark:text-green-400" : ""
                                            )}>
                                                {record.type === "MX" ? record.value.split(" ")[0] : ""}
                                            </span>
                                            {record.type === "MX" && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => copyToClipboard(record.type === "MX" ? record.value.split(" ")[0] : "")}
                                                    className="h-8 w-8 p-0 hover:bg-muted border border-border rounded flex-shrink-0 ml-2"
                                                >
                                                    <Clipboard2 width="16" height="16" className="text-muted-foreground" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {dnsRecords.length === 0 && (
                                <div className="text-center py-8 text-muted-foreground">
                                    No DNS records available yet.
                                </div>
                            )}
                        </div>
                    </div>

                    {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

                    <div className="flex gap-3 mt-10">
                        <Button
                            onClick={() => downloadZoneFile()}
                            variant="secondary"
                            className="w-full md:w-auto"
                            disabled={!domainName || dnsRecords.length === 0}
                        >
                            <Download2 width="16" height="16" className="mr-2" />
                            Download Zone File
                        </Button>
                        <Button
                            onClick={() => downloadZoneFile(true)}
                            variant="secondary"
                            className="w-full md:w-auto"
                            disabled={!domainName || dnsRecords.length === 0}
                        >
                            <Download2 width="16" height="16" className="mr-2" />
                            Download Zone File (Absolute)
                        </Button>
                    </div>
                </div>
            )}

              {!showDomainSelection && !showBulkImport && currentStepIdx === 2 && (
                <div className="text-center py-8">
                  <BadgeCheck2 width="80" height="80" className="mx-auto mb-5 text-green-600" />
                  <h2 className="mb-2 text-2xl font-semibold text-foreground">Domain Verified!</h2>
                  <p className="text-muted-foreground mb-1">
                    Your domain <span className="font-semibold text-foreground">{domainName}</span> is now ready.
                  </p>
                  <p className="text-sm text-muted-foreground">{stepsConfig[2].description}</p>
                  <div className="flex gap-4 justify-center mt-10">
                    <Button
                      onClick={() => router.push('/emails')}
                      variant="primary"
                    >
                      View Domains
                    </Button>
                    <Button
                      onClick={() => {
                        setCurrentStepIdx(0)
                        setDomainName("")
                        setDnsRecords([])
                        setDomainId("")
                        setError("")
                      }}
                      variant="secondary"
                    >
                      Add Another Domain
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}

