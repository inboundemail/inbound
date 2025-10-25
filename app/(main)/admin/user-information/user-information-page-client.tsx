'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Progress } from '@/components/ui/progress'
import UserGroup from '@/components/icons/user-group'
import Envelope2 from '@/components/icons/envelope-2'
import ChartTrendUp from '@/components/icons/chart-trend-up'
import CircleWarning2 from '@/components/icons/circle-warning-2'
import Ban2 from '@/components/icons/ban-2'
import ShieldCheck from '@/components/icons/shield-check'
import Activity2 from '@/components/icons/chart-activity-2'
import Magnifier2 from '@/components/icons/magnifier-2'
import Refresh2 from '@/components/icons/refresh-2'
import Eye from '@/components/icons/eye-2'
import Calendar2 from '@/components/icons/calendar-2'
import Download2 from '@/components/icons/download-2'
import { getUserAnalytics, exportUserEmails, UserAnalyticsData, TopUserActivity, SuspiciousActivity } from '@/app/actions/user-analytics'

// Helper function to format numbers
const formatNumber = (num: number): string => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

// Helper function to get risk severity color
const getRiskColor = (score: number) => {
  if (score >= 80) return 'text-red-500'
  if (score >= 60) return 'text-orange-500'
  if (score >= 40) return 'text-yellow-600'
  return 'text-green-600'
}

// Helper function to get severity badge variant
const getSeverityVariant = (severity: string) => {
  switch (severity) {
    case 'critical': return 'destructive'
    case 'high': return 'destructive'
    case 'medium': return 'secondary'
    case 'low': return 'outline'
    default: return 'outline'
  }
}

