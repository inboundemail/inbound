"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { 
  LoaderIcon,
  CheckCircleIcon,
  XCircleIcon,
  AlertTriangleIcon,
  MailIcon,
  GlobeIcon,
  ServerIcon,
  DatabaseIcon,
  TestTubeIcon,
  PlayIcon,
  RefreshCwIcon,
  CopyIcon,
  CheckIcon
} from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"

interface DnsCheckResult {
  domain: string
  domainId: string
  canReceiveEmails: boolean
  hasMxRecords: boolean
  mxRecords?: Array<{ exchange: string; priority: number }>
  provider?: {
    name: string
    icon: string
    detected: boolean
    confidence: 'high' | 'medium' | 'low'
  }
  error?: string
  timestamp: Date
}

interface DnsRecord {
  type: string
  name: string
  value: string
  isVerified: boolean
  actualValues?: string[]
  error?: string
}

interface DomainVerificationResult {
  domain: string
  domainId: string
  verificationToken: string
  status: 'pending' | 'dns_verified' | 'ses_verified' | 'failed'
  sesStatus: string
  dnsRecords: DnsRecord[]
  canProceed: boolean
}

interface EmailConfigurationResult {
  domain: string
  emailAddresses: Array<{
    id: string
    address: string
    isConfigured: boolean
    ruleName: string
    isNew?: boolean
  }>
  receiptRule: {
    name: string
    status: string
  }
  lambdaFunction: string
  s3Bucket: string
  message: string
}

interface ExistingEmailAddresses {
  domain: string
  emailAddresses: Array<{
    id: string
    address: string
    isConfigured: boolean
    ruleName: string
    createdAt: string
  }>
  hasExistingConfiguration: boolean
}

