"use client"

import * as React from "react"
import NextLink from "next/link"
import { useRouter } from "next/navigation"

/**
 * OptimizedLink component that provides faster navigation
 * by skipping view transitions for internal navigation
 */
export function OptimizedLink({
  href,
  prefetch = true,
  children,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof NextLink>) {
  return (
    <NextLink
      href={href}
      prefetch={prefetch}
      className={className}
      {...props}
    >
      {children}
    </NextLink>
  )
}