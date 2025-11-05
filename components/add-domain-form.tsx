"use client";

import React, { useState, useEffect, useMemo, FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { track } from "@vercel/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils";
import ArrowBoldRight from "@/components/icons/arrow-bold-right";
import Clock2 from "@/components/icons/clock-2";
import CircleCheck from "@/components/icons/circle-check";
import CircleWarning2 from "@/components/icons/circle-warning-2";
import Loader from "@/components/icons/loader";
import Clipboard2 from "@/components/icons/clipboard-2";
import Download2 from "@/components/icons/download-2";
import Refresh2 from "@/components/icons/refresh-2";
import BadgeCheck2 from "@/components/icons/badge-check-2";
import Globe2 from "@/components/icons/globe-2";
import ExternalLink2 from "@/components/icons/external-link-2";
import CheckList from "@/components/icons/check-list";
import { useRouter } from "next/navigation";
// import Image from "next/image"
import type {
  PostDomainsResponse,
  DomainWithStats,
} from "@/app/api/v2/domains/route";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import ArrowBoldUp from "./icons/arrow-bold-up";
import EnvelopeArrowRight from "./icons/envelope-arrow-right";
import { Label } from "./ui/label";
import { sendDnsSetupInstructions } from "@/app/actions/dns-setup";

interface StepConfig {
  id: string;
  name: string;
  description: string;
}

const stepsConfig: StepConfig[] = [
  {
    id: "add-domain",
    name: "Add Domain",
    description:
      "Let's get you sending and receiving emails with ease, (and your own domain).",
  },
  {
    id: "configure-dns",
    name: "Configure DNS",
    description: "Add the following DNS records to your domain provider.",
  },
  {
    id: "verified",
    name: "Verified",
    description: "Start sending emails to your domain.",
  },
];

const stepVariants = {
  hidden: { opacity: 0, x: 20 },
  visible: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

interface DnsRecord {
  type: "TXT" | "MX" | string; // Allow string for flexibility
  name: string;
  value: string;
  isVerified?: boolean;
}

// Type for DNS records from verification check
type VerificationDnsRecord = {
  type: string;
  name: string;
  value: string;
  isVerified: boolean;
  error?: string;
};

// Enhanced type for domain response with verification check
interface DomainResponseWithCheck
  extends Omit<DomainWithStats, "stats" | "catchAllEndpoint"> {
  stats: {
    totalEmailAddresses: number;
    activeEmailAddresses: number;
    hasCatchAll: boolean;
  };
  catchAllEndpoint?: {
    id: string;
    name: string;
    type: string;
    isActive: boolean;
  } | null;
  verificationCheck?: {
    dnsRecords?: Array<VerificationDnsRecord>;
    sesStatus?: string;
    isFullyVerified?: boolean;
    lastChecked?: Date;
  };
}

interface ApiResponse {
  success: boolean;
  error?: string;
  domain?: string;
  domainId?: string;
  status?: "pending" | "verified" | "failed";
  dnsRecords?: DnsRecord[];
  verificationToken?: string;
  provider?: {
    name: string;
    confidence: "high" | "medium" | "low";
  };
}

interface AddDomainFormProps {
  // Optional props for preloading existing domain data
  preloadedDomain?: string;
  preloadedDomainId?: string;
  preloadedDnsRecords?: DnsRecord[];
  preloadedStep?: number;
  preloadedProvider?: string;
  onRefresh?: () => void;
  overrideRefreshFunction?: () => Promise<void>;
  // Optional callback when domain is successfully added/verified
  onSuccess?: (domainId: string) => void;
}

// Provider documentation mapping
const getProviderDocUrl = (provider: string): string | null => {
  const providerMap: Record<string, string> = {
    route53: "https://resend.com/docs/knowledge-base/route53",
    "amazon route 53": "https://resend.com/docs/knowledge-base/route53",
    aws: "https://resend.com/docs/knowledge-base/route53",
    cloudflare: "https://resend.com/docs/knowledge-base/cloudflare",
    namecheap: "https://resend.com/docs/knowledge-base/namecheap",
    vercel: "https://resend.com/docs/knowledge-base/vercel",
    squarespace: "https://resend.com/docs/knowledge-base/squarespace",
    hostzinger: "https://resend.com/docs/knowledge-base/hostzinger",
    ionos: "https://resend.com/docs/knowledge-base/ionos",
    gandi: "https://resend.com/docs/knowledge-base/gandi",
    porkbun: "https://resend.com/docs/knowledge-base/porkbun",
  };

  const normalizedProvider = provider.toLowerCase().trim();
  return providerMap[normalizedProvider] || null;
};

export default function AddDomainForm({
  preloadedDomain = "",
  preloadedDomainId = "",
  preloadedDnsRecords = [],
  preloadedStep = 0,
  preloadedProvider = "",
  onRefresh,
  overrideRefreshFunction,
  onSuccess,
}: AddDomainFormProps) {
  const [currentStepIdx, setCurrentStepIdx] = useState(preloadedStep);
  const [domainName, setDomainName] = useState(preloadedDomain);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<
    "pending" | "verified" | "failed" | null
  >(null);
  const [dnsRecords, setDnsRecords] =
    useState<DnsRecord[]>(preloadedDnsRecords);
  const [domainId, setDomainId] = useState(preloadedDomainId);
  // Resend import functionality removed
  const [periodicCheckEnabled, setPeriodicCheckEnabled] = useState(false);
  const router = useRouter();
  const [showDnsWarning, setShowDnsWarning] = useState(false);

  // Memoize the DNS records to prevent unnecessary re-renders
  const memoizedPreloadedDnsRecords = useMemo(
    () => preloadedDnsRecords,
    [JSON.stringify(preloadedDnsRecords)]
  );

  // Update state when props change (for when component is reused with different data)
  useEffect(() => {
    setCurrentStepIdx(preloadedStep);
    setDomainName(preloadedDomain);
    setDnsRecords(memoizedPreloadedDnsRecords);
    setDomainId(preloadedDomainId);
  }, [
    preloadedStep,
    preloadedDomain,
    memoizedPreloadedDnsRecords,
    preloadedDomainId,
  ]);

  // Lazy refresh status when component loads with preloaded data (pending domain)
  useEffect(() => {
    if (preloadedDomainId && preloadedDomain && preloadedStep === 1) {
      // Add a small delay to let the component fully mount
      const timer = setTimeout(() => {
        console.log(
          "🔄 Auto-refreshing domain verification status for:",
          preloadedDomain
        );
        handleRefresh();
        // Enable periodic checks after initial refresh
        setPeriodicCheckEnabled(true);
      }, 500); // 500ms delay

      return () => clearTimeout(timer);
    }
  }, [preloadedDomainId, preloadedDomain, preloadedStep]);

  // Fetch DNS records when we have a domainId but no DNS records
  useEffect(() => {
    if (domainId && dnsRecords.length === 0 && currentStepIdx === 1) {
      const fetchDnsRecords = async () => {
        try {
          const response = await fetch(
            `/api/v2/domains/${domainId}/dns-records`
          );
          if (response.ok) {
            const data = await response.json();
            const mappedRecords = data.records.map((record: any) => ({
              type: record.recordType,
              name: record.name,
              value: record.value,
              isVerified: record.isVerified || false,
            }));
            setDnsRecords(mappedRecords);
          }
        } catch (error) {
          console.error("Error fetching DNS records:", error);
        }
      };
      fetchDnsRecords();
    }
  }, [domainId, dnsRecords.length, currentStepIdx]);

  // Periodic verification check every 5 seconds
  useEffect(() => {
    if (
      !periodicCheckEnabled ||
      !domainId ||
      !domainName ||
      verificationStatus === "verified" ||
      verificationStatus === "failed"
    ) {
      return;
    }

    console.log(
      "🔄 Starting periodic verification checks every 5 seconds for:",
      domainName
    );

    const intervalId = setInterval(() => {
      console.log("⏰ Periodic verification check for:", domainName);
      handlePeriodicRefresh();
    }, 5000); // 5 seconds

    return () => {
      console.log("🛑 Stopping periodic verification checks for:", domainName);
      clearInterval(intervalId);
    };
  }, [periodicCheckEnabled, domainId, domainName, verificationStatus]);

  // Handle periodic refresh (silent, no loading states)
  const handlePeriodicRefresh = async () => {
    if (!domainId || !domainName || isRefreshing) {
      return;
    }

    // Use overrideRefreshFunction if provided
    if (overrideRefreshFunction) {
      try {
        await overrideRefreshFunction();
      } catch (err) {
        console.error("Error in periodic refresh:", err);
      }
      return;
    }

    try {
      const response = await fetch(`/api/v2/domains?status=pending&check=true`);

      if (!response.ok) {
        console.error("Failed to check domain status:", response.status);
        return;
      }

      const result = await response.json();

      // Find our domain in the response
      const ourDomain = result.data?.find(
        (d: DomainResponseWithCheck) => d.id === domainId
      );

      if (!ourDomain) {
        console.error("Domain not found in response");
        return;
      }

      // Update verification status based on domain status
      setVerificationStatus(
        ourDomain.status as "pending" | "verified" | "failed"
      );

      // Update DNS records if verification check is available
      if (ourDomain.verificationCheck?.dnsRecords) {
        setDnsRecords(
          ourDomain.verificationCheck.dnsRecords.map(
            (record: VerificationDnsRecord) => ({
              type: record.type,
              name: record.name,
              value: record.value,
              isVerified: record.isVerified,
            })
          )
        );
      }

      if (ourDomain.status === "verified") {
        console.log(
          "✅ Domain verified! Redirecting to domain details page..."
        );
        toast.success("Domain verified successfully! Redirecting...");
        setPeriodicCheckEnabled(false); // Stop periodic checks

        // Redirect to domain details page
        setTimeout(() => {
          router.push(`/emails/${domainId}`);
        }, 1500); // Small delay to show the success message
      }
    } catch (err) {
      console.error("Error in periodic verification check:", err);
      // Don't show error toast for periodic checks to avoid spamming
    }
  };

  const handleNext = () => {
    if (currentStepIdx === 0 && !domainName.trim()) {
      setError("Please enter a valid domain name.");
      return;
    }
    if (currentStepIdx === 0 && domainName.trim()) {
      if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domainName)) {
        setError("Please enter a valid domain format (e.g., example.com).");
        return;
      }
    }
    setError("");
    if (currentStepIdx < stepsConfig.length - 1) {
      setCurrentStepIdx((prev) => prev + 1);
    }
  };

  const handleSubmitDomain = async (e: FormEvent) => {
    e.preventDefault();
    if (!domainName.trim()) {
      setError("Please enter a valid domain name.");
      return;
    }

    if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domainName)) {
      setError("Please enter a valid domain format (e.g., example.com).");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      // Use v2 API to add domain
      const addResponse = await fetch("/api/v2/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: domainName,
        }),
      });

      const addResult: PostDomainsResponse | { error: string } =
        await addResponse.json();

      if (!addResponse.ok) {
        const errorResult = addResult as { error: string; code?: string };

        // Check for specific error types
        if (addResponse.status === 409) {
          // Use the specific error message from the API for better UX
          setError(errorResult.error || "This domain already exists.");
        } else if (addResponse.status === 403) {
          setError(
            errorResult.error ||
              "Domain limit reached. Please upgrade your plan."
          );
        } else if (
          addResponse.status === 400 &&
          errorResult.error?.includes("conflicting DNS records")
        ) {
          setError(
            "This domain cannot be used. It may have conflicting DNS records (MX or CNAME). Please remove them before adding this domain."
          );
        } else {
          setError(errorResult.error || "Failed to add domain");
        }
        return;
      }

      const successResult = addResult as PostDomainsResponse;
      console.log("Domain added successfully:", successResult);

      // Track domain addition
      track("Domain Added", {
        domain: domainName,
        domainId: successResult.id,
      });

      // Call success callback if provided
      if (onSuccess) {
        onSuccess(successResult.id);
      }

      // Always redirect to domain details page after creation
      toast.success("Domain added successfully! Redirecting...");
      setTimeout(() => {
        router.push(`/emails/${successResult.id}`);
      }, 1000); // Small delay to show the success message
    } catch (err) {
      console.error("Error adding domain:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    // Use overrideRefreshFunction if provided, otherwise fall back to onRefresh or default behavior
    if (overrideRefreshFunction) {
      setIsRefreshing(true);
      try {
        await overrideRefreshFunction();
      } catch (err) {
        console.error("Error in override refresh function:", err);
        toast.error("Failed to refresh status");
      } finally {
        setIsRefreshing(false);
      }
      return;
    }

    if (onRefresh) {
      onRefresh();
      return;
    }

    if (!domainId) {
      toast.error("No domain ID available for verification");
      return;
    }

    setIsRefreshing(true);
    setError("");

    console.log("🔄 Manual refresh for domainId:", domainId);

    try {
      const response = await fetch(`/api/v2/domains?status=pending&check=true`);

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || "Failed to check verification status");
        toast.error("Failed to refresh status");
        setPeriodicCheckEnabled(false); // Stop periodic checks on error
        return;
      }

      const result = await response.json();

      // Find our domain in the response
      const ourDomain = result.data?.find(
        (d: DomainResponseWithCheck) => d.id === domainId
      );

      if (!ourDomain) {
        setError("Domain not found");
        toast.error("Domain not found");
        setPeriodicCheckEnabled(false);
        return;
      }

      console.log("🔍 Manual refresh result:", ourDomain);

      // Update verification status
      setVerificationStatus(
        ourDomain.status as "pending" | "verified" | "failed"
      );

      if (ourDomain.status === "verified") {
        console.log("✅ Domain verified via manual refresh! Redirecting...");
        toast.success("Domain verified successfully! Redirecting...");
        setPeriodicCheckEnabled(false); // Stop periodic checks

        // Redirect to domain details page
        setTimeout(() => {
          router.push(`/emails/${domainId}`);
        }, 1500); // Small delay to show the success message
      } else if (ourDomain.status === "failed") {
        toast.error("Domain verification failed");
        setPeriodicCheckEnabled(false); // Stop periodic checks on failure
      } else {
        toast.info("Domain verification still pending");
        // Enable periodic checks if not already enabled
        if (!periodicCheckEnabled) {
          setPeriodicCheckEnabled(true);
        }
      }

      // Update DNS records if verification check is available
      if (ourDomain.verificationCheck?.dnsRecords) {
        setDnsRecords(
          ourDomain.verificationCheck.dnsRecords.map(
            (record: VerificationDnsRecord) => ({
              type: record.type,
              name: record.name,
              value: record.value,
              isVerified: record.isVerified,
            })
          )
        );
      }
    } catch (err) {
      console.error("Error checking verification:", err);
      setError(
        "An unexpected error occurred while checking verification status."
      );
      toast.error("Failed to refresh status");
      setPeriodicCheckEnabled(false); // Stop periodic checks on error
    } finally {
      setIsRefreshing(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch (err) {
      console.error("Failed to copy text: ", err);
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleSend = () => {
    return async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      
      const formData = new FormData(e.currentTarget);
      const recipientEmail = formData.get("email") as string;
      const recipientName = formData.get("name") as string;

      if (!recipientEmail) {
        toast.error("Please enter an email address");
        return;
      }

      if (!domainName) {
        toast.error("Domain name is missing");
        return;
      }

      if (!dnsRecords || dnsRecords.length === 0) {
        toast.error("DNS records are not available");
        return;
      }

      try {
        toast.loading("Sending DNS setup instructions...");
        
        const result = await sendDnsSetupInstructions({
          recipientEmail,
          recipientName: recipientName || undefined,
          domain: domainName,
          dnsRecords: dnsRecords,
          provider: preloadedProvider || undefined
        });

        if (result.success) {
          toast.success(`DNS setup instructions sent to ${recipientEmail}`);
          // Reset form
          (e.target as HTMLFormElement).reset();
        } else {
          toast.error(result.error || "Failed to send instructions");
        }
      } catch (error) {
        console.error("Error sending DNS setup instructions:", error);
        toast.error("Failed to send instructions");
      } finally {
        toast.dismiss();
      }
    };
  };

  const generateZoneFile = (
    domain: string,
    records: DnsRecord[],
    absolute: boolean = false
  ): string => {
    // Extract root domain (last two parts: domain.tld)
    const domainParts = domain.split(".");
    const rootDomain = domainParts.slice(-2).join(".");

    let zoneContent = `; Zone file for ${domain}\n`;
    zoneContent += `; Generated by Inbound Email Service\n`;
    zoneContent += `; \n`;

    if (absolute) {
      zoneContent += `; This file uses ABSOLUTE domain names (full names).\n`;
      zoneContent += `; Each record includes the complete domain name.\n`;
      zoneContent += `; Use this format if your DNS provider requires full domain names.\n`;
      zoneContent += `; \n`;
    } else {
      zoneContent += `; IMPORTANT: This zone file uses relative names.\n`;
      zoneContent += `; The $ORIGIN directive means all names are relative to ${rootDomain}\n`;
      zoneContent += `; For example, '_amazonses' will become '_amazonses.${rootDomain}'\n`;
      zoneContent += `; and '@' represents the root domain (${rootDomain})\n`;
      zoneContent += `; \n`;
      zoneContent += `; Some DNS providers may require you to enter the full domain name.\n`;
      zoneContent += `; If so, use '_amazonses.${rootDomain}' instead of just '_amazonses'\n`;
      zoneContent += `; \n`;
      zoneContent += `$ORIGIN ${rootDomain}.\n`;
    }

    zoneContent += `$TTL 3600\n\n`;

    // Group records by type
    const txtRecords = records.filter((r) => r.type === "TXT");
    const mxRecords = records.filter((r) => r.type === "MX");

    // TXT Records
    if (txtRecords.length > 0) {
      zoneContent += `; TXT Records\n`;
      txtRecords.forEach((record) => {
        const recordName = extractRecordName(record.name, domain);
        const name = absolute
          ? recordName === "@"
            ? rootDomain
            : record.name
          : recordName === "@"
            ? "@"
            : recordName;
        zoneContent += `${name}\t\t3600\tTXT\t"${record.value}"\n`;
      });
      zoneContent += `\n`;
    }

    // MX Records
    if (mxRecords.length > 0) {
      zoneContent += `; MX Records\n`;
      mxRecords.forEach((record) => {
        const recordName = extractRecordName(record.name, domain);
        const name = absolute
          ? recordName === "@"
            ? rootDomain
            : record.name
          : recordName === "@"
            ? "@"
            : recordName;
        const [priority, mailServer] = record.value.split(" ");

        // Remove domain suffix if accidentally appended (common DNS provider issue)
        let cleanMailServer = mailServer;
        if (cleanMailServer.endsWith(`.${rootDomain}`)) {
          cleanMailServer = cleanMailServer.replace(`.${rootDomain}`, "");
        }

        // Ensure MX target has trailing dot for FQDN (prevents auto-appending)
        if (!cleanMailServer.endsWith(".")) {
          cleanMailServer += ".";
        }

        zoneContent += `${name}\t\t3600\tMX\t${priority}\t${cleanMailServer}\n`;
      });
      zoneContent += `\n`;
    }

    return zoneContent;
  };

  // Resend import handlers removed

  const extractRecordName = (recordName: string, domainName: string) => {
    // Extract root domain from domainName (get last 2 parts: domain.tld)
    const domainParts = domainName.split(".");
    const rootDomain = domainParts.slice(-2).join(".");

    // If the record name is exactly the root domain, return "@"
    if (recordName === rootDomain) {
      return "@";
    }

    // If the record name ends with the root domain, extract the subdomain part
    if (recordName.endsWith(`.${rootDomain}`)) {
      return recordName.replace(`.${rootDomain}`, "");
    }

    // Fallback: if no match found, return the original record name
    return recordName;
  };

  const isStepCompleted = (index: number) => index < currentStepIdx;
  const isStepCurrent = (index: number) => index === currentStepIdx;
  const isStepFuture = (index: number) => index > currentStepIdx;

  return (
    <div className="w-full flex flex-col">
      <div className="w-full px-2 mx-auto">
        {/* Main Content Area */}
        <div
          className={`w-full mx-auto ${currentStepIdx < 1 ? "max-w-3xl" : ""}`}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStepIdx}
              variants={stepVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={{ duration: 0.3, type: "tween" }}
              className="pt-1"
            >
              {currentStepIdx === 0 && (
                <div className="">
                  <h2 className="mb-1 text-lg font-semibold text-foreground">
                    {stepsConfig[0].name}
                  </h2>
                  <p className="mb-5 text-sm text-muted-foreground">
                    {stepsConfig[0].description}
                  </p>
                  <form onSubmit={handleSubmitDomain}>
                    <label
                      htmlFor="domainName"
                      className="mb-1.5 block text-sm font-medium text-foreground"
                    >
                      Name
                    </label>
                    <Input
                      id="domainName"
                      type="text"
                      value={domainName}
                      onChange={(e) => {
                        setDomainName(e.target.value);
                        if (error) setError("");
                      }}
                      placeholder="example.com"
                      className="mb-2 w-full font-mono text-sm"
                      aria-label="Domain Name"
                      disabled={isLoading || !!preloadedDomain} // Disable if preloaded
                    />
                    {error && (
                      <p className="mb-4 text-sm text-destructive">{error}</p>
                    )}

                    <Button
                      type="submit"
                      variant="primary"
                      className="mt-4 w-full md:w-auto"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader
                            width="16"
                            height="16"
                            className="mr-2 animate-spin"
                          />
                          Adding Domain...
                        </>
                      ) : (
                        <>
                          Add Domain{" "}
                          <ArrowBoldRight
                            width="16"
                            height="16"
                            className="ml-1.5"
                          />
                        </>
                      )}
                    </Button>
                  </form>

                  {/* Resend import section removed */}
                </div>
              )}

              {currentStepIdx === 1 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-lg font-semibold text-foreground">
                      {stepsConfig[1].name}
                    </h2>
                    {preloadedProvider && (
                      <div className="flex items-center gap-2">
                        {getProviderDocUrl(preloadedProvider) ? (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                window.open(
                                  getProviderDocUrl(preloadedProvider)!,
                                  "_blank"
                                )
                              }
                              className="flex items-center gap-2 text-sm border"
                            >
                              <Globe2 width="16" height="16" />
                              <span>{preloadedProvider} Setup Guide</span>
                            </Button>
                            <Popover>
                              <PopoverTrigger>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="flex items-center gap-2 text-sm border"
                                >
                                  <EnvelopeArrowRight width="16" height="16" />
                                  Send to IT Team
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent>
                                <form className="space-y-4 p-2" onSubmit={handleSend()}>
                                  <div>
                                    <Label htmlFor="name" className="block text-sm font-medium mb-2">
                                      Recipient Name (optional)
                                    </Label>
                                    <Input
                                      id="name"
                                      name="name"
                                      type="text"
                                      placeholder="IT Team"
                                      className="w-full px-3 py-2 border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor="email" className="block text-sm font-medium mb-2">
                                      Email Address
                                    </Label>
                                    <Input
                                      id="email"
                                      name="email"
                                      type="email"
                                      placeholder="it-team@company.com"
                                      className="w-full px-3 py-2 border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                                      required
                                    />
                                  </div>
                                  <Button type="submit" size="sm" className="w-full">
                                    Send Setup Instructions
                                  </Button>
                                </form>
                              </PopoverContent>
                            </Popover>
                          </>
                        ) : (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Globe2 width="16" height="16" />
                            <span>
                              Provider:{" "}
                              <span className="font-medium">
                                {preloadedProvider}
                              </span>
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="mb-6 text-sm text-muted-foreground">
                    {stepsConfig[1].description}
                  </p>

                  {/* Verification Status Indicator */}
                  {verificationStatus && (
                    <div
                      className={cn("mb-6 rounded-lg p-4 border", {
                        "bg-yellow-500/10 border-yellow-500/20 dark:bg-yellow-500/5":
                          verificationStatus === "pending",
                        "bg-green-500/10 border-green-500/20 dark:bg-green-500/5":
                          verificationStatus === "verified",
                        "bg-destructive/10 border-destructive/20 dark:bg-destructive/5":
                          verificationStatus === "failed",
                      })}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          {verificationStatus === "pending" && (
                            <>
                              <Clock2
                                width="16"
                                height="16"
                                className="text-yellow-600 mr-2"
                              />
                              <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
                                Verification Pending
                              </span>
                              {isRefreshing && (
                                <Loader
                                  width="16"
                                  height="16"
                                  className="ml-2 animate-spin text-yellow-600"
                                />
                              )}
                            </>
                          )}
                          {verificationStatus === "verified" && (
                            <>
                              <CircleCheck
                                width="16"
                                height="16"
                                className="text-green-600 mr-2"
                              />
                              <span className="text-sm font-medium text-green-700 dark:text-green-400">
                                Domain Verified
                              </span>
                            </>
                          )}
                          {verificationStatus === "failed" && (
                            <>
                              <CircleWarning2
                                width="16"
                                height="16"
                                className="text-destructive mr-2"
                              />
                              <span className="text-sm font-medium text-destructive">
                                Verification Failed
                              </span>
                            </>
                          )}
                        </div>

                        {/* Periodic Check Indicator */}
                        {periodicCheckEnabled &&
                          verificationStatus === "pending" && (
                            <div className="flex items-center text-xs text-yellow-600 dark:text-yellow-400">
                              <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2 animate-pulse"></div>
                              <span>Auto-checking every 5s</span>
                            </div>
                          )}
                      </div>

                      <p className="text-xs text-muted-foreground mt-1">
                        {verificationStatus === "pending" &&
                          !periodicCheckEnabled &&
                          "DNS records are being verified. This may take a few hours."}
                        {verificationStatus === "pending" &&
                          periodicCheckEnabled &&
                          "We're automatically checking your domain verification status. You'll be redirected once it's verified."}
                        {verificationStatus === "verified" &&
                          "Your domain has been successfully verified and is ready to use."}
                        {verificationStatus === "failed" &&
                          "Please check your DNS records and try again."}
                      </p>
                    </div>
                  )}

                  {/* Verification Status Summary / Success Banner */}
                  {dnsRecords.length > 0 && (
                    <div className="mb-4">
                      {(() => {
                        const verifiedCount = dnsRecords.filter(
                          (r) => r.isVerified
                        ).length;
                        const totalCount = dnsRecords.length;
                        const allVerified = verifiedCount === totalCount;

                        if (allVerified) {
                          return (
                            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-primary">
                              Well done! All the DNS records are verified. You
                              are ready to start building and sending emails
                              with this domain.
                            </div>
                          );
                        }

                        return (
                          <div
                            className={cn(
                              "rounded-lg p-4 border",
                              verifiedCount > 0
                                ? "bg-yellow-500/10 border-yellow-500/20 dark:bg-yellow-500/5"
                                : "bg-muted/50 border-border"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              {verifiedCount > 0 ? (
                                <>
                                  <Clock2
                                    width="20"
                                    height="20"
                                    className="text-yellow-600"
                                  />
                                  <div>
                                    <p className="font-medium text-yellow-700 dark:text-yellow-400">
                                      Partial verification ({verifiedCount}/
                                      {totalCount} records verified)
                                    </p>
                                    <p className="text-sm text-yellow-600 dark:text-yellow-500">
                                      {dnsRecords
                                        .filter((r) => !r.isVerified)
                                        .map((r) => r.type)
                                        .join(", ")}{" "}
                                      record
                                      {dnsRecords.filter((r) => !r.isVerified)
                                        .length > 1
                                        ? "s"
                                        : ""}{" "}
                                      still need
                                      {dnsRecords.filter((r) => !r.isVerified)
                                        .length > 1
                                        ? ""
                                        : "s"}{" "}
                                      to be configured.
                                    </p>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <CircleWarning2
                                    width="20"
                                    height="20"
                                    className="text-muted-foreground"
                                  />
                                  <div>
                                    <p className="font-medium text-foreground">
                                      DNS records not yet verified
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      Please add the DNS records below to your
                                      domain provider. Verification may take a
                                      few minutes after adding the records.
                                    </p>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  <div className="overflow-hidden border border-border rounded-lg">
                    {/* DNS Configuration Warning */}
                    {showDnsWarning && (
                      <div className="bg-yellow-500/10 border-b border-yellow-500/20 p-4">
                        <div className="flex items-start gap-2">
                          <CircleWarning2
                            width="16"
                            height="16"
                            className="text-yellow-600 mt-0.5 flex-shrink-0"
                          />
                          <div className="flex-1 text-sm">
                            <p className="font-medium text-yellow-700 dark:text-yellow-400 mb-1">
                              Important DNS Configuration Note
                            </p>
                            <p className="text-yellow-600 dark:text-yellow-500 mb-2">
                              When adding MX records, use only the mail server
                              hostname without your domain appended. For
                              example, use{" "}
                              <span className="font-mono">
                                inbound-smtp.us-east-2.amazonaws.com
                              </span>
                              NOT{" "}
                              <span className="font-mono">
                                inbound-smtp.us-east-2.amazonaws.com.
                                {domainName}
                              </span>
                            </p>
                            <p className="text-yellow-600 dark:text-yellow-500 text-xs">
                              Note: TXT records may take longer to propagate
                              than MX records. If TXT verification fails, please
                              wait a few minutes and try refreshing again.
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowDnsWarning(false)}
                            className="h-6 w-6 p-0 hover:bg-yellow-500/20 rounded text-yellow-600 hover:text-yellow-700 dark:hover:text-yellow-400"
                            aria-label="Dismiss DNS configuration note"
                          >
                            <span className="text-base font-medium leading-none">
                              ×
                            </span>
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Table Header */}
                    <div className="bg-muted/30 border-b border-border">
                      <div className="flex text-sm font-medium text-muted-foreground px-4 py-3">
                        <span className="w-[25%]">Record name</span>
                        <span className="w-[15%]">Type</span>
                        <span className="w-[10%]">TTL</span>
                        <span className="w-[30%]">Value</span>
                        <span className="w-[15%] text-right">Priority</span>
                      </div>
                    </div>

                    {/* Table Body */}
                    <div className="bg-card">
                      {dnsRecords.map((record, idx) => (
                        <div
                          key={`${record.type}-${idx}`}
                          className={cn("flex transition-colors px-4 py-3", {
                            "bg-green-500/10 hover:bg-green-500/20 dark:bg-green-500/5 dark:hover:bg-green-500/10":
                              record.isVerified,
                            "bg-card hover:bg-muted/50": !record.isVerified,
                            "border-b border-border/50":
                              idx < dnsRecords.length - 1,
                          })}
                        >
                          <div className="w-[25%] pr-4">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-sm truncate">
                                {extractRecordName(record.name, domainName)}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  copyToClipboard(
                                    extractRecordName(record.name, domainName)
                                  )
                                }
                                className="h-8 w-8 p-0 hover:bg-muted border border-border rounded flex-shrink-0 ml-2"
                              >
                                <Clipboard2
                                  width="16"
                                  height="16"
                                  className="text-muted-foreground"
                                />
                              </Button>
                            </div>
                          </div>
                          <div className="w-[15%] pr-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{record.type}</span>
                                {record.isVerified && (
                                  <CircleCheck
                                    width="16"
                                    height="16"
                                    className="text-green-600"
                                  />
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(record.type)}
                                className="h-8 w-8 p-0 hover:bg-muted border border-border rounded flex-shrink-0 ml-2"
                              >
                                <Clipboard2
                                  width="16"
                                  height="16"
                                  className="text-muted-foreground"
                                />
                              </Button>
                            </div>
                          </div>
                          <div className="w-[10%] pr-4">
                            <span className="text-sm">Auto</span>
                          </div>
                          <div className="w-[30%]">
                            <div className="flex items-center justify-between">
                              <span
                                className={cn(
                                  "font-mono text-sm truncate",
                                  record.isVerified
                                    ? "text-green-700 dark:text-green-400"
                                    : "opacity-50"
                                )}
                              >
                                {record.type === "MX" ? (
                                  <>
                                    {record.value.split(" ")[1]}
                                    {!record.isVerified &&
                                      record.value
                                        .split(" ")[1]
                                        .endsWith(`.${domainName}`) && (
                                        <span className="text-destructive ml-1">
                                          (Remove .{domainName})
                                        </span>
                                      )}
                                  </>
                                ) : (
                                  record.value
                                )}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  copyToClipboard(
                                    record.type === "MX"
                                      ? record.value.split(" ")[1]
                                      : record.value
                                  )
                                }
                                className="h-8 w-8 p-0 hover:bg-muted border border-border rounded flex-shrink-0 ml-2"
                              >
                                <Clipboard2
                                  width="16"
                                  height="16"
                                  className="text-muted-foreground"
                                />
                              </Button>
                            </div>
                          </div>
                          <div className="w-[15%] text-right ml-2">
                            <div className="flex items-center justify-end">
                              <span
                                className={cn(
                                  "text-sm",
                                  record.isVerified && record.type === "MX"
                                    ? "text-green-700 dark:text-green-400"
                                    : ""
                                )}
                              >
                                {record.type === "MX"
                                  ? record.value.split(" ")[0]
                                  : ""}
                              </span>
                              {record.type === "MX" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    copyToClipboard(
                                      record.type === "MX"
                                        ? record.value.split(" ")[0]
                                        : ""
                                    )
                                  }
                                  className="h-8 w-8 p-0 hover:bg-muted border border-border rounded flex-shrink-0 ml-2"
                                >
                                  <Clipboard2
                                    width="16"
                                    height="16"
                                    className="text-muted-foreground"
                                  />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {dnsRecords.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                          No DNS records available yet.
                        </div>
                      )}
                    </div>
                  </div>

                  {error && (
                    <p className="mt-4 text-sm text-destructive">{error}</p>
                  )}
                </div>
              )}

              {currentStepIdx === 2 && (
                <div className="text-center py-8">
                  <BadgeCheck2
                    width="80"
                    height="80"
                    className="mx-auto mb-5 text-green-600"
                  />
                  <h2 className="mb-2 text-2xl font-semibold text-foreground">
                    Domain Verified!
                  </h2>
                  <p className="text-muted-foreground mb-1">
                    Your domain{" "}
                    <span className="font-semibold text-foreground">
                      {domainName}
                    </span>{" "}
                    is now ready.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {stepsConfig[2].description}
                  </p>
                  <div className="flex gap-4 justify-center mt-10">
                    <Button
                      onClick={() => router.push("/emails")}
                      variant="primary"
                    >
                      View Domains
                    </Button>
                    <Button
                      onClick={() => {
                        setCurrentStepIdx(0);
                        setDomainName("");
                        setDnsRecords([]);
                        setDomainId("");
                        setError("");
                      }}
                      variant="secondary"
                    >
                      Add Another Domain
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
