"use client"

import { useEffect, useState } from 'react'
import { useSession } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
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

import { 
  CheckCircleIcon, 
  XCircleIcon, 
  ClockIcon, 
  SearchIcon,
  PlusIcon,
  MailIcon,
  GlobeIcon,
  TrendingUpIcon,
  CalendarIcon,
  RefreshCwIcon,
  ExternalLinkIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  CloudIcon,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { DOMAIN_STATUS } from '@/lib/db/schema'

interface DomainStats {
  id: string
  domain: string
  status: string
  isVerified: boolean
  emailAddressCount: number
  emailsLast24h: number
  createdAt: string
  updatedAt: string
}

interface DomainStatsResponse {
  domains: DomainStats[]
  totalDomains: number
  verifiedDomains: number
  totalEmailAddresses: number
  totalEmailsLast24h: number
  limits?: {
    allowed: boolean
    unlimited: boolean
    balance: number | null
    current: number
    remaining: number | null
  } | null
}

type SortField = 'domain' | 'status' | 'emailAddressCount' | 'emailsLast24h' | 'createdAt'
type SortDirection = 'asc' | 'desc'

export default function EmailsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [domainStats, setDomainStats] = useState<DomainStatsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [filteredDomains, setFilteredDomains] = useState<DomainStats[]>([])

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('createdAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  useEffect(() => {
    if (session?.user) {
      fetchDomainStats()
    }
  }, [session])

  useEffect(() => {
    if (domainStats) {
      let filtered = domainStats.domains.filter(domain => {
        const matchesSearch = domain.domain.toLowerCase().includes(searchQuery.toLowerCase())
        
        const matchesStatus = statusFilter === 'all' || 
          (statusFilter === 'verified' && domain.isVerified) ||
          (statusFilter === DOMAIN_STATUS.PENDING && domain.status === DOMAIN_STATUS.PENDING) ||
          (statusFilter === DOMAIN_STATUS.FAILED && domain.status === DOMAIN_STATUS.FAILED)
        return matchesSearch && matchesStatus
      })

      // Apply sorting
      filtered.sort((a, b) => {
        let aValue: any = a[sortField]
        let bValue: any = b[sortField]

        // Handle special cases
        if (sortField === 'status') {
          // Sort by verification status first, then by status
          const statusOrder = {
            [DOMAIN_STATUS.VERIFIED]: 4,
            [DOMAIN_STATUS.PENDING]: 2,
            [DOMAIN_STATUS.FAILED]: 1
          }
          aValue = statusOrder[a.status as keyof typeof statusOrder] || 0
          bValue = statusOrder[b.status as keyof typeof statusOrder] || 0
        } else if (sortField === 'createdAt') {
          aValue = new Date(a.createdAt).getTime()
          bValue = new Date(b.createdAt).getTime()
        }

        if (sortDirection === 'asc') {
          return aValue > bValue ? 1 : -1
        } else {
          return aValue < bValue ? 1 : -1
        }
      })

      setFilteredDomains(filtered)
    }
  }, [domainStats, searchQuery, statusFilter, sortField, sortDirection])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDownIcon className="h-3 w-3 text-muted-foreground" />
    }
    return sortDirection === 'asc' 
      ? <ArrowUpIcon className="h-3 w-3 text-purple-600" />
      : <ArrowDownIcon className="h-3 w-3 text-purple-600" />
  }

  const fetchDomainStats = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await fetch('/api/domains/stats')
      
      if (!response.ok) {
        throw new Error('Failed to fetch domain statistics')
      }
      
      const data: DomainStatsResponse = await response.json()
      setDomainStats(data)
    } catch (error) {
      console.error('Error fetching domain stats:', error)
      setError(error instanceof Error ? error.message : 'Failed to load domain statistics')
      toast.error('Failed to load domain statistics')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRowClick = (domainId: string) => {
    // Navigate directly to domain detail page
    router.push(`/emails/${domainId}`)
  }



  const getStatusBadge = (domain: DomainStats) => {
    if (domain.isVerified) {
      return (
        <Badge className="bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200 transition-colors">
          <CheckCircleIcon className="h-3 w-3 mr-1" />
          Verified
        </Badge>
      )
    }
    
    switch (domain.status) {
      case DOMAIN_STATUS.PENDING:
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200 transition-colors">
            <ClockIcon className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        )
      case DOMAIN_STATUS.VERIFIED:
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200 transition-colors">
            <ClockIcon className="h-3 w-3 mr-1" />
            SES Pending
          </Badge>
        )
      case DOMAIN_STATUS.FAILED:
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
            {domain.status}
          </Badge>
        )
    }
  }

  const getGlobeIconColor = (domain: DomainStats) => {
    if (domain.isVerified || domain.status === DOMAIN_STATUS.VERIFIED) {
      return {
        bgColor: 'bg-purple-100',
        borderColor: 'border-purple-200',
        iconColor: 'text-purple-600'
      }
    }
    
    switch (domain.status) {
      case DOMAIN_STATUS.PENDING:
        return {
          bgColor: 'bg-amber-100',
          borderColor: 'border-amber-200',
          iconColor: 'text-amber-600'
        }
      case DOMAIN_STATUS.VERIFIED:
        return {
          bgColor: 'bg-blue-100',
          borderColor: 'border-blue-200',
          iconColor: 'text-blue-600'
        }
      case DOMAIN_STATUS.FAILED:
        return {
          bgColor: 'bg-rose-100',
          borderColor: 'border-rose-200',
          iconColor: 'text-rose-600'
        }
      default:
        return {
          bgColor: 'bg-slate-100',
          borderColor: 'border-slate-200',
          iconColor: 'text-slate-600'
        }
    }
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
                <h1 className="text-4xl font-bold tracking-tight mb-2">Domains</h1>
                <p className="text-purple-100 text-lg">
                  Manage your email domains and monitor their performance
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

        {/* Loading Table */}
        <div>
          {/* Search and Filters */}
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                disabled
                className="pl-10 bg-background"
              />
            </div>
            <Select disabled>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
            </Select>
            <Select disabled>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Regions" />
              </SelectTrigger>
            </Select>
          </div>
          
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
              <span className="text-muted-foreground">Loading domains...</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header with Gradient */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 p-8 text-white shadow-xl">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight mb-2">Domains</h1>
              <p className="text-purple-100 text-lg">
                Manage your email domains and monitor their performance
              </p>
              {domainStats && (
                <div className="flex items-center gap-6 mt-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                    <span className="text-purple-100">{domainStats.totalDomains} Total Domains</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-300 rounded-full"></div>
                    <span className="text-purple-100">{domainStats.verifiedDomains} Verified</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-300 rounded-full"></div>
                    <span className="text-purple-100">{domainStats.totalEmailAddresses} Email Addresses</span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                onClick={fetchDomainStats}
                disabled={isLoading}
                className="bg-white/20 border-white/30 text-white hover:bg-white/30 backdrop-blur-sm"
              >
                <RefreshCwIcon className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              
              <Button
                onClick={() => router.push("/add")}
                disabled={isLoading || (domainStats?.limits ? !domainStats.limits.allowed : false)}
                className="bg-white text-purple-700 hover:bg-white/90 border-white/30 backdrop-blur-sm font-medium"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Add Domain
              </Button>
            </div>
          </div>
        </div>
        {/* Decorative elements */}
        <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>
        <div className="absolute top-1/2 right-1/4 w-16 h-16 bg-white/5 rounded-full blur-lg"></div>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <XCircleIcon className="h-4 w-4" />
              <span>{error}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchDomainStats}
                className="ml-auto text-red-600 hover:text-red-700"
              >
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Domains Table */}
      <div>
        {/* Search and Filters */}
        <div className="flex items-center gap-4 mb-3">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-background"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value={DOMAIN_STATUS.PENDING}>Pending</SelectItem>
              <SelectItem value={DOMAIN_STATUS.FAILED}>Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filteredDomains.length === 0 ? (
          <div className="text-center py-12">
            <GlobeIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No domains found</h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || statusFilter !== 'all'
                ? 'No domains match your search criteria.' 
                : 'Get started by adding your first domain.'}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden">
            {/* Table Header with Rounded Border and Sorting */}
            <div className="border border-border bg-muted/30 rounded-lg px-6 py-3">
              <div className="grid grid-cols-5 gap-4 text-sm font-medium text-muted-foreground">
                <button 
                  className="flex items-center gap-2 hover:text-foreground transition-colors text-left"
                  onClick={() => handleSort('domain')}
                >
                  <span>Domain</span>
                  {getSortIcon('domain')}
                </button>
                <button 
                  className="flex items-center gap-2 hover:text-foreground transition-colors text-left"
                  onClick={() => handleSort('status')}
                >
                  <span>Status</span>
                  {getSortIcon('status')}
                </button>
                <button 
                  className="flex items-center gap-2 hover:text-foreground transition-colors text-left"
                  onClick={() => handleSort('emailAddressCount')}
                >
                  <span>Email Addresses</span>
                  {getSortIcon('emailAddressCount')}
                </button>
                <button 
                  className="flex items-center gap-2 hover:text-foreground transition-colors text-left"
                  onClick={() => handleSort('emailsLast24h')}
                >
                  <span>Emails (24h)</span>
                  {getSortIcon('emailsLast24h')}
                </button>
                <button 
                  className="flex items-center gap-2 hover:text-foreground transition-colors text-left"
                  onClick={() => handleSort('createdAt')}
                >
                  <span>Created</span>
                  {getSortIcon('createdAt')}
                </button>
              </div>
            </div>
            
            {/* Table Body */}
            <div className="">
              <Table>
                <TableBody>
                  {filteredDomains.map((domain, index) => {
                    const iconColors = getGlobeIconColor(domain)
                    return (
                      <TableRow 
                        key={domain.id} 
                        className={`hover:bg-muted/50 cursor-pointer transition-colors ${
                          index < filteredDomains.length - 1 ? 'border-b border-border/50' : ''
                        }`}
                        onClick={() => handleRowClick(domain.id)}
                      >
                        <TableCell className="w-1/5">
                          <div className="flex items-center gap-3">
                            <div className={`flex items-center justify-center w-8 h-8 rounded-md ${iconColors.bgColor} border-2 ${iconColors.borderColor}`}>
                              <GlobeIcon className={`h-4 w-4 ${iconColors.iconColor}`} />
                            </div>
                            <div>
                              <div className="font-medium text-base py-2">
                                {domain.domain}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="w-1/5">
                          {getStatusBadge(domain)}
                        </TableCell>
                        <TableCell className="w-1/5">
                          <div className="flex items-center gap-2">
                            <MailIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{domain.emailAddressCount}</span>
                            <span className="text-sm text-muted-foreground">addresses</span>
                          </div>
                        </TableCell>
                        <TableCell className="w-1/5">
                          <div className="flex items-center gap-2">
                            <TrendingUpIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{domain.emailsLast24h}</span>
                            <span className="text-sm text-muted-foreground">emails</span>
                          </div>
                        </TableCell>
                        <TableCell className="w-1/5">
                          <div className="flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm">
                              {(() => {
                                const createdAt = new Date(domain.createdAt);
                                const now = new Date();
                                const diffInDays = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
                                let colorClass = 'text-muted-foreground';
                                if (diffInDays < 1) {
                                  colorClass = 'text-purple-500';
                                } else if (diffInDays < 7) {
                                  colorClass = 'text-purple-600';
                                } else if (diffInDays < 30) {
                                  colorClass = 'text-purple-800';
                                } else {
                                  colorClass = 'text-purple-800';
                                }
                                return (
                                  <span className={colorClass}>
                                    {formatDistanceToNow(createdAt, { addSuffix: true })}
                                  </span>
                                );
                              })()}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 