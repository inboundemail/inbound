"use client"

import React from 'react'
import { useSession } from '@/lib/auth/auth-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  useApiKeysQuery,
  useCreateApiKeyMutation,
  useUpdateApiKeyMutation,
  useDeleteApiKeyMutation,
} from '@/features/settings/hooks'
import {
  ApiKey,
  CreateApiKeyForm,
} from '@/features/settings/types'
import Key2 from "@/components/icons/key-2"
import CirclePlus from "@/components/icons/circle-plus"
import Clipboard2 from "@/components/icons/clipboard-2"
import Trash2 from "@/components/icons/trash-2"
import CircleCheck from "@/components/icons/circle-check"
import { formatDistanceToNow } from 'date-fns'
import { useRouter } from 'next/navigation'

export default function ApiKeysPage() {
  const { data: session, isPending } = useSession()
  const router = useRouter()
  
  // React Query hooks
  const { 
    data: apiKeysData = [], 
    isLoading: isLoadingApiKeys,
    error: apiKeysError
  } = useApiKeysQuery()

  // Sort API keys by creation date (newest first)
  const apiKeys = [...apiKeysData].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
  
  // Mutations
  const createApiKeyMutation = useCreateApiKeyMutation()
  const updateApiKeyMutation = useUpdateApiKeyMutation()
  const deleteApiKeyMutation = useDeleteApiKeyMutation()
  
  // API Key state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [newApiKey, setNewApiKey] = useState<string | null>(null)
  const [showNewApiKey, setShowNewApiKey] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState<CreateApiKeyForm>({
    name: '',
    prefix: ''
  })

  const handleCreateApiKey = async () => {
    try {
      const createData = {
        name: createForm.name || undefined,
        prefix: createForm.prefix || undefined,
      }
      
      const result = await createApiKeyMutation.mutateAsync(createData)
      
      if (result?.key) {
        setNewApiKey(result.key)
        setShowNewApiKey(true)
        toast.success('API key created successfully')
        
        // Reset form
        setCreateForm({
          name: '',
          prefix: ''
        })
      }
    } catch (error) {
      console.error('Error creating API key:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create API key')
    }
  }

  const handleDeleteApiKey = async (keyId: string) => {
    try {
      await deleteApiKeyMutation.mutateAsync(keyId)
      toast.success('API key deleted successfully')
    } catch (error) {
      console.error('Error deleting API key:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to delete API key')
    }
  }

  const handleUpdateApiKey = async (keyId: string, updates: { name?: string; enabled?: boolean }) => {
    try {
      await updateApiKeyMutation.mutateAsync({ keyId, ...updates })
      toast.success('API key updated successfully')
    } catch (error) {
      console.error('Error updating API key:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to update API key')
    }
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied to clipboard')
    } catch (error) {
      toast.error('Failed to copy to clipboard')
    }
  }

  if (isPending) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center py-20">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        </div>
      </div>
    )
  }

  if (!session) {
    router.push('/login')
    return null
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto p-4">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground mb-1 tracking-tight">
                API Keys
              </h2>
              <p className="text-muted-foreground text-sm font-medium">
                Manage API keys for programmatic access to your account
              </p>
            </div>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <CirclePlus width="16" height="16" className="mr-2" />
                  Create API Key
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Create New API Key</DialogTitle>
                  <DialogDescription>
                    Create a new API key for programmatic access to your account.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4" onKeyDown={(e) => {
                  if (e.key === 'Enter' && !createApiKeyMutation.isPending) {
                    e.preventDefault()
                    handleCreateApiKey()
                  }
                }}>
                  <div className="space-y-2">
                    <Label htmlFor="name">Name (optional)</Label>
                    <Input
                      id="name"
                      placeholder="My API Key"
                      value={createForm.name}
                      onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prefix">Prefix (optional)</Label>
                    <Input
                      id="prefix"
                      placeholder="myapp"
                      value={createForm.prefix}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\s+/g, '-')
                        setCreateForm(prev => ({ ...prev, prefix: value }))
                      }}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => setIsCreateDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateApiKey}
                      disabled={createApiKeyMutation.isPending}
                    >
                      {createApiKeyMutation.isPending ? 'Creating...' : 'Create API Key'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6">
          <div className="h-4 border-b border-slate-800"></div>
          
          {/* API Keys Management */}
          <Card className="border-none bg-transparent">
            <CardContent className="p-0 bg-transparent mb-4">
              {apiKeysError ? (
                <div className="text-center py-8">
                  <Key2 width="32" height="32" className="text-red-500 mx-auto mb-2" />
                  <p className="text-sm text-red-600 mb-3">Failed to load API keys</p>
                  <p className="text-xs text-muted-foreground mb-3">
                    {apiKeysError instanceof Error ? apiKeysError.message : 'Unknown error'}
                  </p>
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={() => window.location.reload()}
                  >
                    Retry
                  </Button>
                </div>
              ) : isLoadingApiKeys ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <Skeleton className="w-8 h-8 rounded-md" />
                        <div>
                          <Skeleton className="h-4 w-32 mb-1" />
                          <Skeleton className="h-3 w-40" />
                        </div>
                      </div>
                      <Skeleton className="h-6 w-16 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : apiKeys.length === 0 ? (
                <div className="text-center py-8">
                  <Key2 width="32" height="32" className="text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">No API keys created yet</p>
                  <Button 
                    variant="secondary" 
                    size="sm" 
                    onClick={() => setIsCreateDialogOpen(true)}
                  >
                    <CirclePlus width="16" height="16" className="mr-2" />
                    Create Your First API Key
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {apiKeys.map((apiKey) => (
                    <div 
                      key={apiKey.id}
                      className={`flex items-center justify-between p-1 ${apiKeys.length > 1 ? 'border-b' : ''}`}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className="flex items-center justify-center w-8 h-8 rounded-md bg-purple-100 border border-purple-200">
                          <Key2 width="16" height="16" className="text-purple-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="font-medium text-sm truncate">
                              {apiKey.name || 'Unnamed API Key'}
                            </div>
                            <Badge variant={apiKey.enabled ? "default" : "secondary"}>
                              {apiKey.enabled ? 'Active' : 'Disabled'}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground space-y-1">
                            <div className="flex items-center gap-4">
                              <span>Key: {apiKey.prefix ? `${apiKey.prefix}_` : ''}***{apiKey.start}</span>
                              {apiKey.remaining !== null && (
                                <span>Remaining: {apiKey.remaining.toLocaleString()}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-4">
                              <span>Created: {formatDistanceToNow(new Date(apiKey.createdAt), { addSuffix: true })}</span>
                              {apiKey.expiresAt && (
                                <span className={new Date(apiKey.expiresAt) < new Date() ? 'text-red-500' : ''}>
                                  Expires: {formatDistanceToNow(new Date(apiKey.expiresAt), { addSuffix: true })}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUpdateApiKey(apiKey.id, { enabled: !apiKey.enabled })}
                          disabled={updateApiKeyMutation.isPending}
                        >
                          {updateApiKeyMutation.isPending ? 'Updating...' : (apiKey.enabled ? 'Disable' : 'Enable')}
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-red-600 hover:text-red-700"
                          onClick={() => {
                            setKeyToDelete(apiKey.id)
                            setDeleteConfirmOpen(true)
                          }}
                        >
                          <Trash2 width="16" height="16" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete API Key</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this API key? This action cannot be undone and will immediately revoke access for any applications using this key.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="secondary"
              onClick={() => {
                setDeleteConfirmOpen(false)
                setKeyToDelete(null)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (keyToDelete) {
                  handleDeleteApiKey(keyToDelete)
                  setDeleteConfirmOpen(false)
                  setKeyToDelete(null)
                }
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New API Key Display Dialog */}
      <Dialog open={showNewApiKey} onOpenChange={setShowNewApiKey}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CircleCheck width="20" height="20" className="text-green-600" />
              API Key Created
            </DialogTitle>
            <DialogDescription>
              Your new API key has been created. Make sure to copy it now as you won't be able to see it again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>API Key</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={newApiKey || ''}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => copyToClipboard(newApiKey || '')}
                >
                  <Clipboard2 width="16" height="16" />
                </Button>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <div className="w-4 h-4 rounded-full bg-amber-500 mt-0.5 flex-shrink-0"></div>
                <div className="text-sm text-amber-800">
                  <strong>Important:</strong> This is the only time you'll see this API key. Make sure to copy and store it securely.
                </div>
              </div>
            </div>
            <Button 
              onClick={() => {
                setShowNewApiKey(false)
                setNewApiKey(null)
                setIsCreateDialogOpen(false)
              }}
              className="w-full"
            >
              I've Saved My API Key
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}