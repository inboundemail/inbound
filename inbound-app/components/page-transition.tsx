"use client"

import { motion, AnimatePresence } from "framer-motion"
import { usePathname } from "next/navigation"
import { ReactNode, useEffect, useState, useMemo } from "react"

interface PageTransitionProps {
  children: ReactNode
  className?: string
}

// Check if View Transitions API is supported
const supportsViewTransitions = () => {
  return typeof window !== "undefined" && "startViewTransition" in document
}

const pageVariants = {
  initial: {
    opacity: 0,
    x: 20,
    scale: 0.98,
  },
  in: {
    opacity: 1,
    x: 0,
    scale: 1,
  },
  out: {
    opacity: 0,
    x: -20,
    scale: 0.98,
  },
}

const pageTransition = {
  type: "tween",
  ease: "easeInOut",
  duration: 0.08, // Significantly faster transition for better performance
}

export function PageTransition({ children, className = "" }: PageTransitionProps) {
  const pathname = usePathname()
  const [isSupported, setIsSupported] = useState(false)

  useEffect(() => {
    setIsSupported(supportsViewTransitions())
  }, [])

  // If View Transitions API is supported, let it handle the transitions
  if (isSupported) {
    return (
      <div className={`page-transition-container ${className}`}>
        {children}
      </div>
    )
  }

  // Fallback to Framer Motion for browsers without View Transitions support
  return (
    <AnimatePresence mode="sync" initial={false}>
      <motion.div
        key={pathname}
        initial="initial"
        animate="in"
        exit="out"
        variants={pageVariants}
        transition={pageTransition}
        className={`page-transition-container ${className}`}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

// Enhanced page transition with custom animations
export function EnhancedPageTransition({
  children,
  className = "",
  direction = "horizontal"
}: PageTransitionProps & { direction?: "horizontal" | "vertical" | "fade" }) {
  const pathname = usePathname()
  const [isSupported, setIsSupported] = useState(false)

  // Memoize the variants to prevent recalculation on each render
  const variants = useMemo(() => {
    switch (direction) {
      case "vertical":
        return {
          initial: { opacity: 0, y: 10 }, // Reduced distance for faster transition
          in: { opacity: 1, y: 0 },
          out: { opacity: 0, y: -10 }, // Reduced distance for faster transition
        }
      case "fade":
        return {
          initial: { opacity: 0 },
          in: { opacity: 1 },
          out: { opacity: 0 },
        }
      default: // horizontal
        return {
          initial: { opacity: 0, x: 10 }, // Reduced distance for faster transition
          in: { opacity: 1, x: 0 },
          out: { opacity: 0, x: -10 }, // Reduced distance for faster transition
        }
    }
  }, [direction]);

  useEffect(() => {
    setIsSupported(supportsViewTransitions())
  }, [])

  if (isSupported) {
    return (
      <div className={`enhanced-page-transition ${className}`} style={{
        viewTransitionName: "page-content"
      }}>
        {children}
      </div>
    )
  }

  return (
    <AnimatePresence mode="sync" initial={false}>
      <motion.div
        key={pathname}
        initial="initial"
        animate="in"
        exit="out"
        variants={variants}
        transition={pageTransition}
        className={`enhanced-page-transition ${className}`}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}