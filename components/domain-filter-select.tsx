"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useRouter, useSearchParams } from 'next/navigation'

interface DomainFilterSelectProps {
  domains: string[]
  currentDomain: string
}

export function DomainFilterSelect({ domains, currentDomain }: DomainFilterSelectProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleDomainChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    
    if (value === 'all') {
      params.delete('domain')
    } else {
      params.set('domain', value)
    }
    
    // Reset offset when filtering
    params.delete('offset')
    
    router.push(`/mail?${params.toString()}`)
  }

  return (
    <Select value={currentDomain} onValueChange={handleDomainChange}>
      <SelectTrigger className="w-40 h-9 rounded-xl">
        <SelectValue placeholder="All Domains" />
      </SelectTrigger>
      <SelectContent className="rounded-xl">
        <SelectItem value="all">All Domains</SelectItem>
        {domains.map((domain) => (
          <SelectItem key={domain} value={domain}>
            {domain}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
} 