"use client"

import { Card } from "@/components/ui/card"
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver"
import type { ReactNode } from "react"

interface AnimatedCardProps {
  children: ReactNode
  className?: string
  delay?: number
  direction?: "up" | "down" | "left" | "right"
  onClick?: () => void
}

export function AnimatedCard({ children, className = "", delay = 0, direction = "up", onClick }: AnimatedCardProps) {
  const { ref, hasIntersected } = useIntersectionObserver()

  const getTransformClasses = () => {
    const baseClasses = "transition-all duration-700 ease-out"
    
    if (!hasIntersected) {
      switch (direction) {
        case "up":
          return `${baseClasses} opacity-0 translate-y-8`
        case "down":
          return `${baseClasses} opacity-0 -translate-y-8`
        case "left":
          return `${baseClasses} opacity-0 translate-x-8`
        case "right":
          return `${baseClasses} opacity-0 -translate-x-8`
        default:
          return `${baseClasses} opacity-0 translate-y-8`
      }
    }
    
    return `${baseClasses} opacity-100 translate-y-0 translate-x-0`
  }

  return (
    <div 
      ref={ref} 
      className={getTransformClasses()} 
      style={{ 
        animationDelay: `${delay}ms`,
        transitionDelay: `${delay}ms`
      }}
    >
      <Card className={className} onClick={onClick}>
        {children}
      </Card>
    </div>
  )
}
