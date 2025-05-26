import { Button } from "@/components/ui/button"
import InboundIcon from "@/components/InboundIcon"
import { FaArrowRight, FaCheck, FaRocket, FaLock, FaUsers } from "react-icons/fa"

export default function HomePage() {
  return (
    <div className="relative min-h-screen">
      {/* Background with subtle pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900"></div>
      
      {/* Main content */}
      <div className="relative z-10">
        {/* Header */}
        <header className="px-6 py-4 md:px-10">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-2">
              <InboundIcon className="w-8 h-8" variant="black" />
              <span className="text-3xl font-bold -ml-1">inbound</span>
            </div>
            <nav className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-600 hover:text-gray-900 transition-colors">Features</a>
              <a href="#pricing" className="text-gray-600 hover:text-gray-900 transition-colors">Pricing</a>
              <a href="#about" className="text-gray-600 hover:text-gray-900 transition-colors">About</a>
              <Button variant="secondary" asChild>
                <a href="/login">Sign In</a>
              </Button>
            </nav>
          </div>
        </header>

        {/* Hero Section */}
        <section className="px-6 py-20 md:px-10 md:py-32">
          <div className="max-w-7xl mx-auto text-center">
            <div className="max-w-4xl mx-auto">
              <h1 className="text-5xl md:text-7xl font-bold text-gray-900 mb-6">
                Streamline Your
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-blue-600"> Inbound </span>
                Operations
              </h1>
              <p className="text-xl md:text-2xl text-gray-600 mb-8 leading-relaxed">
                Transform your business with our powerful SaaS platform. Automate workflows, 
                manage customers, and scale your operations with ease.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8 py-4 text-lg">
                  Get Started Free
                  <span className="ml-2"><FaArrowRight /></span>
                </Button>
                <Button variant="secondary" size="lg" className="px-8 py-4 text-lg">
                  Watch Demo
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="px-6 py-20 md:px-10 bg-white/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
                Why Choose Inbound?
              </h2>
              <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                Everything you need to manage and grow your business in one powerful platform
              </p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center p-8 rounded-2xl bg-white/80 backdrop-blur-sm shadow-lg hover:shadow-xl transition-shadow">
                <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-white text-2xl"><FaRocket /></span>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Lightning Fast</h3>
                <p className="text-gray-600 leading-relaxed">
                  Built for speed and performance. Get things done faster with our optimized platform.
                </p>
              </div>
              
              <div className="text-center p-8 rounded-2xl bg-white/80 backdrop-blur-sm shadow-lg hover:shadow-xl transition-shadow">
                <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-white text-2xl"><FaLock /></span>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Secure & Reliable</h3>
                <p className="text-gray-600 leading-relaxed">
                  Enterprise-grade security with 99.9% uptime. Your data is safe and always accessible.
                </p>
              </div>
              
              <div className="text-center p-8 rounded-2xl bg-white/80 backdrop-blur-sm shadow-lg hover:shadow-xl transition-shadow">
                <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <span className="text-white text-2xl"><FaUsers /></span>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Team Collaboration</h3>
                <p className="text-gray-600 leading-relaxed">
                  Work together seamlessly with powerful collaboration tools and real-time updates.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="px-6 py-20 md:px-10">
          <div className="max-w-4xl mx-auto text-center">
            <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-3xl p-12 md:p-16 text-white">
              <h2 className="text-4xl md:text-5xl font-bold mb-6">
                Ready to Get Started?
              </h2>
              <p className="text-xl mb-8 opacity-90">
                Join thousands of businesses already using Inbound to streamline their operations.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" variant="secondary" className="bg-white text-purple-600 hover:bg-gray-100 px-8 py-4 text-lg font-semibold">
                  Start Free Trial
                </Button>
                <Button size="lg" variant="ghost" className="border border-white text-white hover:bg-white/10 px-8 py-4 text-lg">
                  Contact Sales
                </Button>
              </div>
              <div className="flex items-center justify-center gap-6 mt-8 text-sm opacity-80">
                <div className="flex items-center gap-2">
                  <span className="text-green-300"><FaCheck /></span>
                  <span>No credit card required</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-300"><FaCheck /></span>
                  <span>14-day free trial</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-green-300"><FaCheck /></span>
                  <span>Cancel anytime</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="px-6 py-12 md:px-10 bg-gray-900 text-white">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row items-center justify-between">
              <div className="flex items-center gap-2 mb-4 md:mb-0">
                <InboundIcon className="w-6 h-6" variant="white" />
                <span className="text-2xl font-bold -ml-1">inbound</span>
              </div>
              <div className="flex items-center gap-8 text-sm text-gray-400">
                <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
                <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
                <a href="#" className="hover:text-white transition-colors">Support</a>
              </div>
            </div>
            <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400 text-sm">
              © 2024 Inbound. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
