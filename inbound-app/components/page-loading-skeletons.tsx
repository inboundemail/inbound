"use client"

import { motion } from "framer-motion"

interface PageLoadingSkeletonProps {
  className?: string
}

export function PageLoadingSkeleton({ className = "" }: PageLoadingSkeletonProps) {
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

  const itemVariants = {
    initial: { opacity: 0.5 },
    animate: { opacity: 1 }
  }

  return (
    <motion.div 
      variants={containerVariants}
      initial="initial"
      animate="animate"
      className={`space-y-6 ${className}`}
    >
      {/* Page Header */}
      <motion.div variants={itemVariants} className="space-y-3">
        <div className="animate-pulse bg-muted h-8 rounded w-1/3" />
        <div className="animate-pulse bg-muted h-4 rounded w-2/3" />
      </motion.div>

      {/* Stats Cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border rounded-lg p-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="animate-pulse bg-muted h-5 rounded w-24" />
              <div className="animate-pulse bg-muted h-5 w-5 rounded" />
            </div>
            <div className="animate-pulse bg-muted h-8 rounded w-16" />
            <div className="animate-pulse bg-muted h-3 rounded w-20" />
          </div>
        ))}
      </motion.div>

      {/* Filter Bar */}
      <motion.div variants={itemVariants} className="flex gap-4 items-center">
        <div className="animate-pulse bg-muted h-10 rounded flex-1 max-w-sm" />
        <div className="animate-pulse bg-muted h-10 w-32 rounded" />
        <div className="animate-pulse bg-muted h-10 w-24 rounded" />
      </motion.div>

      {/* Data Table/List */}
      <motion.div variants={itemVariants} className="border rounded-lg">
        {/* Table Header */}
        <div className="border-b p-4">
          <div className="grid grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="animate-pulse bg-muted h-4 rounded w-full" />
            ))}
          </div>
        </div>
        
        {/* Table Rows */}
        <div className="divide-y">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="p-4">
              <div className="grid grid-cols-5 gap-4 items-center">
                <div className="flex items-center space-x-3">
                  <div className="animate-pulse bg-muted h-8 w-8 rounded-full" />
                  <div className="space-y-1">
                    <div className="animate-pulse bg-muted h-4 rounded w-24" />
                    <div className="animate-pulse bg-muted h-3 rounded w-16" />
                  </div>
                </div>
                <div className="animate-pulse bg-muted h-4 rounded w-20" />
                <div className="animate-pulse bg-muted h-6 w-16 rounded-full" />
                <div className="animate-pulse bg-muted h-4 rounded w-24" />
                <div className="animate-pulse bg-muted h-8 w-8 rounded" />
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}

export function EmailLoadingSkeleton({ className = "" }: PageLoadingSkeletonProps) {
  const containerVariants = {
    initial: { opacity: 0 },
    animate: { 
      opacity: 1,
      transition: {
        duration: 0.3,
        staggerChildren: 0.05
      }
    }
  }

  const itemVariants = {
    initial: { opacity: 0.5, y: 10 },
    animate: { opacity: 1, y: 0 }
  }

  return (
    <motion.div 
      variants={containerVariants}
      initial="initial"
      animate="animate"
      className={`space-y-3 ${className}`}
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <motion.div
          key={i}
          variants={itemVariants}
          className="border rounded-lg p-4 hover:bg-muted/5 transition-colors"
        >
          <div className="flex items-start space-x-4">
            {/* Type Icon */}
            <div className="animate-pulse bg-muted h-5 w-5 rounded mt-1" />
            
            {/* Email Content */}
            <div className="flex-1 space-y-2">
              <div className="flex items-center space-x-2">
                <div className="animate-pulse bg-muted h-4 rounded w-48" />
                <div className="animate-pulse bg-muted h-4 w-4 rounded-full" />
                <div className="animate-pulse bg-muted h-5 w-16 rounded-full" />
              </div>
              
              <div className="flex items-center space-x-4 text-sm">
                <div className="animate-pulse bg-muted h-3 rounded w-32" />
                <div className="animate-pulse bg-muted h-3 rounded w-24" />
                <div className="animate-pulse bg-muted h-3 rounded w-20" />
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex space-x-2">
              <div className="animate-pulse bg-muted h-8 w-8 rounded" />
              <div className="animate-pulse bg-muted h-8 w-8 rounded" />
            </div>
          </div>
        </motion.div>
      ))}
    </motion.div>
  )
}

export function AnalyticsLoadingSkeleton({ className = "" }: PageLoadingSkeletonProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`space-y-6 ${className}`}
    >
      {/* Header */}
      <div className="space-y-2">
        <div className="animate-pulse bg-muted h-8 rounded w-1/4" />
        <div className="animate-pulse bg-muted h-4 rounded w-1/2" />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="animate-pulse bg-muted h-4 rounded w-20" />
              <div className="animate-pulse bg-muted h-4 w-4 rounded" />
            </div>
            <div className="animate-pulse bg-muted h-10 rounded w-24" />
            <div className="animate-pulse bg-muted h-3 rounded w-16" />
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border rounded-lg p-6 space-y-4">
          <div className="animate-pulse bg-muted h-6 rounded w-32" />
          <div className="animate-pulse bg-muted h-64 rounded" />
        </div>
        <div className="border rounded-lg p-6 space-y-4">
          <div className="animate-pulse bg-muted h-6 rounded w-28" />
          <div className="animate-pulse bg-muted h-64 rounded" />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="border rounded-lg p-6 space-y-4">
        <div className="animate-pulse bg-muted h-6 rounded w-36" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center space-x-3">
              <div className="animate-pulse bg-muted h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-1">
                <div className="animate-pulse bg-muted h-4 rounded w-3/4" />
                <div className="animate-pulse bg-muted h-3 rounded w-1/2" />
              </div>
              <div className="animate-pulse bg-muted h-4 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
