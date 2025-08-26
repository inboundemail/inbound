"use client"

import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { usePathname } from 'next/navigation'
import { useSession } from "@/lib/auth/auth-client"
import InboundIcon from './icons/inbound'
import { useEffect, useState } from 'react'

export function SiteHeader() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')

  useEffect(() => {
    try {
      const saved = localStorage.getItem('theme')
      const initialTheme = saved === 'light' ? 'light' : 'dark'
      setTheme(initialTheme)
    } catch { }
  }, [])

  const toggleTheme = () => {
    try {
      const next = theme === 'light' ? 'dark' : 'light'
      setTheme(next)
      localStorage.setItem('theme', next)
      const d = document.documentElement
      if (next === 'light') d.classList.remove('dark')
      else d.classList.add('dark')
    } catch { }
  }

  const isActive = (href: string) => {
    if (href === '/pricing') {
      return pathname === '/pricing'
    }
    return false
  }

  return (
    <header className="border-b border-border bg-sidebar/90 backdrop-blur-sm sticky top-0 z-50 relative">
      <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-3">
          <InboundIcon width={20} height={20} />
          <span className="text-2xl font-semibold text-foreground -ml-2">inbound</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm">
          <a href="/#features" className="text-muted-foreground hover:text-foreground transition-colors">features</a>
          <a href="/#examples" className="text-muted-foreground hover:text-foreground transition-colors">examples</a>
          <Link
            href="/pricing"
            className={`transition-colors ${isActive('/pricing')
              ? 'text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            pricing
          </Link>
          <Link href="/docs" className="text-muted-foreground hover:text-foreground transition-colors">docs</Link>
        </nav>
        <div className="flex items-center gap-2">
          {session?.user ? (
            <Button variant="primary" asChild>
              <Link href="/logs">hey {session.user.name.toLowerCase().split(' ')[0]} 👋</Link>
            </Button>
          ) : (
            <Button variant="primary" asChild>
              <Link href="/login">get started</Link>
            </Button>
          )}
          <Button
            variant="secondary"
            size="icon"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <title>dark-light</title>
              <g fill="currentColor">
                <path d="M9 16.25C13.0041 16.25 16.25 13.0041 16.25 9C16.25 4.99594 13.0041 1.75 9 1.75C4.99594 1.75 1.75 4.99594 1.75 9C1.75 13.0041 4.99594 16.25 9 16.25Z" fill="currentColor" fill-opacity="0.3" data-stroke="none" stroke="none"></path>
                <path d="M9 6V12C10.657 12 12 10.657 12 9C12 7.343 10.657 6 9 6Z" fill="currentColor" data-stroke="none" stroke="none"></path>
                <path d="M9 12C7.343 12 6 10.657 6 9C6 7.343 7.343 6 9 6V1.75C4.996 1.75 1.75 4.996 1.75 9C1.75 13.004 4.996 16.25 9 16.25V12Z" fill="currentColor" data-stroke="none" stroke="none"></path>
                <path d="M9 16.25C13.0041 16.25 16.25 13.0041 16.25 9C16.25 4.99594 13.0041 1.75 9 1.75C4.99594 1.75 1.75 4.99594 1.75 9C1.75 13.0041 4.99594 16.25 9 16.25Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"></path>
              </g>
            </svg>
          </Button>
        </div>
      </div>
    </header>
  )
}