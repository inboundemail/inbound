import { GalleryVerticalEnd } from "lucide-react"

import { LoginForm } from "@/components/login-form"
import { Button } from "@/components/ui/button"
import InboundIcon from "@/components/InboundIcon"

export default function LoginPage() {
  return (
    <div className="relative min-h-svh">
      {/* Background image - full screen */}
      <div className="absolute inset-0 hidden lg:block">
        <img
          src="/login.png"
          alt="Image"
          className="h-full w-full object-cover blur-sm scale-110 dark:brightness-[0.2] dark:grayscale"
        />
      </div>
      
      {/* Login form overlay */}
      <div className="relative z-10 grid min-h-svh lg:grid-cols-2 py-2">
        <div className="flex flex-col gap-4 p-6 md:p-10 lg:rounded-r-3xl lg:bg-white/95 lg:backdrop-blur-sm">
          <div className="flex justify-center gap-2 md:justify-start">
            <a href="#" className="flex items-center gap-2">
              <InboundIcon className="w-7 h-7" variant="black" />
              <span className="text-3xl font-bold -ml-1">inbound</span>
            </a>
          </div>
          <div className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-xs">
              <LoginForm />
            </div>
          </div>
        </div>
        <div className="hidden lg:block"></div>
      </div>
    </div>
  )
}
