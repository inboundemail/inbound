"use client"

import React, { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { HiMail, HiLightningBolt, HiSparkles, HiArrowRight, HiChevronDown } from "react-icons/hi"

export function ServicesDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:bg-gray-100 focus:text-gray-900 focus:outline-none"
      >
        Products
        <HiChevronDown
          className={`h-4 w-4 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[500px] rounded-lg border border-gray-200 bg-white p-6 shadow-lg">
          <div className="mb-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-1">
              Email Infrastructure
            </h4>
            <p className="text-xs text-gray-600">
              Complete email processing solutions for developers
            </p>
          </div>
          
          <div className="grid gap-2">
            <Link
              href="/"
              onClick={() => setIsOpen(false)}
              className="group block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-gray-50 hover:text-gray-900 focus:bg-gray-50 focus:text-gray-900"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                  <HiSparkles className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <div className="text-sm font-medium leading-none text-gray-900">
                    AI Email Infrastructure
                  </div>
                  <p className="text-xs leading-snug text-gray-600 mt-1">
                    Complete email infrastructure for AI agents and developers
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href="/email-as-webhook"
              onClick={() => setIsOpen(false)}
              className="group block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-gray-50 hover:text-gray-900 focus:bg-gray-50 focus:text-gray-900"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <HiLightningBolt className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm font-medium leading-none text-gray-900">
                    Email to Webhook
                  </div>
                  <p className="text-xs leading-snug text-gray-600 mt-1">
                    Turn any email address into a powerful webhook endpoint
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href="/improvmx-alternative"
              onClick={() => setIsOpen(false)}
              className="group block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-gray-50 hover:text-gray-900 focus:bg-gray-50 focus:text-gray-900"
            >
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <HiMail className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <div className="text-sm font-medium leading-none text-gray-900">
                    ImprovMX Alternative
                  </div>
                  <p className="text-xs leading-snug text-gray-600 mt-1">
                    Free email aliases with unlimited forwarding and advanced features
                  </p>
                </div>
              </div>
            </Link>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-200">
            <Link
              href="/docs"
              onClick={() => setIsOpen(false)}
              className="group flex items-center justify-between text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              View all documentation
              <HiArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}