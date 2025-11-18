"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { motion } from "motion/react";
import CirclePlay from "@/components/icons/circle-play";
import ArrowBoldRight from "@/components/icons/arrow-bold-right";
import Check2 from "@/components/icons/check-2";
import { useState } from "react";
import ShieldCheck from "@/components/icons/shield-check";
import Webhook from "@/components/icons/webhook";
import InboxArrowDown from "@/components/icons/inbox-arrow-down";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";

export function HeroNew() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText("bun add inboundemail");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const codeString = `import { Inbound } from 'inboundemail';

const client = new Inbound(process.env.INBOUND_API_KEY);

// Send a transactional email
await client.emails.send({
  from: 'hello@inbound.net',
  to: 'user@example.com',
  subject: 'Welcome aboard!',
  html: '<p>Thanks for signing up.</p>'
});`;

  return (
    <section className="relative pt-32 pb-32 md:pt-48 md:pb-48 overflow-hidden bg-[#0f0a1f]">
      {/* Background Grid & Gradients */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#7c3aed1a_1px,transparent_1px),linear-gradient(to_bottom,#7c3aed1a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-[#7c3aed]/10 via-[#7c3aed]/5 to-transparent blur-[100px] rounded-full mix-blend-screen" />
      </div>

      <div className="container px-4 md:px-6 mx-auto relative z-10">
        <div className="flex flex-col items-center text-center gap-10 max-w-4xl mx-auto">
            {/* Announcement Pill */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[#7c3aed]/30 bg-[#7c3aed]/10 text-[#a78bfa] hover:bg-[#7c3aed]/20 transition-colors backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#7c3aed] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#7c3aed]"></span>
              </span>
              <span className="text-sm font-medium">New: Mailboxes Beta</span>
            </div>
          </motion.div>

          {/* Heading */}
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-5xl md:text-7xl font-medium tracking-tight text-white leading-[1.1]"
          >
            The Complete Email API <br className="hidden md:block" />
            for <span className="text-white">Developers.</span>
          </motion.h1>

          {/* Subheading */}
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-xl text-gray-400 max-w-2xl leading-relaxed"
          >
            Send, receive, and reply to emails with a simple REST API. 
            Built-in webhooks, parsing, and spam protection.
          </motion.p>

          {/* Buttons */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto"
          >
            <Button 
                variant="primary"
                size="lg" 
                className="h-14 px-8 text-base rounded-xl w-full sm:w-auto transition-all duration-300 shadow-[0_0_20px_-5px_rgba(124,58,237,0.4)] hover:shadow-[0_0_25px_-5px_rgba(124,58,237,0.6)] bg-[#7c3aed] border-transparent hover:bg-[#6d28d9] active:bg-[#5b21b6] text-white" 
                asChild
            >
                <Link href="/login">
                    Start Building
                    <ArrowBoldRight className="ml-2 h-4 w-4" />
                </Link>
            </Button>
            
            <Button 
                variant="outline" 
                size="lg" 
                className="h-14 px-8 text-base rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white backdrop-blur-sm w-full sm:w-auto"
            >
                <CirclePlay className="mr-2 h-5 w-5" />
                Watch Demo
            </Button>
          </motion.div>
        </div>

        {/* Hero Visual with Floating Elements */}
        <motion.div 
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="mt-24 relative max-w-5xl mx-auto"
        >
            {/* Central Card (Phone-like or Code) */}
            <div className="relative z-20 bg-[#1e1b4b]/80 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-2 shadow-2xl ring-1 ring-white/5 max-w-3xl mx-auto">
                <div className="bg-[#0f0a1f] rounded-[2rem] overflow-hidden border border-white/5 relative">
                     {/* Fake Header */}
                    <div className="flex items-center justify-between px-8 py-6 border-b border-white/5 bg-[#0f0a1f]">
                         <div className="flex gap-2">
                             <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
                             <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                             <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
                         </div>
                         <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">api/v2/emails</div>
                    </div>

                    {/* Code Content */}
                    <div className="font-mono text-sm md:text-base overflow-x-auto bg-[#0f0a1f] p-2">
                        <SyntaxHighlighter
                            language="typescript"
                            style={atomDark}
                            customStyle={{
                                margin: 0,
                                padding: '2rem',
                                background: 'transparent',
                                fontSize: '0.95rem',
                                lineHeight: '1.6',
                            }}
                            codeTagProps={{
                                style: {
                                    background: 'transparent',
                                }
                            }}
                            showLineNumbers={true}
                            lineNumberStyle={{
                                minWidth: '2.5em',
                                paddingRight: '1.5em',
                                color: 'rgba(167, 139, 250, 0.3)',
                                textAlign: 'right',
                                userSelect: 'none',
                            }}
                            wrapLines={true}
                        >
                            {codeString}
                        </SyntaxHighlighter>
                    </div>
                </div>
            </div>

            {/* Floating Elements */}
            
            {/* Left Card */}
            <motion.div 
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -left-4 md:-left-16 top-1/2 -translate-y-1/2 z-30 hidden md:block"
            >
                <div className="bg-[#1e1b4b]/90 backdrop-blur-md rounded-2xl p-4 shadow-xl flex items-center gap-4 w-64 border border-white/10 ring-1 ring-white/5">
                    <div className="w-12 h-12 rounded-full bg-[#7c3aed]/20 flex items-center justify-center text-[#a78bfa] shrink-0">
                        <ShieldCheck width={24} height={24} />
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 font-medium">Spam Protection</p>
                        <div className="flex items-center gap-2">
                            <p className="text-lg font-bold text-white">99.9%</p>
                            <div className="px-1.5 py-0.5 rounded-full bg-[#10b981]/20 text-[#10b981] text-[10px] font-bold border border-[#10b981]/30">Active</div>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Right Card */}
            <motion.div 
                animate={{ y: [0, 15, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="absolute -right-4 md:-right-16 top-1/3 z-30 hidden md:block"
            >
                <div className="bg-[#1e1b4b]/90 backdrop-blur-md rounded-2xl p-4 shadow-xl flex items-center gap-4 w-56 border border-white/10 ring-1 ring-white/5">
                     <div className="w-12 h-12 rounded-full bg-pink-500/20 flex items-center justify-center text-pink-400 shrink-0">
                        <Webhook width={24} height={24} />
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 font-medium">Webhooks</p>
                        <p className="text-lg font-bold text-white">Delivered</p>
                    </div>
                    <div className="ml-auto">
                         <div className="w-8 h-8 rounded-full bg-[#10b981] flex items-center justify-center text-white shadow-[0_0_10px_rgba(16,185,129,0.4)]">
                            <Check2 width={16} height={16} />
                         </div>
                    </div>
                </div>
            </motion.div>

            {/* Bottom Card */}
            <motion.div 
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 2 }}
                className="absolute left-12 -bottom-8 z-30 hidden md:block"
            >
                <div className="bg-[#1e1b4b]/90 backdrop-blur-md rounded-2xl p-4 shadow-xl flex items-center gap-4 border border-white/10 ring-1 ring-white/5">
                     <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                        <InboxArrowDown width={20} height={20} />
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 font-medium">Inbound Parsed</p>
                        <p className="text-sm font-bold text-white">user@example.com</p>
                    </div>
                </div>
            </motion.div>

             {/* Decorative Glows */}
            <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-[#7c3aed]/20 blur-[80px] rounded-full z-0" />
            <div className="absolute -left-20 -top-20 w-72 h-72 bg-blue-500/20 blur-[80px] rounded-full z-0" />
        </motion.div>
      </div>
    </section>
  );
}
