"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth/auth-client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import Menu from "@/components/icons/menu";
import CircleXmark from "@/components/icons/circle-xmark";

function InboundIconWhite({ width = 24, height = 24, className }: { width?: number | string, height?: number | string, className?: string }) {
  return (
    <svg 
      width={width} 
      height={height} 
      viewBox="0 0 134 134" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path 
        opacity="0.5" 
        d="M-0.00012207 90.9294L43.0708 134L55.4166 68.1611C55.7301 66.489 55.1983 64.7698 53.9953 63.5669L19.7547 29.3272C16.8241 26.3967 11.8086 27.9483 11.0449 32.0218L-0.00012207 90.9294Z" 
        fill="currentColor"
      />
      <path 
        d="M43.0719 134L0.00101471 90.9288L65.8392 78.5842C67.5113 78.2706 69.2303 78.8025 70.4333 80.0054L104.674 114.245C107.604 117.175 106.053 122.191 101.979 122.955L43.0719 134Z" 
        fill="currentColor"
      />
      <path 
        opacity="0.5" 
        d="M90.9289 0L134.001 43.0721L68.1617 55.4168C66.4896 55.7303 64.7705 55.1984 63.5676 53.9955L29.328 19.7559C26.3974 16.8253 27.9489 11.8098 32.0224 11.046L90.9289 0Z" 
        fill="currentColor"
      />
      <path 
        d="M78.5863 65.8407C78.2728 67.5128 78.8046 69.2319 80.0076 70.4348L114.247 104.674C117.178 107.605 122.193 106.053 122.957 101.98L134.002 43.0723L90.931 0.00140381L78.5863 65.8407Z" 
        fill="currentColor"
      />
    </svg>
  )
}

export function LandingHeader() {
  const { data: session } = useSession();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <header className={`fixed top-0 left-0 right-0 z-[100] transition-all duration-300 ${
        isScrolled ? "bg-[#0f0a1f]/80 backdrop-blur-md border-b border-white/10 py-4" : "bg-transparent py-6"
      }`}>
        <div className="max-w-7xl mx-auto px-4 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2 text-white hover:opacity-90 transition-opacity">
            <InboundIconWhite width={32} height={32} className="text-[#7c3aed]" />
            <span className="text-2xl font-outfit font-semibold tracking-tight">
              inbound
            </span>
          </Link>

          <div className="flex items-center">
            <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-white/70">
              {["Features", "Examples", "Pricing", "Docs", "Blog"].map(
                (item) => (
                  <Link
                    key={item}
                    href={`/${item.toLowerCase()}`}
                    className="hover:text-white transition-colors"
                  >
                    {item}
                  </Link>
                )
              )}
              
              <div className="flex items-center gap-4 ml-4">
                 {session?.user ? (
                    <Button className="rounded-full bg-[#7c3aed] hover:bg-[#6d28d9] text-white border-0 h-9 px-4" asChild>
                      <Link href="/logs">
                        Dashboard
                      </Link>
                    </Button>
                  ) : (
                    <>
                        <Link href="/login" className="text-white hover:text-white/80 transition-colors">
                            Sign in
                        </Link>
                        <Button className="rounded-full bg-[#7c3aed] hover:bg-[#6d28d9] text-white border-0 h-9 px-4" asChild>
                        <Link href="/login">
                            Register
                        </Link>
                        </Button>
                    </>
                  )}
              </div>
            </nav>

            <button
              className="md:hidden text-white p-2"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu width={24} height={24} />
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-[101] md:hidden">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ ease: "easeOut", duration: 0.3 }}
              className="absolute right-0 top-0 h-full w-80 bg-[#0f0a1f] border-l border-white/10 shadow-2xl p-6"
            >
              <div className="flex justify-between items-center mb-8">
                <Link href="/" className="flex items-center gap-2 text-white">
                    <InboundIconWhite width={32} height={32} className="text-[#7c3aed]" />
                    <span className="text-xl font-bold">inbound</span>
                </Link>
                <button onClick={() => setIsMobileMenuOpen(false)} className="text-white/70 hover:text-white">
                  <CircleXmark width={24} height={24} />
                </button>
              </div>
              
              <div className="flex flex-col gap-6">
                {["Features", "Examples", "Pricing", "Docs", "Blog"].map((item) => (
                  <Link
                    key={item}
                    href={`/${item.toLowerCase()}`}
                    className="text-lg text-white/80 hover:text-white font-medium"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {item}
                  </Link>
                ))}
                
                <div className="h-px bg-white/10 my-2" />
                
                {session?.user ? (
                    <Button className="w-full rounded-full bg-[#7c3aed] hover:bg-[#6d28d9]" asChild>
                        <Link href="/logs">Dashboard</Link>
                    </Button>
                ) : (
                    <div className="flex flex-col gap-4">
                        <Link href="/login" className="text-lg text-white/80 hover:text-white font-medium">
                            Sign in
                        </Link>
                        <Button className="w-full rounded-full bg-[#7c3aed] hover:bg-[#6d28d9]" asChild>
                            <Link href="/login">Register</Link>
                        </Button>
                    </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
