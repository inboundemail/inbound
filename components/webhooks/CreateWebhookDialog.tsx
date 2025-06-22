"use client"

import { useState, useEffect } from 'react'
import { useCreateWebhookMutation } from '@/features/webhooks/hooks'
import { CreateWebhookData } from '@/features/webhooks/types'
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
import { HiLightningBolt, HiX, HiPlus } from 'react-icons/hi'
import { toast } from 'sonner'

interface CreateWebhookDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateWebhookDialog({ open, onOpenChange }: CreateWebhookDialogProps) {
  const [formData, setFormData] = useState<CreateWebhookData>({
    name: '',
    url: '',
    description: '',
    timeout: 30,
    retryAttempts: 3,
    headers: {}
  })
  const [headerKey, setHeaderKey] = useState('')
  const [headerValue, setHeaderValue] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const createWebhookMutation = useCreateWebhookMutation()

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        if (!createWebhookMutation.isPending && validateForm()) {
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
  }, [open, createWebhookMutation.isPending, formData])

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    }

    if (!formData.url.trim()) {
      newErrors.url = 'URL is required'
    } else {
      try {
        new URL(formData.url)
      } catch {
        newErrors.url = 'Please enter a valid URL'
      }
    }

    if (formData.timeout && (formData.timeout < 1 || formData.timeout > 300)) {
      newErrors.timeout = 'Timeout must be between 1 and 300 seconds'
    }

    if (formData.retryAttempts && (formData.retryAttempts < 0 || formData.retryAttempts > 10)) {
      newErrors.retryAttempts = 'Retry attempts must be between 0 and 10'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    try {
      await createWebhookMutation.mutateAsync(formData)
      toast.success('Webhook created successfully!')
      handleClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create webhook')
    }
  }

  const handleClose = () => {
    setFormData({
      name: '',
      url: '',
      description: '',
      timeout: 30,
      retryAttempts: 3,
      headers: {}
    })
    setHeaderKey('')
    setHeaderValue('')
    setErrors({})
    onOpenChange(false)
  }

  const addHeader = () => {
    if (headerKey.trim() && headerValue.trim()) {
      setFormData(prev => ({
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
    setFormData(prev => {
      const newHeaders = { ...prev.headers }
      delete newHeaders[key]
      return {
        ...prev,
        headers: newHeaders
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100">
              <HiLightningBolt className="h-4 w-4 text-purple-600" />
            </div>
            Create New Webhook
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Production Webhook"
              className={errors.name ? 'border-red-500' : ''}
            />
            {errors.name && <p className="text-sm text-red-500">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">URL *</Label>
            <Input
              id="url"
              type="url"
              value={formData.url}
              onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
              placeholder="https://your-app.com/webhooks/inbound"
              className={errors.url ? 'border-red-500' : ''}
            />
            {errors.url && <p className="text-sm text-red-500">{errors.url}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Optional description of this webhook's purpose"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="timeout">Timeout (seconds)</Label>
              <Input
                id="timeout"
                type="number"
                min="1"
                max="300"
                value={formData.timeout || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, timeout: parseInt(e.target.value) || 30 }))}
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
                value={formData.retryAttempts || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, retryAttempts: parseInt(e.target.value) || 3 }))}
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
                <HiPlus className="h-4 w-4" />
              </Button>
            </div>
            
            {Object.entries(formData.headers || {}).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {Object.entries(formData.headers || {}).map(([key, value]) => (
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
        </form>

        <DialogFooter className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Press Cmd+Enter to submit
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createWebhookMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {createWebhookMutation.isPending ? 'Creating...' : 'Create Webhook'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 