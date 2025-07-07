"use client"

import { useState, useEffect } from 'react'
import { useCreateEndpointMutation } from '@/features/endpoints/hooks'
import { useDomainsStatsQuery } from '@/features/domains/hooks/useDomainsQuery'
import { CreateEndpointData, WebhookConfig, EmailForwardConfig, EmailGroupConfig } from '@/features/endpoints/types'
import { WEBHOOK_FORMAT_CONFIGS, getWebhookFormatConfig } from '@/lib/webhook-formats'
import type { WebhookFormat } from '@/lib/db/schema'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { HiPlus, HiX, HiLightningBolt, HiMail, HiUserGroup, HiArrowLeft, HiArrowRight } from 'react-icons/hi'
import { toast } from 'sonner'
import { EndpointTypeSelector } from './EndpointTypeSelector'

interface CreateEndpointDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Step = 'type' | 'basic' | 'config'

export function CreateEndpointDialog({ open, onOpenChange }: CreateEndpointDialogProps) {
  const [currentStep, setCurrentStep] = useState<Step>('type')
  const [selectedType, setSelectedType] = useState<'webhook' | 'email' | 'email_group' | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  })
  
  // Webhook-specific state
  const [webhookFormat, setWebhookFormat] = useState<WebhookFormat>('inbound')
  const [webhookConfig, setWebhookConfig] = useState<WebhookConfig>({
    url: '',
    timeout: 30,
    retryAttempts: 3,
    headers: {}
  })
  const [headerKey, setHeaderKey] = useState('')
  const [headerValue, setHeaderValue] = useState('')
  
  // Email-specific state
  const [emailConfig, setEmailConfig] = useState<EmailForwardConfig>({
    forwardTo: '',
    includeAttachments: true,
    subjectPrefix: ''
  })
  
  // Email group-specific state
  const [emailGroupConfig, setEmailGroupConfig] = useState<EmailGroupConfig>({
    emails: [],
    includeAttachments: true,
    subjectPrefix: ''
  })
  const [newEmail, setNewEmail] = useState('')
  
  const [errors, setErrors] = useState<Record<string, string>>({})

  const createEndpointMutation = useCreateEndpointMutation()
  const { data: domainsData } = useDomainsStatsQuery()

  // Get verified domains for email endpoints
  const verifiedDomains = domainsData?.domains?.filter(domain => domain.isVerified) || []

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        if (currentStep === 'config' && !createEndpointMutation.isPending && selectedType && validateCurrentStep()) {
          handleSubmit(event as any)
        } else if (canProceedToNextStep()) {
          handleNext()
        }
      }
    }

    if (open) {
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, currentStep, createEndpointMutation.isPending, selectedType, formData, webhookConfig, emailConfig, emailGroupConfig])

  const validateCurrentStep = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (currentStep === 'type') {
      if (!selectedType) {
        newErrors.type = 'Please select an endpoint type'
      }
    }

    if (currentStep === 'basic') {
      if (!formData.name.trim()) {
        newErrors.name = 'Name is required'
      }
    }

    if (currentStep === 'config' && selectedType) {
      if (selectedType === 'webhook') {
        if (!webhookConfig.url.trim()) {
          newErrors.url = 'URL is required'
        } else {
          try {
            new URL(webhookConfig.url)
          } catch {
            newErrors.url = 'Please enter a valid URL'
          }
        }

        if (webhookConfig.timeout && (webhookConfig.timeout < 1 || webhookConfig.timeout > 300)) {
          newErrors.timeout = 'Timeout must be between 1 and 300 seconds'
        }

        if (webhookConfig.retryAttempts && (webhookConfig.retryAttempts < 0 || webhookConfig.retryAttempts > 10)) {
          newErrors.retryAttempts = 'Retry attempts must be between 0 and 10'
        }
      }

      if (selectedType === 'email') {
        if (!emailConfig.forwardTo.trim()) {
          newErrors.forwardTo = 'Forward to email is required'
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailConfig.forwardTo)) {
          newErrors.forwardTo = 'Please enter a valid email address'
        }
      }

      if (selectedType === 'email_group') {
        if (emailGroupConfig.emails.length === 0) {
          newErrors.emails = 'At least one email address is required'
        }
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const canProceedToNextStep = (): boolean => {
    if (currentStep === 'type') return selectedType !== null
    if (currentStep === 'basic') return formData.name.trim() !== ''
    return false
  }

  const handleNext = () => {
    if (!validateCurrentStep()) return

    if (currentStep === 'type') {
      setCurrentStep('basic')
    } else if (currentStep === 'basic') {
      setCurrentStep('config')
    }
  }

  const handlePrevious = () => {
    if (currentStep === 'config') {
      setCurrentStep('basic')
    } else if (currentStep === 'basic') {
      setCurrentStep('type')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedType || !validateCurrentStep()) {
      return
    }

    let config: WebhookConfig | EmailForwardConfig | EmailGroupConfig

    switch (selectedType) {
      case 'webhook':
        config = webhookConfig
        break
      case 'email':
        config = emailConfig
        break
      case 'email_group':
        config = emailGroupConfig
        break
      default:
        return
    }

    const createData: CreateEndpointData = {
      name: formData.name,
      type: selectedType,
      webhookFormat: selectedType === 'webhook' ? webhookFormat : undefined,
      description: formData.description || undefined,
      config
    }

    try {
      await createEndpointMutation.mutateAsync(createData)
      toast.success('Endpoint created successfully!')
      handleClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create endpoint')
    }
  }

  const handleClose = () => {
    setCurrentStep('type')
    setSelectedType(null)
    setFormData({ name: '', description: '' })
    setWebhookFormat('inbound')
    setWebhookConfig({
      url: '',
      timeout: 30,
      retryAttempts: 3,
      headers: {}
    })
    setEmailConfig({
      forwardTo: '',
      includeAttachments: true,
      subjectPrefix: ''
    })
    setEmailGroupConfig({
      emails: [],
      includeAttachments: true,
      subjectPrefix: ''
    })
    setHeaderKey('')
    setHeaderValue('')
    setNewEmail('')
    setErrors({})
    onOpenChange(false)
  }

  const addHeader = () => {
    if (headerKey.trim() && headerValue.trim()) {
      setWebhookConfig(prev => ({
        ...prev,
        headers: {
          ...prev.headers,
          [headerKey.trim()]: headerValue.trim()
        }
      }))
      setHeaderKey('')
      setHeaderValue('')
    }
  }

  const removeHeader = (key: string) => {
    setWebhookConfig(prev => {
      const newHeaders = { ...prev.headers }
      delete newHeaders[key]
      return {
        ...prev,
        headers: newHeaders
      }
    })
  }

  const addEmail = () => {
    if (newEmail.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
      if (!emailGroupConfig.emails.includes(newEmail.trim())) {
        setEmailGroupConfig(prev => ({
          ...prev,
          emails: [...prev.emails, newEmail.trim()]
        }))
        setNewEmail('')
      }
    }
  }

  const removeEmail = (email: string) => {
    setEmailGroupConfig(prev => ({
      ...prev,
      emails: prev.emails.filter(e => e !== email)
    }))
  }

  const getDialogIcon = () => {
    switch (selectedType) {
      case 'webhook':
        return { icon: HiLightningBolt, color: 'purple' }
      case 'email':
        return { icon: HiMail, color: 'blue' }
      case 'email_group':
        return { icon: HiUserGroup, color: 'green' }
      default:
        return { icon: HiPlus, color: 'gray' }
    }
  }

  const { icon: DialogIcon, color } = getDialogIcon()

  const getStepTitle = () => {
    switch (currentStep) {
      case 'type':
        return 'Choose Endpoint Type'
      case 'basic':
        return 'Basic Information'
      case 'config':
        return `Configure ${selectedType === 'webhook' ? 'Webhook' : selectedType === 'email' ? 'Email Forward' : 'Email Group'}`
      default:
        return 'Create New Endpoint'
    }
  }

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center space-x-2 mb-6">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
        currentStep === 'type' ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-600'
      }`}>
        1
      </div>
      <div className={`w-8 h-1 ${currentStep !== 'type' ? 'bg-blue-600' : 'bg-gray-200'}`} />
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
        currentStep === 'basic' ? 'bg-blue-600 text-white' : 
        currentStep === 'config' ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'
      }`}>
        2
      </div>
      <div className={`w-8 h-1 ${currentStep === 'config' ? 'bg-blue-600' : 'bg-gray-200'}`} />
      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
        currentStep === 'config' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
      }`}>
        3
      </div>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
              color === 'purple' ? 'bg-purple-100' :
              color === 'blue' ? 'bg-blue-100' :
              color === 'green' ? 'bg-green-100' :
              'bg-gray-100'
            }`}>
              <DialogIcon className={`h-4 w-4 ${
                color === 'purple' ? 'text-purple-600' :
                color === 'blue' ? 'text-blue-600' :
                color === 'green' ? 'text-green-600' :
                'text-gray-600'
              }`} />
            </div>
            {getStepTitle()}
          </DialogTitle>
        </DialogHeader>

        {renderStepIndicator()}

        <div className="min-h-[300px]">
          {/* Step 1: Type Selection */}
          {currentStep === 'type' && (
            <div className="space-y-4">
              <EndpointTypeSelector
                selectedType={selectedType}
                onTypeSelect={setSelectedType}
              />
              {errors.type && <p className="text-sm text-red-500">{errors.type}</p>}
            </div>
          )}

          {/* Step 2: Basic Information */}
          {currentStep === 'basic' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={`${selectedType === 'webhook' ? 'Production Webhook' : selectedType === 'email' ? 'Support Email Forward' : 'Team Email Group'}`}
                  className={errors.name ? 'border-red-500' : ''}
                  autoFocus
                />
                {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description of this endpoint's purpose"
                  rows={3}
                />
              </div>
            </div>
          )}

          {/* Step 3: Configuration */}
          {currentStep === 'config' && selectedType && (
            <div className="space-y-4">
              {selectedType === 'webhook' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="url">URL *</Label>
                    <Input
                      id="url"
                      type="url"
                      value={webhookConfig.url}
                      onChange={(e) => setWebhookConfig(prev => ({ ...prev, url: e.target.value }))}
                      placeholder="https://your-app.com/webhooks/inbound"
                      className={errors.url ? 'border-red-500' : ''}
                      autoFocus
                    />
                    {errors.url && <p className="text-sm text-red-500">{errors.url}</p>}
                  </div>

                  <div className="space-y-3">
                    <Label>Webhook Format</Label>
                    <div className="grid gap-3">
                      {Object.entries(WEBHOOK_FORMAT_CONFIGS).map(([format, config]) => {
                        const isDisabled = format === 'slack'
                        return (
                        <div
                          key={format}
                          className={`relative rounded-lg border p-4 transition-all ${
                            isDisabled 
                              ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                              : webhookFormat === format
                                ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500 cursor-pointer'
                                : 'border-gray-200 hover:border-gray-300 cursor-pointer'
                          }`}
                          onClick={() => !isDisabled && setWebhookFormat(format as WebhookFormat)}
                        >
                          <div className="flex items-start gap-3">
                                                         <div className={`mt-0.5 h-4 w-4 rounded-full border-2 transition-colors ${
                               isDisabled
                                 ? 'border-gray-300 bg-gray-200'
                                 : webhookFormat === format
                                   ? 'border-blue-500 bg-blue-500'
                                   : 'border-gray-300'
                             }`}>
                                                             {webhookFormat === format && !isDisabled && (
                                 <div className="h-full w-full rounded-full bg-white scale-50" />
                               )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-gray-900">{config.name}</h4>
                              <p className="text-sm text-gray-600 mt-1">{config.description}</p>
                              {format === 'discord' && (
                                <div className="mt-2 text-xs text-gray-500">
                                  Perfect for Discord channels with rich embeds
                                </div>
                              )}
                              {format === 'slack' && (
                                <div className="mt-2 text-xs text-gray-500">
                                  Coming soon - Slack-compatible format
                                </div>
                              )}
                            </div>
                                                     </div>
                         </div>
                       )
                       })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="timeout">Timeout (seconds)</Label>
                      <Input
                        id="timeout"
                        type="number"
                        min="1"
                        max="300"
                        value={webhookConfig.timeout || ''}
                        onChange={(e) => setWebhookConfig(prev => ({ ...prev, timeout: parseInt(e.target.value) || 30 }))}
                        className={errors.timeout ? 'border-red-500' : ''}
                      />
                      {errors.timeout && <p className="text-sm text-red-500">{errors.timeout}</p>}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="retryAttempts">Retry Attempts</Label>
                      <Input
                        id="retryAttempts"
                        type="number"
                        min="0"
                        max="10"
                        value={webhookConfig.retryAttempts || ''}
                        onChange={(e) => setWebhookConfig(prev => ({ ...prev, retryAttempts: parseInt(e.target.value) || 3 }))}
                        className={errors.retryAttempts ? 'border-red-500' : ''}
                      />
                      {errors.retryAttempts && <p className="text-sm text-red-500">{errors.retryAttempts}</p>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Custom Headers (Optional)</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Header name"
                        value={headerKey}
                        onChange={(e) => setHeaderKey(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addHeader())}
                      />
                      <Input
                        placeholder="Header value"
                        value={headerValue}
                        onChange={(e) => setHeaderValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addHeader())}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={addHeader}
                        disabled={!headerKey.trim() || !headerValue.trim()}
                      >
                        <HiPlus className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    {Object.entries(webhookConfig.headers || {}).length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {Object.entries(webhookConfig.headers || {}).map(([key, value]) => (
                          <Badge key={key} variant="secondary" className="text-xs">
                            {key}: {value}
                            <button
                              type="button"
                              onClick={() => removeHeader(key)}
                              className="ml-1 hover:text-red-500"
                            >
                              <HiX className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {selectedType === 'email' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="forwardTo">Forward To *</Label>
                    <Input
                      id="forwardTo"
                      type="email"
                      value={emailConfig.forwardTo}
                      onChange={(e) => setEmailConfig(prev => ({ ...prev, forwardTo: e.target.value }))}
                      placeholder="recipient@example.com"
                      className={errors.forwardTo ? 'border-red-500' : ''}
                      autoFocus
                    />
                    {errors.forwardTo && <p className="text-sm text-red-500">{errors.forwardTo}</p>}
                  </div>

                  {/* Subject Prefix */}
                  <div className="space-y-2">
                    <Label htmlFor="subjectPrefix">Subject Prefix</Label>
                    <Input
                      id="subjectPrefix"
                      value={emailConfig.subjectPrefix}
                      onChange={(e) => setEmailConfig(prev => ({ ...prev, subjectPrefix: e.target.value }))}
                      placeholder="[Forwarded] "
                    />
                    <p className="text-xs text-gray-500">
                      Optional prefix to add to forwarded email subjects
                    </p>
                  </div>

                  {/* Include Attachments */}
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <Label className="text-sm font-medium">Include Attachments</Label>
                      <p className="text-xs text-gray-600">Forward email attachments</p>
                    </div>
                    <Switch
                      checked={emailConfig.includeAttachments}
                      onCheckedChange={(checked) => setEmailConfig(prev => ({ ...prev, includeAttachments: checked }))}
                    />
                  </div>
                </>
              )}

              {selectedType === 'email_group' && (
                <>
                  <div className="space-y-2">
                    <Label>Email Recipients *</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="recipient@example.com"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEmail())}
                        autoFocus
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={addEmail}
                        disabled={!newEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())}
                      >
                        <HiPlus className="h-4 w-4" />
                      </Button>
                    </div>
                    
                                      {emailGroupConfig.emails.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {emailGroupConfig.emails.map((email) => (
                        <Badge key={email} variant="secondary" className="text-xs">
                          {email}
                          <button
                            type="button"
                            onClick={() => removeEmail(email)}
                            className="ml-1 hover:text-red-500"
                          >
                            <HiX className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  {errors.emails && <p className="text-sm text-red-500">{errors.emails}</p>}
                </div>

                {/* Subject Prefix */}
                <div className="space-y-2">
                  <Label htmlFor="subjectPrefix">Subject Prefix</Label>
                  <Input
                    id="subjectPrefix"
                    value={emailGroupConfig.subjectPrefix}
                    onChange={(e) => setEmailGroupConfig(prev => ({ ...prev, subjectPrefix: e.target.value }))}
                    placeholder="[Forwarded] "
                  />
                  <p className="text-xs text-gray-500">
                    Optional prefix to add to forwarded email subjects
                  </p>
                </div>

                  {/* Include Attachments */}
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <Label className="text-sm font-medium">Include Attachments</Label>
                      <p className="text-xs text-gray-600">Forward email attachments</p>
                    </div>
                    <Switch
                      checked={emailGroupConfig.includeAttachments}
                      onCheckedChange={(checked) => setEmailGroupConfig(prev => ({ ...prev, includeAttachments: checked }))}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {currentStep !== 'type' && (
              <Button variant="secondary" onClick={handlePrevious}>
                <HiArrowLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            {currentStep === 'config' ? (
              <Button
                onClick={handleSubmit}
                disabled={createEndpointMutation.isPending || !selectedType}
                className={`${
                  selectedType === 'webhook' ? 'bg-purple-600 hover:bg-purple-700' :
                  selectedType === 'email' ? 'bg-blue-600 hover:bg-blue-700' :
                  selectedType === 'email_group' ? 'bg-green-600 hover:bg-green-700' :
                  'bg-gray-600 hover:bg-gray-700'
                }`}
              >
                {createEndpointMutation.isPending ? 'Creating...' : 'Create Endpoint'}
              </Button>
            ) : (
              <Button
                onClick={handleNext}
                disabled={!canProceedToNextStep()}
              >
                Next
                <HiArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 