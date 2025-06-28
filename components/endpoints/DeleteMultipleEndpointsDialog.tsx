"use client"

import React from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useDeleteMultipleEndpointsMutation } from '@/features/endpoints/hooks'
import { Endpoint } from '@/features/endpoints/types'
import { HiTrash, HiExclamationCircle } from 'react-icons/hi'
import { toast } from 'sonner'

interface DeleteMultipleEndpointsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  endpoints: Endpoint[]
  onSuccess?: () => void
}

export const DeleteMultipleEndpointsDialog: React.FC<DeleteMultipleEndpointsDialogProps> = ({
  open,
  onOpenChange,
  endpoints,
  onSuccess
}) => {
  const deleteMultipleMutation = useDeleteMultipleEndpointsMutation()

  const handleDelete = async () => {
    try {
      const endpointIds = endpoints.map(e => e.id)
      const result = await deleteMultipleMutation.mutateAsync(endpointIds)
      
      if (result.success) {
        // Show enhanced message if available, otherwise use default
        const message = result.message || `Successfully deleted ${result.deletedCount} endpoint${result.deletedCount !== 1 ? 's' : ''}`
        toast.success(message)
        onOpenChange(false)
        onSuccess?.()
      } else {
        toast.error(result.error || 'Failed to delete endpoints')
      }
    } catch (error) {
      console.error('Error deleting endpoints:', error)
      toast.error('Failed to delete endpoints')
    }
  }

  const getEndpointTypeSummary = () => {
    const types = endpoints.reduce((acc, endpoint) => {
      acc[endpoint.type] = (acc[endpoint.type] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const summary = Object.entries(types).map(([type, count]) => {
      const label = type === 'webhook' ? 'webhook' : 
                   type === 'email' ? 'email forward' : 
                   type === 'email_group' ? 'email group' : 'endpoint'
      return `${count} ${label}${count !== 1 ? 's' : ''}`
    })

    return summary.join(', ')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <HiExclamationCircle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <DialogTitle>Delete Multiple Endpoints</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete {endpoints.length} endpoint{endpoints.length !== 1 ? 's' : ''}?
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-700">
            <div className="font-medium mb-2">You are about to delete:</div>
            <div className="text-gray-600">{getEndpointTypeSummary()}</div>
            <div className="mt-3 space-y-1">
              {endpoints.slice(0, 5).map((endpoint) => (
                <div key={endpoint.id} className="text-xs text-gray-500 font-mono">
                  • {endpoint.name}
                </div>
              ))}
              {endpoints.length > 5 && (
                <div className="text-xs text-gray-500">
                  ... and {endpoints.length - 5} more
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-2">
            <HiExclamationCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-red-700">
              <div className="font-medium">This action cannot be undone.</div>
              <div className="text-red-600">All selected endpoints and their configurations will be permanently deleted.</div>
              <div className="text-red-600 mt-1">Any email addresses using these endpoints will be switched to "store-only" mode.</div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={deleteMultipleMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMultipleMutation.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            <HiTrash className="h-4 w-4 mr-2" />
            {deleteMultipleMutation.isPending ? 'Deleting...' : `Delete ${endpoints.length} Endpoint${endpoints.length !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 