export default function DevelopmentTab() {
  const [emailAddress, setEmailAddress] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState<'input' | 'dns' | 'verification' | 'email-config' | 'complete'>('input')
  
  // Results state
  const [dnsResult, setDnsResult] = useState<DnsCheckResult | null>(null)
  const [verificationResult, setVerificationResult] = useState<DomainVerificationResult | null>(null)
  const [emailConfigResult, setEmailConfigResult] = useState<EmailConfigurationResult | null>(null)
  
  // Email configuration state
  const [emailAddresses, setEmailAddresses] = useState<string[]>([''])
  const [isConfiguringEmails, setIsConfiguringEmails] = useState(false)
  const [emailConfigError, setEmailConfigError] = useState<string | null>(null)
  const [existingEmails, setExistingEmails] = useState<ExistingEmailAddresses | null>(null)
  const [isLoadingExistingEmails, setIsLoadingExistingEmails] = useState(false)
  
  // Copy state
  const [copiedValues, setCopiedValues] = useState<Record<string, boolean>>({})

  const extractDomain = (email: string): string => {
    return email.split('@')[1] || ''
  }

  const resetWorkflow = () => {
    setCurrentStep('input')
    setDnsResult(null)
    setVerificationResult(null)
    setEmailConfigResult(null)
    setEmailAddress("")
    setEmailAddresses([''])
    setEmailConfigError(null)
    setCopiedValues({})
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

  const handleDnsCheck = async () => {
    if (!emailAddress) return
    
    setIsLoading(true)
    setCurrentStep('dns')
    
    try {
      const domain = extractDomain(emailAddress)
      const response = await fetch('/api/inbound/check-dns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain })
      })
      
      const result = await response.json()
      setDnsResult(result)
      
      if (result.canReceiveEmails) {
        // Automatically proceed to domain verification
        await handleDomainVerification(domain, result.domainId)
      }
    } catch (error) {
      console.error('DNS check failed:', error)
      setDnsResult({
        domain: extractDomain(emailAddress),
        domainId: '',
        canReceiveEmails: false,
        hasMxRecords: false,
        error: 'Failed to check DNS records',
        timestamp: new Date()
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDomainVerification = async (domain?: string, domainId?: string) => {
    const targetDomain = domain || dnsResult?.domain
    const targetDomainId = domainId || dnsResult?.domainId
    if (!targetDomain) return
    
    setIsLoading(true)
    setCurrentStep('verification')
    
    try {
      const response = await fetch('/api/inbound/verify-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: targetDomain, domainId: targetDomainId })
      })
      
      const result = await response.json()
      setVerificationResult(result)
      
      // Only proceed to email configuration if fully verified
      if (result.canProceed) {
        setCurrentStep('email-config')
      }
    } catch (error) {
      console.error('Domain verification failed:', error)
      setVerificationResult({
        domain: targetDomain,
        domainId: targetDomainId || '',
        verificationToken: '',
        status: 'failed',
        sesStatus: 'Failed',
        dnsRecords: [],
        canProceed: false
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDnsRecordCheck = async () => {
    if (!verificationResult?.domain) return
    
    setIsLoading(true)
    
    try {
      const response = await fetch('/api/inbound/check-dns-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          domain: verificationResult.domain,
          domainId: verificationResult.domainId 
        })
      })
      
      const result = await response.json()
      
      // Update verification result with new DNS status
      setVerificationResult(prev => prev ? {
        ...prev,
        dnsRecords: result.dnsRecords,
        canProceed: result.canProceed
      } : null)
      
      // If all DNS records are verified, check SES status again
      if (result.allVerified) {
        await handleDomainVerification()
      }
      
      // If we can proceed to email config, load existing emails
      if (result.canProceed) {
        setCurrentStep('email-config')
        await loadExistingEmailAddresses()
      }
    } catch (error) {
      console.error('DNS record check failed:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const addEmailAddress = () => {
    setEmailAddresses([...emailAddresses, ''])
  }

  const removeEmailAddress = (index: number) => {
    if (emailAddresses.length > 1) {
      setEmailAddresses(emailAddresses.filter((_, i) => i !== index))
    }
  }

  const updateEmailAddress = (index: number, value: string) => {
    // Only allow the username part (before @)
    const cleanValue = value.split('@')[0]
    const updated = [...emailAddresses]
    updated[index] = cleanValue
    setEmailAddresses(updated)
  }

  const getFullEmailAddress = (username: string) => {
    if (!username.trim()) return ''
    return `${username}@${verificationResult?.domain || ''}`
  }

  const loadExistingEmailAddresses = async () => {
    if (!verificationResult?.domain) return
    
    setIsLoadingExistingEmails(true)
    try {
      const response = await fetch('/api/inbound/get-email-addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: verificationResult.domain })
      })
      
      if (response.ok) {
        const result = await response.json()
        setExistingEmails(result)
        
        // If there are existing emails, show them in a helpful way
        if (result.hasExistingConfiguration) {
          console.log(`Found ${result.emailAddresses.length} existing email addresses for ${result.domain}`)
        }
      } else {
        console.error('Failed to load existing email addresses')
      }
    } catch (error) {
      console.error('Error loading existing email addresses:', error)
    } finally {
      setIsLoadingExistingEmails(false)
    }
  }

  const handleEmailConfiguration = async () => {
    if (!verificationResult?.domain) return
    
    const validUsernames = emailAddresses.filter(username => username.trim() !== '')
    if (validUsernames.length === 0) return
    
    // Convert usernames to full email addresses
    const validEmails = validUsernames.map(username => getFullEmailAddress(username))
    
    setIsConfiguringEmails(true)
    setEmailConfigError(null)
    
    try {
      const response = await fetch('/api/inbound/configure-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: verificationResult.domain,
          emailAddresses: validEmails
        })
      })
      
      const result = await response.json()
      
      if (response.ok) {
        setEmailConfigResult(result)
        setEmailConfigError(null)
        setCurrentStep('complete')
      } else {
        // Handle different types of errors
        let errorMessage = result.error || 'Failed to configure email addresses'
        
        if (result.details) {
          if (result.details.includes('AlreadyExistsException')) {
            errorMessage = `Email configuration already exists for ${verificationResult.domain}. The system will update the existing configuration with your new email addresses.`
          } else if (result.details.includes('InvalidParameterValue')) {
            errorMessage = 'Invalid email configuration. Please check your email addresses and try again.'
          } else if (result.details.includes('LimitExceededException')) {
            errorMessage = 'AWS SES limit exceeded. Please contact support or try again later.'
          } else {
            errorMessage = `Configuration failed: ${result.details}`
          }
        }
        
        if (result.invalidEmails && result.invalidEmails.length > 0) {
          errorMessage += `\n\nInvalid email addresses: ${result.invalidEmails.join(', ')}`
        }
        
        setEmailConfigError(errorMessage)
        console.error('Email configuration failed:', result)
      }
    } catch (error) {
      console.error('Email configuration error:', error)
      setEmailConfigError('Network error occurred. Please check your connection and try again.')
    } finally {
      setIsConfiguringEmails(false)
    }
  }

  const getStepStatus = (step: string) => {
    const steps = ['input', 'dns', 'verification', 'email-config', 'complete']
    const currentIndex = steps.indexOf(currentStep)
    const stepIndex = steps.indexOf(step)
    
    if (stepIndex < currentIndex) return 'completed'
    if (stepIndex === currentIndex) return 'current'
    return 'pending'
  }

  const StepIndicator = ({ step, title, icon: Icon }: { step: string; title: string; icon: any }) => {
    const status = getStepStatus(step)
    
    return (
      <div className="flex items-center gap-2">
        <div className={`p-2 rounded-full ${
          status === 'completed' ? 'bg-green-100 text-green-600' :
          status === 'current' ? 'bg-blue-100 text-blue-600' :
          'bg-gray-100 text-gray-400'
        }`}>
          {status === 'completed' ? <CheckCircleIcon className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </div>
        <span className={`text-sm font-medium ${
          status === 'completed' ? 'text-green-600' :
          status === 'current' ? 'text-blue-600' :
          'text-gray-400'
        }`}>
          {title}
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTubeIcon className="h-5 w-5" />
            AWS Email Workflow Testing
          </CardTitle>
          <CardDescription>
            Test the complete AWS SES email receiving workflow from DNS verification to email processing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress Steps */}
          <div className="flex items-center justify-between">
            <StepIndicator step="input" title="Email Input" icon={MailIcon} />
            <div className="flex-1 h-px bg-gray-200 mx-1" />
            <StepIndicator step="dns" title="DNS Check" icon={GlobeIcon} />
            <div className="flex-1 h-px bg-gray-200 mx-1" />
            <StepIndicator step="verification" title="SES Verification" icon={ServerIcon} />
            <div className="flex-1 h-px bg-gray-200 mx-1" />
            <StepIndicator step="email-config" title="Email Config" icon={MailIcon} />
            <div className="flex-1 h-px bg-gray-200 mx-1" />
            <StepIndicator step="complete" title="Complete" icon={CheckCircleIcon} />
          </div>

          <Separator />

          <Tabs value={currentStep} className="w-full">
            {/* Step 1: Email Input */}
            <TabsContent value="input" className="space-y-4">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="email">Email Address to Test</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="test@yourdomain.com"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    Enter an email address to test the complete workflow
                  </p>
                </div>
                <Button 
                  onClick={handleDnsCheck} 
                  disabled={!emailAddress || isLoading}
                  className="w-full"
                >
                  {isLoading ? (
                    <>
                      <LoaderIcon className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <PlayIcon className="h-4 w-4 mr-2" />
                      Start Workflow Test
                    </>
                  )}
                </Button>
              </div>
            </TabsContent>

            {/* Step 2: DNS Check Results */}
            <TabsContent value="dns" className="space-y-4">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">DNS Check Results</h3>
                
                {dnsResult && (
                  <div className="space-y-4">
                    <Alert className={dnsResult.canReceiveEmails ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
                      <div className="flex items-center gap-2">
                        {dnsResult.canReceiveEmails ? (
                          <CheckCircleIcon className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircleIcon className="h-4 w-4 text-red-600" />
                        )}
                        <AlertDescription>
                          {dnsResult.canReceiveEmails 
                            ? `Domain ${dnsResult.domain} can safely receive emails (no existing MX records). Proceeding to SES verification...`
                            : `Domain ${dnsResult.domain} already has MX records and cannot be used for AWS SES receiving`
                          }
                        </AlertDescription>
                      </div>
                    </Alert>

                    {dnsResult.provider && (
                      <div className="p-4 border rounded-lg">
                        <h4 className="font-medium mb-2">Domain Provider</h4>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{dnsResult.provider.name}</Badge>
                          <span className="text-sm text-muted-foreground">
                            Confidence: {dnsResult.provider.confidence}
                          </span>
                        </div>
                      </div>
                    )}

                    {dnsResult.mxRecords && dnsResult.mxRecords.length > 0 && (
                      <div className="p-4 border rounded-lg">
                        <h4 className="font-medium mb-2">Existing MX Records</h4>
                        <div className="space-y-1">
                          {dnsResult.mxRecords.map((record, index) => (
                            <div key={index} className="text-sm font-mono">
                              {record.priority} {record.exchange}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {dnsResult.error && (
                      <Alert className="border-yellow-200 bg-yellow-50">
                        <AlertTriangleIcon className="h-4 w-4 text-yellow-600" />
                        <AlertDescription>{dnsResult.error}</AlertDescription>
                      </Alert>
                    )}

                    {!dnsResult.canReceiveEmails && (
                      <Button onClick={resetWorkflow} variant="secondary" className="w-full">
                        <RefreshCwIcon className="h-4 w-4 mr-2" />
                        Try Different Email
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Step 3: Domain Verification */}
            <TabsContent value="verification" className="space-y-4">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">AWS SES Domain Verification</h3>
                
                <Alert className="border-blue-200 bg-blue-50">
                  <ServerIcon className="h-4 w-4 text-blue-600" />
                  <AlertDescription>
                    {isLoading 
                      ? `Verifying domain ${dnsResult?.domain} with AWS SES...`
                      : `Domain verification in progress for ${dnsResult?.domain}`
                    }
                  </AlertDescription>
                </Alert>

                {verificationResult && (
                  <div className="space-y-4">
                    {verificationResult.dnsRecords && verificationResult.dnsRecords.length > 0 && (
                      <div className="p-4 border rounded-lg">
                        <h4 className="font-medium mb-2">Required DNS Records</h4>
                        <div className="space-y-4">
                          {verificationResult.dnsRecords.map((record, index) => (
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

                                {/* Value Field */}
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

                                {/* Found Values (if any) */}
                                {record.actualValues && record.actualValues.length > 0 && (
                                  <div>
                                    <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Found Values</label>
                                    <div className="mt-1 p-2 bg-blue-50 border border-blue-200 rounded font-mono text-sm">
                                      {record.actualValues.join(', ')}
                                    </div>
                                  </div>
                                )}

                                {/* Error (if any) */}
                                {record.error && (
                                  <div>
                                    <label className="text-xs font-medium text-red-600 uppercase tracking-wide">Error</label>
                                    <div className="mt-1 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                                      {record.error}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
                          <p className="text-sm text-blue-800">
                            <strong>Instructions:</strong> Add these DNS records to your domain registrar or DNS provider. 
                            Use the copy buttons to easily copy each value. DNS changes may take up to 24 hours to propagate.
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="p-4 border rounded-lg">
                      <h4 className="font-medium mb-2">Verification Status</h4>
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={verificationResult.status === 'ses_verified' ? 'default' : 'secondary'}>
                          {verificationResult.status}
                        </Badge>
                        <Badge variant="secondary">
                          SES: {verificationResult.sesStatus}
                        </Badge>
                      </div>
                      {verificationResult.verificationToken && (
                        <div className="mt-2">
                          <p className="text-sm text-muted-foreground">Verification Token:</p>
                          <code className="text-xs bg-gray-100 p-1 rounded">{verificationResult.verificationToken}</code>
                        </div>
                      )}
                    </div>

                    {!verificationResult.canProceed && (
                      <Alert className="border-yellow-200 bg-yellow-50">
                        <AlertTriangleIcon className="h-4 w-4 text-yellow-600" />
                        <AlertDescription>
                          DNS records must be verified before proceeding. Add the required DNS records to your domain and click "Check DNS Records" below.
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="flex gap-2">
                      <Button 
                        onClick={handleDnsRecordCheck} 
                        disabled={isLoading}
                        variant="secondary"
                        className="flex-1"
                      >
                        <RefreshCwIcon className="h-4 w-4 mr-2" />
                        Check DNS Records
                      </Button>
                      
                      {verificationResult.canProceed && (
                        <Button 
                          onClick={() => setCurrentStep('email-config')}
                          className="flex-1"
                        >
                          <MailIcon className="h-4 w-4 mr-2" />
                          Configure Emails
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {isLoading && (
                  <div className="flex items-center justify-center py-8">
                    <LoaderIcon className="h-8 w-8 animate-spin text-blue-600" />
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Step 4: Email Configuration */}
            <TabsContent value="email-config" className="space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Configure Email Addresses</h3>
                  <Button
                    onClick={loadExistingEmailAddresses}
                    variant="secondary"
                    size="sm"
                    disabled={isLoadingExistingEmails}
                  >
                    {isLoadingExistingEmails ? (
                      <LoaderIcon className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCwIcon className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                
                <Alert className="border-blue-200 bg-blue-50">
                  <MailIcon className="h-4 w-4 text-blue-600" />
                  <AlertDescription>
                    Configure specific email addresses for {verificationResult?.domain} that will be routed to your Lambda function.
                  </AlertDescription>
                </Alert>

                {/* Existing Email Addresses */}
                {existingEmails && existingEmails.hasExistingConfiguration && (
                  <div className="p-4 border rounded-lg bg-green-50">
                    <h4 className="font-medium mb-2 text-green-800">Existing Email Addresses</h4>
                    <div className="space-y-2">
                      {existingEmails.emailAddresses.map((email, index) => (
                        <div key={index} className="flex items-center justify-between text-sm">
                          <span className="font-mono text-green-700">{email.address}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant={email.isConfigured ? "default" : "secondary"}>
                              {email.isConfigured ? 'Active' : 'Inactive'}
                            </Badge>
                            {email.ruleName && (
                              <span className="text-xs text-green-600">Rule: {email.ruleName}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-sm text-green-700 mt-2">
                      You can add more email addresses below. They will be added to the existing configuration.
                    </p>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <Label>Email Addresses</Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      Enter the username part for email addresses you want to receive at {verificationResult?.domain}
                    </p>
                    
                    <div className="space-y-2">
                      {emailAddresses.map((username, index) => (
                        <div key={index} className="flex gap-2">
                          <div className="flex-1 flex items-center border rounded-md">
                            <Input
                              type="text"
                              placeholder="user"
                              value={username}
                              onChange={(e) => updateEmailAddress(index, e.target.value)}
                              className="border-0 rounded-r-none focus:ring-0 focus:border-0"
                            />
                            <div className="px-3 py-2 bg-gray-50 border-l text-sm text-gray-600 rounded-r-md">
                              @{verificationResult?.domain || 'yourdomain.com'}
                            </div>
                          </div>
                          {emailAddresses.length > 1 && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => removeEmailAddress(index)}
                            >
                              <XCircleIcon className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={addEmailAddress}
                      className="mt-2"
                    >
                      <PlayIcon className="h-4 w-4 mr-2" />
                      Add Another Email
                    </Button>
                  </div>

                  {/* Preview of email addresses */}
                  {emailAddresses.some(username => username.trim() !== '') && (
                    <div className="p-4 border rounded-lg bg-blue-50">
                      <h4 className="font-medium mb-2">Email Addresses to Configure</h4>
                      <div className="space-y-1">
                        {emailAddresses
                          .filter(username => username.trim() !== '')
                          .map((username, index) => (
                            <div key={index} className="text-sm font-mono text-blue-800">
                              {getFullEmailAddress(username)}
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  <div className="p-4 border rounded-lg bg-gray-50">
                    <h4 className="font-medium mb-2">What happens next?</h4>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      <li>• SES receipt rules will be created for these email addresses</li>
                      <li>• Incoming emails will be stored in S3</li>
                      <li>• Your Lambda function will be triggered for processing</li>
                      <li>• Webhooks will be sent to your API endpoints</li>
                    </ul>
                  </div>

                  {/* Error Display */}
                  {emailConfigError && (
                    <Alert className="border-red-200 bg-red-50">
                      <XCircleIcon className="h-4 w-4 text-red-600" />
                      <AlertDescription className="whitespace-pre-line">
                        {emailConfigError}
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="flex gap-2">
                    <Button 
                      onClick={handleEmailConfiguration}
                      disabled={isConfiguringEmails || emailAddresses.every(username => username.trim() === '')}
                      className="flex-1"
                    >
                      {isConfiguringEmails ? (
                        <>
                          <LoaderIcon className="h-4 w-4 mr-2 animate-spin" />
                          Configuring Email Addresses...
                        </>
                      ) : emailConfigError ? (
                        <>
                          <RefreshCwIcon className="h-4 w-4 mr-2" />
                          Retry Configuration
                        </>
                      ) : (
                        <>
                          <ServerIcon className="h-4 w-4 mr-2" />
                          Configure Email Receiving
                        </>
                      )}
                    </Button>
                    
                    {emailConfigError && (
                      <Button 
                        onClick={() => setEmailConfigError(null)}
                        variant="secondary"
                        size="sm"
                      >
                        <XCircleIcon className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Step 5: Complete */}
            <TabsContent value="complete" className="space-y-4">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Workflow Complete</h3>
                
                {emailConfigResult && (
                  <div className="space-y-4">
                    <Alert className="border-green-200 bg-green-50">
                      <CheckCircleIcon className="h-4 w-4 text-green-600" />
                      <AlertDescription>
                        {emailConfigResult.message}
                      </AlertDescription>
                    </Alert>

                    <div className="p-4 border rounded-lg">
                      <h4 className="font-medium mb-2">Configured Email Addresses</h4>
                      <div className="space-y-2">
                        {emailConfigResult.emailAddresses.map((email, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <CheckCircleIcon className="h-4 w-4 text-green-600" />
                            <span className="font-mono text-sm">{email.address}</span>
                            <Badge variant={email.isNew ? "default" : "secondary"}>
                              {email.isNew ? 'New' : 'Existing'}
                            </Badge>
                            <Badge variant="secondary">Active</Badge>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-4 border rounded-lg">
                      <h4 className="font-medium mb-2">AWS Configuration</h4>
                      <div className="space-y-1 text-sm">
                        <div><strong>Receipt Rule:</strong> {emailConfigResult.receiptRule.name}</div>
                        <div><strong>Lambda Function:</strong> {emailConfigResult.lambdaFunction}</div>
                        <div><strong>S3 Bucket:</strong> {emailConfigResult.s3Bucket}</div>
                        <div><strong>Status:</strong> <Badge variant="default">{emailConfigResult.receiptRule.status}</Badge></div>
                      </div>
                    </div>

                    <div className="p-4 border rounded-lg">
                      <h4 className="font-medium mb-2">Email Flow</h4>
                      <div className="text-sm space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          <span>Email sent to configured addresses</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          <span>AWS SES receives and stores in S3</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          <span>Lambda function processes email</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          <span>Webhook sent to your API</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 border rounded-lg">
                      <h4 className="font-medium mb-2">Next Steps</h4>
                      <ul className="text-sm space-y-1 text-muted-foreground">
                        <li>• Test email delivery to your configured addresses</li>
                        <li>• Monitor CloudWatch logs for Lambda execution</li>
                        <li>• Check your API endpoints for webhook deliveries</li>
                        <li>• Configure additional email addresses as needed</li>
                      </ul>
                    </div>

                    <Button onClick={resetWorkflow} variant="secondary" className="w-full">
                      <RefreshCwIcon className="h-4 w-4 mr-2" />
                      Configure Another Domain
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Debug Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseIcon className="h-5 w-5" />
            Debug Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {dnsResult && (
              <div>
                <h4 className="font-medium mb-2">DNS Check Result</h4>
                <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto">
                  {JSON.stringify(dnsResult, null, 2)}
                </pre>
              </div>
            )}
            
            {verificationResult && (
              <div>
                <h4 className="font-medium mb-2">Verification Result</h4>
                <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto">
                  {JSON.stringify(verificationResult, null, 2)}
                </pre>
              </div>
            )}
            
            {emailConfigResult && (
              <div>
                <h4 className="font-medium mb-2">Email Configuration Result</h4>
                <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto">
                  {JSON.stringify(emailConfigResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 