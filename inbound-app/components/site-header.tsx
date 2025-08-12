"use client"

import Link from 'next/link'
import Image from 'next/image'
import { Button } from "@/components/ui/button"
import { usePathname } from 'next/navigation'

export function SiteHeader() {
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/pricing') {
      return pathname === '/pricing'
    }
    return false
  }

  return (
    <header className="border-b border-[var(--border-primary)] bg-[#1B1C1D]/90 backdrop-blur-sm sticky top-0 z-50 relative">
      <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/inbound-logo-3.png" alt="inbound" width={32} height={32} />
          <span className="text-2xl font-semibold text-[var(--text-primary)] -ml-2">inbound</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm">
          <a href="/#features" className="text-[var(--text-secondary)] hover:text-[var(--purple-primary)] transition-colors">features</a>
          <a href="/#examples" className="text-[var(--text-secondary)] hover:text-[var(--purple-primary)] transition-colors">examples</a>
          <Link 
            href="/pricing" 
            className={`transition-colors ${
              isActive('/pricing') 
                ? 'text-[var(--purple-primary)] font-medium' 
                : 'text-[var(--text-secondary)] hover:text-[var(--purple-primary)]'
            }`}
          >
            pricing
          </Link>
          <Link href="/docs" className="text-[var(--text-secondary)] hover:text-[var(--purple-primary)] transition-colors">docs</Link>
        </nav>
        <Button
          className="bg-[var(--purple-primary)] hover:bg-[var(--purple-dark)] text-white border-0 font-medium"
          asChild
        >
          <Link href="/login">get started</Link>
        </Button>
      </div>
    </header>
  )
}