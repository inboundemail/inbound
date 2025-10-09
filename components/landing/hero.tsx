"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { AnimatedHeightDiv } from "../animated-height-div";
import { HomepageContent } from "@/app/actions/homepage";

interface EmailLog {
  id: string;
  status: "sent" | "failed" | "delivered";
  from: string;
  to: string;
  subject: string;
  time: string;
}

const emailTemplates: Omit<EmailLog, "id" | "time">[] = [
  {
    status: "failed",
    from: "no-reply@randommail.com",
    to: "alice@wonderland.com",
    subject: "Oops! Your password reset failed",
  },
  {
    status: "delivered",
    from: "support@acme.io",
    to: "bob@builder.com",
    subject: "Your ticket #5678 has been resolved",
  },
  {
    status: "sent",
    from: "updates@newsletter.com",
    to: "charlie@chocolate.com",
    subject: "Monthly Update: New Features Released!",
  },
  {
    status: "delivered",
    from: "billing@fintech.com",
    to: "dana@company.org",
    subject: "Payment Received - Invoice #9876",
  },
  {
    status: "sent",
    from: "hello@startup.dev",
    to: "eve@cybermail.net",
    subject: "Welcome! Let’s get started with your account",
  },
  {
    status: "failed",
    from: "noreply@alerts.com",
    to: "frank@domain.com",
    subject: "Alert: Unusual login attempt detected",
  },
];

const codeSnippets = [
  {
    title: "[RECEIVE EMAILS]",
    code: (
      <>
        <span className="text-purple-600 dark:text-purple-400">
          export async function
        </span>{" "}
        <span className="text-blue-600 dark:text-blue-400">POST</span>
        <span className="text-yellow-600 dark:text-yellow-400">
          (req: Request)
        </span>{" "}
        <span className="text-foreground">{"{"}</span>
        {"\n"}
        {"  "}
        <span className="text-purple-600 dark:text-purple-400">const</span>{" "}
        <span className="text-foreground">{"{ email }"}</span>{" "}
        <span className="text-purple-600 dark:text-purple-400">=</span>{" "}
        <span className="text-purple-600 dark:text-purple-400">await</span> req.
        <span className="text-blue-600 dark:text-blue-400">json</span>
        <span className="text-foreground">()</span>
        {"\n"}
        {"  "}console.
        <span className="text-blue-600 dark:text-blue-400">log</span>
        <span className="text-foreground">(</span>email.subject, email.html
        <span className="text-foreground">)</span>
        {"\n"}
        {"  "}
        <span className="text-purple-600 dark:text-purple-400">
          return
        </span>{" "}
        Response.
        <span className="text-blue-600 dark:text-blue-400">json</span>
        <span className="text-foreground">(</span>
        <span className="text-yellow-600 dark:text-yellow-400">
          {"{"}success: true{"}"}
        </span>
        <span className="text-foreground">)</span>
        {"\n"}
        <span className="text-foreground">{"}"}</span>
      </>
    ),
  },
  {
    title: "[SEND EMAILS]",
    code: (
      <>
        <span className="text-purple-600 dark:text-purple-400">await</span>{" "}
        inbound.emails.
        <span className="text-blue-600 dark:text-blue-400">send</span>
        <span className="text-foreground">({"{"}</span>
        {"\n"}
        {"  "}
        <span className="text-green-600 dark:text-green-400">from</span>:
        <span className="text-green-600 dark:text-green-400">
          'agent@inbnd.dev'
        </span>
        ,{"\n"}
        {"  "}
        <span className="text-green-600 dark:text-green-400">to</span>:
        <span className="text-green-600 dark:text-green-400">
          'you@example.com'
        </span>
        ,{"\n"}
        {"  "}
        <span className="text-green-600 dark:text-green-400">subject</span>:
        <span className="text-green-600 dark:text-green-400">
          'Hello from Inbound'
        </span>
        ,{"\n"}
        {"  "}
        <span className="text-green-600 dark:text-green-400">html</span>:
        <span className="text-green-600 dark:text-green-400">
          '&lt;p&gt;It just works.&lt;/p&gt;'
        </span>
        {"\n"}
        <span className="text-foreground">{"}"})</span>
      </>
    ),
  },
  {
    title: "[REPLY TO EMAILS]",
    code: (
      <>
        <span className="text-purple-600 dark:text-purple-400">await</span>{" "}
        inbound.emails.
        <span className="text-blue-600 dark:text-blue-400">send</span>
        <span className="text-foreground">({"{"}</span>
        {"\n"}
        {"  "}
        <span className="text-green-600 dark:text-green-400">from</span>:
        <span className="text-green-600 dark:text-green-400">
          'support@inbnd.dev'
        </span>
        ,{"\n"}
        {"  "}
        <span className="text-green-600 dark:text-green-400">to</span>:
        originalEmail.from,
        {"\n"}
        {"  "}
        <span className="text-green-600 dark:text-green-400">subject</span>:
        <span className="text-green-600 dark:text-green-400">'Re: '</span> +
        originalEmail.subject,
        {"\n"}
        {"  "}
        <span className="text-green-600 dark:text-green-400">html</span>:
        <span className="text-green-600 dark:text-green-400">
          '&lt;p&gt;Thanks for your email!&lt;/p&gt;'
        </span>
        {"\n"}
        <span className="text-foreground">{"}"})</span>
      </>
    ),
  },
];

