"use client"

import { useEffect, useState } from 'react'
import { useSession } from '@/lib/auth-client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmailDetailSheet } from '@/components/email-detail-sheet'
import {
  BarChart3Icon,
  TrendingUpIcon,
  MailIcon,
  GlobeIcon,
  ClockIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  SearchIcon,
  RefreshCwIcon,
  CalendarIcon,
  ServerIcon,
  FilterIcon,
  DownloadIcon
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { toast } from 'sonner'

interface AnalyticsData {
  stats: {
    totalEmails: number
    emailsLast24h: number
    emailsLast7d: number
    emailsLast30d: number
    totalDomains: number
    verifiedDomains: number
    totalEmailAddresses: number
    avgProcessingTime: number
  }
  recentEmails: Array<{
    id: string
    messageId: string
    from: string
    recipient: string
    subject: string
    receivedAt: string
    status: string
    domain: string
    authResults: {
      spf: string
      dkim: string
      dmarc: string
      spam: string
      virus: string
    }
    hasContent: boolean
    contentSize?: number
  }>
  emailsByDay: Array<{
    date: string
    count: number
  }>
  emailsByDomain: Array<{
    domain: string
    count: number
    percentage: number
  }>
  authResultsStats: {
    spf: { pass: number; fail: number; neutral: number }
    dkim: { pass: number; fail: number; neutral: number }
    dmarc: { pass: number; fail: number; neutral: number }
    spam: { pass: number; fail: number }
    virus: { pass: number; fail: number }
  }
}

export default function AnalyticsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [domainFilter, setDomainFilter] = useState('all')
  const [filteredEmails, setFilteredEmails] = useState<AnalyticsData['recentEmails']>([])
  
  // Email detail sheet state
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)

  useEffect(() => {
    if (session?.user) {
      fetchAnalyticsData()
    }
  }, [session])

  // Handle URL parameters for email ID
  useEffect(() => {
    const emailId = searchParams.get('emailid')
    if (emailId && analyticsData) {
      setSelectedEmailId(emailId)
      setIsSheetOpen(true)
    }
  }, [searchParams, analyticsData])

  useEffect(() => {
    if (analyticsData) {
      let filtered = analyticsData.recentEmails.filter(email => {
        const matchesSearch = 
          email.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
          email.recipient.toLowerCase().includes(searchQuery.toLowerCase()) ||
          email.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
          email.messageId.toLowerCase().includes(searchQuery.toLowerCase())
        
        const matchesStatus = statusFilter === 'all' || email.status === statusFilter
        const matchesDomain = domainFilter === 'all' || email.domain === domainFilter
        
        return matchesSearch && matchesStatus && matchesDomain
      })

      setFilteredEmails(filtered)
    }
  }, [analyticsData, searchQuery, statusFilter, domainFilter])

  const fetchAnalyticsData = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await fetch('/api/analytics')
      
      if (!response.ok) {
        throw new Error('Failed to fetch analytics data')
      }
      
      const data: AnalyticsData = await response.json()
      setAnalyticsData(data)
    } catch (error) {
      console.error('Error fetching analytics:', error)
      setError(error instanceof Error ? error.message : 'Failed to load analytics')
      toast.error('Failed to load analytics data')
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'received':
        return (
          <Badge className="bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200 transition-colors">
            <CheckCircleIcon className="h-3 w-3 mr-1" />
            Received
          </Badge>
        )
      case 'processing':
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 transition-colors">
            <ClockIcon className="h-3 w-3 mr-1" />
            Processing
          </Badge>
        )
      case 'forwarded':
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200 transition-colors">
            <TrendingUpIcon className="h-3 w-3 mr-1" />
            Forwarded
          </Badge>
        )
      case 'failed':
        return (
          <Badge className="bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-200 transition-colors">
            <XCircleIcon className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        )
      default:
        return (
          <Badge className="bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 transition-colors">
            <ClockIcon className="h-3 w-3 mr-1" />
            {status}
          </Badge>
        )
    }
  }

  const getAuthBadge = (result: string, type: 'spf' | 'dkim' | 'dmarc' | 'spam' | 'virus') => {
    const isPass = result === 'PASS'
    const isFail = result === 'FAIL'
    
    if (isPass) {
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
          <CheckCircleIcon className="h-2 w-2 mr-1" />
          {type.toUpperCase()}
        </Badge>
      )
    } else if (isFail) {
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">
          <XCircleIcon className="h-2 w-2 mr-1" />
          {type.toUpperCase()}
        </Badge>
      )
    } else {
      return (
        <Badge className="bg-gray-100 text-gray-600 border-gray-200 text-xs">
          <AlertTriangleIcon className="h-2 w-2 mr-1" />
          {type.toUpperCase()}
        </Badge>
      )
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const handleEmailClick = (emailId: string) => {
    setSelectedEmailId(emailId)
    setIsSheetOpen(true)
    // Update URL with emailid parameter
    const params = new URLSearchParams(searchParams.toString())
    params.set('emailid', emailId)
    router.push(`/analytics?${params.toString()}`)
  }

  const handleSheetClose = () => {
    setIsSheetOpen(false)
    setSelectedEmailId(null)
    // Remove emailid parameter from URL
    const params = new URLSearchParams(searchParams.toString())
    params.delete('emailid')
    const newUrl = params.toString() ? `/analytics?${params.toString()}` : '/analytics'
    router.push(newUrl)
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
                <h1 className="text-4xl font-bold tracking-tight mb-2">Analytics</h1>
                <p className="text-purple-100 text-lg">
                  Monitor your email traffic and performance metrics
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="secondary" disabled className="bg-white/20 border-white/30 text-white hover:bg-white/30">
                  <RefreshCwIcon className="h-4 w-4 mr-2" />
                  Refresh
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
            <span className="text-muted-foreground">Loading analytics...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error || !analyticsData) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        {/* Header with Gradient */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 p-8 text-white shadow-xl">
          <div className="absolute inset-0 bg-black/10"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-bold tracking-tight mb-2">Analytics</h1>
                <p className="text-purple-100 text-lg">
                  Monitor your email traffic and performance metrics
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  onClick={fetchAnalyticsData}
                  className="bg-white/20 border-white/30 text-white hover:bg-white/30 backdrop-blur-sm"
                >
                  <RefreshCwIcon className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            </div>
          </div>
          {/* Decorative elements */}
          <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
          <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>
        </div>

        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <XCircleIcon className="h-4 w-4" />
              <span>{error || 'Failed to load analytics'}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { stats, recentEmails } = analyticsData

  // Get unique domains for filter
  const uniqueDomains = Array.from(new Set(recentEmails.map(email => email.domain)))

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header with Gradient */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 p-8 text-white shadow-xl">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2">Analytics</h1>
              <p className="text-purple-100 text-lg">
                Monitor your email traffic and performance metrics
              </p>
              <div className="flex items-center gap-6 mt-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-white rounded-full"></div>
                  <span className="text-purple-100">{stats.totalEmails} Total Emails</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-300 rounded-full"></div>
                  <span className="text-purple-100">{stats.emailsLast7d} Last 7 Days</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-300 rounded-full"></div>
                  <span className="text-purple-100">{stats.avgProcessingTime}ms Avg Processing</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                onClick={fetchAnalyticsData}
                disabled={isLoading}
                className="bg-white/20 border-white/30 text-white hover:bg-white/30 backdrop-blur-sm"
              >
                <RefreshCwIcon className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button className="bg-white text-purple-700 hover:bg-white/90 font-semibold shadow-lg">
                <DownloadIcon className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </div>
        {/* Decorative elements */}
        <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>
        <div className="absolute top-1/2 right-1/4 w-16 h-16 bg-white/5 rounded-full blur-lg"></div>
      </div>

      {/* Analytics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total Emails */}
        <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-purple-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-purple-700">Total Emails</CardTitle>
            <MailIcon className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-900">{stats.totalEmails.toLocaleString()}</div>
            <p className="text-xs text-purple-600 mt-1">
              {stats.emailsLast24h} in last 24h
            </p>
          </CardContent>
        </Card>

        {/* Weekly Growth */}
        <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-blue-700">Weekly Volume</CardTitle>
            <TrendingUpIcon className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900">{stats.emailsLast7d.toLocaleString()}</div>
            <p className="text-xs text-blue-600 mt-1">
              {stats.emailsLast30d} in last 30d
            </p>
          </CardContent>
        </Card>

        {/* Domains */}
        <Card className="border-green-200 bg-gradient-to-br from-green-50 to-green-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-green-700">Active Domains</CardTitle>
            <GlobeIcon className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-900">{stats.verifiedDomains}</div>
            <p className="text-xs text-green-600 mt-1">
              {stats.totalDomains} total configured
            </p>
          </CardContent>
        </Card>

        {/* Processing Time */}
        <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-amber-700">Avg Processing</CardTitle>
            <ClockIcon className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-900">{stats.avgProcessingTime}ms</div>
            <p className="text-xs text-amber-600 mt-1">
              last 30 days average
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Email Activity Section - No Card */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3Icon className="h-6 w-6 text-purple-600" />
              Email Activity (Last 7 Days)
            </h2>
            <p className="text-muted-foreground mt-1">
              Inbound emails received in the past week
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-sm">
              {filteredEmails.length} of {recentEmails.length} emails
            </Badge>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-3">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search emails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-background"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="forwarded">Forwarded</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={domainFilter} onValueChange={setDomainFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Domains" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              {uniqueDomains.map(domain => (
                <SelectItem key={domain} value={domain}>{domain}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Email Table */}
        {filteredEmails.length === 0 ? (
          <div className="text-center py-12">
            <MailIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No emails found</h3>
            <p className="text-muted-foreground">
              {searchQuery || statusFilter !== 'all' || domainFilter !== 'all' 
                ? 'No emails match your search criteria.' 
                : 'No emails have been received yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden">
            {/* Table Header with Rounded Border */}
            <div className="border border-border bg-muted/30 rounded-lg px-6 py-3">
              <div className="grid grid-cols-7 gap-4 text-sm font-medium text-muted-foreground">
                <div className="col-span-1">From</div>
                <div className="col-span-1">To</div>
                <div className="col-span-2">Subject</div>
                <div className="col-span-1">Status</div>
                <div className="col-span-1">Auth</div>
                <div className="col-span-1">Received</div>
              </div>
            </div>
            
            {/* Table Body */}
            <div className="">
              <Table>
                <TableBody>
                  {filteredEmails.map((email, index) => (
                    <TableRow 
                      key={email.id} 
                      className={`hover:bg-muted/50 transition-colors cursor-pointer ${
                        index < filteredEmails.length - 1 ? 'border-b border-border/50' : ''
                      }`}
                      onClick={() => handleEmailClick(email.id)}
                    >
                      <TableCell className="w-1/7">
                        <div className="font-medium text-sm truncate max-w-[120px]">{email.from}</div>
                        <div className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">
                          {email.messageId.substring(0, 15)}...
                        </div>
                      </TableCell>
                      <TableCell className="w-1/7">
                        <div className="font-medium text-sm">{email.recipient}</div>
                        <div className="text-xs text-muted-foreground">{email.domain}</div>
                      </TableCell>
                      <TableCell className="w-2/7">
                        <div className="font-medium text-sm max-w-[250px] truncate">
                          {email.subject}
                        </div>
                      </TableCell>
                      <TableCell className="w-1/7">
                        {getStatusBadge(email.status)}
                      </TableCell>
                      <TableCell className="w-1/7">
                        <div className="flex flex-wrap gap-1">
                          {getAuthBadge(email.authResults.spf, 'spf')}
                          {getAuthBadge(email.authResults.dkim, 'dkim')}
                          {getAuthBadge(email.authResults.spam, 'spam')}
                        </div>
                      </TableCell>
                      <TableCell className="w-1/7">
                        <div className="text-sm">
                          {formatDistanceToNow(new Date(email.receivedAt), { addSuffix: true })}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(email.receivedAt), 'MMM d, HH:mm')}
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
      
      {/* Email Detail Sheet */}
      <EmailDetailSheet
        emailId={selectedEmailId}
        isOpen={isSheetOpen}
        onClose={handleSheetClose}
      />
    </div>
  )
} 