"use client"

import type React from "react"

import { useState, useEffect, useMemo, type FormEvent } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Globe2, ListChecks, BadgeCheck, CheckCircle2, ArrowRight, ClipboardCopy, LoaderIcon, RefreshCw, Clock, AlertCircle, GlobeIcon, ExternalLinkIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { toast } from "sonner"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"

interface StepConfig {
  id: string
  name: string
  description?: string
  icon: React.ElementType
}

const stepsConfig: StepConfig[] = [
  { id: "01", name: "Domain", description: "Domain name for your sending.", icon: Globe2 },
  { id: "02", name: "DNS Records", description: "Add records to your DNS provider.", icon: ListChecks },
  { id: "03", name: "Verified", description: "Your domain is ready.", icon: BadgeCheck },
]

const stepVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
}

interface DnsRecord {
  name: string
  type: "TXT" | "MX"
  value: string
  isVerified: boolean
}

interface ApiResponse {
  success: boolean
  domain: string
  domainId: string
  verificationToken: string
  status: 'pending' | 'verified' | 'failed'
  dnsRecords: DnsRecord[]
  error?: string
}

interface AddDomainFormProps {
  // Optional props for preloading existing domain data
  preloadedDomain?: string
  preloadedDomainId?: string
  preloadedDnsRecords?: DnsRecord[]
  preloadedStep?: number
  preloadedProvider?: string
  onRefresh?: () => void
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
  const router = useRouter()

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
      }, 500) // 2 second delay

      return () => clearTimeout(timer)
    }
  }, [preloadedDomainId, preloadedDomain, preloadedStep])

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
      // First check if domain can be used
      const checkResponse = await fetch('/api/domain/verifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'canDomainBeUsed',
          domain: domainName
        })
      })

      const checkResult = await checkResponse.json()

      if (!checkResult.success) {
        setError(checkResult.error || 'Failed to check domain')
        return
      }

      if (!checkResult.canBeUsed) {
        setError('This domain cannot be used. It may have conflicting DNS records.')
        return
      }

      // If domain can be used, add it
      const addResponse = await fetch('/api/domain/verifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addDomain',
          domain: domainName
        })
      })

      const addResult: ApiResponse = await addResponse.json()

      if (!addResult.success) {
        setError(addResult.error || 'Failed to add domain')
        return
      }

      console.log("addResult", addResult)

      // Success - move to next step
      setDnsRecords(addResult.dnsRecords)
      setDomainId(addResult.domainId)
      setVerificationStatus(addResult.status)
      setCurrentStepIdx(1)

      // Call success callback if provided
      if (onSuccess) {
        onSuccess(addResult.domainId)
      }

    } catch (err) {
      console.error('Error adding domain:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRefresh = async () => {
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

    console.log("domainId", domainId)

    try {
      const response = await fetch('/api/domain/verifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'checkVerification',
          domain: domainName,
          domainId: domainId
        })
      })

      const result: ApiResponse = await response.json()

      console.log("result", result)

      if (!result.success) {
        setError(result.error || 'Failed to check verification status')
        toast.error("Failed to refresh status")
        return
      }

      // Update verification status
      setVerificationStatus(result.status)

      if (result.status === 'verified') {
        toast.success("Domain verified successfully!")
        setCurrentStepIdx(2)
      } else if (result.status === 'failed') {
        toast.error("Domain verification failed")
      } else {
        toast.info("Domain verification still pending")
      }

      // Update DNS records if provided
      if (result.dnsRecords) {
        setDnsRecords(result.dnsRecords)
      }

    } catch (err) {
      console.error('Error checking verification:', err)
      setError('An unexpected error occurred while checking verification status.')
      toast.error("Failed to refresh status")
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

  const extractRecordName = (recordName: string, domainName: string) => {
    // Extract root domain from domainName (get last 2 parts: domain.tld)
    const domainParts = domainName.split('.')
    const rootDomain = domainParts.slice(-2).join('.')
    
    // If the record name is exactly the root domain, return "*"
    if (recordName === rootDomain) {
      return "*"
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
    <div className="flex min-h-screen flex-col bg-background">
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
                      <ArrowRight
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
                <div className="mb-10 rounded-lg bg-green-50 p-5 border border-green-200">
                  <div className="flex items-center mb-1">
                    <h2 className="text-lg font-semibold text-gray-800">{stepsConfig[0].name}</h2>
                    <CheckCircle2 size={18} className="ml-2 text-green-600" />
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{stepsConfig[0].description}</p>
                  <div className="flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm">
                    {/* <Image src="/domain-icon.png" alt="Logo" width={16} height={16} /> */}
                    <span className="font-mono text-sm text-gray-700">{domainName}</span>
                  </div>
                </div>
              )}

              {currentStepIdx === 0 && (
                <div className="">
                  <h2 className="mb-1 text-lg font-semibold text-darkText">{stepsConfig[0].name}</h2>
                  <p className="mb-5 text-sm text-mediumText">{stepsConfig[0].description}</p>
                  <form onSubmit={handleSubmitDomain}>
                    <label htmlFor="domainName" className="mb-1.5 block text-sm font-medium text-darkText">
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
                    {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
                    <Button type="submit" variant="primary" className="mt-4 w-full md:w-auto" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
                          Adding Domain...
                        </>
                      ) : (
                        <>
                          Add Domain <ArrowRight size={16} className="ml-1.5" />
                        </>
                      )}
                    </Button>
                  </form>
                </div>
              )}

              {currentStepIdx === 1 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-lg font-semibold text-darkText">{stepsConfig[1].name}</h2>
                    {preloadedProvider && (
                      <div className="flex items-center gap-2">
                        {getProviderDocUrl(preloadedProvider) ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => window.open(getProviderDocUrl(preloadedProvider)!, '_blank')}
                            className="flex items-center gap-2 text-sm border"
                          >
                            <GlobeIcon className="h-4 w-4" />
                            <span>{preloadedProvider} Setup Guide</span>
                            <ExternalLinkIcon className="h-3 w-3" />
                          </Button>
                        ) : (
                          <div className="flex items-center gap-1 text-sm text-mediumText">
                            <GlobeIcon className="h-4 w-4" />
                            <span>Provider: <span className="font-medium">{preloadedProvider}</span></span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="mb-6 text-sm text-mediumText">{stepsConfig[1].description}</p>

                  {/* Provider Information Note */}
                  {/* {preloadedProvider && (
                    <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800">
                        <strong>Detected Provider:</strong> We've identified your domain is managed by {preloadedProvider}.
                        {getProviderDocUrl(preloadedProvider) ? (
                          <>
                            {' '}Follow our step-by-step guide above or add the DNS records below to your {preloadedProvider} control panel.
                          </>
                        ) : (
                          <>
                            {' '}Add the DNS records below to your {preloadedProvider} control panel or DNS management interface.
                          </>
                        )}
                      </p>
                    </div>
                  )} */}

                  {/* Verification Status Indicator */}
                  {verificationStatus && (
                    <div className={cn(
                      "mb-6 rounded-lg p-4 border",
                      {
                        "bg-yellow-50 border-yellow-200": verificationStatus === 'pending',
                        "bg-green-50 border-green-200": verificationStatus === 'verified',
                        "bg-red-50 border-red-200": verificationStatus === 'failed',
                      }
                    )}>
                      <div className="flex items-center">
                        {verificationStatus === 'pending' && (
                          <>
                            <Clock className="h-4 w-4 text-yellow-600 mr-2" />
                            <span className="text-sm font-medium text-yellow-800">
                              Verification Pending
                            </span>
                            {isRefreshing && (
                              <LoaderIcon className="ml-2 h-4 w-4 animate-spin text-yellow-600" />
                            )}
                          </>
                        )}
                        {verificationStatus === 'verified' && (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-green-600 mr-2" />
                            <span className="text-sm font-medium text-green-800">
                              Domain Verified
                            </span>
                          </>
                        )}
                        {verificationStatus === 'failed' && (
                          <>
                            <AlertCircle className="h-4 w-4 text-red-600 mr-2" />
                            <span className="text-sm font-medium text-red-800">
                              Verification Failed
                            </span>
                          </>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-1">
                        {verificationStatus === 'pending' && "DNS records are being verified. This may take a few minutes."}
                        {verificationStatus === 'verified' && "Your domain has been successfully verified and is ready to use."}
                        {verificationStatus === 'failed' && "Please check your DNS records and try again."}
                      </p>
                    </div>
                  )}

                  <div className="overflow-hidden border border-border rounded-lg">
                    {/* Table Header */}
                    <div className="bg-muted/30 border-b border-border">
                      <div className="flex text-sm font-medium text-muted-foreground px-4 py-3">
                        <span className="w-[25%]">Record name</span>
                        <span className="w-[25%]">Type</span>
                        <span className="w-[25%]">TTL</span>
                        <span className="w-[25%]">Value</span>
                      </div>
                    </div>

                    {/* Table Body */}
                    <div className="bg-white">
                      {dnsRecords.map((record, idx) => (
                        <div key={`${record.type}-${idx}`} className={cn(
                          "flex transition-colors px-4 py-3",
                          {
                            "bg-green-50 hover:bg-green-100": record.isVerified,
                            "bg-white hover:bg-muted/50": !record.isVerified,
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
                                className="h-8 w-8 p-0 hover:bg-gray-100 border border-gray-300 rounded flex-shrink-0 ml-2"
                              >
                                <ClipboardCopy size={16} className="text-gray-600" />
                              </Button>
                            </div>
                          </div>
                          <div className="w-[25%] pr-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{record.type}</span>
                                {record.isVerified && (
                                  <CheckCircle2 size={16} className="text-green-600" />
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(record.type)}
                                className="h-8 w-8 p-0 hover:bg-gray-100 border border-gray-300 rounded flex-shrink-0 ml-2"
                              >
                                <ClipboardCopy size={16} className="text-gray-600" />
                              </Button>
                            </div>
                          </div>
                          <div className="w-[25%] pr-4">
                            <span className="text-sm">Auto</span>
                          </div>
                          <div className="w-[25%]">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-sm truncate opacity-50">{record.value}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(record.value)}
                                className="h-8 w-8 p-0 hover:bg-gray-100 border border-gray-300 rounded flex-shrink-0 ml-2"
                              >
                                <ClipboardCopy size={16} className="text-gray-600" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {dnsRecords.length === 0 && (
                        <div className="text-center py-8 text-gray-500">
                          No DNS records available yet.
                        </div>
                      )}
                    </div>
                  </div>

                  {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

                  <Button
                    onClick={handleRefresh}
                    variant="primary"
                    className="mt-10 w-full md:w-auto"
                    disabled={isRefreshing}
                  >
                    <RefreshCw className={cn("mr-2 h-4 w-4", { "animate-spin": isRefreshing })} />
                    Refresh Status
                  </Button>
                </div>
              )}

              {currentStepIdx === 2 && (
                <div className="text-center py-8">
                  <BadgeCheck className="mx-auto mb-5 h-20 w-20 text-successGreen" />
                  <h2 className="mb-2 text-2xl font-semibold text-darkText">Domain Verified!</h2>
                  <p className="text-mediumText mb-1">
                    Your domain <span className="font-semibold text-darkText">{domainName}</span> is now ready.
                  </p>
                  <p className="text-sm text-mediumText">{stepsConfig[2].description}</p>
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
