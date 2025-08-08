"use client"

import { useState, useEffect } from 'react'
import { useUpdateEndpointMutation } from '@/features/endpoints/hooks'
import { useDomainsStatsQuery } from '@/features/domains/hooks/useDomainsQuery'
import { Endpoint, UpdateEndpointData, WebhookConfig, EmailForwardConfig, EmailGroupConfig } from '@/features/endpoints/types'
import { WEBHOOK_FORMAT_CONFIGS, getWebhookFormatConfig } from '@/lib/webhooks/webhook-formats'
import type { WebhookFormat } from '@/lib/db/schema'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import Gear2 from '@/components/icons/gear-2'
import TabClose from '@/components/icons/tab-close'
import CirclePlus from '@/components/icons/circle-plus'
import BoltLightning from '@/components/icons/bolt-lightning'
import Envelope2 from '@/components/icons/envelope-2'
import UserGroup from '@/components/icons/user-group'
import { toast } from 'sonner'

interface EditEndpointDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  endpoint: Endpoint | null
}

export function EditEndpointDialog({ open, onOpenChange, endpoint }: EditEndpointDialogProps) {
  const [formData, setFormData] = useState<UpdateEndpointData>({
    name: '',
    description: '',
    isActive: true
  })
  
  const [webhookFormat, setWebhookFormat] = useState<WebhookFormat>('inbound')
  
  const [webhookConfig, setWebhookConfig] = useState<WebhookConfig>({
    url: '',
    timeout: 30,
    retryAttempts: 3,
    headers: {}
  })
  const [headerKey, setHeaderKey] = useState('')
  const [headerValue, setHeaderValue] = useState('')
  
  const [emailConfig, setEmailConfig] = useState<EmailForwardConfig>({
    forwardTo: '',
    includeAttachments: true,
    subjectPrefix: '',
    fromAddress: ''
  })
  
  const [emailGroupConfig, setEmailGroupConfig] = useState<EmailGroupConfig>({
    emails: [],
    includeAttachments: true,
    subjectPrefix: '',
    fromAddress: ''
  })
  const [newEmail, setNewEmail] = useState('')
  
  const [errors, setErrors] = useState<Record<string, string>>({})

  const updateEndpointMutation = useUpdateEndpointMutation()
  const { data: domainsData } = useDomainsStatsQuery()

  const verifiedDomains = domainsData?.domains?.filter(domain => domain.isVerified) || []

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        if (!updateEndpointMutation.isPending && endpoint && validateForm()) {
          handleSubmit(event as any)
        }
      }
    }

    if (open) {
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, updateEndpointMutation.isPending, endpoint, formData, webhookConfig, emailConfig, emailGroupConfig])

  useEffect(() => {
    if (endpoint && open) {
      // Reset form data when endpoint changes and dialog is open
      setFormData({
        name: endpoint.name,
        description: endpoint.description || '',
        isActive: endpoint.isActive ?? true
      })

      // Set webhook format from endpoint
      if (endpoint.type === 'webhook') {
        setWebhookFormat((endpoint.webhookFormat as WebhookFormat) || 'inbound')
      }

      let parsedConfig = {}
      if (endpoint.config) {
        try {
          parsedConfig = JSON.parse(endpoint.config)
        } catch (e) {
          console.error('Failed to parse endpoint config:', e)
          parsedConfig = {}
        }
      }

      if (endpoint.type === 'webhook') {
        setWebhookConfig({
          url: (parsedConfig as WebhookConfig).url || '',
          timeout: (parsedConfig as WebhookConfig).timeout || 30,
          retryAttempts: (parsedConfig as WebhookConfig).retryAttempts || 3,
          headers: (parsedConfig as WebhookConfig).headers || {}
        })
      } else if (endpoint.type === 'email') {
        setEmailConfig({
          forwardTo: (parsedConfig as EmailForwardConfig).forwardTo || '',
          includeAttachments: (parsedConfig as EmailForwardConfig).includeAttachments ?? true,
          subjectPrefix: (parsedConfig as EmailForwardConfig).subjectPrefix || '',
          fromAddress: (parsedConfig as EmailForwardConfig).fromAddress || ''
        })
      } else if (endpoint.type === 'email_group') {
        setEmailGroupConfig({
          emails: (parsedConfig as EmailGroupConfig).emails || [],
          includeAttachments: (parsedConfig as EmailGroupConfig).includeAttachments ?? true,
          subjectPrefix: (parsedConfig as EmailGroupConfig).subjectPrefix || '',
          fromAddress: (parsedConfig as EmailGroupConfig).fromAddress || ''
        })
      }
      
      // Clear any previous errors
      setErrors({})
    }
  }, [endpoint, open])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.name?.trim()) {
      newErrors.name = 'Name is required'
    }

    if (!endpoint) {
      setErrors(newErrors)
      return false
    }

    if (endpoint.type === 'webhook') {
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

    if (endpoint.type === 'email') {
      if (!emailConfig.forwardTo.trim()) {
        newErrors.forwardTo = 'Forward to email is required'
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailConfig.forwardTo)) {
        newErrors.forwardTo = 'Please enter a valid email address'
      }
    }

    if (endpoint.type === 'email_group') {
      if (emailGroupConfig.emails.length === 0) {
        newErrors.emails = 'At least one email address is required'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!endpoint || !validateForm()) {
      return
    }

    let config: WebhookConfig | EmailForwardConfig | EmailGroupConfig

    switch (endpoint.type) {
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

    const updateData: UpdateEndpointData = {
      ...formData,
      webhookFormat: endpoint.type === 'webhook' ? webhookFormat : undefined,
      config
    }

    try {
      await updateEndpointMutation.mutateAsync({
        id: endpoint.id,
        data: updateData
      })
      toast.success('Endpoint updated successfully!')
      handleClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update endpoint')
    }
  }

  const handleClose = () => {
    // Only clear temporary input fields, not the main form data
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
    switch (endpoint?.type) {
      case 'webhook':
        return { icon: BoltLightning, color: 'purple' }
      case 'email':
        return { icon: Envelope2, color: 'blue' }
      case 'email_group':
        return { icon: UserGroup, color: 'green' }
      default:
        return { icon: Gear2, color: 'gray' }
    }
  }

  if (!endpoint) return null

  const { icon: DialogIcon, color } = getDialogIcon()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted">
              <DialogIcon className="h-4 w-4 text-muted-foreground" />
            </div>
            Edit Endpoint
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div>
              <Label className="text-sm font-medium">Status</Label>
              <p className="text-xs text-muted-foreground">Enable or disable this endpoint</p>
            </div>
            <Switch
              checked={formData.isActive}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Basic Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-foreground border-b border-border pb-2">Basic Information</h3>
              
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={`${endpoint.type === 'webhook' ? 'Production Webhook' : endpoint.type === 'email' ? 'Support Email Forward' : 'Team Email Group'}`}
                  className={errors.name ? 'border-red-500' : ''}
                />
                {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description of this endpoint's purpose"
                  rows={3}
                />
              </div>

              {endpoint.type === 'webhook' && (
                <div className="space-y-2">
                  <Label htmlFor="url">URL *</Label>
                  <Input
                    id="url"
                    type="url"
                    value={webhookConfig.url || ''}
                    onChange={(e) => setWebhookConfig(prev => ({ ...prev, url: e.target.value }))}
                    placeholder="https://your-app.com/webhooks/inbound"
                    className={errors.url ? 'border-red-500' : ''}
                  />
                  {errors.url && <p className="text-sm text-red-500">{errors.url}</p>}
                </div>
              )}
            </div>

            {/* Right Column - Configuration */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-foreground border-b border-border pb-2">Configuration</h3>

              {endpoint.type === 'webhook' && (
                <>
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
                              ? 'border-border bg-muted cursor-not-allowed opacity-60'
                              : webhookFormat === format
                                ? 'border-primary bg-accent ring-1 ring-primary cursor-pointer'
                                : 'border-border hover:border-muted-foreground cursor-pointer'
                          }`}
                          onClick={() => !isDisabled && setWebhookFormat(format as WebhookFormat)}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 h-4 w-4 rounded-full border-2 transition-colors ${
                              isDisabled
                                ? 'border-muted-foreground bg-muted'
                                : webhookFormat === format
                                  ? 'border-primary bg-primary'
                                  : 'border-muted-foreground'
                            }`}>
                              {webhookFormat === format && !isDisabled && (
                                <div className="h-full w-full rounded-full bg-white scale-50" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-foreground">{config.name}</h4>
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
                    <Label>Custom Headers</Label>
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
                        <CirclePlus className="h-4 w-4" />
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
                              <TabClose className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {endpoint.type === 'email' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="forwardTo">Forward To Email *</Label>
                    <Input
                      id="forwardTo"
                      type="email"
                      value={emailConfig.forwardTo || ''}
                      onChange={(e) => setEmailConfig(prev => ({ ...prev, forwardTo: e.target.value }))}
                      placeholder="support@yourcompany.com"
                      className={errors.forwardTo ? 'border-red-500' : ''}
                    />
                    {errors.forwardTo && <p className="text-sm text-red-500">{errors.forwardTo}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fromAddress">From Address</Label>
                    <Select
                      value={emailConfig.fromAddress || 'auto-detect'}
                      onValueChange={(value) => setEmailConfig(prev => ({ 
                        ...prev, 
                        fromAddress: value === 'auto-detect' ? '' : value 
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Auto-detect from domain" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto-detect">Auto-detect from domain</SelectItem>
                        {verifiedDomains.map((domain) => (
                          <SelectItem key={domain.id} value={`noreply@${domain.domain}`}>
                            noreply@{domain.domain}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="senderName">Sender Name</Label>
                    <Input
                      id="senderName"
                      value={emailConfig.senderName || ''}
                      onChange={(e) => setEmailConfig(prev => ({ ...prev, senderName: e.target.value }))}
                      placeholder="Support Team (leave empty for 'Original Sender via Inbound')"
                    />
                    <p className="text-sm text-muted-foreground">
                      Custom display name for forwarded emails. If empty, will use "Original Sender via Inbound" format.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subjectPrefix">Subject Prefix</Label>
                    <Input
                      id="subjectPrefix"
                      value={emailConfig.subjectPrefix || ''}
                      onChange={(e) => setEmailConfig(prev => ({ ...prev, subjectPrefix: e.target.value }))}
                      placeholder="[Support]"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="includeAttachments"
                      checked={emailConfig.includeAttachments}
                      onCheckedChange={(checked) => setEmailConfig(prev => ({ ...prev, includeAttachments: checked }))}
                    />
                    <Label htmlFor="includeAttachments">Include attachments</Label>
                  </div>
                </>
              )}

              {endpoint.type === 'email_group' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="emails">Email Addresses *</Label>
                    <div className="flex gap-2">
                      <Input
                        id="emails"
                        type="email"
                        placeholder="team@yourcompany.com"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEmail())}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={addEmail}
                        disabled={!newEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())}
                      >
                        <CirclePlus className="h-4 w-4" />
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
                              <TabClose className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    {errors.emails && <p className="text-sm text-red-500">{errors.emails}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fromAddressGroup">From Address</Label>
                    <Select
                      value={emailGroupConfig.fromAddress || 'auto-detect'}
                      onValueChange={(value) => setEmailGroupConfig(prev => ({ 
                        ...prev, 
                        fromAddress: value === 'auto-detect' ? '' : value 
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Auto-detect from domain" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto-detect">Auto-detect from domain</SelectItem>
                        {verifiedDomains.map((domain) => (
                          <SelectItem key={domain.id} value={`noreply@${domain.domain}`}>
                            noreply@{domain.domain}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="senderNameGroup">Sender Name</Label>
                    <Input
                      id="senderNameGroup"
                      value={emailGroupConfig.senderName || ''}
                      onChange={(e) => setEmailGroupConfig(prev => ({ ...prev, senderName: e.target.value }))}
                      placeholder="Team Support (leave empty for 'Original Sender via Inbound')"
                    />
                    <p className="text-sm text-muted-foreground">
                      Custom display name for forwarded emails. If empty, will use "Original Sender via Inbound" format.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subjectPrefixGroup">Subject Prefix</Label>
                    <Input
                      id="subjectPrefixGroup"
                      value={emailGroupConfig.subjectPrefix || ''}
                      onChange={(e) => setEmailGroupConfig(prev => ({ ...prev, subjectPrefix: e.target.value }))}
                      placeholder="[Team]"
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="includeAttachmentsGroup"
                      checked={emailGroupConfig.includeAttachments}
                      onCheckedChange={(checked) => setEmailGroupConfig(prev => ({ ...prev, includeAttachments: checked }))}
                    />
                    <Label htmlFor="includeAttachmentsGroup">Include attachments</Label>
                  </div>
                </>
              )}
            </div>
          </div>
        </form>

        <DialogFooter className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Press Cmd+Enter to submit
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={updateEndpointMutation.isPending}
            >
              {updateEndpointMutation.isPending ? 'Updating...' : 'Update Endpoint'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 