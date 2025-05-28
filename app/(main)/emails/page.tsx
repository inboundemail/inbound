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
  ExternalLinkIcon
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { DOMAIN_STATUS, SES_VERIFICATION_STATUS } from '@/lib/db/schema'

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
}

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

  // Add domain modal state
  const [isAddDomainOpen, setIsAddDomainOpen] = useState(false)
  const [newDomain, setNewDomain] = useState('')
  const [isAddingDomain, setIsAddingDomain] = useState(false)
  const [addDomainError, setAddDomainError] = useState<string | null>(null)

  useEffect(() => {
    if (session?.user) {
      fetchDomainStats()
    }
  }, [session])

  useEffect(() => {
    if (domainStats) {
      const filtered = domainStats.domains.filter(domain => {
        const matchesSearch = domain.domain.toLowerCase().includes(searchQuery.toLowerCase())
        
        const matchesStatus = statusFilter === 'all' || 
          (statusFilter === 'verified' && domain.isVerified) ||
          (statusFilter === DOMAIN_STATUS.PENDING && domain.status === DOMAIN_STATUS.PENDING) ||
          (statusFilter === DOMAIN_STATUS.FAILED && domain.status === DOMAIN_STATUS.FAILED)
        
        // For now, all domains are in the same region, but this can be extended
        const matchesRegion = regionFilter === 'all' || regionFilter === 'us-east-1'
        
        return matchesSearch && matchesStatus && matchesRegion
      })
      setFilteredDomains(filtered)
    }
  }, [domainStats, searchQuery, statusFilter, regionFilter])

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
        setAddDomainError(result.error || 'Failed to add domain')
      }
    } catch (error) {
      console.error('Error adding domain:', error)
      setAddDomainError('Network error occurred')
    } finally {
      setIsAddingDomain(false)
    }
  }

  const getStatusBadge = (domain: DomainStats) => {
    if (domain.isVerified) {
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-200 transition-colors">
          <CheckCircleIcon className="h-3 w-3 mr-1" />
          Verified
        </Badge>
      )
    }
    
    switch (domain.status) {
      case DOMAIN_STATUS.PENDING:
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-200 transition-colors">
            <ClockIcon className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        )
      case DOMAIN_STATUS.DNS_VERIFIED:
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-200 transition-colors">
            <ClockIcon className="h-3 w-3 mr-1" />
            SES Pending
          </Badge>
        )
      case DOMAIN_STATUS.SES_VERIFIED:
        return (
          <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-200 transition-colors">
            <CheckCircleIcon className="h-3 w-3 mr-1" />
            Verified
          </Badge>
        )
      case DOMAIN_STATUS.FAILED:
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-200 transition-colors">
            <XCircleIcon className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="hover:bg-muted transition-colors">
            <ClockIcon className="h-3 w-3 mr-1" />
            {domain.status}
          </Badge>
        )
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

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Domains</h1>
            <p className="text-muted-foreground">
              Manage your email domains and monitor their performance
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled>
              <RefreshCwIcon className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button disabled variant="primary">
              <PlusIcon className="h-4 w-4 mr-2" />
              Add Domain
            </Button>
          </div>
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Domains</h1>
          <p className="text-muted-foreground">
            Manage your email domains and monitor their performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={fetchDomainStats}
            disabled={isLoading}
          >
            <RefreshCwIcon className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="primary" onClick={handleAddDomain}>
            <PlusIcon className="h-4 w-4 mr-2" />
            Add Domain
          </Button>
        </div>
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
          {/* <Select value={regionFilter} onValueChange={setRegionFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Regions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              <SelectItem value="us-east-2">Ohio (us-east-2)</SelectItem>
              <SelectItem value="us-east-1">North Virginia (us-east-1)</SelectItem>
              <SelectItem value="us-west-2">Oregon (us-west-2)</SelectItem>
              <SelectItem value="eu-west-1">Ireland (eu-west-1)</SelectItem>
            </SelectContent>
          </Select> */}
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
            {!searchQuery && statusFilter === 'all' && regionFilter === 'all' && (
              <Button variant="primary" onClick={handleAddDomain}>
                <PlusIcon className="h-4 w-4 mr-2" />
                Add Your First Domain
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden">
            {/* Table Header with Rounded Border */}
            <div className="border border-border bg-muted/30 rounded-lg px-6 py-2">
              <div className="grid grid-cols-5 gap-4 text-sm font-medium text-muted-foreground">
                <div>Domain</div>
                <div>Status</div>
                <div>Email Addresses</div>
                <div>Emails (24h)</div>
                <div>Created</div>
              </div>
            </div>
            
            {/* Table Body */}
            <div className="">
              <Table>
                <TableBody>
                  {filteredDomains.map((domain, index) => (
                    <TableRow 
                      key={domain.id} 
                      className={`hover:bg-muted/50 cursor-pointer transition-colors ${
                        index < filteredDomains.length - 1 ? 'border-b border-border/50' : ''
                      }`}
                      onClick={() => handleRowClick(domain.id)}
                    >
                      <TableCell className="w-1/5">
                        <div className="flex items-center gap-3">
                          {/* <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100">
                            <GlobeIcon className="h-4 w-4 text-blue-600" />
                          </div> */}
                          <div>
                            <div className="font-medium text-base py-2">{domain.domain}</div>
                            {/* <div className="text-sm text-muted-foreground flex items-center gap-1">
                              <ExternalLinkIcon className="h-3 w-3" />
                              Click to manage
                            </div> */}
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
                            {formatDistanceToNow(new Date(domain.createdAt), { addSuffix: true })}
                          </span>
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

      {/* Add Domain Modal */}
      <Dialog open={isAddDomainOpen} onOpenChange={setIsAddDomainOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New Domain</DialogTitle>
            <DialogDescription>
              Enter your domain name to start receiving emails. You'll need to add DNS records to verify ownership.
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
                disabled={isAddingDomain}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddDomainSubmit()
                  }
                }}
              />
              {addDomainError && (
                <p className="text-sm text-red-600">{addDomainError}</p>
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
              disabled={isAddingDomain || !newDomain.trim()}
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
    </div>
  )
} 