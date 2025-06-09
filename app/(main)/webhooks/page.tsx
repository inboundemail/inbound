"use client"

import { useState } from 'react'
import { useSession } from '@/lib/auth-client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  CheckCircleIcon,
  XCircleIcon,
  PlusIcon,
  TrendingUpIcon,
  CalendarIcon,
  RefreshCwIcon,
  TrashIcon,
  SettingsIcon,
  PlayIcon,
  AlertTriangleIcon,
  WebhookIcon
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import {
  useWebhooksQuery,
  useCreateWebhookMutation,
  useUpdateWebhookMutation,
  useDeleteWebhookMutation,
  useTestWebhookMutation
} from '@/features/webhooks/hooks'
import { Webhook } from '@/features/webhooks/types'

export default function WebhooksPage() {
  const { data: session } = useSession()

  // React Query hooks
  const {
    data: webhooks = [],
    isLoading,
    error,
    refetch: refetchWebhooks
  } = useWebhooksQuery()

  const createWebhookMutation = useCreateWebhookMutation()
  const updateWebhookMutation = useUpdateWebhookMutation()
  const deleteWebhookMutation = useDeleteWebhookMutation()
  const testWebhookMutation = useTestWebhookMutation()

  // Create webhook state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    url: '',
    description: '',
    timeout: 30,
    retryAttempts: 3
  })
  const [createError, setCreateError] = useState<string | null>(null)

  // Edit webhook state
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    url: '',
    description: '',
    isActive: true,
    timeout: 30,
    retryAttempts: 3
  })
  const [editError, setEditError] = useState<string | null>(null)

  const handleCreateWebhook = async () => {
    if (!createForm.name.trim() || !createForm.url.trim()) {
      setCreateError('Name and URL are required')
      return
    }

    setCreateError(null)

    try {
      await createWebhookMutation.mutateAsync(createForm)
      toast.success('Webhook created successfully!')
      setIsCreateDialogOpen(false)
      setCreateForm({
        name: '',
        url: '',
        description: '',
        timeout: 30,
        retryAttempts: 3
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create webhook'
      setCreateError(errorMessage)
      toast.error(errorMessage)
    }
  }

  const handleTestWebhook = async (webhookId: string) => {
    try {
      const result = await testWebhookMutation.mutateAsync(webhookId)
      toast.success(`Webhook test successful! Response: ${result.statusCode}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to test webhook'
      toast.error(`Webhook test failed: ${errorMessage}`)
    }
  }

  const handleDeleteWebhook = async (webhookId: string, webhookName: string) => {
    if (!confirm(`Are you sure you want to delete the webhook "${webhookName}"?`)) {
      return
    }

    try {
      await deleteWebhookMutation.mutateAsync(webhookId)
      toast.success('Webhook deleted successfully')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete webhook'
      toast.error(errorMessage)
    }
  }

  const openEditDialog = (webhook: Webhook) => {
    setEditingWebhook(webhook)
    setEditForm({
      name: webhook.name,
      url: webhook.url,
      description: webhook.description || '',
      isActive: webhook.isActive || true,
      timeout: webhook.timeout || 30,
      retryAttempts: webhook.retryAttempts || 3
    })
    setEditError(null)
    setIsEditDialogOpen(true)
  }

  const handleEditWebhook = async () => {
    if (!editForm.name.trim() || !editForm.url.trim() || !editingWebhook) {
      setEditError('Name and URL are required')
      return
    }

    setEditError(null)

    try {
      await updateWebhookMutation.mutateAsync({
        id: editingWebhook.id,
        data: editForm
      })
      toast.success('Webhook updated successfully!')
      setIsEditDialogOpen(false)
      setEditingWebhook(null)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update webhook'
      setEditError(errorMessage)
      toast.error(errorMessage)
    }
  }

  const getStatusBadge = (webhook: Webhook) => {
    if (webhook.isActive) {
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-200 transition-colors">
          <CheckCircleIcon className="h-3 w-3 mr-1" />
          Active
        </Badge>
      )
    } else {
      return (
        <Badge className="bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 transition-colors">
          <XCircleIcon className="h-3 w-3 mr-1" />
          Disabled
        </Badge>
      )
    }
  }

  const getSuccessRate = (webhook: Webhook) => {
    if (!webhook.totalDeliveries) return 0
    return Math.round(((webhook.successfulDeliveries || 0) / webhook.totalDeliveries) * 100)
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        {/* Header with Gradient */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 p-8 text-white shadow-xl">
          <div className="absolute inset-0 bg-black/10"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-bold tracking-tight mb-2">Webhooks</h1>
                <p className="text-purple-100 text-lg">
                  Manage webhook endpoints for email notifications
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="secondary" disabled className="bg-white/20 border-white/30 text-white hover:bg-white/30">
                  <RefreshCwIcon className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
                <Button disabled className="bg-white text-purple-700 hover:bg-white/90 font-semibold shadow-lg">
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Create Webhook
                </Button>
              </div>
            </div>
          </div>
          {/* Decorative elements */}
          <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
          <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>
        </div>

        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            <span className="text-muted-foreground">Loading webhooks...</span>
          </div>
        </div>
      </div>
    )
  }

  // Calculate webhook stats
  const totalWebhooks = webhooks.length
  const activeWebhooks = webhooks.filter(w => w.isActive).length
  const totalDeliveries = webhooks.reduce((sum, w) => sum + (w.totalDeliveries || 0), 0)
  const successfulDeliveries = webhooks.reduce((sum, w) => sum + (w.successfulDeliveries || 0), 0)
  const overallSuccessRate = totalDeliveries > 0 ? Math.round((successfulDeliveries / totalDeliveries) * 100) : 0

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header with Gradient */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 p-8 text-white shadow-xl">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2">Webhooks</h1>
              <p className="text-purple-100 text-lg">
                Manage webhook endpoints for email notifications
              </p>
              {webhooks.length > 0 && (
                <div className="flex items-center gap-6 mt-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                    <span className="text-purple-100">{totalWebhooks} Total Webhooks</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-300 rounded-full"></div>
                    <span className="text-purple-100">{activeWebhooks} Active</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-300 rounded-full"></div>
                    <span className="text-purple-100">{overallSuccessRate}% Success Rate</span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                onClick={() => refetchWebhooks()}
                disabled={isLoading}
                className="bg-white/20 border-white/30 text-white hover:bg-white/30 backdrop-blur-sm"
              >
                <RefreshCwIcon className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button onClick={() => setIsCreateDialogOpen(true)} className="bg-white text-purple-700 hover:bg-white/90 font-semibold shadow-lg">
                <PlusIcon className="h-4 w-4 mr-2" />
                Create Webhook
              </Button>
            </div>
          </div>
        </div>
        {/* Decorative elements */}
        <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <XCircleIcon className="h-4 w-4" />
              <span>{error.message}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => refetchWebhooks()}
                className="ml-auto text-red-600 hover:text-red-700"
              >
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Webhooks Table */}
      <div>
        {webhooks.length === 0 ? (
          <div className="text-center py-12">
            <WebhookIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No webhooks configured</h3>
            <p className="text-muted-foreground mb-4">
              Create your first webhook to receive email notifications.
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <PlusIcon className="h-4 w-4 mr-2" />
              Create Your First Webhook
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden">
            {/* Table Header with Rounded Border */}
            <div className="border border-border bg-muted/30 rounded-lg px-6 py-3">
              <div className="grid grid-cols-6 gap-4 text-sm font-medium text-muted-foreground">
                <span className="flex items-center gap-2">
                  <WebhookIcon className="h-4 w-4" />
                  Name
                </span>
                <span>URL</span>
                <span>Status</span>
                <span>Success Rate</span>
                <span>Last Used</span>
                <span className="text-right">Actions</span>
              </div>
            </div>

            {/* Table Body */}
            <div className="">
              <Table>
                <TableBody>
                  {webhooks.map((webhook, index) => (
                    <TableRow
                      key={webhook.id}
                      className={`hover:bg-muted/50 transition-colors ${index < webhooks.length - 1 ? 'border-b border-border/50' : ''
                        }`}
                    >
                      <TableCell className="w-1/6">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-purple-100 border-2 border-purple-200">
                            <WebhookIcon className="h-4 w-4 text-purple-600" />
                          </div>
                          <div>
                            <div className="font-medium text-base py-2">{webhook.name}</div>
                            {webhook.description && (
                              <div className="text-sm text-muted-foreground">
                                {webhook.description}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="w-1/6">
                        <div className="font-mono text-sm max-w-xs truncate">
                          {webhook.url}
                        </div>
                      </TableCell>
                      <TableCell className="w-1/6">
                        {getStatusBadge(webhook)}
                      </TableCell>
                      <TableCell className="w-1/6">
                        <div className="flex items-center gap-2">
                          <TrendingUpIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {getSuccessRate(webhook)}%
                          </span>
                          <span className="text-sm text-muted-foreground">
                            ({webhook.successfulDeliveries}/{webhook.totalDeliveries})
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="w-1/6">
                        <div className="flex items-center gap-2">
                          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                          {webhook.lastUsed ? (
                            <span className="text-sm">
                              {formatDistanceToNow(new Date(webhook.lastUsed), { addSuffix: true })}
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">Never</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="w-1/6 text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => testWebhookMutation.mutateAsync(webhook.id)}
                            disabled={testWebhookMutation.isPending || !webhook.isActive}
                            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            {testWebhookMutation.isPending ? (
                              <RefreshCwIcon className="h-4 w-4 animate-spin" />
                            ) : (
                              <PlayIcon className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(webhook)}
                            className="text-gray-600 hover:text-gray-700 hover:bg-gray-50"
                          >
                            <SettingsIcon className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteWebhookMutation.mutateAsync(webhook.id)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      {/* Create Webhook Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Webhook</DialogTitle>
            <DialogDescription>
              Add a new webhook endpoint to receive email notifications.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="webhook-name">Name *</Label>
              <Input
                id="webhook-name"
                placeholder="My Email Webhook"
                value={createForm.name}
                onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                disabled={createWebhookMutation.isPending}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="webhook-url">URL *</Label>
              <Input
                id="webhook-url"
                placeholder="https://api.example.com/webhooks/email"
                value={createForm.url}
                onChange={(e) => setCreateForm(prev => ({ ...prev, url: e.target.value }))}
                disabled={createWebhookMutation.isPending}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="webhook-description">Description</Label>
              <Textarea
                id="webhook-description"
                placeholder="Optional description for this webhook"
                value={createForm.description}
                onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                disabled={createWebhookMutation.isPending}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="webhook-timeout">Timeout (seconds)</Label>
                <Input
                  id="webhook-timeout"
                  type="number"
                  min="1"
                  max="300"
                  value={createForm.timeout}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, timeout: parseInt(e.target.value) || 30 }))}
                  disabled={createWebhookMutation.isPending}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="webhook-retries">Retry Attempts</Label>
                <Input
                  id="webhook-retries"
                  type="number"
                  min="0"
                  max="10"
                  value={createForm.retryAttempts}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, retryAttempts: parseInt(e.target.value) || 3 }))}
                  disabled={createWebhookMutation.isPending}
                />
              </div>
            </div>
            {createError && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertTriangleIcon className="h-4 w-4" />
                <span>{createError}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setIsCreateDialogOpen(false)
                setCreateForm({
                  name: '',
                  url: '',
                  description: '',
                  timeout: 30,
                  retryAttempts: 3
                })
                setCreateError(null)
              }}
              disabled={createWebhookMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateWebhook}
              disabled={createWebhookMutation.isPending || !createForm.name.trim() || !createForm.url.trim()}
            >
              {createWebhookMutation.isPending ? (
                <>
                  <RefreshCwIcon className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Create Webhook
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Webhook Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Webhook</DialogTitle>
            <DialogDescription>
              Edit the details of the webhook.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="webhook-name">Name *</Label>
              <Input
                id="webhook-name"
                placeholder="My Email Webhook"
                value={editForm.name}
                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                disabled={updateWebhookMutation.isPending}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="webhook-url">URL *</Label>
              <Input
                id="webhook-url"
                placeholder="https://api.example.com/webhooks/email"
                value={editForm.url}
                onChange={(e) => setEditForm(prev => ({ ...prev, url: e.target.value }))}
                disabled={updateWebhookMutation.isPending}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="webhook-description">Description</Label>
              <Textarea
                id="webhook-description"
                placeholder="Optional description for this webhook"
                value={editForm.description}
                onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                disabled={updateWebhookMutation.isPending}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="webhook-timeout">Timeout (seconds)</Label>
                <Input
                  id="webhook-timeout"
                  type="number"
                  min="1"
                  max="300"
                  value={editForm.timeout}
                  onChange={(e) => setEditForm(prev => ({ ...prev, timeout: parseInt(e.target.value) || 30 }))}
                  disabled={updateWebhookMutation.isPending}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="webhook-retries">Retry Attempts</Label>
                <Input
                  id="webhook-retries"
                  type="number"
                  min="0"
                  max="10"
                  value={editForm.retryAttempts}
                  onChange={(e) => setEditForm(prev => ({ ...prev, retryAttempts: parseInt(e.target.value) || 3 }))}
                  disabled={updateWebhookMutation.isPending}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="webhook-isActive">Status</Label>
              <Switch
                id="webhook-isActive"
                checked={editForm.isActive}
                onCheckedChange={(value) => setEditForm(prev => ({ ...prev, isActive: value }))}
                disabled={updateWebhookMutation.isPending}
              />
            </div>
            {editError && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertTriangleIcon className="h-4 w-4" />
                <span>{editError}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setIsEditDialogOpen(false)
                setEditForm({
                  name: '',
                  url: '',
                  description: '',
                  isActive: true,
                  timeout: 30,
                  retryAttempts: 3
                })
                setEditError(null)
              }}
              disabled={updateWebhookMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditWebhook}
              disabled={updateWebhookMutation.isPending || !editForm.name.trim() || !editForm.url.trim()}
            >
              {updateWebhookMutation.isPending ? (
                <>
                  <RefreshCwIcon className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <SettingsIcon className="h-4 w-4 mr-2" />
                  Update Webhook
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 