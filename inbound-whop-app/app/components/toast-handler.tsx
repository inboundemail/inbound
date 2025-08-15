"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"

export function ToastHandler() {
  const searchParams = useSearchParams()
  const toastType = searchParams.get("toast")

  useEffect(() => {
    if (!toastType) return

    switch (toastType) {
      case "email-sent":
        toast.success("Email sent successfully!", {
          description: "Your email has been delivered."
        })
        break
      case "email-error":
        toast.error("Failed to send email", {
          description: "Please try again or check your connection."
        })
        break
      case "reply-sent":
        toast.success("Reply sent successfully!", {
          description: "Your reply has been delivered."
        })
        break
      case "reply-error":
        toast.error("Failed to send reply", {
          description: "Please try again or check your connection."
        })
        break
      case "refresh-success":
        toast.success("Inbox refreshed", {
          description: "Your emails have been updated."
        })
        break
      default:
        break
    }

    // Clean up the URL parameter after showing the toast
    if (toastType) {
      const url = new URL(window.location.href)
      url.searchParams.delete("toast")
      window.history.replaceState({}, "", url.toString())
    }
  }, [toastType])

  return null
}
