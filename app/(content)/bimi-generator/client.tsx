"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CopyButton } from "@/components/copy-button"
import Link from "next/link"

// Nucleo icons
import ShieldCheck from "@/components/icons/shield-check"
import Check2 from "@/components/icons/check-2"
import CircleXmark from "@/components/icons/circle-xmark"
import InboundIcon from "@/components/icons/inbound"

export default function BimiGeneratorClient() {
  const [domain, setDomain] = useState("")
  const [svgUrl, setSvgUrl] = useState("")
  const [pemUrl, setPemUrl] = useState("")
  const [bimiRecord, setBimiRecord] = useState("")
  const [dnsHost, setDnsHost] = useState("")
  const [dnsValue, setDnsValue] = useState("")

  useEffect(() => {
    generateBimiRecord()
  }, [domain, svgUrl, pemUrl])

  const generateBimiRecord = () => {
    if (!domain || !svgUrl) {
      setBimiRecord("")
      setDnsHost("")
      setDnsValue("")
      return
    }

    // Clean domain (remove protocol, www, trailing dots)
    const cleanDomain = domain
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/$/, "")
      .trim()

    // Generate DNS host
    const host = `default._bimi.${cleanDomain}`
    
    // Generate DNS value
    const value = pemUrl 
      ? `v=BIMI1; l=${svgUrl}; a=${pemUrl};`
      : `v=BIMI1; l=${svgUrl};`

    // Full record for display
    const fullRecord = `${host} IN TXT "${value}"`

    setBimiRecord(fullRecord)
    setDnsHost(host)
    setDnsValue(value)
  }

  const validateUrl = (url: string): boolean => {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  const isSvgUrlValid = svgUrl ? validateUrl(svgUrl) : false
  const isPemUrlValid = pemUrl ? validateUrl(pemUrl) || pemUrl === "" : true
  const isDomainValid = domain ? /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?(\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?)*\.[a-zA-Z]{2,}$/.test(domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "")) : false

  return (
    <div className="min-h-screen bg-white">
      <main className="px-6 py-20">
        <div className="max-w-5xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-100 rounded-2xl mb-6">
              <ShieldCheck width="40" height="40" className="text-blue-600" />
            </div>
            
            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              BIMI DNS Record
              <br />
              <span className="text-[#1C2894]">Generator</span>
            </h1>
            
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto leading-relaxed">
              Generate Brand Indicators for Message Identification (BIMI) DNS records to display your 
              verified logo in supported email clients like Gmail and Yahoo Mail.
            </p>
          </div>

          {/* Generator Card */}
          <Card className="mb-12">
            <CardHeader>
              <CardTitle className="text-2xl">Generate Your BIMI Record</CardTitle>
              <CardDescription>
                Fill in your domain and logo details to generate a BIMI DNS record
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Domain Input */}
              <div className="space-y-2">
                <Label htmlFor="domain" className="text-base font-semibold">
                  Domain Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="domain"
                  type="text"
                  placeholder="example.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className={domain && !isDomainValid ? "border-red-500" : ""}
                />
                <p className="text-sm text-gray-500">
                  Your email sending domain (e.g., example.com)
                </p>
                {domain && !isDomainValid && (
                  <p className="text-sm text-red-500 flex items-center gap-1">
                    <CircleXmark width="14" height="14" />
                    Please enter a valid domain name
                  </p>
                )}
              </div>

              {/* SVG URL Input */}
              <div className="space-y-2">
                <Label htmlFor="svgUrl" className="text-base font-semibold">
                  SVG Logo URL <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="svgUrl"
                  type="url"
                  placeholder="https://example.com/logo.svg"
                  value={svgUrl}
                  onChange={(e) => setSvgUrl(e.target.value)}
                  className={svgUrl && !isSvgUrlValid ? "border-red-500" : ""}
                />
                <p className="text-sm text-gray-500">
                  Public HTTPS URL to your SVG Tiny PS logo file (square, &lt;32KB)
                </p>
                {svgUrl && !isSvgUrlValid && (
                  <p className="text-sm text-red-500 flex items-center gap-1">
                    <CircleXmark width="14" height="14" />
                    Please enter a valid HTTPS URL
                  </p>
                )}
              </div>

              {/* PEM URL Input (Optional) */}
              <div className="space-y-2">
                <Label htmlFor="pemUrl" className="text-base font-semibold">
                  VMC Certificate URL (Optional)
                </Label>
                <Input
                  id="pemUrl"
                  type="url"
                  placeholder="https://example.com/certificate.pem"
                  value={pemUrl}
                  onChange={(e) => setPemUrl(e.target.value)}
                  className={pemUrl && !isPemUrlValid ? "border-red-500" : ""}
                />
                <p className="text-sm text-gray-500">
                  URL to your Verified Mark Certificate (PEM format) - Required for Gmail
                </p>
                {pemUrl && !isPemUrlValid && (
                  <p className="text-sm text-red-500 flex items-center gap-1">
                    <CircleXmark width="14" height="14" />
                    Please enter a valid HTTPS URL
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Generated Records */}
          {bimiRecord && isDomainValid && isSvgUrlValid && (
            <div className="space-y-6 mb-12">
              {/* Full Record */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl flex items-center justify-between">
                    Generated BIMI Record
                    <CopyButton text={bimiRecord} label="BIMI record" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-900 rounded-xl p-4 overflow-x-auto">
                    <code className="text-sm text-green-400 font-mono whitespace-pre">
                      {bimiRecord}
                    </code>
                  </div>
                </CardContent>
              </Card>

              {/* DNS Instructions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl">Add to Your DNS</CardTitle>
                  <CardDescription>
                    Add these values as a TXT record in your DNS provider
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* DNS Host */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">Host / Name</Label>
                      <CopyButton text={dnsHost} label="host" />
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <code className="text-sm font-mono text-gray-800 break-all">
                        {dnsHost}
                      </code>
                    </div>
                  </div>

                  {/* DNS Value */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">Value / Data</Label>
                      <CopyButton text={dnsValue} label="value" />
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <code className="text-sm font-mono text-gray-800 break-all">
                        {dnsValue}
                      </code>
                    </div>
                  </div>

                  {/* DNS Type */}
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">Record Type</Label>
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <code className="text-sm font-mono text-gray-800">TXT</code>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Requirements Section */}
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Prerequisites</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <Check2 width="16" height="16" className="text-green-500 mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900">DMARC with Enforcement</p>
                    <p className="text-sm text-gray-600">
                      Must have <code className="bg-gray-100 px-1 rounded">p=quarantine</code> or{" "}
                      <code className="bg-gray-100 px-1 rounded">p=reject</code>
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Check2 width="16" height="16" className="text-green-500 mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900">SPF & DKIM Aligned</p>
                    <p className="text-sm text-gray-600">Both must pass and align with your domain</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Check2 width="16" height="16" className="text-green-500 mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900">SVG Tiny PS Logo</p>
                    <p className="text-sm text-gray-600">Square aspect ratio, solid background, &lt;32KB</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Check2 width="16" height="16" className="text-green-500 mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900">Public HTTPS URL</p>
                    <p className="text-sm text-gray-600">Logo must be accessible via HTTPS</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Email Client Support</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <Check2 width="16" height="16" className="text-green-500 mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900">Gmail (VMC Required)</p>
                    <p className="text-sm text-gray-600">
                      Requires Verified Mark Certificate from DigiCert or Entrust
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Check2 width="16" height="16" className="text-green-500 mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900">Yahoo Mail</p>
                    <p className="text-sm text-gray-600">Supports BIMI with or without VMC</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Check2 width="16" height="16" className="text-green-500 mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900">AOL Mail</p>
                    <p className="text-sm text-gray-600">Part of Verizon Media, supports BIMI</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Check2 width="16" height="16" className="text-green-500 mt-1 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-900">Fastmail</p>
                    <p className="text-sm text-gray-600">Growing support for BIMI standard</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Logo Requirements */}
          <Card className="mb-12">
            <CardHeader>
              <CardTitle className="text-xl">Logo Requirements</CardTitle>
              <CardDescription>
                Your logo must meet these specifications for BIMI
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Format Requirements</h4>
                    <ul className="space-y-2 text-sm text-gray-600">
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        SVG Tiny PS (Portable/Secure) format
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        File size under 32 kilobytes
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        Square aspect ratio (1:1)
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        Solid background color (not transparent)
                      </li>
                    </ul>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-2">Design Best Practices</h4>
                    <ul className="space-y-2 text-sm text-gray-600">
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        Center your logo with padding around edges
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        May appear in rounded or circular frames
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        Use simple, recognizable design
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        Match your brand identity consistently
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Implementation Steps */}
          <Card className="mb-12">
            <CardHeader>
              <CardTitle className="text-xl">Implementation Steps</CardTitle>
              <CardDescription>
                Follow these steps to successfully implement BIMI
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                    1
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1">Configure Email Authentication</h4>
                    <p className="text-sm text-gray-600">
                      Set up SPF, DKIM, and DMARC with enforcement policy (quarantine or reject) on your domain.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                    2
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1">Create SVG Tiny PS Logo</h4>
                    <p className="text-sm text-gray-600">
                      Convert your logo to SVG Tiny PS format with square dimensions, solid background, and under 32KB.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                    3
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1">Host Logo File</h4>
                    <p className="text-sm text-gray-600">
                      Upload your SVG file to a publicly accessible HTTPS URL on your domain.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                    4
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1">Get VMC (Optional but Recommended)</h4>
                    <p className="text-sm text-gray-600">
                      Obtain a Verified Mark Certificate from DigiCert or Entrust for Gmail support (~$1,500/year).
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                    5
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1">Add BIMI DNS Record</h4>
                    <p className="text-sm text-gray-600">
                      Use this generator to create your BIMI record and add it to your DNS as a TXT record.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                    6
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1">Verify Setup</h4>
                    <p className="text-sm text-gray-600">
                      Wait 24-48 hours for DNS propagation, then test by sending emails and checking supported inboxes.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Resources */}
          <Card className="mb-12">
            <CardHeader>
              <CardTitle className="text-xl">Helpful Resources</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <a 
                href="https://bimigroup.org/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
              >
                <p className="font-semibold text-gray-900">BIMI Group Official Site</p>
                <p className="text-sm text-gray-600">Complete specifications and validator tools</p>
              </a>
              <a 
                href="https://bimigroup.org/bimi-generator/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
              >
                <p className="font-semibold text-gray-900">BIMI Inspector</p>
                <p className="text-sm text-gray-600">Validate your BIMI implementation</p>
              </a>
              <a 
                href="https://www.digicert.com/faq/bimi/what-is-bimi" 
                target="_blank" 
                rel="noopener noreferrer"
                className="block p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
              >
                <p className="font-semibold text-gray-900">DigiCert VMC Information</p>
                <p className="text-sm text-gray-600">Learn about Verified Mark Certificates</p>
              </a>
            </CardContent>
          </Card>

          {/* CTA Section */}
          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Need Help with Email Authentication?
            </h2>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              inbound provides automated email authentication setup with DMARC, SPF, and DKIM 
              configuration to help you implement BIMI faster.
            </p>
            
            <div className="flex items-center gap-4 justify-center">
              <Button variant="primary" asChild>
                <Link href="/add">
                  Get Started Free
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/">
                  Learn More
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center gap-2 mb-4 md:mb-0">
            <InboundIcon width={24} height={24} />
            <span className="text-lg font-bold text-gray-900">inbound</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <a href="https://twitter.com/intent/follow?screen_name=inboundemail" className="hover:text-gray-700 transition-colors flex items-center gap-1">
              Contact us on
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 1200 1227">
                <path fill="#000" d="M714.163 519.284 1160.89 0h-105.86L667.137 450.887 357.328 0H0l468.492 681.821L0 1226.37h105.866l409.625-476.152 327.181 476.152H1200L714.137 519.284h.026ZM569.165 687.828l-47.468-67.894-377.686-540.24h162.604l304.797 435.991 47.468 67.894 396.2 566.721H892.476L569.165 687.854v-.026Z" />
              </svg>
            </a>
            <a href="https://discord.gg/JVdUrY9gJZ" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700 transition-colors flex items-center gap-1">
              Discord
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0002 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9554 2.4189-2.1568 2.4189Z"/>
              </svg>
            </a>
            <a href="/privacy" className="hover:text-gray-700 transition-colors">Privacy</a>
            <a href="/terms" className="hover:text-gray-700 transition-colors">Terms</a>
            <a href="/docs" className="hover:text-gray-700 transition-colors">Docs</a>
            <a href="mailto:support@inbound.exon.dev" className="hover:text-gray-700 transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

