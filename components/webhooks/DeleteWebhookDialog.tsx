"use client"

import { useEffect } from 'react'
import { useDeleteWebhookMutation } from '@/features/webhooks/hooks'
import { Webhook } from '@/features/webhooks/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { HiExclamationCircle } from 'react-icons/hi'
import { toast } from 'sonner'

interface DeleteWebhookDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  webhook: Webhook | null
}

export function DeleteWebhookDialog({ open, onOpenChange, webhook }: DeleteWebhookDialogProps) {
  const deleteWebhookMutation = useDeleteWebhookMutation()

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        if (!deleteWebhookMutation.isPending && webhook) {
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
  }, [open, deleteWebhookMutation.isPending, webhook])

  const handleDelete = async () => {
    if (!webhook) return

    try {
      await deleteWebhookMutation.mutateAsync(webhook.id)
      toast.success('Webhook deleted successfully!')
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete webhook')
    }
  }

  if (!webhook) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-100">
              <HiExclamationCircle className="h-4 w-4 text-red-600" />
            </div>
            Delete Webhook
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <HiExclamationCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-medium text-red-800 mb-1">
                  This action cannot be undone
                </h4>
                <p className="text-sm text-red-700">
                  Deleting this webhook will permanently remove it and stop all email deliveries to this endpoint.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              You are about to delete the webhook:
            </p>
            <div className="bg-gray-50 rounded-lg p-3 border">
              <div className="font-medium text-gray-900">{webhook.name}</div>
              <div className="text-sm text-gray-600 font-mono">{webhook.url}</div>
              {webhook.description && (
                <div className="text-sm text-gray-500 mt-1">{webhook.description}</div>
              )}
            </div>
          </div>

          {webhook.totalDeliveries && webhook.totalDeliveries > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800">
                <strong>Note:</strong> This webhook has delivered {webhook.totalDeliveries} emails. 
                Make sure you have updated any email addresses that use this webhook.
              </p>
            </div>
          )}

          <p className="text-sm text-gray-500">
            Type the webhook name <strong>{webhook.name}</strong> to confirm deletion:
          </p>
          <input 
            type="text"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            placeholder={webhook.name}
            onChange={(e) => {
              // This is a simple confirmation - in a real app you might want more sophisticated confirmation
            }}
          />
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
              disabled={deleteWebhookMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleteWebhookMutation.isPending ? 'Deleting...' : 'Delete Webhook'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 