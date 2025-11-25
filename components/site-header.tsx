"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth/auth-client";
import InboundIcon from "./icons/inbound";
import Menu from "./icons/menu";
import CircleXmark from "./icons/circle-xmark";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { FeedbackButton } from "./feedback-button";

export function SiteHeader() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuToggleRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    // Enforce light mode only
    try { localStorage.setItem("theme", "light"); } catch {}
    setTheme("light");
    document.documentElement.classList.remove("dark");
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMobileMenuOpen]);

  // Focus management for mobile menu
  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMobileMenu();
        return;
      }

      if (event.key === "Tab") {
        const focusableElements = mobileMenuRef.current?.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) as NodeListOf<HTMLElement>;

        if (!focusableElements || focusableElements.length === 0) return;

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (event.shiftKey) {
          // Shift + Tab
          if (document.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab
          if (document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    // Focus the close button when menu opens
    const closeButton = mobileMenuRef.current?.querySelector(
      '[aria-label="Close menu"]'
    ) as HTMLElement;
    if (closeButton) {
      closeButton.focus();
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileMenuOpen]);

  const toggleTheme = () => {
    // Disabled: light-only mode
    return;
  };

  const toggleMobileMenu = () => {
    if (isMobileMenuOpen) {
      // Close menu and restore focus
      setIsMobileMenuOpen(false);
      if (previousActiveElementRef.current) {
        previousActiveElementRef.current.focus();
      }
    } else {
      // Open menu and store current focus
      previousActiveElementRef.current = document.activeElement as HTMLElement;
      setIsMobileMenuOpen(true);
    }
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
    if (previousActiveElementRef.current) {
      previousActiveElementRef.current.focus();
    }
  };

  const isActive = (href: string) => {
    // Normalize href to ensure it starts with "/"
    const normalizedHref = href.startsWith("/") ? href : `/${href}`;

    // Handle anchor links (e.g., "/#features")
    if (normalizedHref.includes("#")) {
      const [path, hash] = normalizedHref.split("#");
      const currentHash =
        typeof window !== "undefined" ? window.location.hash : "";
      return pathname === path && currentHash === `#${hash}`;
    }

    // Handle regular paths
    return (
      pathname === normalizedHref ||
      (normalizedHref === "/blog" && pathname.startsWith("/blog"))
    );
  };

  return (
    <>
      <header className="border-b border-border bg-background/90 backdrop-blur-sm sticky top-0 z-[100]">
        <div className="max-w-7xl mx-auto px-4 py-6 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <InboundIcon width={32} height={32} />
            <span className="text-2xl font-outfit font-semibold tracking-tight">
              inbound
            </span>
          </Link>

          <div className="flex items-center">
            <nav className="hidden md:flex items-center gap-6 text-sm tracking-normal">
              {["/features", "/examples", "/pricing", "/docs", "/blog"].map(
                (href) => (
                  <Link
                    key={href}
                    href={href}
                    className={`opacity-70 hover:opacity-100 ${
                      isActive(href) ? "opacity-100 font-medium" : ""
                    }`}
                  >
                    {href
                      .replace("/", "")

                      .replace("#", "")
                      .replace(/^\w/, (c) => c.toUpperCase())}
                  </Link>
                )
              )}
              <FeedbackButton />
              {session?.user ? (
                <Button variant="primary" asChild>
                  <Link href="/logs">
                    hey {session.user.name.toLowerCase().split(" ")[0]} 👋
                  </Link>
                </Button>
              ) : (
                <Button variant="primary" asChild>
                  <Link href="/login">Get Started</Link>
                </Button>
              )}
              {/* <Button
                variant="secondary"
                size="icon"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 18 18"
                  aria-hidden="true"
                >
                  <g fill="currentColor">
                    <circle cx="9" cy="9" r="7.25" opacity="0.3" />
                    <path d="M9 6v6c1.66 0 3-1.34 3-3s-1.34-3-3-3Z" />
                    <path d="M9 12c-1.66 0-3-1.34-3-3s1.34-3 3-3V1.75A7.25 7.25 0 1 0 9 16.25V12Z" />
                    <circle
                      cx="9"
                      cy="9"
                      r="7.25"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      fill="none"
                    />
                  </g>
                </svg>
              </Button> */}
            </nav>

            <Button
              ref={mobileMenuToggleRef}
              variant="secondary"
              size="icon"
              className="md:hidden"
              onClick={toggleMobileMenu}
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? (
                <CircleXmark width={18} height={18} />
              ) : (
                <Menu width={18} height={18} />
              )}
            </Button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-[9999] md:hidden">
            <div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={closeMobileMenu}
              aria-hidden="true"
            />

            <motion.div
              ref={mobileMenuRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="mobile-menu-title"
              className="absolute right-0 top-0 h-full w-80 max-w-[85vw] bg-sidebar border-l border-border shadow-xl"
              initial={shouldReduceMotion ? { x: 0 } : { x: "100%" }}
              animate={{ x: 0 }}
              exit={shouldReduceMotion ? { x: 0 } : { x: "100%" }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : { ease: "easeOut", duration: 0.3 }
              }
            >
              <div className="flex flex-col h-full">
                <h2 id="mobile-menu-title" className="sr-only">
                  Navigation Menu
                </h2>
                <div className="flex items-center justify-between p-6 border-b border-border">
                  <Link href="/" className="flex items-center gap-2">
                    <InboundIcon width={32} height={32} />
                    <span className="text-2xl font-outfit font-semibold tracking-tight">
                      inbound
                    </span>
                  </Link>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={closeMobileMenu}
                    aria-label="Close menu"
                  >
                    <CircleXmark width={18} height={18} />
                  </Button>
                </div>

                <nav className="flex-1 p-6">
                  <div className="flex flex-col gap-6">
                    {[
                      "/features",
                      "/examples",
                      "/pricing",
                      "/docs",
                      "/blog",
                    ].map((href) => (
                      <Link
                        key={href}
                        href={href}
                        className={`text-lg py-3 px-4 rounded-lg transition-colors ${
                          isActive(href)
                            ? "bg-primary/10 text-primary font-medium"
                            : "hover:bg-muted/50"
                        }`}
                        onClick={closeMobileMenu}
                      >
                        {href
                          .replace("/", "")
                          .replace("#", "")
                          .replace(/^\w/, (c) => c.toUpperCase())}
                      </Link>
                    ))}
                  </div>
                </nav>

                <div className="p-6 border-t border-border space-y-4">
                  <div className="flex justify-center">
                    <FeedbackButton />
                  </div>
                  {session?.user ? (
                    <Button variant="primary" asChild className="w-full">
                      <Link href="/logs" onClick={closeMobileMenu}>
                        hey {session.user.name.toLowerCase().split(" ")[0]} 👋
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="primary" asChild className="w-full">
                      <Link href="/login" onClick={closeMobileMenu}>
                        Get Started
                      </Link>
                    </Button>
                  )}

                  {/* <Button
                    variant="secondary"
                    onClick={toggleTheme}
                    className="w-full"
                    aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 18 18"
                      aria-hidden="true"
                      className="mr-2"
                    >
                      <g fill="currentColor">
                        <circle cx="9" cy="9" r="7.25" opacity="0.3" />
                        <path d="M9 6v6c1.66 0 3-1.34 3-3s-1.34-3-3-3Z" />
                        <path d="M9 12c-1.66 0-3-1.34-3-3s1.34-3 3-3V1.75A7.25 7.25 0 1 0 9 16.25V12Z" />
                        <circle
                          cx="9"
                          cy="9"
                          r="7.25"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          fill="none"
                        />
                      </g>
                    </svg>
                    Switch to {theme === "dark" ? "light" : "dark"} mode
                  </Button> */}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
