"use client"

import { useIntersectionObserver } from "@/hooks/useIntersectionObserver"
import type { ReactNode } from "react"

interface AnimatedSectionProps {
  children: ReactNode
  className?: string
  delay?: number
  direction?: "up" | "down" | "left" | "right"
}

export function AnimatedSection({ children, className = "", delay = 0, direction = "up" }: AnimatedSectionProps) {
  const { ref, hasIntersected } = useIntersectionObserver()

  const getAnimationClass = () => {
    if (!hasIntersected) return "opacity-0"

    const baseClass = "animate-"
    switch (direction) {
      case "up":
        return `${baseClass}slideInUp`
      case "down":
        return `${baseClass}slideInDown`
      case "left":
        return `${baseClass}slideInLeft`
      case "right":
        return `${baseClass}slideInRight`
      default:
        return `${baseClass}slideInUp`
    }
  }

  return (
    <div ref={ref} className={`${className} ${getAnimationClass()}`} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  )
}
