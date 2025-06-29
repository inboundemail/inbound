import React from "react"
import Link from "next/link"
import { HiMail, HiLightningBolt, HiGlobeAlt, HiSparkles, HiArrowRight } from "react-icons/hi"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu"

export function ServicesDropdown() {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger className="text-gray-700 hover:text-gray-900">
            Products
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <div className="grid gap-3 p-6 w-[500px] grid-cols-1">
              <div className="row-span-3">
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
                        <p className="line-clamp-2 text-xs leading-snug text-gray-600 mt-1">
                          Complete email infrastructure for AI agents and developers
                        </p>
                      </div>
                    </div>
                  </Link>

                  <Link
                    href="/email-as-webhook"
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
                        <p className="line-clamp-2 text-xs leading-snug text-gray-600 mt-1">
                          Turn any email address into a powerful webhook endpoint
                        </p>
                      </div>
                    </div>
                  </Link>

                  <Link
                    href="/improvmx-alternative"
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
                        <p className="line-clamp-2 text-xs leading-snug text-gray-600 mt-1">
                          Free email aliases with unlimited forwarding and advanced features
                        </p>
                      </div>
                    </div>
                  </Link>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200">
                  <Link
                    href="/docs"
                    className="group flex items-center justify-between text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    View all documentation
                    <HiArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </div>
              </div>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  )
}