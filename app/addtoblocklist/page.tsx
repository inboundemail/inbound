'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { blockEmailAction } from '@/app/actions/blocking'
import { HiShieldCheck, HiMail, HiCheck, HiX } from 'react-icons/hi'

export default function AddToBlocklistPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null)

  useEffect(() => {
    const emailParam = searchParams.get('email')
    if (emailParam) {
      setEmail(decodeURIComponent(emailParam))
      setReason('Email forwarded through Inbound - user requested blocking')
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setIsLoading(true)
    setResult(null)

    try {
      const response = await blockEmailAction(email.trim(), reason.trim() || undefined)
      setResult(response)
      
      if (response.success) {
        // Clear the form after successful blocking
        setTimeout(() => {
          router.push('/dashboard')
        }, 2000)
      }
    } catch (error) {
      setResult({
        success: false,
        error: 'An unexpected error occurred'
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-100 p-3 rounded-full">
              <HiShieldCheck className="h-8 w-8 text-blue-600" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Block Email Address</h1>
          <p className="text-gray-600">
            Block unwanted emails from reaching your catch-all domains
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HiMail className="h-5 w-5" />
              Email Blocking
            </CardTitle>
            <CardDescription>
              Add an email address to your blocklist to prevent future emails from this sender
            </CardDescription>
          </CardHeader>
          <CardContent>
            {result && (
              <Alert className={`mb-6 ${result.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                <div className="flex items-center gap-2">
                  {result.success ? (
                    <HiCheck className="h-4 w-4 text-green-600" />
                  ) : (
                    <HiX className="h-4 w-4 text-red-600" />
                  )}
                  <AlertDescription className={result.success ? 'text-green-800' : 'text-red-800'}>
                    {result.success ? result.message : result.error}
                  </AlertDescription>
                </div>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                  Email Address to Block
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter email address"
                  className="mt-1"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  Only emails from catch-all domains can be blocked
                </p>
              </div>

              <div>
                <Label htmlFor="reason" className="text-sm font-medium text-gray-700">
                  Reason (Optional)
                </Label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why are you blocking this email address?"
                  className="mt-1"
                  rows={3}
                />
              </div>

              <div className="flex gap-3">
                <Button
                  type="submit"
                  disabled={isLoading || !email.trim()}
                  className="flex-1"
                >
                  {isLoading ? 'Blocking...' : 'Block Email Address'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => router.back()}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
              </div>
            </form>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h3 className="text-sm font-medium text-blue-900 mb-2">How Email Blocking Works</h3>
              <ul className="text-xs text-blue-800 space-y-1">
                <li>• Only emails from catch-all domains can be blocked</li>
                <li>• Manually added email addresses cannot be blocked</li>
                <li>• Blocked emails will be received but not forwarded</li>
                <li>• You can unblock emails anytime from your dashboard</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 