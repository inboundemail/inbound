"use client"

import { useEffect } from 'react'
import { useDeleteEndpointMutation } from '@/features/endpoints/hooks'
import { Endpoint } from '@/features/endpoints/types'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import CircleWarning2 from '@/components/icons/circle-warning-2'
import BoltLightning from '@/components/icons/bolt-lightning'
import Envelope2 from '@/components/icons/envelope-2'
import UserGroup from '@/components/icons/user-group'
import { toast } from 'sonner'

interface DeleteEndpointDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  endpoint: Endpoint | null
}

export function DeleteEndpointDialog({ open, onOpenChange, endpoint }: DeleteEndpointDialogProps) {
  const deleteEndpointMutation = useDeleteEndpointMutation()

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        if (!deleteEndpointMutation.isPending && endpoint) {
          handleDelete()
        }
      }
    }

    if (open) {
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, deleteEndpointMutation.isPending, endpoint])

  const handleDelete = async () => {
    if (!endpoint) return

    try {
      const result = await deleteEndpointMutation.mutateAsync(endpoint.id)
      
      // Show success message with cleanup info if available
      if (result?.message) {
        toast.success(result.message)
      } else {
        toast.success('Endpoint deleted successfully!')
      }
      
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete endpoint')
    }
  }

  const getEndpointIcon = () => {
    switch (endpoint?.type) {
      case 'webhook':
        return BoltLightning
      case 'email':
        return Envelope2
      case 'email_group':
        return UserGroup
      default:
        return CircleWarning2
    }
  }

  const getEndpointTypeLabel = () => {
    switch (endpoint?.type) {
      case 'webhook':
        return 'Webhook'
      case 'email':
        return 'Email Forward'
      case 'email_group':
        return 'Email Group'
      default:
        return 'Endpoint'
    }
  }

  const getConfigSummary = () => {
    if (!endpoint?.config) return null

    try {
      const config = JSON.parse(endpoint.config)
      
      switch (endpoint.type) {
        case 'webhook':
          return config.url
        case 'email':
          return `→ ${config.forwardTo}`
        case 'email_group':
          return `→ ${config.emails?.length || 0} recipients`
        default:
          return null
      }
    } catch {
      return null
    }
  }

  if (!endpoint) return null

  const EndpointIcon = getEndpointIcon()
  const configSummary = getConfigSummary()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-100">
              <CircleWarning2 className="h-4 w-4 text-red-600" />
            </div>
            Delete {getEndpointTypeLabel()}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <CircleWarning2 className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-medium text-red-800 mb-1">
                  This action cannot be undone
                </h4>
                <p className="text-sm text-red-700">
                  Deleting this {getEndpointTypeLabel().toLowerCase()} will permanently remove it and stop all email deliveries to this endpoint.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              You are about to delete the {getEndpointTypeLabel().toLowerCase()}:
            </p>
            <div className="bg-gray-50 rounded-lg p-3 border">
              <div className="flex items-center gap-2 mb-1">
                <EndpointIcon className="h-4 w-4 text-gray-500" />
                <div className="font-medium text-gray-900">{endpoint.name}</div>
                <span className="text-xs px-2 py-1 bg-gray-200 text-gray-700 rounded-full">
                  {getEndpointTypeLabel()}
                </span>
              </div>
              {configSummary && (
                <div className="text-sm text-gray-600 font-mono">{configSummary}</div>
              )}
              {endpoint.description && (
                <div className="text-sm text-gray-500 mt-1">{endpoint.description}</div>
              )}
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm text-amber-800">
              <strong>Note:</strong> Any email addresses using this endpoint will be automatically switched to "store-only" mode (emails will be received and stored but not forwarded).
            </p>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Press Cmd+Enter to delete
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              disabled={deleteEndpointMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteEndpointMutation.isPending ? 'Deleting...' : `Delete ${getEndpointTypeLabel()}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 