interface HeroProps {
  content: HomepageContent;
}

export default function Hero({ content }: HeroProps) {
  const router = useRouter();
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [currentCodeIndex, setCurrentCodeIndex] = useState(0);
  const [scrollKey, setScrollKey] = useState(0);

  useEffect(() => {
    const initialLogs = emailTemplates.slice(0, 4).map((template, index) => ({
      ...template,
      id: `log-${Date.now()}-${index}`,
      time: new Date(Date.now() - index * 1000 * 60 * 5)
        .toLocaleTimeString("en-US", { hour12: false })
        .slice(0, 8),
    }));
    setLogs(initialLogs);

    const interval = setInterval(() => {
      const randomTemplate =
        emailTemplates[Math.floor(Math.random() * emailTemplates.length)];
      const newLog: EmailLog = {
        ...randomTemplate,
        id: `log-${Date.now()}`,
        time: new Date()
          .toLocaleTimeString("en-US", { hour12: false })
          .slice(0, 8),
      };

      setLogs((prev) => {
        const updated = [...prev, newLog];
        return updated.slice(-4);
      });

      setScrollKey((prev) => prev + 1);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Code snippet animation
  useEffect(() => {
    const codeInterval = setInterval(() => {
      setCurrentCodeIndex((prev) => (prev + 1) % codeSnippets.length);
    }, 5000);

    return () => clearInterval(codeInterval);
  }, []);

  const getStatusConfig = (status: string) => {
    switch (status) {
      case "sent":
        return {
          bgColor: "bg-purple-100 dark:bg-purple-950",
          textColor: "text-purple-600 dark:text-purple-400",
          icon: (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m3 16 4 4 4-4" />
              <path d="M7 20V4" />
              <path d="M11 4h10" />
              <path d="M11 8h7" />
              <path d="M11 12h4" />
            </svg>
          ),
        };
      case "failed":
        return {
          bgColor: "bg-red-100 dark:bg-red-950",
          textColor: "text-red-600 dark:text-red-400",
          icon: (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="m15 9-6 6" />
              <path d="m9 9 6 6" />
            </svg>
          ),
        };
      case "delivered":
        return {
          bgColor: "bg-green-100 dark:bg-green-950",
          textColor: "text-green-600 dark:text-green-400",
          icon: (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ),
        };
      default:
        return {
          bgColor: "bg-gray-100 dark:bg-gray-950",
          textColor: "text-gray-600 dark:text-gray-400",
          icon: null,
        };
    }
  };

  return (
    <div className="xl:h-[calc(100dvh-89px)] min-h-[calc(100dvh-89px)] overflow-hidden py-16 max-md:py-12 items-center justify-center px-4 flex gap-24 relative max-[1074px]:flex-col max-[1074px]:items-start max-[1074px]:gap-12">
      {/* left side */}
      <div className="flex flex-col gap-6 justify-center flex-1 h-full">
        {/* heading */}
        <div className="flex flex-col gap-4">
          <h1 className="text-[4.5rem] max-sm:text-[3.6rem] max-xs:text-[3.2rem] font-semibold max-w-lg leading-[4.9rem] max-sm:leading-[3.8rem] max-xs:leading-[3.5rem] tracking-tight">
            {content.heroPrimaryText}
          </h1>
          <p className="text-lg tracking-normal opacity-80">
            {content.heroSublineText}
          </p>
          <div className="flex items-center gap-2">
            <Button 
              className="tracking-normal h-10 max-xs:grow"
              onClick={() => router.push('/login')}
            >
              {content.ctaButtonPrimaryText}
            </Button>
            <Button
              variant={"secondary"}
              className="tracking-normal h-10 max-xs:grow"
              onClick={() => router.push('/docs')}
            >
              View Documentation
            </Button>
          </div>
        </div>
        {/* trusted by */}
        <div className="flex flex-col gap-4 w-full max-[1074px]:hidden">
          <p className="tracking-normal opacity-80">Trusted by builders at</p>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 opacity-60">
              <svg
                width="18"
                height="18"
                viewBox="0 0 58 57"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M0 9.82759C0 4.39996 4.47705 0 9.99976 0H47.9989C53.5216 0 57.9986 4.39996 57.9986 9.82759V41.5893C57.9986 47.2045 50.7684 49.6414 47.2618 45.2082L36.2991 31.3488V48.1552C36.2991 53.04 32.2698 57 27.2993 57H9.99976C4.47705 57 0 52.6 0 47.1724V9.82759ZM9.99976 7.86207C8.89522 7.86207 7.99981 8.74206 7.99981 9.82759V47.1724C7.99981 48.2579 8.89522 49.1379 9.99976 49.1379H27.5993C28.1516 49.1379 28.2993 48.6979 28.2993 48.1552V25.6178C28.2993 20.0027 35.5295 17.5656 39.0361 21.9989L49.9988 35.8583V9.82759C49.9988 8.74206 50.1034 7.86207 48.9988 7.86207H9.99976Z"
                  fill="currentColor"
                />
                <path
                  d="M48.0003 0C53.523 0 58 4.39996 58 9.82759V41.5893C58 47.2045 50.7699 49.6414 47.2633 45.2082L36.3006 31.3488V48.1552C36.3006 53.04 32.2712 57 27.3008 57C27.8531 57 28.3008 56.56 28.3008 56.0172V25.6178C28.3008 20.0027 35.5309 17.5656 39.0375 21.9989L50.0002 35.8583V1.96552C50.0002 0.879992 49.1048 0 48.0003 0Z"
                  fill="currentColor"
                />
              </svg>
              <p className="tracking-normal">neon.com</p>
            </div>
            <div className="flex items-center gap-2 opacity-60">
              <svg
                height="20"
                width="20"
                viewBox="0 0 185 291"
                xmlns="http://www.w3.org/2000/svg"
              >
                <g fill="none">
                  <path
                    d="M142.177 23.3423H173.437C179.612 23.3423 184.617 28.3479 184.617 34.5227V258.318C184.617 264.493 179.612 269.498 173.437 269.498H142.177V23.3423Z"
                    fill="currentColor"
                  ></path>
                  <path
                    d="M0 57.5604C0 52.8443 2.9699 48.6392 7.41455 47.0622L125.19 5.27404C132.441 2.70142 140.054 8.07871 140.054 15.7722V275.171C140.054 282.801 132.557 288.172 125.332 285.718L7.55682 245.715C3.03886 244.18 0 239.939 0 235.167V57.5604Z"
                    fill="currentColor"
                  ></path>
                </g>
              </svg>
              <p className="tracking-normal">churchspace.co</p>
            </div>
            <div className="flex items-center gap-2 opacity-60">
              <img src="/images/agentuity.png" alt="Agentuity logo" className="h-5 w-auto" />
            </div>
          </div>
        </div>
      </div>

      {/* right side */}
      <div className="relative flex flex-col gap-3 justify-between h-full flex-1 z-20 bg-transparent max-[1074px]:w-full border-x border-dashed">
        {/* Email Cards - Animated */}
        <div className="flex flex-col gap-3 border-y border-dashed p-4 tracking-normal overflow-hidden h-[380px] relative">
          {/* Top fade overlay */}
          <div className="absolute top-0 left-0 right-0 max-sm:h-1 h-28 bg-gradient-to-b from-card to-transparent z-10 pointer-events-none" />

          {/* Bottom fade overlay */}
          <div className="absolute bottom-0 left-0 right-0 max-sm:h-1 h-28 bg-gradient-to-t from-card to-transparent z-10 pointer-events-none" />

          <motion.div
            key={scrollKey}
            initial={{ y: 0 }}
            animate={{ y: -120 }}
            transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
            className="flex flex-col gap-3"
          >
            <AnimatePresence initial={false}>
              {logs.map((log, index) => {
                const config = getStatusConfig(log.status);
                const isNewLog = index === logs.length - 1;

                const totalLogs = logs.length;
                const centerIndex = Math.floor(totalLogs / 2);
                const distanceFromCenter = Math.abs(index - centerIndex);

                const targetScale = Math.max(
                  0.9,
                  1 - distanceFromCenter * 0.25
                );
                const targetOpacity = Math.max(
                  0.3,
                  1 - distanceFromCenter * 0.2
                );
                const targetBlur =
                  distanceFromCenter > 0
                    ? Math.min(2, distanceFromCenter * 0.9)
                    : 0;

                return (
                  <motion.div
                    key={log.id}
                    initial={
                      isNewLog
                        ? { opacity: 0, filter: "blur(4px)", y: 20, scale: 0.9 }
                        : {
                          opacity: targetOpacity,
                          filter: `blur(${targetBlur}px)`,
                          scale: targetScale,
                        }
                    }
                    animate={{
                      opacity: targetOpacity,
                      filter: `blur(${targetBlur}px)`,
                      y: 0,
                      scale: targetScale,
                    }}
                    exit={{
                      opacity: 0,
                      filter: "blur(4px)",
                      y: -120,
                      scale: 0.7,
                      transition: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] },
                    }}
                    transition={{
                      opacity: { duration: 0.8, ease: [0.25, 0.1, 0.25, 1] },
                      filter: { duration: 0.8, ease: [0.25, 0.1, 0.25, 1] },
                      y: { duration: 0.6, ease: [0.25, 0.1, 0.25, 1] },
                      scale: { duration: 0.8, ease: [0.25, 0.1, 0.25, 1] },
                    }}
                    className="p-3 flex items-start gap-4 tracking-normal"
                    style={{
                      zIndex: totalLogs - distanceFromCenter,
                    }}
                  >
                    <div
                      className={`flex items-center justify-center size-10 ${config.bgColor} shrink-0`}
                    >
                      <span className={config.textColor}>{config.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-4">
                        <span
                          className={`px-3 py-1 ${config.bgColor} ${config.textColor} font-medium tracking-normal text-xs capitalize`}
                        >
                          {log.status}
                        </span>
                        <span className="text-sm text-muted-foreground tracking-normal">
                          {log.time}
                        </span>
                      </div>
                      <div className="text-sm tracking-normal flex flex-col gap-1">
                        <span>
                          <span className="font-medium opacity-70">From:</span>{" "}
                          <span className="opacity-100">{log.from}</span>{" "}
                          <span className="font-medium opacity-70">To:</span>{" "}
                          <span className="opacity-100">{log.to}</span>
                        </span>
                        <span>
                          <span className="font-medium opacity-70">
                            Subject:
                          </span>{" "}
                          <span className="opacity-100">{log.subject}</span>
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        </div>
        {/* Code Snippet Card - Animated */}
        <AnimatedHeightDiv className="bg-transparent border-y border-dashed overflow-hidden relative tracking-normal">
          <div className="p-4 flex flex-col gap-4 justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentCodeIndex}
                initial={{ opacity: 0, filter: "blur(4px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(4px)" }}
                transition={{ duration: 0.2, ease: "easeIn" }}
                className="h-full flex flex-col justify-center"
              >
                <pre className="text-[13px]">
                  <code className="text-foreground tracking-tight">
                    {codeSnippets[currentCodeIndex].code}
                  </code>
                </pre>
              </motion.div>
            </AnimatePresence>
            <AnimatePresence mode="wait">
              <motion.div
                key={`interactive-${currentCodeIndex}`}
                initial={{ opacity: 0, filter: "blur(4px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(4px)" }}
                transition={{ duration: 0.5, ease: "linear" }}
                className="text-center opacity-80"
              >
                {currentCodeIndex === 0 && (
                  <div className="p-1 border border-dashed w-full relative">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 text-lg flex-1">
                        <Input
                          placeholder="your-webhook-url"
                          className="w-full tracking-normal text-left h-10 placeholder:opacity-70 font-normal bg-transparent border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none outline-none"
                        />
                      </div>
                      <Button
                        variant={"primary"}
                        className="tracking-normal h-10 rounded-none"
                      >
                        Test Webhook
                      </Button>
                    </div>
                  </div>
                )}
                {currentCodeIndex === 1 && (
                  <div className="p-1 border border-dashed w-full relative">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 text-lg flex-1">
                        <Input
                          placeholder="recipient@example.com"
                          className="w-full tracking-normal text-left h-10 placeholder:opacity-70 font-normal bg-transparent border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none outline-none"
                        />
                      </div>
                      <Button
                        variant={"primary"}
                        className="tracking-normal h-10 rounded-none"
                      >
                        Send Email
                      </Button>
                    </div>
                  </div>
                )}
                {currentCodeIndex === 2 && (
                  <div className="p-1 border border-dashed w-full relative">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 text-lg flex-1">
                        <Input
                          placeholder="Your reply message..."
                          className="w-full tracking-normal text-left h-10 placeholder:opacity-70 font-normal bg-transparent border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none outline-none"
                        />
                      </div>
                      <Button
                        variant={"primary"}
                        className="tracking-normal h-10 rounded-none"
                      >
                        Reply
                      </Button>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </AnimatedHeightDiv>
      </div>
    </div>
  );
}
