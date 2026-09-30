"use client"

import * as React from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useSearch } from "@/hooks/useSearch"
import { useRouter } from "next/navigation"
import Magnifier2 from "@/components/icons/magnifier-2"
import Globe2 from "@/components/icons/globe-2"
import Envelope2 from "@/components/icons/envelope-2"
import Webhook from "@/components/icons/webhook"
import Clock2 from "@/components/icons/clock-2"
import { Badge } from "@/components/ui/badge"

interface CommandBarProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandBar({ open, onOpenChange }: CommandBarProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [selectedIndex, setSelectedIndex] = React.useState(-1)
  const { 
    searchQuery, 
    updateSearchQuery, 
    searchResults, 
    isLoading, 
    error, 
    hasActiveSearch,
    fallbackUsed,
    totalResults,
    clearSearch 
  } = useSearch()

  // Flatten all results for keyboard navigation
  const allResults = React.useMemo(() => {
    if (!searchResults) return []
    
    const results: Array<{type: string, id: string, title: string, subtitle: string}> = []
    
    // Add domains
    searchResults.domains?.forEach(domain => {
      results.push({
        type: 'domain',
        id: domain.id,
        title: domain.domain,
        subtitle: `${domain.status} • ${domain.canReceiveEmails ? 'Can receive' : 'Cannot receive'}`
      })
    })
    
    // Add addresses  
    searchResults.addresses?.forEach(address => {
      results.push({
        type: 'address',
        id: address.domainId,
        title: address.address,
        subtitle: `${address.domain} • ${address.endpointName || 'No endpoint'}`
      })
    })
    
    // Add endpoints
    searchResults.endpoints?.forEach(endpoint => {
      results.push({
        type: 'endpoint',
        id: endpoint.id,
        title: endpoint.name,
        subtitle: endpoint.description || `${endpoint.type} endpoint`
      })
    })
    
    // Add emails
    searchResults.emails?.forEach(email => {
      results.push({
        type: 'email',
        id: email.id,
        title: email.subject || 'No subject',
        subtitle: `From ${email.from} to ${email.to}`
      })
    })
    
    return results
  }, [searchResults])

  // Focus input when dialog opens
  React.useEffect(() => {
    if (open && inputRef.current) {
      // Small delay to ensure dialog animation completes
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }, [open])

  // Reset search when dialog closes
  React.useEffect(() => {
    if (!open) {
      clearSearch()
      setSelectedIndex(-1)
    }
  }, [open, clearSearch])

  // Reset selected index when search results change
  React.useEffect(() => {
    setSelectedIndex(-1)
  }, [allResults])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateSearchQuery(e.target.value)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onOpenChange(false)
      return
    }

    if (!allResults.length) return

    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex(prev => 
        prev < allResults.length - 1 ? prev + 1 : 0
      )
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex(prev => 
        prev > 0 ? prev - 1 : allResults.length - 1
      )
    } else if (e.key === "Enter") {
      e.preventDefault()
      const targetIndex = selectedIndex >= 0 ? selectedIndex : 0
      const selectedResult = allResults[targetIndex]
      if (selectedResult) {
        handleResultClick(selectedResult.type, selectedResult.id)
      }
    }
  }

  const handleResultClick = (type: string, id: string) => {
    onOpenChange(false)
    
    // Navigate based on result type
    switch (type) {
      case 'domain':
        router.push(`/emails/${id}`)
        break
      case 'address':
        router.push(`/emails/${id}`)
        break
      case 'endpoint':
        router.push(`/endpoints/${id}`)
        break
      case 'email':
        router.push(`/logs/${id}`)
        break
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className={cn(
          "max-w-2xl p-0 gap-0 overflow-hidden",
          "fixed top-[20vh] left-1/2 -translate-x-1/2 translate-y-0",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:slide-out-to-top-[10px] data-[state=open]:slide-in-from-top-[10px]",
          "[&>button]:hidden" // Hide default close button
        )}
        aria-describedby="command-bar-description"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Command Bar</DialogTitle>
          <DialogDescription id="command-bar-description">
            Type an email address to search or navigate
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex items-center px-4 py-3 border-b">
          <Magnifier2 width="16" height="16" className="mr-3 text-muted-foreground flex-shrink-0" />
          <Input
            ref={inputRef}
            placeholder="Search domains, addresses, endpoints..."
            value={searchQuery}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            className="flex-1 border-0 px-0 text-base bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground"
          />
          <div className="flex items-center gap-2 ml-3">
            <kbd className="pointer-events-none inline-flex h-6 select-none items-center gap-1 rounded border bg-muted px-2 font-mono text-xs font-medium text-muted-foreground">
              ESC
            </kbd>
          </div>
        </div>
        
        {hasActiveSearch && (
          <div className="max-h-[400px] overflow-y-auto">
            <div className="p-2">
              {isLoading && (
                <div className="flex items-center justify-center p-8 text-muted-foreground">
                  <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                  <span className="text-sm">Searching...</span>
                </div>
              )}

              {error && (
                <div className="p-4 text-center text-destructive">
                  <p className="text-sm">Search failed: {error instanceof Error ? error.message : String(error)}</p>
                </div>
              )}

              {searchResults && !isLoading && !error && (
                <>
                  {totalResults === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <Magnifier2 width="24" height="24" className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No results found</p>
                      <p className="text-xs mt-1 opacity-75">Try a different search term</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {/* Render results with keyboard navigation */}
                      {(() => {
                        let currentIndex = 0
                        return (
                          <>
                            {/* Domains */}
                            {searchResults.domains && searchResults.domains.length > 0 && (
                              <div>
                                <div className="px-2 py-1 text-xs text-muted-foreground font-medium">
                                  Domains ({searchResults.domains.length})
                                </div>
                                {searchResults.domains.map((domain) => {
                                  const isSelected = selectedIndex === currentIndex
                                  currentIndex++
                                  return (
                                    <div
                                      key={domain.id}
                                      onClick={() => handleResultClick('domain', domain.id)}
                                      className={cn(
                                        "flex items-center p-2 rounded-lg cursor-pointer group transition-colors",
                                        isSelected 
                                          ? "bg-primary text-primary-foreground" 
                                          : "hover:bg-primary/10 hover:text-foreground"
                                      )}
                                    >
                                      <Globe2 
                                        width="16" 
                                        height="16" 
                                        className={cn(
                                          "mr-3 flex-shrink-0",
                                          isSelected ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                                        )} 
                                      />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{domain.domain}</p>
                                        <p className={cn(
                                          "text-xs",
                                          isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                                        )}>
                                          {domain.status} • {domain.canReceiveEmails ? 'Can receive' : 'Cannot receive'}
                                        </p>
                                      </div>
                                      <Badge variant="outline" className={cn(
                                        "text-xs",
                                        isSelected && "border-primary-foreground/30 text-primary-foreground"
                                      )}>
                                        Domain
                                      </Badge>
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            {/* Email Addresses */}
                            {searchResults.addresses && searchResults.addresses.length > 0 && (
                              <div>
                                <div className="px-2 py-1 text-xs text-muted-foreground font-medium">
                                  Email Addresses ({searchResults.addresses.length})
                                </div>
                                {searchResults.addresses.map((address) => {
                                  const isSelected = selectedIndex === currentIndex
                                  currentIndex++
                                  return (
                                    <div
                                      key={address.id}
                                      onClick={() => handleResultClick('address', address.domainId)}
                                      className={cn(
                                        "flex items-center p-2 rounded-lg cursor-pointer group transition-colors",
                                        isSelected 
                                          ? "bg-primary text-primary-foreground" 
                                          : "hover:bg-primary/10 hover:text-foreground"
                                      )}
                                    >
                                      <Envelope2 
                                        width="16" 
                                        height="16" 
                                        className={cn(
                                          "mr-3 flex-shrink-0",
                                          isSelected ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                                        )} 
                                      />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{address.address}</p>
                                        <p className={cn(
                                          "text-xs",
                                          isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                                        )}>
                                          {address.domain} • {address.endpointName || 'No endpoint'}
                                        </p>
                                      </div>
                                      <Badge 
                                        variant={address.isActive ? "default" : "secondary"} 
                                        className={cn(
                                          "text-xs",
                                          isSelected && "border-primary-foreground/30 text-primary-foreground bg-primary-foreground/20"
                                        )}
                                      >
                                        {address.isActive ? 'Active' : 'Inactive'}
                                      </Badge>
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            {/* Endpoints */}
                            {searchResults.endpoints && searchResults.endpoints.length > 0 && (
                              <div>
                                <div className="px-2 py-1 text-xs text-muted-foreground font-medium">
                                  Endpoints ({searchResults.endpoints.length})
                                </div>
                                {searchResults.endpoints.map((endpoint) => {
                                  const isSelected = selectedIndex === currentIndex
                                  currentIndex++
                                  return (
                                    <div
                                      key={endpoint.id}
                                      onClick={() => handleResultClick('endpoint', endpoint.id)}
                                      className={cn(
                                        "flex items-center p-2 rounded-lg cursor-pointer group transition-colors",
                                        isSelected 
                                          ? "bg-primary text-primary-foreground" 
                                          : "hover:bg-primary/10 hover:text-foreground"
                                      )}
                                    >
                                      <Webhook 
                                        width="16" 
                                        height="16" 
                                        className={cn(
                                          "mr-3 flex-shrink-0",
                                          isSelected ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                                        )} 
                                      />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{endpoint.name}</p>
                                        <p className={cn(
                                          "text-xs truncate",
                                          isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                                        )}>
                                          {endpoint.description || `${endpoint.type} endpoint`}
                                        </p>
                                      </div>
                                      <Badge 
                                        variant={endpoint.isActive ? "default" : "secondary"} 
                                        className={cn(
                                          "text-xs",
                                          isSelected && "border-primary-foreground/30 text-primary-foreground bg-primary-foreground/20"
                                        )}
                                      >
                                        {endpoint.type}
                                      </Badge>
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            {/* Email Logs (fallback results) */}
                            {searchResults.emails && searchResults.emails.length > 0 && (
                              <div>
                                <div className="px-2 py-1 text-xs text-muted-foreground font-medium flex items-center">
                                  <Clock2 width="12" height="12" className="mr-1" />
                                  Recent Emails ({searchResults.emails.length})
                                  {fallbackUsed && (
                                    <Badge variant="outline" className="ml-2 text-xs">
                                      Extended search
                                    </Badge>
                                  )}
                                </div>
                                {searchResults.emails.map((email) => {
                                  const isSelected = selectedIndex === currentIndex
                                  currentIndex++
                                  return (
                                    <div
                                      key={email.id}
                                      onClick={() => handleResultClick('email', email.id)}
                                      className={cn(
                                        "flex items-center p-2 rounded-lg cursor-pointer group transition-colors",
                                        isSelected 
                                          ? "bg-primary text-primary-foreground" 
                                          : "hover:bg-primary/10 hover:text-foreground"
                                      )}
                                    >
                                      <Envelope2 
                                        width="16" 
                                        height="16" 
                                        className={cn(
                                          "mr-3 flex-shrink-0",
                                          isSelected ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
                                        )} 
                                      />
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{email.subject || 'No subject'}</p>
                                        <p className={cn(
                                          "text-xs truncate",
                                          isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                                        )}>
                                          From {email.from} to {email.to}
                                        </p>
                                      </div>
                                      <div className={cn(
                                        "text-xs",
                                        isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                                      )}>
                                        {new Date(email.receivedAt).toLocaleDateString()}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function useCommandBar() {
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen(true)
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  return { open, setOpen }
}
