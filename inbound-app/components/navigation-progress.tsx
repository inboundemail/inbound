"use client"

import { useEffect, useState, useRef } from "react"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"

interface NavigationProgressProps {
  className?: string
  color?: string
}

export function NavigationProgress({ 
  className = "", 
  color = "bg-gradient-to-r from-blue-500 to-purple-600" 
}: NavigationProgressProps) {
  const pathname = usePathname()
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [prevPathname, setPrevPathname] = useState(pathname)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const completeTimerRef = useRef<NodeJS.Timeout | null>(null)
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null)

  const clearAllTimers = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
    if (completeTimerRef.current) {
      clearTimeout(completeTimerRef.current)
      completeTimerRef.current = null
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }

  useEffect(() => {
    if (pathname !== prevPathname) {
      // Clear any existing timers
      clearAllTimers()
      
      setIsLoading(true)
      setProgress(0)
      setPrevPathname(pathname)
      
      // Simulate progress
      progressIntervalRef.current = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            if (progressIntervalRef.current) {
              clearInterval(progressIntervalRef.current)
              progressIntervalRef.current = null
            }
            return 90
          }
          return prev + Math.random() * 15
        })
      }, 50)

      // Complete progress and hide
      completeTimerRef.current = setTimeout(() => {
        setProgress(100)
        hideTimerRef.current = setTimeout(() => {
          setIsLoading(false)
          setProgress(0)
        }, 150) // Shorter hide delay
      }, 250) // Shorter completion time
    }

    return clearAllTimers
  }, [pathname, prevPathname])

  // Cleanup on unmount
  useEffect(() => {
    return clearAllTimers
  }, [])

  return (
    <AnimatePresence mode="wait">
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
          className={`fixed top-0 left-0 right-0 z-50 ${className}`}
        >
          <motion.div
            initial={{ width: "0%" }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.1, ease: "easeOut" }}
            className={`h-1 ${color} transition-all duration-300`}
          />
          
          {/* Glowing effect */}
          <motion.div
            initial={{ width: "0%" }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.1, ease: "easeOut" }}
            className={`h-1 ${color} opacity-50 blur-sm`}
            style={{ marginTop: "-4px" }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Alternative minimal version with better state management
export function MinimalProgress() {
  const pathname = usePathname()
  const [isLoading, setIsLoading] = useState(false)
  const [prevPathname, setPrevPathname] = useState(pathname)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (pathname !== prevPathname) {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      setIsLoading(true)
      setPrevPathname(pathname)
      
      // Use requestAnimationFrame for better timing
      requestAnimationFrame(() => {
        timeoutRef.current = setTimeout(() => {
          setIsLoading(false)
        }, 250)
      })
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [pathname, prevPathname])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <AnimatePresence mode="wait">
      {isLoading && (
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          exit={{ scaleX: 1, opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-600 z-50 origin-left"
        />
      )}
    </AnimatePresence>
  )
}
