"use client"

import React from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useDeleteMultipleEndpointsMutation } from '@/features/endpoints/hooks'
import { Endpoint } from '@/features/endpoints/types'
import Trash2 from '@/components/icons/trash-2'
import CircleWarning2 from '@/components/icons/circle-warning-2'
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
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/20">
              <CircleWarning2 className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <DialogTitle>Delete Multiple Endpoints</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete {endpoints.length} endpoint{endpoints.length !== 1 ? 's' : ''}?
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-4 p-4 bg-muted rounded-lg">
          <div className="text-sm text-foreground">
            <div className="font-medium mb-2">You are about to delete:</div>
            <div className="text-muted-foreground">{getEndpointTypeSummary()}</div>
            <div className="mt-3 space-y-1">
              {endpoints.slice(0, 5).map((endpoint) => (
                <div key={endpoint.id} className="text-xs text-muted-foreground font-mono">
                  • {endpoint.name}
                </div>
              ))}
              {endpoints.length > 5 && (
                <div className="text-xs text-muted-foreground">
                  ... and {endpoints.length - 5} more
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <div className="flex items-start gap-3">
            <CircleWarning2 className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-destructive mb-1">
                This action cannot be undone
              </h4>
              <p className="text-sm text-destructive/80">
                Deleting these endpoints will permanently remove them and stop all email deliveries to these endpoints.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            disabled={deleteMultipleMutation.isPending}
            variant="destructive"
          >
            {deleteMultipleMutation.isPending ? 'Deleting...' : `Delete ${endpoints.length} Endpoint${endpoints.length !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
} 