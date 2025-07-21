'use client'

import { useState, useEffect } from 'react'
import { listEmails } from '@/app/actions/emails'
import type { EmailItem } from '@inboundemail/sdk'
import { EmailCard } from './email-card'
import { Button } from './button'

interface EmailListProps {
  onEmailSelect?: (email: EmailItem) => void
}

export function EmailList({ onEmailSelect }: EmailListProps) {
  const [emails, setEmails] = useState<EmailItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)

  const loadEmails = async (offset = 0, append = false) => {
    setLoading(true)
    setError(null)
    
    try {
      const result = await listEmails({
        limit: 20,
        offset,
        includeArchived: false
      })

      if (result.success && result.data) {
        const newEmails = result.data.emails
        setEmails(prev => append ? [...prev, ...newEmails] : newEmails)
        setHasMore(newEmails.length === 20)
      } else {
        setError(result.error || 'Failed to load emails')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEmails()
  }, [])

  const handleLoadMore = () => {
    const nextOffset = (page + 1) * 20
    setPage(page + 1)
    loadEmails(nextOffset, true)
  }

  const handleRefresh = () => {
    setPage(0)
    loadEmails()
  }

  if (loading && emails.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading emails...</p>
        </div>
      </div>
    )
  }

  if (error && emails.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={handleRefresh} variant="outline">
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Emails ({emails.length})</h2>
        <Button onClick={handleRefresh} variant="outline" size="sm">
          Refresh
        </Button>
      </div>

      {emails.length === 0 ? (
        <div className="text-center p-8">
          <p className="text-gray-600">No emails found</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {emails.map((email) => (
              <EmailCard
                key={email.id}
                email={email}
                onClick={() => onEmailSelect?.(email)}
              />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button
                onClick={handleLoadMore}
                disabled={loading}
                variant="outline"
              >
                {loading ? 'Loading...' : 'Load More'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
} 