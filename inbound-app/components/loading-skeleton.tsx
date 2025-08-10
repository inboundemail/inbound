"use client"

import { motion } from "framer-motion"

interface LoadingSkeletonProps {
  type?: "page" | "list" | "card" | "form"
  className?: string
}

export function LoadingSkeleton({ type = "page", className = "" }: LoadingSkeletonProps) {
  const pulseVariants = {
    initial: { opacity: 0.5 },
    animate: { opacity: 1 },
  }

  const containerVariants = {
    initial: { opacity: 0, y: 20 },
    animate: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: 0.3,
        staggerChildren: 0.1
      }
    }
  }

  if (type === "list") {
    return (
      <motion.div 
        variants={containerVariants}
        initial="initial"
        animate="animate"
        className={`space-y-4 ${className}`}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <motion.div
            key={i}
            variants={pulseVariants}
            className="flex items-center space-x-4 p-4 border rounded-lg"
          >
            <div className="animate-pulse bg-muted rounded-full h-10 w-10" />
            <div className="flex-1 space-y-2">
              <div className="animate-pulse bg-muted h-4 rounded w-3/4" />
              <div className="animate-pulse bg-muted h-3 rounded w-1/2" />
            </div>
            <div className="animate-pulse bg-muted h-8 w-20 rounded" />
          </motion.div>
        ))}
      </motion.div>
    )
  }

  if (type === "card") {
    return (
      <motion.div 
        variants={containerVariants}
        initial="initial"
        animate="animate"
        className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 ${className}`}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <motion.div
            key={i}
            variants={pulseVariants}
            className="border rounded-lg p-6 space-y-4"
          >
            <div className="animate-pulse bg-muted h-6 rounded w-3/4" />
            <div className="space-y-2">
              <div className="animate-pulse bg-muted h-4 rounded" />
              <div className="animate-pulse bg-muted h-4 rounded w-5/6" />
              <div className="animate-pulse bg-muted h-4 rounded w-2/3" />
            </div>
            <div className="flex space-x-2">
              <div className="animate-pulse bg-muted h-8 w-20 rounded" />
              <div className="animate-pulse bg-muted h-8 w-16 rounded" />
            </div>
          </motion.div>
        ))}
      </motion.div>
    )
  }

  if (type === "form") {
    return (
      <motion.div 
        variants={containerVariants}
        initial="initial"
        animate="animate"
        className={`max-w-md mx-auto space-y-6 ${className}`}
      >
        <motion.div variants={pulseVariants} className="space-y-2">
          <div className="animate-pulse bg-muted h-4 rounded w-1/4" />
          <div className="animate-pulse bg-muted h-10 rounded" />
        </motion.div>
        <motion.div variants={pulseVariants} className="space-y-2">
          <div className="animate-pulse bg-muted h-4 rounded w-1/3" />
          <div className="animate-pulse bg-muted h-10 rounded" />
        </motion.div>
        <motion.div variants={pulseVariants} className="space-y-2">
          <div className="animate-pulse bg-muted h-4 rounded w-1/2" />
          <div className="animate-pulse bg-muted h-24 rounded" />
        </motion.div>
        <motion.div variants={pulseVariants} className="flex space-x-4">
          <div className="animate-pulse bg-muted h-10 rounded flex-1" />
          <div className="animate-pulse bg-primary/20 h-10 w-24 rounded" />
        </motion.div>
      </motion.div>
    )
  }

  // Default page skeleton
  return (
    <motion.div 
      variants={containerVariants}
      initial="initial"
      animate="animate"
      className={`space-y-8 ${className}`}
    >
      {/* Header */}
      <motion.div variants={pulseVariants} className="space-y-4">
        <div className="animate-pulse bg-muted h-8 rounded w-1/3" />
        <div className="animate-pulse bg-muted h-4 rounded w-2/3" />
      </motion.div>

      {/* Stats/Cards */}
      <motion.div variants={pulseVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border rounded-lg p-6 space-y-3">
            <div className="animate-pulse bg-muted h-6 rounded w-1/2" />
            <div className="animate-pulse bg-muted h-8 rounded w-3/4" />
            <div className="animate-pulse bg-muted h-4 rounded w-1/3" />
          </div>
        ))}
      </motion.div>

      {/* Main content */}
      <motion.div variants={pulseVariants} className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="animate-pulse bg-muted h-6 rounded w-1/4" />
          <div className="animate-pulse bg-muted h-10 w-32 rounded" />
        </div>
        
        <div className="border rounded-lg">
          <div className="p-4 border-b">
            <div className="animate-pulse bg-muted h-5 rounded w-1/3" />
          </div>
          <div className="p-4 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center space-x-4">
                <div className="animate-pulse bg-muted rounded h-8 w-8" />
                <div className="flex-1 space-y-2">
                  <div className="animate-pulse bg-muted h-4 rounded w-3/4" />
                  <div className="animate-pulse bg-muted h-3 rounded w-1/2" />
                </div>
                <div className="animate-pulse bg-muted h-6 w-16 rounded" />
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
