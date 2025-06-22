"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { HiCheckCircle, HiExclamation } from 'react-icons/hi'
import { markAllEmailsAsRead } from '@/app/actions/primary'
import { useRouter } from 'next/navigation'

interface MarkAllReadButtonProps {
    unreadCount: number
}

export function MarkAllReadButton({ unreadCount }: MarkAllReadButtonProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const router = useRouter()

    const handleMarkAllAsRead = async () => {
        try {
            setIsLoading(true)
            const result = await markAllEmailsAsRead()
            
            if (result.error) {
                console.error('Failed to mark all as read:', result.error)
                return
            }

            console.log(result.message)
            setIsOpen(false)
            
            // Refresh the page to show updated read status
            router.refresh()
        } catch (error) {
            console.error('Error marking all emails as read:', error)
        } finally {
            setIsLoading(false)
        }
    }

    if (unreadCount === 0) {
        return null // Don't show button if no unread emails
    }

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="primary" size="sm" >
                    <HiCheckCircle className="h-4 w-4 mr-2" />
                    Mark All as Read
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <HiExclamation className="h-5 w-5 text-amber-500" />
                        Mark All Emails as Read?
                    </DialogTitle>
                    <DialogDescription>
                        This will mark all {unreadCount} unread email{unreadCount === 1 ? '' : 's'} as read. 
                        This action cannot be undone.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
                    <Button 
                        variant="secondary" 
                        onClick={() => setIsOpen(false)}
                        disabled={isLoading}
                    >
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleMarkAllAsRead}
                        disabled={isLoading}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        {isLoading ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                Marking as Read...
                            </>
                        ) : (
                            <>
                                <HiCheckCircle className="h-4 w-4 mr-2" />
                                Mark All as Read
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
} 