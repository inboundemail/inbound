"use client"

import { useEffect, useState } from 'react'
import { useSession } from '@/lib/auth-client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
import {
  MailIcon,
  SearchIcon,
  RefreshCwIcon,
  FilterIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  TrendingUpIcon,
  AlertTriangleIcon,
  ArchiveIcon,
  TrashIcon,
  ReplyIcon,
  ForwardIcon,
  MoreHorizontalIcon
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { toast } from 'sonner'

interface EmailItem {
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
  preview?: string
}

interface MailData {
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
  recentEmails: EmailItem[]
}

export default function MailPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [mailData, setMailData] = useState<MailData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [domainFilter, setDomainFilter] = useState('all')
  const [filteredEmails, setFilteredEmails] = useState<EmailItem[]>([])
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null)

  useEffect(() => {
    if (session?.user) {
      fetchMailData()
    }
  }, [session])

  // Handle URL parameters for email ID
  useEffect(() => {
    const emailId = searchParams.get('emailid')
    if (emailId && mailData) {
      setSelectedEmailId(emailId)
    }
  }, [searchParams, mailData])

  useEffect(() => {
    if (mailData) {
      let filtered = mailData.recentEmails.filter(email => {
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
  }, [mailData, searchQuery, statusFilter, domainFilter])

  const fetchMailData = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await fetch('/api/analytics')
      
      if (!response.ok) {
        throw new Error('Failed to fetch mail data')
      }
      
      const data: MailData = await response.json()
      
      // Add preview text for each email - we'll use a simple preview for now
      // In a real implementation, you might want to fetch the first few lines of the email content
      const emailsWithPreview = data.recentEmails.map(email => ({
        ...email,
        preview: `Email received from ${email.from.split('@')[0]} - Click to view full content`
      }))
      
      setMailData({
        ...data,
        recentEmails: emailsWithPreview
      })
    } catch (error) {
      console.error('Error fetching mail data:', error)
      setError(error instanceof Error ? error.message : 'Failed to load mail data')
      toast.error('Failed to load mail data')
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'received':
        return (
          <Badge className="bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200 transition-colors text-xs">
            <CheckCircleIcon className="h-2 w-2 mr-1" />
            Received
          </Badge>
        )
      case 'processing':
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 transition-colors text-xs">
            <ClockIcon className="h-2 w-2 mr-1" />
            Processing
          </Badge>
        )
      case 'forwarded':
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200 transition-colors text-xs">
            <TrendingUpIcon className="h-2 w-2 mr-1" />
            Forwarded
          </Badge>
        )
      case 'failed':
        return (
          <Badge className="bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-200 transition-colors text-xs">
            <XCircleIcon className="h-2 w-2 mr-1" />
            Failed
          </Badge>
        )
      default:
        return (
          <Badge className="bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200 transition-colors text-xs">
            <ClockIcon className="h-2 w-2 mr-1" />
            {status}
          </Badge>
        )
    }
  }

  const handleEmailClick = (emailId: string) => {
    router.push(`/mail/${emailId}`)
  }

  // Generate gradient background for user avatar
  const getAvatarGradient = (email: string) => {
    const colors = [
      'from-blue-400 to-blue-600',
      'from-green-400 to-green-600', 
      'from-purple-400 to-purple-600',
      'from-pink-400 to-pink-600',
      'from-indigo-400 to-indigo-600',
      'from-red-400 to-red-600',
      'from-yellow-400 to-yellow-600',
      'from-teal-400 to-teal-600',
    ]
    
    // Use email to generate consistent color
    const hash = email.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0)
      return a & a
    }, 0)
    
    return colors[Math.abs(hash) % colors.length]
  }

  // Get first name or first letter from email
  const getDisplayName = (email: string) => {
    const beforeAt = email.split('<')[0].trim()
    if (beforeAt && beforeAt !== email) {
      // Has a display name
      return beforeAt.split(' ')[0].charAt(0).toUpperCase()
    }
    // Use first letter of email
    return email.charAt(0).toUpperCase()
  }

  // Get unique domains for filter
  const uniqueDomains = Array.from(new Set(mailData?.recentEmails.map(email => email.domain) || []))

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col h-full bg-white">
        {/* Gmail-style Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-normal text-gray-900">Inbox</h1>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-14" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" disabled className="text-gray-600">
              <RefreshCwIcon className="h-4 w-4 mr-2 animate-spin" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Filters Skeleton */}
          <div className="flex items-center gap-4">
            <Skeleton className="flex-1 h-10" />
            <Skeleton className="w-[150px] h-10" />
            <Skeleton className="w-[150px] h-10" />
            <Skeleton className="w-20 h-6" />
          </div>

          {/* Email Table Skeleton */}
          <div className="rounded-md border">
            <Table>
                             <TableHeader>
                 <TableRow>
                   <TableHead>From</TableHead>
                   <TableHead>To</TableHead>
                   <TableHead>Subject</TableHead>
                   <TableHead>Status</TableHead>
                   <TableHead>Received</TableHead>
                   <TableHead>Actions</TableHead>
                 </TableRow>
               </TableHeader>
              <TableBody>
                {[...Array(8)].map((_, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Skeleton className="w-8 h-8 rounded-full" />
                        <div className="space-y-1">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-40" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-64" />
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-16 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Skeleton className="w-8 h-8" />
                        <Skeleton className="w-8 h-8" />
                        <Skeleton className="w-8 h-8" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    )
  }

  if (error || !mailData) {
    return (
      <div className="flex flex-1 flex-col h-full bg-white w-full">
        {/* Gmail-style Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-normal text-gray-900">Inbox</h1>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>0 total</span>
              <span>0 today</span>
              <span>0 showing</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={fetchMailData}
              className="text-gray-600 hover:bg-gray-100"
            >
              <RefreshCwIcon className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <XCircleIcon className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2 text-gray-900">Failed to load emails</h3>
              <p className="text-gray-600 mb-4">{error || 'Something went wrong while loading your emails.'}</p>
              <Button onClick={fetchMailData} className="bg-blue-600 hover:bg-blue-700 text-white">
                <RefreshCwIcon className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const { stats, recentEmails } = mailData

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Inbox</h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
            <span>{stats.totalEmails} total</span>
            <span>{stats.emailsLast24h} today</span>
            <span>{filteredEmails.length} showing</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={fetchMailData}
            disabled={isLoading}
            className="text-gray-600 hover:bg-gray-100"
          >
            <RefreshCwIcon className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="space-y-4">

      {/* Filters */}
      <div className="flex items-center gap-4">
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
        <Badge variant="secondary" className="text-sm">
          {filteredEmails.length} of {recentEmails.length} emails
        </Badge>
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
        <div className="responsive-table-container rounded-md border overflow-hidden">
          <div className="table-scroll-wrapper overflow-x-auto">
            <Table className="responsive-table">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">From</TableHead>
                  <TableHead className="whitespace-nowrap">To</TableHead>
                  <TableHead className="whitespace-nowrap">Subject</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="whitespace-nowrap">Received</TableHead>
                  <TableHead className="whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmails.map((email) => (
                  <TableRow 
                    key={email.id}
                    className="cursor-pointer hover:bg-muted/50 responsive-table-row"
                    onClick={() => handleEmailClick(email.id)}
                  >
                    <TableCell className="responsive-cell" data-label="From">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarGradient(email.from)} flex items-center justify-center text-white text-sm font-medium flex-shrink-0`}>
                          {getDisplayName(email.from)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">
                            {email.from.split('<')[0].trim() || email.from.split('@')[0]}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {email.from}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="responsive-cell" data-label="To">
                      <div className="font-medium text-sm truncate">{email.recipient}</div>
                      <div className="text-xs text-muted-foreground">{email.domain}</div>
                    </TableCell>
                    <TableCell className="responsive-cell" data-label="Subject">
                      <div className="font-medium text-sm truncate">
                        {email.subject}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {email.preview}
                      </div>
                    </TableCell>
                    <TableCell className="responsive-cell" data-label="Status">
                      {getStatusBadge(email.status)}
                    </TableCell>
                    <TableCell className="responsive-cell" data-label="Received">
                      <div className="text-sm">
                        {formatDistanceToNow(new Date(email.receivedAt), { addSuffix: true })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(email.receivedAt), 'MMM d, HH:mm')}
                      </div>
                    </TableCell>
                    <TableCell className="responsive-cell" data-label="Actions">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
                          <ArchiveIcon className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
                          <TrashIcon className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={(e) => e.stopPropagation()}>
                          <MoreHorizontalIcon className="h-4 w-4" />
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
    </div>
  )
} 