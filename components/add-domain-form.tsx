"use client"

import type React from "react"

import { useState, useEffect, type FormEvent } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Globe2, ListChecks, BadgeCheck, CheckCircle2, ArrowRight, ClipboardCopy, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { toast } from "sonner"

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
  onRefresh?: () => void
  // Optional callback when domain is successfully added/verified
  onSuccess?: (domainId: string) => void
}

export default function AddDomainForm({ 
  preloadedDomain = "",
  preloadedDomainId = "",
  preloadedDnsRecords = [],
  preloadedStep = 0,
  onRefresh,
  onSuccess
}: AddDomainFormProps) {
  const [currentStepIdx, setCurrentStepIdx] = useState(preloadedStep)
  const [domainName, setDomainName] = useState(preloadedDomain)
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>(preloadedDnsRecords)
  const [domainId, setDomainId] = useState(preloadedDomainId)
  const router = useRouter()

  // Update state when props change (for when component is reused with different data)
  useEffect(() => {
    setCurrentStepIdx(preloadedStep)
    setDomainName(preloadedDomain)
    setDnsRecords(preloadedDnsRecords)
    setDomainId(preloadedDomainId)
  }, [preloadedStep, preloadedDomain, preloadedDnsRecords, preloadedDomainId])

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

      // Success - move to next step
      setDnsRecords(addResult.dnsRecords)
      setDomainId(addResult.domainId)
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

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh()
    } else {
      // Default refresh behavior - just show a toast for now
      toast.info("Refresh functionality will be implemented soon")
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

  const isStepCompleted = (index: number) => index < currentStepIdx
  const isStepCurrent = (index: number) => index === currentStepIdx
  const isStepFuture = (index: number) => index > currentStepIdx

  return (
    <div className="flex min-h-screen flex-col bg-background py-12">
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
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
                  </div>
                  <p className="mb-6 text-sm text-mediumText">{stepsConfig[1].description}</p>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm border border-gray-200 rounded-lg">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-4 py-3 text-left font-medium text-gray-900 border-b border-gray-200">
                            Record name
                          </th>
                          <th className="px-4 py-3 text-left font-medium text-gray-900 border-b border-gray-200">
                            Type
                          </th>
                          <th className="px-4 py-3 text-left font-medium text-gray-900 border-b border-gray-200">
                            TTL
                          </th>
                          <th className="px-4 py-3 text-left font-medium text-gray-900 border-b border-gray-200">
                            Value
                          </th>
                          <th className="px-4 py-3 w-16 border-b border-gray-200"></th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {dnsRecords.map((record, idx) => (
                          <tr key={`${record.type}-${idx}`} className="border-b border-gray-100 last:border-b-0">
                            <td className="px-4 py-3 font-mono text-sm text-gray-900">
                              {record.name.replace(`.${domainName}`, '')}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {record.type}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              Auto
                            </td>
                            <td className="px-4 py-3 font-mono text-sm text-gray-900 max-w-xs truncate">
                              {record.value}
                            </td>
                            <td className="px-4 py-3">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(record.value)}
                                className="h-8 w-8 p-0 hover:bg-gray-100 border border-gray-300 rounded"
                              >
                                <ClipboardCopy size={16} className="text-gray-600" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {dnsRecords.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                              No DNS records available yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

                  <Button 
                    onClick={handleRefresh} 
                    variant="primary" 
                    className="mt-10 w-full md:w-auto"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Refreshing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh Status
                      </>
                    )}
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
