"use client"

import type React from "react"

import { useState, type FormEvent } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Globe2, ListChecks, BadgeCheck, CheckCircle2, ArrowRight, ClipboardCopy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

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
  priority?: number
}

export default function AddDomainForm() {
  const [currentStepIdx, setCurrentStepIdx] = useState(0)
  const [domainName, setDomainName] = useState("")
  const [error, setError] = useState("")

  const dnsRecords: DnsRecord[] = domainName
    ? [
        {
          name: `_amazonses.${domainName}`,
          type: "TXT",
          value: "pM9+uA+xL0k4v5zT+wP8qR7sT9uV+wX8yZ0=",
        },
        {
          name: domainName,
          type: "MX",
          value: "10 feedback-smtp.us-east-1.amazonses.com",
        },
      ]
    : []

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

  const handleSubmitDomain = (e: FormEvent) => {
    e.preventDefault()
    handleNext()
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      alert("Copied to clipboard!") // Consider using a toast notification for better UX
    } catch (err) {
      console.error("Failed to copy text: ", err)
      alert("Failed to copy text.")
    }
  }

  const isStepCompleted = (index: number) => index < currentStepIdx
  const isStepCurrent = (index: number) => index === currentStepIdx
  const isStepFuture = (index: number) => index > currentStepIdx

  return (
    <div className="flex min-h-screen flex-col bg-background py-12">
      <div className="w-full max-w-4xl px-6 md:px-10 lg:px-16 mx-auto">
        <header className="mb-16 flex items-center space-x-4">
          <div className="rounded-lg bg-iconBg p-3">
            <Globe2 className="h-8 w-8 text-brandPurple" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold text-darkText">Add Domain</h1>
            <p className="text-base text-mediumText">Use a domain you own to send emails.</p>
          </div>
        </header>
        <div className="flex flex-col md:flex-row">
          {/* Sidebar Stepper */}
          <nav className="relative mb-10 md:mb-0 md:mr-20 md:w-1/4">
            <div className="absolute left-5 top-0 h-6 w-px bg-gradient-to-b from-transparent via-mediumBorder/20 to-mediumBorder/60" />
            {stepsConfig.map((step, index) => {
              const IconComponent = step.icon
              const completed = isStepCompleted(index)
              const current = isStepCurrent(index)
              const future = isStepFuture(index)

              return (
                <div key={step.id} className="relative flex items-start pb-24 last:pb-0">
                  {index < stepsConfig.length - 1 && (
                    <div
                      className={cn("absolute left-5 top-12 h-[calc(100%-3rem)] w-px transition-colors duration-300", {
                        "bg-brandPurple": completed && !current,
                        "bg-mediumBorder": current || future,
                      })}
                    />
                  )}
                  <div className="relative z-10 flex items-center space-x-3">
                    <motion.div
                      className={cn("flex h-10 w-10 items-center justify-center rounded-full", {
                        "bg-brandPurple/10": completed,
                        "bg-brandPurple": current,
                        "bg-gray-100 dark:bg-gray-800": future,
                      })}
                      initial={{ scale: current ? 1.1 : 1 }}
                      animate={{ scale: current ? 1.1 : 1 }}
                      transition={{ duration: 0.2 }}
                    >
                      <IconComponent
                        className={cn("h-5 w-5", {
                          "text-brandPurple": completed,
                          "text-white": current,
                          "text-mediumText": future,
                        })}
                      />
                    </motion.div>
                    <div className="flex items-center space-x-2">
                      <h3
                        className={cn("text-md font-medium transition-colors duration-300", {
                          "text-brandPurple": current,
                          "text-darkText": completed,
                          "text-mediumText": future,
                        })}
                      >
                        {step.name}
                      </h3>
                      {completed && !current && <CheckCircle2 className="h-5 w-5 text-brandPurple" />}
                    </div>
                  </div>
                </div>
              )
            })}
          </nav>

          {/* Main Content Area */}
          <main className="flex-1">
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
                      <Globe2 size={16} className="mr-2 text-gray-500" />
                      <span className="font-mono text-sm text-gray-700">{domainName}</span>
                    </div>
                  </div>
                )}

                {currentStepIdx === 0 && (
                  <div>
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
                        placeholder="yourdomain.com"
                        className="mb-2 w-full font-mono text-sm"
                        aria-label="Domain Name"
                      />
                      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
                      <Button type="submit" variant="primary" className="mt-4 w-full md:w-auto">
                        Add Domain <ArrowRight size={16} className="ml-1.5" />
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

                    <div className="space-y-8">
                      <div>
                        <h3 className="text-md font-semibold text-darkText mb-1">TXT Record</h3>
                        <p className="text-xs text-mediumText mb-4">For domain ownership verification.</p>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead className="rounded-md">
                              <tr className="bg-lightBg rounded-md">
                                <th className="whitespace-nowrap rounded-l-md px-4 py-2.5 text-left font-medium text-darkText">
                                  Name/Host
                                </th>
                                <th className="whitespace-nowrap rounded-r-md px-4 py-2.5 text-left font-medium text-darkText">
                                  Value/Points to
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-mediumBorder">
                              {dnsRecords
                                .filter((r) => r.type === "TXT")
                                .map((record, idx) => (
                                  <tr key={`txt-${idx}`}>
                                    <td className="px-4 py-3.5 font-mono text-darkText break-all">{record.name}</td>
                                    <td className="px-4 py-3.5 font-mono text-darkText break-all">
                                      <div className="flex items-center justify-between">
                                        <span>{record.value}</span>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => copyToClipboard(record.value)}
                                          className="text-xs text-brandPurple hover:text-brandPurple/80 flex items-center ml-4 shrink-0"
                                        >
                                          <ClipboardCopy size={14} className="mr-1" /> Copy
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              {dnsRecords.filter((r) => r.type === "TXT").length === 0 && (
                                <tr>
                                  <td colSpan={2} className="px-4 py-3.5 text-center text-mediumText">
                                    No TXT records for this domain yet.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-md font-semibold text-darkText mb-1">MX Record</h3>
                        <p className="text-xs text-mediumText mb-4">For receiving feedback and bounces.</p>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead className="rounded-md">
                              <tr className="bg-lightBg rounded-md">
                                <th className="whitespace-nowrap rounded-l-md px-4 py-2.5 text-left font-medium text-darkText">
                                  Name/Host
                                </th>
                                <th className="whitespace-nowrap rounded-r-md px-4 py-2.5 text-left font-medium text-darkText">
                                  Value/Points to
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-mediumBorder">
                              {dnsRecords
                                .filter((r) => r.type === "MX")
                                .map((record, idx) => (
                                  <tr key={`mx-${idx}`}>
                                    <td className="px-4 py-3.5 font-mono text-darkText break-all">{record.name}</td>
                                    <td className="px-4 py-3.5 font-mono text-darkText break-all">
                                      <div className="flex items-center justify-between">
                                        <span>{record.value}</span>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => copyToClipboard(record.value)}
                                          className="text-xs text-brandPurple hover:text-brandPurple/80 flex items-center ml-4 shrink-0"
                                        >
                                          <ClipboardCopy size={14} className="mr-1" /> Copy
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              {dnsRecords.filter((r) => r.type === "MX").length === 0 && (
                                <tr>
                                  <td colSpan={2} className="px-4 py-3.5 text-center text-mediumText">
                                    No MX records for this domain yet.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    <Button onClick={handleNext} variant="primary" className="mt-10 w-full md:w-auto">
                      I've added the records
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
                    <Button
                      onClick={() => {
                        setCurrentStepIdx(0)
                        setDomainName("")
                      }}
                      variant="secondary"
                      className="mt-10"
                    >
                      Add Another Domain
                    </Button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  )
}
