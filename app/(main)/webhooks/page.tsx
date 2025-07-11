"use client"

import React, { useState } from 'react'
import { useWebhooksQuery, useTestWebhookMutation } from '@/features/webhooks/hooks'
import { CreateWebhookDialog, EditWebhookDialog, DeleteWebhookDialog, TestWebhookDialog } from '@/components/webhooks'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { CopyButton } from '@/components/copy-button'
import { 
  HiCheckCircle, 
  HiX, 
  HiClock, 
  HiPlus,
  HiRefresh,
  HiLightningBolt,
  HiGlobeAlt,
  HiTrendingUp,
  HiExclamationCircle,
  HiShieldCheck,
  HiPlay,
  HiCog,
  HiDotsHorizontal,
  HiChartBar,
  HiClipboard,
  HiTrash
} from 'react-icons/hi'
import { CustomInboundIcon } from '@/components/icons/customInbound'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import { Webhook } from '@/features/webhooks/types'

export default function WebhooksPage() {
  const { data: webhooks = [], isLoading, error, refetch } = useWebhooksQuery()
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null)
  const testWebhookMutation = useTestWebhookMutation()
  
  // Dialog state
  const [selectedWebhook, setSelectedWebhook] = useState<Webhook | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [testDialogOpen, setTestDialogOpen] = useState(false)

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedUrl(url)
      setTimeout(() => setCopiedUrl(null), 2000)
    } catch (err) {
      console.error("Failed to copy URL:", err)
    }
  }

  const handleTestWebhook = (webhook: Webhook) => {
    setSelectedWebhook(webhook)
    setTestDialogOpen(true)
  }

  const handleEditWebhook = (webhook: Webhook) => {
    setSelectedWebhook(webhook)
    setEditDialogOpen(true)
  }

  const handleDeleteWebhook = (webhook: Webhook) => {
    setSelectedWebhook(webhook)
    setDeleteDialogOpen(true)
  }

  // Helper functions
  const getStatusBadge = (webhook: Webhook) => {
    if (webhook.isActive) {
      const successRate = getSuccessRate(webhook)
      if ((webhook.totalDeliveries || 0) === 0) {
        return (
          <Badge className="bg-blue-500 text-white rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm pointer-events-none">
            <HiLightningBolt className="w-3 h-3 mr-1" />
            Ready
          </Badge>
        )
      }
      if (successRate >= 95) {
        return (
          <Badge className="bg-emerald-500 text-white rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm pointer-events-none">
            <HiCheckCircle className="w-3 h-3 mr-1" />
            Excellent
          </Badge>
        )
      }
      if (successRate >= 80) {
        return (
          <Badge className="bg-blue-500 text-white rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm pointer-events-none">
            <HiTrendingUp className="w-3 h-3 mr-1" />
            Good
          </Badge>
        )
      }
      return (
        <Badge className="bg-amber-500 text-white rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm pointer-events-none">
          <HiExclamationCircle className="w-3 h-3 mr-1" />
          Needs Attention
        </Badge>
      )
    } else {
      return (
        <Badge className="bg-gray-400 text-white rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm pointer-events-none">
          <HiX className="w-3 h-3 mr-1" />
          Disabled
        </Badge>
      )
    }
  }

  const getSuccessRate = (webhook: Webhook) => {
    if (!webhook.totalDeliveries) return 0
    return Math.round(((webhook.successfulDeliveries || 0) / webhook.totalDeliveries) * 100)
  }

  const getStatusColor = (webhook: Webhook) => {
    if (!webhook.isActive) return "bg-gray-400"
    
    const successRate = getSuccessRate(webhook)
    if ((webhook.totalDeliveries || 0) === 0) return "bg-blue-500"
    if (successRate >= 95) return "bg-emerald-500"
    if (successRate >= 80) return "bg-blue-500"
    return "bg-amber-500"
  }

  const getWebhookIconColor = (webhook: Webhook) => {
    if (!webhook.isActive) return '#64748b' // gray
    
    const successRate = getSuccessRate(webhook)
    if ((webhook.totalDeliveries || 0) === 0) return '#3b82f6' // blue
    if (successRate >= 95) return '#10b981' // emerald
    if (successRate >= 80) return '#3b82f6' // blue
    return '#f59e0b' // amber
  }

  // Calculate metrics
  const totalEndpoints = webhooks.length
  const activeEndpoints = webhooks.filter(w => w.isActive).length
  const totalDeliveries = webhooks.reduce((sum, w) => sum + (w.totalDeliveries || 0), 0)
  const successfulDeliveries = webhooks.reduce((sum, w) => sum + (w.successfulDeliveries || 0), 0)
  const overallSuccessRate = totalDeliveries > 0 ? Math.round((successfulDeliveries / totalDeliveries) * 100) : 0

  if (isLoading) {
    return (
      <div className="min-h-screen p-4 font-outfit">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-center py-12">
            <div className="text-muted-foreground">Loading webhooks...</div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen p-4 font-outfit">
        <div className="max-w-5xl mx-auto">
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 text-destructive">
                <HiX className="h-4 w-4" />
                <span>{error.message}</span>
                <Button variant="ghost" size="sm" onClick={() => refetch()} className="ml-auto text-destructive hover:text-destructive">
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

    return (
    <>
      <div className="min-h-screen p-4 font-outfit">
        <div className="max-w-5xl mx-auto">
          {/* Compact Header */}
          <div className="flex items-center justify-between bg-slate-900 text-white rounded-lg p-4 mb-6">
            <div>
              <h1 className="text-xl font-semibold mb-1">Webhook Management</h1>
              <div className="flex items-center gap-4 text-sm text-slate-300">
                <span>{totalEndpoints} webhooks</span>
                <span>{activeEndpoints} active</span>
                <span className="flex items-center gap-1">
                  <HiLightningBolt className="h-3 w-3" />
                  {totalDeliveries} deliveries
                </span>
                {totalDeliveries > 0 && (
                  <span className="flex items-center gap-1">
                    <HiTrendingUp className="h-3 w-3" />
                    {overallSuccessRate}% success rate
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
                className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
              >
                <HiRefresh className="h-3 w-3 mr-1" />
                Refresh
              </Button>
              <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
                <HiPlus className="h-3 w-3 mr-1" />
                Add Webhook
              </Button>
            </div>
          </div>

          {/* Performance Overview */}
          {totalDeliveries > 0 && (
            <Card className="bg-card border-border rounded-xl mb-6">
              <CardContent className="p-4">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <HiChartBar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">Performance Overview:</span>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span className="text-muted-foreground">{totalDeliveries} total</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-muted-foreground">{successfulDeliveries} successful</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                      <span className="text-muted-foreground">{totalDeliveries - successfulDeliveries} failed</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-sm font-medium text-foreground">{overallSuccessRate}%</span>
                    <div className="w-16">
                      <Progress value={overallSuccessRate} className="h-1" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Webhooks List */}
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 mb-1 tracking-tight">
              Active Webhooks ({totalEndpoints})
            </h2>
            <p className="text-gray-600 text-sm font-medium">Manage your webhook endpoints and delivery settings</p>
          </div>

          <div className="space-y-4">
            {webhooks.length === 0 ? (
              <Card className="bg-card border-border rounded-xl">
                <CardContent className="p-8">
                  <div className="text-center">
                    <CustomInboundIcon 
                      Icon={HiLightningBolt} 
                      size={48} 
                      backgroundColor="#8b5cf6" 
                      className="mx-auto mb-4" 
                    />
                    <p className="text-sm text-muted-foreground mb-4">No webhooks configured</p>
                    <Button variant="secondary" onClick={() => setCreateDialogOpen(true)}>
                      <HiPlus className="h-4 w-4 mr-2" />
                      Add Your First Webhook
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              webhooks.map((webhook: Webhook) => (
                <Card
                  key={webhook.id}
                  className="bg-card border-border hover:bg-accent/5 transition-all duration-300 rounded-xl group"
                >
                  <CardContent className="p-0">
                    <div className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                          <CustomInboundIcon 
                            Icon={HiLightningBolt} 
                            size={36} 
                            backgroundColor={getWebhookIconColor(webhook)} 
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2 mb-1">
                              <h3 className="text-base font-semibold text-foreground tracking-tight truncate">{webhook.name}</h3>
                              <Badge className="bg-purple-500 text-white rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm pointer-events-none">
                                Webhook
                              </Badge>
                              {getStatusBadge(webhook)}
                            </div>
                            <div className="flex items-center space-x-3 text-sm">
                              <div className="flex items-center space-x-2 text-muted-foreground">
                                <span className="font-mono truncate">
                                  {new URL(webhook.url).hostname}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="opacity-0 group-hover:opacity-100 transition-all duration-200 p-1 h-auto hover:bg-accent rounded hover:scale-105 active:scale-95"
                                  onClick={() => copyUrl(webhook.url)}
                                >
                                  {copiedUrl === webhook.url ? (
                                    <HiCheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                  ) : (
                                    <HiClipboard className="w-3.5 h-3.5 text-muted-foreground transition-all duration-150 hover:text-foreground" />
                                  )}
                                </Button>
                              </div>
                              {webhook.secret && (
                                <div className="flex items-center space-x-1 text-green-600">
                                  <HiShieldCheck className="w-3 h-3" />
                                  <span className="text-xs font-medium">Secured</span>
                                </div>
                              )}
                              {(webhook.totalDeliveries || 0) > 0 && (
                                <div className="flex items-center space-x-1 text-muted-foreground">
                                  <span className="text-xs font-medium">{getSuccessRate(webhook)}% success</span>
                                  <span className="text-xs text-muted-foreground/70">({webhook.totalDeliveries} deliveries)</span>
                                </div>
                              )}
                              {webhook.description && (
                                <span className="text-muted-foreground text-xs truncate">{webhook.description}</span>
                              )}
                              <span className="text-muted-foreground/70 text-xs">
                                Added {webhook.createdAt ? formatDistanceToNow(new Date(webhook.createdAt), { addSuffix: true }) : 'recently'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="p-1.5 hover:bg-accent rounded-lg transition-colors"
                            onClick={() => handleTestWebhook(webhook)}
                            disabled={testWebhookMutation.isPending}
                            title="Test webhook"
                          >
                            <HiPlay className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="p-1.5 hover:bg-accent rounded-lg transition-colors"
                            onClick={() => handleEditWebhook(webhook)}
                            title="Configure webhook"
                          >
                            <HiCog className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="p-1.5 hover:bg-accent rounded-lg transition-colors"
                            onClick={() => handleDeleteWebhook(webhook)}
                            title="Delete webhook"
                          >
                            <HiTrash className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <CreateWebhookDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
      
      <EditWebhookDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        webhook={selectedWebhook}
      />
      
      <DeleteWebhookDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        webhook={selectedWebhook}
      />
      
      <TestWebhookDialog
        open={testDialogOpen}
        onOpenChange={setTestDialogOpen}
        webhook={selectedWebhook}
      />
    </>
  )
} 