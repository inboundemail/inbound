"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import Code2 from "@/components/icons/code-2";
import Globe2 from "@/components/icons/globe-2";
import Webhook from "@/components/icons/webhook";
import { CodeBlock } from "@/components/ui/code-block";

const steps = [
  {
    id: "setup",
    title: "Connect your domain",
    description: "Add a few DNS records to start sending and receiving emails from your custom domain.",
    icon: Globe2,
    code: `// DNS Configuration
Type: MX
Host: @
Value: inbound.mx.inbound.net
Priority: 10

Type: TXT
Host: @
Value: v=spf1 include:inbound.net ~all`,
    language: "plaintext",
  },
  {
    id: "api",
    title: "Integrate the API",
    description: "Use our simple REST API or SDKs to send transactional emails or process inbound messages.",
    icon: Code2,
    code: `import { Inbound } from 'inboundemail';

const client = new Inbound('api_key');

await client.emails.send({
  from: 'notifications@myapp.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<p>Hello world</p>'
});`,
    language: "typescript",
  },
  {
    id: "webhooks",
    title: "Listen for events",
    description: "Receive real-time webhooks for delivered emails, bounces, opens, clicks, and incoming replies.",
    icon: Webhook,
    code: `app.post('/webhooks/inbound', (req, res) => {
  const event = req.body;

  if (event.type === 'email.received') {
    console.log('New email from:', event.data.from);
    console.log('Subject:', event.data.subject);
  }

  res.sendStatus(200);
});`,
    language: "typescript",
  },
];

export function HowItWorks() {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <section className="py-24 bg-background">
      <div className="container px-4 md:px-6 mx-auto">
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-24 items-center">
          {/* Left Side: Steps */}
          <div className="flex-1 w-full">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-12">
              How it works
            </h2>
            <div className="space-y-8 relative">
              {/* Vertical Line */}
              <div className="absolute left-[27px] top-4 bottom-4 w-0.5 bg-border -z-10" />

              {steps.map((step, index) => (
                <div 
                  key={step.id}
                  className={cn(
                    "flex gap-6 cursor-pointer group",
                    activeStep === index ? "opacity-100" : "opacity-50 hover:opacity-80"
                  )}
                  onClick={() => setActiveStep(index)}
                >
                  <div className={cn(
                    "w-14 h-14 rounded-full border-2 flex items-center justify-center shrink-0 bg-background transition-all duration-300 z-10",
                    activeStep === index ? "border-primary text-primary" : "border-muted text-muted-foreground group-hover:border-primary/50"
                  )}>
                    <step.icon width={24} height={24} />
                  </div>
                  <div className="pt-2">
                    <h3 className={cn(
                      "text-xl font-semibold mb-2 transition-colors",
                      activeStep === index ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {step.title}
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Side: Code Preview */}
          <div className="flex-1 w-full lg:h-[500px] relative">
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 to-purple-500/5 rounded-3xl -z-10" />
            
            <div className="relative h-full rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col">
              <div className="flex items-center px-4 py-3 border-b border-border bg-muted/50">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/20" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/20" />
                  <div className="w-3 h-3 rounded-full bg-green-500/20" />
                </div>
              </div>
              
              <div className="font-mono text-sm overflow-auto flex-1 custom-scrollbar bg-[#0f0a1f]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeStep}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                    className="h-full"
                  >
                    <CodeBlock 
                        code={steps[activeStep].code}
                        language={steps[activeStep].language}
                        syntaxHighlighting={true}
                        copy={true}
                        className="border-0 bg-transparent h-full p-6"
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
