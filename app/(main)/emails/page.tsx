"use client"

import { useEffect, useState } from 'react'
import { useSession } from '@/lib/auth-client'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  AlertTriangleIcon,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { DOMAIN_STATUS, SES_VERIFICATION_STATUS } from '@/lib/db/schema'
import { shouldShowSyncButton } from '@/lib/feature-flags'

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
  const [regionFilter, setRegionFilter] = useState('all')
  const [filteredDomains, setFilteredDomains] = useState<DomainStats[]>([])

  // Sorting state
  const [sortField, setSortField] = useState<SortField>('createdAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  // Add domain modal state
  const [isAddDomainOpen, setIsAddDomainOpen] = useState(false)
  const [newDomain, setNewDomain] = useState('')
  const [isAddingDomain, setIsAddingDomain] = useState(false)
  const [addDomainError, setAddDomainError] = useState<string | null>(null)

  // Sync with AWS state
  const [isSyncing, setIsSyncing] = useState(false)

  // MX records conflict error state
  const [mxConflictError, setMxConflictError] = useState<{
    domain: string
    suggestedSubdomains: string[]
    mxRecords?: Array<{ exchange: string; priority: number }>
  } | null>(null)

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
        
        // For now, all domains are in the same region, but this can be extended
        const matchesRegion = regionFilter === 'all' || regionFilter === 'us-east-1'
        
        return matchesSearch && matchesStatus && matchesRegion
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
  }, [domainStats, searchQuery, statusFilter, regionFilter, sortField, sortDirection])

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

  const handleAddDomain = () => {
    setIsAddDomainOpen(true)
    setNewDomain('')
    setAddDomainError(null)
  }

  const handleAddDomainSubmit = async () => {
    if (!newDomain.trim()) {
      setAddDomainError('Domain is required')
      return
    }

    // Basic domain validation
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/
    if (!domainRegex.test(newDomain.trim())) {
      setAddDomainError('Please enter a valid domain name (e.g., example.com)')
      return
    }

    setIsAddingDomain(true)
    setAddDomainError(null)

    try {
      const response = await fetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: newDomain.trim().toLowerCase() })
      })

      const result = await response.json()

      if (response.ok) {
        toast.success('Domain added successfully!')
        setIsAddDomainOpen(false)
        setNewDomain('')
        
        // Redirect to the domain detail page
        router.push(`/emails/${result.domain.id}`)
      } else {
        // Check if this is an MX records conflict error
        if (result.hasMxRecords && result.suggestedSubdomains) {
          setMxConflictError({
            domain: newDomain.trim().toLowerCase(),
            suggestedSubdomains: result.suggestedSubdomains,
            mxRecords: result.mxRecords
          })
          setIsAddDomainOpen(false) // Close the add domain dialog
        } else {
          setAddDomainError(result.error || 'Failed to add domain')
        }
      }
    } catch (error) {
      console.error('Error adding domain:', error)
      setAddDomainError('Network error occurred')
    } finally {
      setIsAddingDomain(false)
    }
  }

  const handleAddSubdomain = async (subdomain: string) => {
    setIsAddingDomain(true)
    
    try {
      const response = await fetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: subdomain })
      })

      const result = await response.json()

      if (response.ok) {
        toast.success(`Subdomain ${subdomain} added successfully!`)
        setMxConflictError(null)
        
        // Redirect to the domain detail page
        router.push(`/emails/${result.domain.id}`)
      } else {
        toast.error(result.error || `Failed to add subdomain ${subdomain}`)
      }
    } catch (error) {
      console.error('Error adding subdomain:', error)
      toast.error('Network error occurred')
    } finally {
      setIsAddingDomain(false)
    }
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

  const getStatusIcon = (domain: DomainStats) => {
    if (domain.isVerified) {
      return <CheckCircleIcon className="h-4 w-4 text-green-600" />
    }
    
    switch (domain.status) {
      case DOMAIN_STATUS.PENDING:
        return <ClockIcon className="h-4 w-4 text-yellow-600" />
      case DOMAIN_STATUS.FAILED:
        return <XCircleIcon className="h-4 w-4 text-red-600" />
      default:
        return <ClockIcon className="h-4 w-4 text-gray-600" />
    }
  }

  const syncWithAWS = async () => {
    try {
      setIsSyncing(true)
      
      const response = await fetch('/api/domains/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncWithAWS: true })
      })

      if (response.ok) {
        const result = await response.json()
        toast.success(`Synced ${result.synced || 0} domains with AWS SES`)
        
        // Refresh the domain stats after sync
        await fetchDomainStats()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to sync with AWS SES')
      }
    } catch (error) {
      console.error('Sync error:', error)
      toast.error('Failed to sync with AWS SES')
    } finally {
      setIsSyncing(false)
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
              {shouldShowSyncButton() && (
                <Button
                  variant="secondary"
                  onClick={syncWithAWS}
                  disabled={isSyncing || isLoading}
                  className="bg-white/20 border-white/30 text-white hover:bg-white/30 backdrop-blur-sm"
                >
                  <CloudIcon className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-pulse' : ''}`} />
                  {isSyncing ? 'Syncing...' : 'Sync with AWS'}
                </Button>
              )}
              <Button
                onClick={handleAddDomain}
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
              {searchQuery || statusFilter !== 'all' || regionFilter !== 'all' 
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

      {/* Add Domain Modal */}
      <Dialog open={isAddDomainOpen} onOpenChange={setIsAddDomainOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New Domain</DialogTitle>
            <DialogDescription>
              {domainStats?.limits && !domainStats.limits.allowed ? (
                <span className="text-red-600">
                  You've reached your domain limit ({domainStats.limits.current}/{domainStats.limits.balance}). Please upgrade your plan to add more domains.
                </span>
              ) : (
                "Enter your domain name to start receiving emails. You'll need to add DNS records to verify ownership."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="domain">Domain Name</Label>
              <Input
                id="domain"
                placeholder="example.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                disabled={isAddingDomain || (domainStats?.limits ? !domainStats.limits.allowed : false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddDomainSubmit()
                  }
                }}
              />
              {addDomainError && (
                <p className="text-sm text-red-600">{addDomainError}</p>
              )}
              {domainStats?.limits && !domainStats.limits.unlimited && (
                <p className="text-xs text-muted-foreground">
                  {domainStats.limits.remaining} domain{domainStats.limits.remaining !== 1 ? 's' : ''} remaining on your plan
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setIsAddDomainOpen(false)}
              disabled={isAddingDomain}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddDomainSubmit}
              disabled={isAddingDomain || !newDomain.trim() || (domainStats?.limits ? !domainStats.limits.allowed : false)}
            >
              {isAddingDomain ? (
                <>
                  <RefreshCwIcon className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Add Domain
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MX Records Conflict Dialog */}
      <Dialog open={!!mxConflictError} onOpenChange={() => setMxConflictError(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangleIcon className="h-5 w-5 text-amber-600" />
              Domain Already Has Email Setup
            </DialogTitle>
            <DialogDescription>
              The domain <strong>{mxConflictError?.domain}</strong> already has MX records configured for email receiving. 
              Adding our email service would conflict with your existing setup.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {mxConflictError?.mxRecords && mxConflictError.mxRecords.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <h4 className="font-semibold text-amber-800 mb-2">Existing MX Records:</h4>
                <div className="space-y-1">
                  {mxConflictError.mxRecords.map((record, index) => (
                    <div key={index} className="text-sm text-amber-700 font-mono">
                      {record.priority} {record.exchange}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg">
              <h4 className="font-semibold text-blue-800 mb-2">Recommended Solution: Use a Subdomain</h4>
              <p className="text-sm text-blue-700 mb-3">
                Instead of using your main domain, you can use a subdomain for inbound emails. 
                This won't conflict with your existing email setup.
              </p>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium text-blue-800">
                  Choose a subdomain to configure for inbound emails:
                </Label>
                {mxConflictError?.suggestedSubdomains.map((subdomain) => (
                  <div key={subdomain} className="flex items-center justify-between p-2 bg-white border border-blue-200 rounded">
                    <span className="font-mono text-sm">{subdomain}</span>
                    <Button
                      size="sm"
                      onClick={() => handleAddSubdomain(subdomain)}
                      disabled={isAddingDomain}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {isAddingDomain ? (
                        <RefreshCwIcon className="h-3 w-3 animate-spin" />
                      ) : (
                        'Use This Subdomain'
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <h4 className="font-semibold text-gray-800 mb-1">Why use a subdomain?</h4>
              <ul className="text-sm text-gray-700 space-y-1">
                <li>• Your existing email setup (like Gmail, Outlook) continues to work normally</li>
                <li>• You can still receive emails at your regular addresses (@{mxConflictError?.domain})</li>
                <li>• Inbound emails will be received at the subdomain (e.g., contact@mail.{mxConflictError?.domain})</li>
                <li>• No conflicts or downtime with your current email service</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setMxConflictError(null)}
              disabled={isAddingDomain}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
} 