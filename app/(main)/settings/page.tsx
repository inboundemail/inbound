"use client"

import { useSession } from '@/lib/auth-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useState } from 'react'
import { toast } from 'sonner'

export default function SettingsPage() {
  const { data: session, isPending } = useSession()
  const [isLoading, setIsLoading] = useState(false)

  const handleUpdateProfile = async (formData: FormData) => {
    setIsLoading(true)
    try {
      // Implementation would go here
      toast.success('Profile updated successfully')
    } catch (error) {
      toast.error('Failed to update profile')
    } finally {
      setIsLoading(false)
    }
  }

  if (isPending) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="flex items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <div className="flex items-center justify-center">
          <div className="text-muted-foreground">Please sign in to access settings</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-10">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>
              Update your profile details and personal information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={handleUpdateProfile} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input 
                    id="name" 
                    name="name" 
                    defaultValue={session.user.name || ''} 
                    placeholder="Enter your full name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input 
                    id="email" 
                    name="email" 
                    type="email" 
                    defaultValue={session.user.email} 
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="image">Profile Image URL</Label>
                <Input 
                  id="image" 
                  name="image" 
                  type="url" 
                  defaultValue={session.user.image || ''} 
                  placeholder="https://example.com/avatar.jpg"
                />
              </div>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Updating...' : 'Update Profile'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account Status</CardTitle>
            <CardDescription>
              Your account verification and status information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span>Email Verification</span>
              <Badge variant={session.user.emailVerified ? "default" : "destructive"}>
                {session.user.emailVerified ? 'Verified' : 'Unverified'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Account Created</span>
              <span className="text-sm text-muted-foreground">
                {new Date(session.user.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Last Updated</span>
              <span className="text-sm text-muted-foreground">
                {new Date(session.user.updatedAt).toLocaleDateString()}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 