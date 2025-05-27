"use client"

import { useState, useEffect, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { FaCheck, FaExclamationTriangle, FaRedo, FaCopy, FaEnvelope, FaGlobe, FaCheckCircle, FaArrowLeft, FaChevronDown, FaChevronUp, FaCloud, FaAws } from "react-icons/fa"
import { checkDomainAction, checkSubdomainsAction, checkCustomSubdomainAction, checkDnsConfigurationAction } from "./actions"
import { type DnsCheckResult } from "@/lib/dns"
import { toast } from "sonner"

type FlowStep = "email" | "domain" | "dns" | "success"

interface SubdomainOption {
  subdomain: string
  canReceive: boolean
  checking?: boolean
}

export default function AddInboundPage() {
  const searchParams = useSearchParams()
  const [flowId] = useState(() => searchParams.get("id") || crypto.randomUUID())
  
  // Flow state
  const [currentStep, setCurrentStep] = useState<FlowStep>("email")
  const [email, setEmail] = useState("")
  const [domain, setDomain] = useState("")
  const [selectedDomain, setSelectedDomain] = useState("")
  const [customSubdomain, setCustomSubdomain] = useState("")
  const [selectedSubdomain, setSelectedSubdomain] = useState("")
  
  // DNS checking state
  const [domainCheckResult, setDomainCheckResult] = useState<DnsCheckResult | null>(null)
  const [selectedDomainCheckResult, setSelectedDomainCheckResult] = useState<DnsCheckResult | null>(null)
  const [subdomainOptions, setSubdomainOptions] = useState<SubdomainOption[]>([])
  const [checkingDomain, setCheckingDomain] = useState(false)
  const [checkingCustom, setCheckingCustom] = useState(false)
  const [dnsConfigured, setDnsConfigured] = useState(false)
  const [checkingDnsConfig, setCheckingDnsConfig] = useState(false)
  const [showAllMxRecords, setShowAllMxRecords] = useState(false)

  // Extract domain from email
  useEffect(() => {
    if (email.includes("@")) {
      const emailDomain = email.split("@")[1]
      setDomain(emailDomain)
    }
  }, [email])

  // Check domain when it changes
  useEffect(() => {
    if (domain && currentStep === "domain") {
      checkMainDomain()
    }
  }, [domain, currentStep])

  const checkMainDomain = async () => {
    if (!domain) return
    
    setCheckingDomain(true)
    try {
      const result = await checkDomainAction(domain)
      setDomainCheckResult(result)
      
      if (!result.canReceiveEmails) {
        // Check subdomains
        await checkSubdomains()
      }
    } catch (error) {
      console.error("Error checking domain:", error)
    } finally {
      setCheckingDomain(false)
    }
  }

  const checkSubdomains = async () => {
    const subdomains = ["add", "in", "inbound", "new", "mail", "m"]
    const options: SubdomainOption[] = []
    
    try {
      const results = await checkSubdomainsAction(domain, subdomains)
      
      for (let i = 0; i < results.length && options.length < 3; i++) {
        const result = results[i]
        if (result.canReceiveEmails) {
          const subdomain = subdomains[i]
          options.push({ subdomain, canReceive: true })
        }
      }
    } catch (error) {
      console.error("Error checking subdomains:", error)
    }
    
    setSubdomainOptions(options)
  }

  const handleEmailSubmit = () => {
    if (email && email.includes("@")) {
      setCurrentStep("domain")
    }
  }

  // Keyboard event handlers
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      
      if (currentStep === "email" && email && email.includes("@")) {
        handleEmailSubmit()
      } else if (currentStep === "domain" && domainCheckResult) {
        if (domainCheckResult.canReceiveEmails) {
          handleDomainSelection(domain)
        } else if (selectedSubdomain) {
          handleSubdomainNext()
        }
      } else if (currentStep === "dns" && !checkingDnsConfig) {
        handleDnsCheck()
      }
    }
  }, [currentStep, email, domain, domainCheckResult, selectedSubdomain, checkingDnsConfig])

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  const handleDomainSelection = async (selectedDomain: string) => {
    setSelectedDomain(selectedDomain)
    
    // If selecting the main domain, use its check result
    if (selectedDomain === domain && domainCheckResult) {
      setSelectedDomainCheckResult(domainCheckResult)
    } else {
      // For subdomains, we need to get provider info from the main domain
      // since subdomains typically use the same DNS provider
      if (domainCheckResult?.provider) {
        setSelectedDomainCheckResult({
          ...domainCheckResult,
          domain: selectedDomain,
          canReceiveEmails: true, // We know this is true since we're proceeding
          hasMxRecords: false
        })
      }
    }
    
    setCurrentStep("dns")
  }

  const handleSubdomainSelection = (subdomain: string) => {
    setSelectedSubdomain(subdomain)
  }

  const handleSubdomainNext = () => {
    if (selectedSubdomain) {
      setSelectedDomain(selectedSubdomain)
      
      // For subdomains, use provider info from the main domain check
      if (domainCheckResult?.provider) {
        setSelectedDomainCheckResult({
          ...domainCheckResult,
          domain: selectedSubdomain,
          canReceiveEmails: true, // We know this is true since we're proceeding
          hasMxRecords: false
        })
      }
      
      setCurrentStep("dns")
    }
  }

  const handleCustomSubdomainCheck = async () => {
    if (!customSubdomain) return
    
    setCheckingCustom(true)
    try {
      const result = await checkCustomSubdomainAction(domain, customSubdomain)
      
      if (result.canReceiveEmails) {
        setSelectedSubdomain(`${customSubdomain}.${domain}`)
      } else {
        alert("This subdomain cannot receive emails. Please try another one.")
      }
    } catch (error) {
      console.error("Error checking custom subdomain:", error)
      alert("Error checking subdomain. Please try again.")
    } finally {
      setCheckingCustom(false)
    }
  }

  const handleDnsCheck = async () => {
    setCheckingDnsConfig(true)
    try {
      const result = await checkDnsConfigurationAction(selectedDomain)
      setDnsConfigured(result.configured)
      
      if (result.configured) {
        setTimeout(() => setCurrentStep("success"), 1000)
      } else if (result.error) {
        console.error("DNS check error:", result.error)
      }
    } catch (error) {
      console.error("Error checking DNS configuration:", error)
    } finally {
      setCheckingDnsConfig(false)
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`Copied "${text}" to clipboard`)
    } catch (error) {
      toast.error("Failed to copy to clipboard")
    }
  }

  const getProviderIcon = (iconName: string) => {
    switch (iconName) {
      case 'cloudflare':
        return <FaCloud className="w-4 h-4 text-orange-500" />
      case 'aws':
        return <FaAws className="w-4 h-4 text-orange-600" />
      case 'google':
        return <FaGlobe className="w-4 h-4 text-blue-600" />
      case 'vercel':
        return <div className="w-4 h-4 bg-black rounded-sm flex items-center justify-center">
          <div className="w-2 h-2 bg-white" style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}></div>
        </div>
      default:
        return <FaGlobe className="w-4 h-4 text-blue-600" />
    }
  }

  const mxRecord = `${selectedDomain} MX 10 inbound.exon.dev`
  const instructions = `Please add the following MX record to your DNS configuration:

Record Type: MX
Name: ${selectedDomain}
Priority: 10
Value: inbound.exon.dev

If you're using a DNS provider like Cloudflare, Route53, or Namecheap:
1. Log into your DNS management console
2. Navigate to DNS records
3. Add a new MX record with the above values
4. Save the changes (may take up to 24 hours to propagate)`

  const goBackStep = () => {
    if (currentStep === "domain") {
      setCurrentStep("email")
    } else if (currentStep === "dns") {
      setCurrentStep("domain")
    } else if (currentStep === "success") {
      setCurrentStep("dns")
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 max-w-4xl mx-auto">
      {/* Progress Indicator */}
      <div className="flex items-center gap-4 mb-6">
        <div className={`flex items-center gap-2 ${currentStep === "email" ? "text-primary" : ["domain", "dns", "success"].includes(currentStep) ? "text-green-600" : "text-muted-foreground"}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${currentStep === "email" ? "border-primary bg-primary/10" : ["domain", "dns", "success"].includes(currentStep) ? "border-green-600 bg-green-600 text-white" : "border-muted"}`}>
            {currentStep !== "email" ? <FaCheck className="w-4 h-4" /> : "1"}
          </div>
          <span className="font-medium">Email Address</span>
        </div>
        
        <Separator orientation="horizontal" className="flex-1" />
        
        <div className={`flex items-center gap-2 ${currentStep === "domain" ? "text-primary" : ["dns", "success"].includes(currentStep) ? "text-green-600" : "text-muted-foreground"}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${currentStep === "domain" ? "border-primary bg-primary/10" : ["dns", "success"].includes(currentStep) ? "border-green-600 bg-green-600 text-white" : "border-muted"}`}>
            {["dns", "success"].includes(currentStep) ? <FaCheck className="w-4 h-4" /> : "2"}
          </div>
          <span className="font-medium">Domain Setup</span>
        </div>
        
        <Separator orientation="horizontal" className="flex-1" />
        
        <div className={`flex items-center gap-2 ${currentStep === "dns" ? "text-primary" : currentStep === "success" ? "text-green-600" : "text-muted-foreground"}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${currentStep === "dns" ? "border-primary bg-primary/10" : currentStep === "success" ? "border-green-600 bg-green-600 text-white" : "border-muted"}`}>
            {currentStep === "success" ? <FaCheck className="w-4 h-4" /> : "3"}
          </div>
          <span className="font-medium">DNS Configuration</span>
        </div>
        
        <Separator orientation="horizontal" className="flex-1" />
        
        <div className={`flex items-center gap-2 ${currentStep === "success" ? "text-green-600" : "text-muted-foreground"}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${currentStep === "success" ? "border-green-600 bg-green-600 text-white" : "border-muted"}`}>
            {currentStep === "success" ? <FaCheck className="w-4 h-4" /> : "4"}
          </div>
          <span className="font-medium">Complete</span>
        </div>
      </div>

      {/* Step 1: Email Address */}
      {currentStep === "email" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FaEnvelope className="w-5 h-5" />
              Enter Email Address
            </CardTitle>
            <CardDescription>
              Provide the email address you want to set up for inbound email receiving
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="support@yourdomain.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="text-lg"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
              />
              {domain && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Domain detected:</span>
                  <Badge variant="secondary" className="font-mono">{domain}</Badge>
                </div>
              )}
            </div>
            
            <Button 
              onClick={handleEmailSubmit} 
              disabled={!email || !email.includes("@")}
              className="w-full"
            >
              Continue to Domain Setup
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Domain Setup */}
      {currentStep === "domain" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={goBackStep}>
                <FaArrowLeft className="w-4 h-4" />
              </Button>
              <div className="flex-1">
                <CardTitle className="flex items-center gap-2">
                  <FaGlobe className="w-5 h-5" />
                  Domain Configuration
                </CardTitle>
                <CardDescription>
                  We need to check if your domain can receive emails through our service
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="font-mono">{email}</div>
              <div className="text-muted-foreground">→</div>
              <Badge variant="outline" className="font-mono">{domain}</Badge>
            </div>

            {checkingDomain && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                <span>Checking domain configuration...</span>
              </div>
            )}

            {domainCheckResult && (
              <div className="space-y-4">
                {domainCheckResult.canReceiveEmails ? (
                  <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <FaCheckCircle className="w-4 h-4 text-green-600" />
                    <div className="flex-1">
                      <div className="font-medium text-green-800 text-sm">Domain is available!</div>
                      <div className="text-xs text-green-600">
                        {domain} can receive emails through our service
                      </div>
                    </div>
                    <Button size="sm" onClick={() => handleDomainSelection(domain)}>
                      Use {domain}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                      <FaExclamationTriangle className="w-4 h-4 text-orange-600 mt-0.5" />
                      <div className="flex-1">
                        <div className="font-medium text-orange-800 text-sm">Domain has existing MX records</div>
                        <div className="text-xs text-orange-600 mb-2">
                          {domain} already receives emails. You'll need to use a subdomain.
                        </div>
                        
                        {domainCheckResult.mxRecords && domainCheckResult.mxRecords.length > 0 && (
                          <div className="mt-2">
                            <div className="flex items-center justify-between mb-1">
                              <div className="text-xs font-medium text-orange-700">
                                Existing MX Records ({domainCheckResult.mxRecords.length})
                              </div>
                              {domainCheckResult.mxRecords.length > 2 && (
                                <button
                                  onClick={() => setShowAllMxRecords(!showAllMxRecords)}
                                  className="text-xs text-orange-600 hover:text-orange-700 flex items-center gap-1"
                                >
                                  {showAllMxRecords ? (
                                    <>
                                      Show less <FaChevronUp className="w-2 h-2" />
                                    </>
                                  ) : (
                                    <>
                                      Show all <FaChevronDown className="w-2 h-2" />
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                            <div className="bg-white/50 rounded border text-xs">
                              <div className="grid grid-cols-3 gap-2 p-2 border-b bg-orange-100/50 font-medium text-xs">
                                <div>Priority</div>
                                <div className="col-span-2">Mail Server</div>
                              </div>
                              {(showAllMxRecords ? domainCheckResult.mxRecords : domainCheckResult.mxRecords.slice(0, 2)).map((record, index) => (
                                <div key={index} className="grid grid-cols-3 gap-2 p-2 border-b last:border-b-0 text-xs">
                                  <div className="font-mono font-medium">{record.priority}</div>
                                  <div className="font-mono col-span-2 truncate" title={record.exchange}>
                                    {record.exchange}
                                  </div>
                                </div>
                              ))}
                              {!showAllMxRecords && domainCheckResult.mxRecords.length > 2 && (
                                <div className="p-2 text-center text-xs text-orange-600 bg-orange-50/50 border-t">
                                  +{domainCheckResult.mxRecords.length - 2} more records
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {subdomainOptions.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm">Available subdomains:</Label>
                        <div className="grid gap-2">
                          {subdomainOptions.map((option) => {
                            const fullSubdomain = `${option.subdomain}.${domain}`
                            return (
                              <div
                                key={option.subdomain}
                                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                                  selectedSubdomain === fullSubdomain
                                    ? "border-primary bg-primary/5"
                                    : "border-border hover:border-primary/50"
                                }`}
                                onClick={() => handleSubdomainSelection(fullSubdomain)}
                              >
                                <div className="flex items-center gap-2">
                                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                    selectedSubdomain === fullSubdomain
                                      ? "border-primary bg-primary"
                                      : "border-muted-foreground"
                                  }`}>
                                    {selectedSubdomain === fullSubdomain && (
                                      <div className="w-2 h-2 rounded-full bg-white"></div>
                                    )}
                                  </div>
                                  <FaCheckCircle className="w-3 h-3 text-green-600" />
                                  <div className="text-left">
                                    <div className="font-mono font-medium text-sm">
                                      {fullSubdomain}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      Available for email receiving
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label className="text-sm">Or enter a custom subdomain:</Label>
                      <div className="flex gap-2">
                        <div className="flex-1 flex items-stretch">
                          <Input
                            placeholder="custom"
                            value={customSubdomain}
                            onChange={(e) => setCustomSubdomain(e.target.value.replace(/\s/g, ''))}
                            className="rounded-r-none border-r-0 h-9"
                          />
                          <div className="px-3 py-2 bg-muted border border-l-0 rounded-r-md text-muted-foreground text-sm h-9 flex items-center">
                            .{domain}
                          </div>
                        </div>
                        <Button 
                          size="sm"
                          onClick={handleCustomSubdomainCheck}
                          disabled={!customSubdomain || checkingCustom}
                          className="h-9"
                        >
                          {checkingCustom ? (
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                          ) : (
                            "Verify"
                          )}
                        </Button>
                      </div>
                      
                      {selectedSubdomain && selectedSubdomain.includes(customSubdomain) && customSubdomain && (
                        <div className={`p-3 border rounded-lg border-primary bg-primary/5`}>
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 rounded-full border-2 border-primary bg-primary flex items-center justify-center">
                              <div className="w-2 h-2 rounded-full bg-white"></div>
                            </div>
                            <FaCheckCircle className="w-3 h-3 text-green-600" />
                            <div className="text-left">
                              <div className="font-mono font-medium text-sm">
                                {selectedSubdomain}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Custom subdomain verified and available
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {domainCheckResult && !domainCheckResult.canReceiveEmails && (
              <div className="pt-4 border-t">
                <Button 
                  onClick={handleSubdomainNext}
                  disabled={!selectedSubdomain}
                  className="w-full"
                >
                  Continue with {selectedSubdomain || "Selected Subdomain"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: DNS Configuration */}
      {currentStep === "dns" && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={goBackStep}>
                <FaArrowLeft className="w-4 h-4" />
              </Button>
              <div className="flex-1">
                <CardTitle>DNS Records</CardTitle>
                <CardDescription>
                  Add the following DNS records to complete the setup for {selectedDomain}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Provider Info - Always show if available */}
            {selectedDomainCheckResult?.provider && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                {getProviderIcon(selectedDomainCheckResult.provider.icon)}
                <div className="flex-1">
                  <div className="font-medium text-blue-800 text-sm">DNS Provider: {selectedDomainCheckResult.provider.name}</div>
                  <div className="text-xs text-blue-600">
                    Add the MX record in your DNS management console
                  </div>
                </div>
                {selectedDomainCheckResult.provider.confidence === 'high' && (
                  <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 border-green-200">
                    Detected
                  </Badge>
                )}
              </div>
            )}

            {/* MX Record Section */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">MX Record</h3>
                  <p className="text-sm text-muted-foreground">Add this record to enable email receiving for your domain</p>
                </div>
                <Badge variant="destructive" className="text-xs">Required</Badge>
              </div>
              
              {/* DNS Record Cards */}
              <div className="space-y-4">
                {/* Primary Fields Row */}
                <div className="grid gap-4 md:grid-cols-3">
                  {/* Name */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Name</Label>
                    <div className="relative group">
                      <div className="p-3 bg-muted/50 rounded-lg border font-mono text-sm flex items-center justify-between">
                        <span className="text-foreground">
                          {selectedDomain === domain ? "@" : selectedDomain.replace(`.${domain}`, "")}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard(selectedDomain === domain ? "@" : selectedDomain.replace(`.${domain}`, ""))}
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <FaCopy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Type */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Type</Label>
                    <div className="relative group">
                      <div className="p-3 bg-muted/50 rounded-lg border font-mono text-sm flex items-center justify-between">
                        <span className="text-foreground">MX</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard("MX")}
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <FaCopy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  {/* Priority */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Priority</Label>
                    <div className="relative group">
                      <div className="p-3 bg-muted/50 rounded-lg border font-mono text-sm flex items-center justify-between">
                        <span className="text-foreground">10</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard("10")}
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <FaCopy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Secondary Fields Row */}
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Value */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Value</Label>
                    <div className="relative group">
                      <div className="p-3 bg-muted/50 rounded-lg border font-mono text-sm flex items-center justify-between">
                        <span className="text-foreground">inbound.exon.dev</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard("inbound.exon.dev")}
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <FaCopy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  
                  {/* TTL */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">TTL</Label>
                    <div className="relative group">
                      <div className="p-3 bg-muted/50 rounded-lg border font-mono text-sm flex items-center justify-between">
                        <span className="text-foreground">3600</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyToClipboard("3600")}
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <FaCopy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Quick Copy All */}
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      Copy all values at once
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const nameValue = selectedDomain === domain ? "@" : selectedDomain.replace(`.${domain}`, "")
                        const allValues = `Name: ${nameValue}\nType: MX\nValue: inbound.exon.dev\nTTL: 3600\nPriority: 10`
                        copyToClipboard(allValues)
                      }}
                      className="gap-2"
                    >
                      <FaCopy className="w-3 h-3" />
                      Copy All
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Status Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full border-2 border-muted-foreground"></div>
                  <span className="text-sm">I've added the records</span>
                </div>
                <Button
                  onClick={handleDnsCheck}
                  disabled={checkingDnsConfig}
                  variant="secondary"
                  size="sm"
                >
                  {checkingDnsConfig ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  ) : (
                    "Verify Records"
                  )}
                </Button>
              </div>

              {checkingDnsConfig && (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  <span>Checking DNS configuration...</span>
                </div>
              )}

              {dnsConfigured && (
                <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <FaCheckCircle className="w-5 h-5 text-green-600" />
                  <div>
                    <div className="font-medium text-green-800">DNS configured successfully!</div>
                    <div className="text-sm text-green-600">
                      MX record detected. Proceeding to completion...
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Success */}
      {currentStep === "success" && (
        <Card>
          <CardHeader className="text-center">
            <div className="flex items-center justify-center mb-4">
              <Button variant="ghost" size="sm" onClick={goBackStep} className="absolute left-6">
                <FaArrowLeft className="w-4 h-4" />
              </Button>
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <FaCheckCircle className="w-8 h-8 text-green-600" />
              </div>
            </div>
            <CardTitle className="text-2xl text-green-800">Setup Complete!</CardTitle>
            <CardDescription className="text-lg">
              Your inbound email configuration has been successfully created
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">Email Address</div>
                <div className="font-mono font-medium">{email}</div>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">Domain</div>
                <div className="font-mono font-medium">{selectedDomain}</div>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">Flow ID</div>
                <div className="font-mono font-medium">{flowId}</div>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="text-sm text-muted-foreground mb-1">Status</div>
                <Badge variant="default" className="bg-green-600">Active</Badge>
              </div>
            </div>

            <div className="flex gap-3">
              <Button asChild className="flex-1">
                <a href="/dashboard">Go to Dashboard</a>
              </Button>
              <Button variant="secondary" asChild>
                <a href="/emails">Manage Emails</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
} 