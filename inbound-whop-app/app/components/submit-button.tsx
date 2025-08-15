"use client"

import { useFormStatus } from "react-dom"
import { Button } from "./button"
import { Loader2 } from "lucide-react"

interface SubmitButtonProps {
  children: React.ReactNode
  variant?: "primary" | "secondary" | "outline" | "ghost" | "destructive"
  size?: "default" | "sm" | "lg" | "icon"
  className?: string
  loadingText?: string
}

export function SubmitButton({ 
  children, 
  variant = "primary", 
  size = "default", 
  className,
  loadingText = "Loading..."
}: SubmitButtonProps) {
  const { pending } = useFormStatus()

  return (
    <Button 
      type="submit" 
      variant={variant} 
      size={size} 
      className={className}
      disabled={pending}
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {loadingText}
        </>
      ) : (
        children
      )}
    </Button>
  )
}