export default function UserInformationPageClient() {
  const [data, setData] = useState<UserAnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState<TopUserActivity | null>(null)
  const [selectedSuspiciousActivity, setSelectedSuspiciousActivity] = useState<SuspiciousActivity | null>(null)
  const [showUserDialog, setShowUserDialog] = useState(false)
  const [showSuspiciousDialog, setShowSuspiciousDialog] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const [exportState, setExportState] = useState<{ open: boolean; userId: string | null; userEmail: string | null }>({ open: false, userId: null, userEmail: null })

  const loadData = async () => {
    try {
      setIsLoading(true)
      const result = await getUserAnalytics()
      if (result.success) {
        setData(result.data)
        setError(null)
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError('Failed to load user analytics')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadData()
    setRefreshing(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  // Filter users based on search query
  const filteredUsers = data?.topUsers.filter(user =>
    user.userName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.userEmail.toLowerCase().includes(searchQuery.toLowerCase())
  ) || []

  // Filter suspicious activities
  const filteredSuspicious = data?.suspiciousActivity || []

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex items-center gap-2">
            <Refresh2 width="24" height="24" className="animate-spin" />
            <span>Loading user analytics...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive">
              <CircleWarning2 width="16" height="16" />
              <span>{error}</span>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={loadData}>
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data) return null

  const { overview, topUsers, suspiciousActivity, emailTrends } = data

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <UserGroup width="32" height="32" />
            User Information
          </h1>
          <p className="text-muted-foreground">
            User activity analytics and monitoring dashboard
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            Last updated: {new Date(data.cachedAt).toLocaleTimeString()}
          </Badge>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <Refresh2 width="16" height="16" className={refreshing ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <UserGroup width="16" height="16" />
              Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(overview.totalUsers)}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-green-600">{overview.activeUsers} active</span>
              {overview.bannedUsers > 0 && (
                <>
                  <span>•</span>
                  <span className="text-red-600">{overview.bannedUsers} banned</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Envelope2 width="16" height="16" />
              Total Emails
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(overview.totalEmailsSent + overview.totalEmailsReceived)}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-blue-600">{formatNumber(overview.totalEmailsReceived)} received</span>
              <span>•</span>
              <span className="text-green-600">{formatNumber(overview.totalEmailsSent)} sent</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity2 width="16" height="16" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(overview.emailsLast24h)}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Last 24h</span>
              <span>•</span>
              <span>{formatNumber(overview.emailsLast7d)} last 7d</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ChartTrendUp width="16" height="16" />
              Avg per User
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(overview.avgEmailsPerUser)}</div>
            <p className="text-xs text-muted-foreground">
              Emails per registered user
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alert for Suspicious Activity */}
      {suspiciousActivity.length > 0 && (
        <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-orange-800 dark:text-orange-200">
              <CircleWarning2 width="16" height="16" />
              <span className="font-medium">
                {suspiciousActivity.length} suspicious activit{suspiciousActivity.length === 1 ? 'y' : 'ies'} detected
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                className="ml-auto border-orange-300 hover:bg-orange-100"
                onClick={() => document.getElementById('suspicious-tab')?.click()}
              >
                Review All
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Tabs */}
      <Tabs defaultValue="top-users" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="top-users" className="flex items-center gap-2">
            <ChartTrendUp width="16" height="16" />
            Top Users
          </TabsTrigger>
          <TabsTrigger value="suspicious" id="suspicious-tab" className="flex items-center gap-2">
            <CircleWarning2 width="16" height="16" />
            Suspicious Activity
            {suspiciousActivity.length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">
                {suspiciousActivity.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="trends" className="flex items-center gap-2">
            <Activity2 width="16" height="16" />
            Trends
          </TabsTrigger>
        </TabsList>

        {/* Top Users Tab */}
        <TabsContent value="top-users" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Top Email Volume Users</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Users ranked by total email activity (sent + received)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-64"
                  />
                  <Button variant="outline" size="sm">
                    <Magnifier2 width="16" height="16" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Total Emails</TableHead>
                      <TableHead>Sent / Received</TableHead>
                      <TableHead>Recent Activity</TableHead>
                      <TableHead>Risk Score</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No users found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredUsers.map((user, index) => (
                        <TableRow key={user.userId} className={index === 0 ? 'bg-muted/20' : ''}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {index < 3 && (
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                  index === 0 ? 'bg-yellow-500 text-white' :
                                  index === 1 ? 'bg-gray-400 text-white' :
                                  'bg-orange-600 text-white'
                                }`}>
                                  {index + 1}
                                </div>
                              )}
                              <div>
                                <div className="font-medium">{user.userName || 'No name'}</div>
                                <div className="text-sm text-muted-foreground">{user.userEmail}</div>
                                {user.role === 'admin' && (
                                  <Badge variant="secondary" className="text-xs mt-1">
                                    <ShieldCheck width="12" height="12" className="mr-1" />
                                    Admin
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="font-mono text-lg font-bold">
                              {formatNumber(user.totalEmails)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-green-600">↑ {formatNumber(user.sentEmails)}</span>
                                <span className="text-blue-600">↓ {formatNumber(user.receivedEmails)}</span>
                              </div>
                              <Progress 
                                value={(user.sentEmails / user.totalEmails) * 100} 
                                className="h-1"
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm space-y-1">
                              <div>7d: {formatNumber(user.emailsLast7d)}</div>
                              <div className="text-muted-foreground">30d: {formatNumber(user.emailsLast30d)}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={`font-mono text-sm font-bold ${getRiskColor(user.riskScore)}`}>
                                {user.riskScore}
                              </div>
                              <Progress 
                                value={user.riskScore} 
                                className="h-2 w-16"
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              {user.banned ? (
                                <Badge variant="destructive">
                                  <Ban2 width="12" height="12" className="mr-1" />
                                  Banned
                                </Badge>
                              ) : (
                                <Badge variant="default">Active</Badge>
                              )}
                              {user.flags.length > 0 && (
                                <div className="text-xs text-muted-foreground">
                                  {user.flags.slice(0, 2).join(', ')}
                                  {user.flags.length > 2 && ` +${user.flags.length - 2}`}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedUser(user)
                                  setShowUserDialog(true)
                                }}
                              >
                                <Eye width="14" height="14" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setExportState({ open: true, userId: user.userId, userEmail: user.userEmail })}
                                title="Export emails"
                              >
                                <Download2 width="14" height="14" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Suspicious Activity Tab */}
        <TabsContent value="suspicious" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CircleWarning2 width="20" height="20" className="text-orange-500" />
                Suspicious Activity Detection
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Automated detection of unusual user behavior and potential security risks
              </p>
            </CardHeader>
            <CardContent>
              {filteredSuspicious.length === 0 ? (
                <div className="text-center py-12">
                  <ShieldCheck width="48" height="48" className="mx-auto text-green-500 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">All Clear</h3>
                  <p className="text-muted-foreground">No suspicious activity detected</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredSuspicious.map((activity, index) => (
                    <Card key={`${activity.userId}-${index}`} className={`border-l-4 ${
                      activity.severity === 'critical' ? 'border-l-red-500 bg-red-50/50 dark:bg-red-950/10' :
                      activity.severity === 'high' ? 'border-l-orange-500 bg-orange-50/50 dark:bg-orange-950/10' :
                      activity.severity === 'medium' ? 'border-l-yellow-500 bg-yellow-50/50 dark:bg-yellow-950/10' :
                      'border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/10'
                    }`}>
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant={getSeverityVariant(activity.severity)}>
                                {activity.severity.toUpperCase()}
                              </Badge>
                              <Badge variant="outline">
                                {activity.activityType.replace('_', ' ').toUpperCase()}
                              </Badge>
                              <span className={`text-sm font-mono font-bold ${getRiskColor(activity.riskScore)}`}>
                                Risk: {activity.riskScore}
                              </span>
                            </div>
                            
                            <div className="mb-3">
                              <div className="font-medium text-sm">{activity.userName || 'Unknown User'}</div>
                              <div className="text-sm text-muted-foreground">{activity.userEmail}</div>
                            </div>
                            
                            <p className="text-sm mb-2">{activity.description}</p>
                            
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar2 width="12" height="12" />
                                Detected: {new Date(activity.detectedAt).toLocaleString()}
                              </span>
                            </div>
                          </div>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedSuspiciousActivity(activity)
                              setShowSuspiciousDialog(true)
                            }}
                          >
                            Details
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Export Emails Dialog */}
        <Dialog open={exportState.open} onOpenChange={(open) => !open && setExportState({ open: false, userId: null, userEmail: null })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Export emails</DialogTitle>
              <DialogDescription>
                Download {exportState.userEmail ? `${exportState.userEmail}'s` : 'user'} emails for a selected time range.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-2">
              {[1,7,30].map((d) => (
                <Button
                  key={d}
                  variant="outline"
                  onClick={async () => {
                    if (!exportState.userId) return
                    const res = await exportUserEmails({ userId: exportState.userId, days: d as 1 | 7 | 30 })
                    if (!res.success) return
                    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = res.filename
                    document.body.appendChild(a)
                    a.click()
                    a.remove()
                    URL.revokeObjectURL(url)
                    setExportState({ open: false, userId: null, userEmail: null })
                  }}
                >
                  {d} day{d === 1 ? '' : 's'}
                </Button>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Email Activity Trends</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Daily email volume over the last 30 days
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20">
                      <div className="text-2xl font-bold text-blue-600">
                        {formatNumber(emailTrends.daily.reduce((sum, d) => sum + d.received, 0))}
                      </div>
                      <div className="text-muted-foreground">Total Received (30d)</div>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950/20">
                      <div className="text-2xl font-bold text-green-600">
                        {formatNumber(emailTrends.daily.reduce((sum, d) => sum + d.sent, 0))}
                      </div>
                      <div className="text-muted-foreground">Total Sent (30d)</div>
                    </div>
                  </div>
                  
                  {/* Simple bar chart representation */}
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">Recent 7 days activity:</div>
                    {emailTrends.daily.slice(-7).map((day, index) => (
                      <div key={day.date} className="flex items-center gap-2 text-xs">
                        <div className="w-16 text-muted-foreground">
                          {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                        </div>
                        <div className="flex-1 flex gap-1">
                          <div 
                            className="bg-blue-200 dark:bg-blue-800 h-4 rounded-sm flex items-center justify-center text-xs"
                            style={{ width: `${Math.max((day.received / Math.max(...emailTrends.daily.slice(-7).map(d => d.received + d.sent))) * 100, 5)}%` }}
                          >
                            {day.received > 0 && formatNumber(day.received)}
                          </div>
                          <div 
                            className="bg-green-200 dark:bg-green-800 h-4 rounded-sm flex items-center justify-center text-xs"
                            style={{ width: `${Math.max((day.sent / Math.max(...emailTrends.daily.slice(-7).map(d => d.received + d.sent))) * 100, 5)}%` }}
                          >
                            {day.sent > 0 && formatNumber(day.sent)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>User Growth</CardTitle>
                <p className="text-sm text-muted-foreground">
                  New user registrations over time
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-center p-4 rounded-lg bg-purple-50 dark:bg-purple-950/20">
                    <div className="text-3xl font-bold text-purple-600">
                      {data.userGrowth.reduce((sum, g) => sum + g.newUsers, 0)}
                    </div>
                    <div className="text-sm text-muted-foreground">New Users (30 days)</div>
                  </div>
                  
                  {/* Growth chart */}
                  {data.userGrowth.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs text-muted-foreground">Daily signups (last 7 days):</div>
                      {data.userGrowth.slice(-7).map((growth, index) => (
                        <div key={growth.period} className="flex items-center gap-2 text-xs">
                          <div className="w-16 text-muted-foreground">
                            {new Date(growth.period).toLocaleDateString('en-US', { weekday: 'short' })}
                          </div>
                          <div className="flex-1">
                            <div 
                              className="bg-purple-200 dark:bg-purple-800 h-3 rounded-sm flex items-center px-2"
                              style={{ width: `${Math.max((growth.newUsers / Math.max(...data.userGrowth.slice(-7).map(g => g.newUsers), 1)) * 100, 10)}%` }}
                            >
                              {growth.newUsers > 0 && growth.newUsers}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* User Details Dialog */}
      <Dialog open={showUserDialog} onOpenChange={setShowUserDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              User Details: {selectedUser?.userName || 'Unknown User'}
            </DialogTitle>
            <DialogDescription>
              {selectedUser?.userEmail}
            </DialogDescription>
          </DialogHeader>
          
          {selectedUser && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {formatNumber(selectedUser.receivedEmails)}
                      </div>
                      <div className="text-sm text-muted-foreground">Emails Received</div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {formatNumber(selectedUser.sentEmails)}
                      </div>
                      <div className="text-sm text-muted-foreground">Emails Sent</div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="font-medium mb-1">Account Info</div>
                  <div className="space-y-1 text-muted-foreground">
                    <div>Role: {selectedUser.role || 'user'}</div>
                    <div>Joined: {new Date(selectedUser.joinedAt).toLocaleDateString()}</div>
                    <div>Status: {selectedUser.banned ? 'Banned' : 'Active'}</div>
                    {selectedUser.lastActivity && (
                      <div>Last Activity: {new Date(selectedUser.lastActivity).toLocaleDateString()}</div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="font-medium mb-1">Risk Assessment</div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Risk Score:</span>
                      <span className={`font-bold ${getRiskColor(selectedUser.riskScore)}`}>
                        {selectedUser.riskScore}/100
                      </span>
                    </div>
                    <Progress value={selectedUser.riskScore} className="h-2" />
                  </div>
                </div>
              </div>

              {selectedUser.flags.length > 0 && (
                <div>
                  <div className="font-medium mb-2">Flags</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedUser.flags.map((flag, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {flag.replace('_', ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div className="text-center">
                  <div className="font-bold">{formatNumber(selectedUser.emailsLast7d)}</div>
                  <div className="text-xs text-muted-foreground">Last 7 days</div>
                </div>
                <div className="text-center">
                  <div className="font-bold">{formatNumber(selectedUser.emailsLast30d)}</div>
                  <div className="text-xs text-muted-foreground">Last 30 days</div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Suspicious Activity Details Dialog */}
      <Dialog open={showSuspiciousDialog} onOpenChange={setShowSuspiciousDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CircleWarning2 width="20" height="20" className="text-orange-500" />
              Suspicious Activity Details
            </DialogTitle>
          </DialogHeader>
          
          {selectedSuspiciousActivity && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant={getSeverityVariant(selectedSuspiciousActivity.severity)}>
                  {selectedSuspiciousActivity.severity.toUpperCase()}
                </Badge>
                <Badge variant="outline">
                  {selectedSuspiciousActivity.activityType.replace('_', ' ').toUpperCase()}
                </Badge>
                <span className={`font-mono font-bold ${getRiskColor(selectedSuspiciousActivity.riskScore)}`}>
                  Risk Score: {selectedSuspiciousActivity.riskScore}
                </span>
              </div>

              <div>
                <h4 className="font-medium mb-2">User Information</h4>
                <div className="text-sm space-y-1">
                  <div><strong>Name:</strong> {selectedSuspiciousActivity.userName || 'Unknown'}</div>
                  <div><strong>Email:</strong> {selectedSuspiciousActivity.userEmail}</div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Activity Description</h4>
                <p className="text-sm">{selectedSuspiciousActivity.description}</p>
              </div>

              <div>
                <h4 className="font-medium mb-2">Technical Details</h4>
                <div className="bg-muted p-3 rounded-lg">
                  <pre className="text-xs overflow-auto">
                    {JSON.stringify(selectedSuspiciousActivity.details, null, 2)}
                  </pre>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
                <Calendar2 width="12" height="12" />
                <span>Detected: {new Date(selectedSuspiciousActivity.detectedAt).toLocaleString()}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
