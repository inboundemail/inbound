"use client";

import InboxArrowDown from "@/components/icons/inbox-arrow-down";
import PaperPlane2 from "@/components/icons/paper-plane-2";
import Webhook from "@/components/icons/webhook";
import ChatBubble2 from "@/components/icons/chat-bubble-2";
import ShieldCheck from "@/components/icons/shield-check";
import ChartActivity2 from "@/components/icons/chart-activity-2";
import { cn } from "@/lib/utils";
import { motion, useMotionTemplate, useMotionValue } from "motion/react";
import { MouseEvent } from "react";

const features = [
  {
    title: "Inbound Parsing",
    description: "Turn incoming emails into structured JSON. We parse attachments, headers, and body content for you.",
    icon: InboxArrowDown,
    className: "md:col-span-2",
    visual: (
        <div className="absolute right-4 top-4 w-32 h-24 opacity-10 group-hover:opacity-20 transition-opacity select-none overflow-hidden font-mono text-[10px] bg-muted p-2 rounded border border-border/50">
            {`{
  "from": "user",
  "subject": "Hi",
  "attachments": []
}`}
        </div>
    )
  },
  {
    title: "Sending API",
    description: "High-deliverability sending infrastructure. Send transactional emails with a single API call.",
    icon: PaperPlane2,
    className: "md:col-span-1",
  },
  {
    title: "Real-time Webhooks",
    description: "Get notified instantly when emails arrive, bounce, or are opened. Fully typed payloads.",
    icon: Webhook,
    className: "md:col-span-2",
    visual: (
        <div className="absolute right-4 top-4 flex gap-2 opacity-10 group-hover:opacity-20 transition-opacity">
            <div className="px-2 py-1 rounded-full bg-primary/20 border border-primary/30 text-[10px] text-primary font-mono">email.received</div>
            <div className="px-2 py-1 rounded-full bg-green-500/20 border border-green-500/30 text-[10px] text-green-500 font-mono">200 OK</div>
        </div>
    )
  },
  {
    title: "Conversation Threading",
    description: "Automatically group emails into threads. Build chat-like experiences on top of email.",
    icon: ChatBubble2,
    className: "md:col-span-1",
  },
  {
    title: "Analytics & Logs",
    description: "Track delivery rates, opens, and clicks. Full 30-day retention of email logs.",
    icon: ChartActivity2,
    className: "md:col-span-2",
    visual: (
        <div className="absolute right-6 bottom-6 flex items-end gap-1 opacity-20 group-hover:opacity-30 transition-opacity">
            <div className="w-2 h-8 bg-primary rounded-t" />
            <div className="w-2 h-12 bg-primary rounded-t" />
            <div className="w-2 h-6 bg-primary rounded-t" />
            <div className="w-2 h-10 bg-primary rounded-t" />
            <div className="w-2 h-14 bg-primary rounded-t" />
        </div>
    )
  },
  {
    title: "Spam Protection",
    description: "Built-in SPF, DKIM, and DMARC handling. We filter out spam before it hits your webhook.",
    icon: ShieldCheck,
    className: "md:col-span-1",
  },
];

function SpotlightCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({ currentTarget, clientX, clientY }: MouseEvent) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  return (
    <div
      className={cn(
        "group relative border border-border bg-background overflow-hidden rounded-xl",
        className
      )}
      onMouseMove={handleMouseMove}
    >
      <motion.div
        className="pointer-events-none absolute -inset-px opacity-0 transition duration-300 group-hover:opacity-100"
        style={{
          background: useMotionTemplate`
            radial-gradient(
              650px circle at ${mouseX}px ${mouseY}px,
              rgba(124, 58, 237, 0.1),
              transparent 80%
            )
          `,
        }}
      />
      <div className="relative h-full">{children}</div>
    </div>
  );
}

export function FeaturesGrid() {
  return (
    <section className="py-24 bg-background relative overflow-hidden">
       {/* Background Pattern */}
       <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
            style={{ 
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` 
            }} 
        />

      <div className="container px-4 md:px-6 mx-auto relative z-10">
        <div className="flex flex-col items-center text-center gap-4 mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Everything you need to build email features
          </h2>
          <p className="text-muted-foreground max-w-2xl text-lg">
            A complete toolkit for developers who need to integrate email capabilities into their applications.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {features.map((feature, index) => (
            <SpotlightCard key={index} className={feature.className}>
              <div className="p-8 h-full flex flex-col relative">
                {feature.visual}
                <div className="mb-6 inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary group-hover:scale-110 transition-transform duration-300">
                  <feature.icon width={24} height={24} />
                </div>
                <h3 className="text-xl font-semibold mb-3 tracking-tight">{feature.title}</h3>
                <p className="text-muted-foreground leading-relaxed text-sm flex-1">
                  {feature.description}
                </p>
                
                <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-primary/0 via-primary/50 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              </div>
            </SpotlightCard>
          ))}
        </div>
      </div>
    </section>
  );
}
