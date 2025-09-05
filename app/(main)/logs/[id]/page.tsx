import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'

import { auth } from '@/lib/auth/auth'
import { db } from '@/lib/db'
import { structuredEmails, sentEmails, endpointDeliveries, endpoints, sesEvents } from '@/lib/db/schema'
import { and, eq, desc } from 'drizzle-orm'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'

// Nucleo icons
import ArchiveDownload from '@/components/icons/archive-download'
import ArchiveExport from '@/components/icons/archive-export'
import ShieldCheck from '@/components/icons/shield-check'
import Ban2 from '@/components/icons/ban-2'
import Hashtag2 from '@/components/icons/hashtag-2'
import ArrowBoldLeft from '@/components/icons/arrow-bold-left'

import { format } from 'date-fns'

import type { GetMailByIdResponse } from '@/app/api/v2/mail/[id]/route'
import type { GetEmailByIdResponse } from '@/app/api/v2/emails/[id]/route'

// Import the attachment list component
import { AttachmentList } from '@/components/logs/attachment-list'
import { CodeBlock } from '@/components/ui/code-block'

export default async function LogDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    redirect('/login')
  }

  const userId = session.user.id

  // Determine if this ID corresponds to an inbound (structuredEmails) or outbound (sentEmails) record
  const [inbound] = await db
    .select({ id: structuredEmails.id })
    .from(structuredEmails)
    .where(and(eq(structuredEmails.id, id), eq(structuredEmails.userId, userId)))
    .limit(1)

  let type: 'inbound' | 'outbound' | null = null
  if (inbound) {
    type = 'inbound'
  } else {
    const [outbound] = await db
      .select({ id: sentEmails.id })
      .from(sentEmails)
      .where(and(eq(sentEmails.id, id), eq(sentEmails.userId, userId)))
      .limit(1)
    if (outbound) type = 'outbound'
  }

  if (!type) {
    return (
      <div className="p-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/logs">
              <Button variant="primary">
                <ArrowBoldLeft className="h-4 w-4 mr-2" />
                Back to Logs
              </Button>
            </Link>
          </div>
          <Card className="border-destructive/50 bg-destructive/10 rounded-xl">
            <CardContent className="p-6">
              <div className="text-destructive">Log not found</div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Fetch rich details based on type
  let inboundDetails: (GetMailByIdResponse & { deliveries?: Array<any> }) | null = null
  let outboundDetails: (GetEmailByIdResponse & { provider?: string; status?: string; failureReason?: string | null; providerResponse?: any }) | null = null

  if (type === 'inbound') {
    // Get full inbound email details by reusing the same projection as the API
    const details = await db
      .select({
        // structured
        id: structuredEmails.id,
        emailId: structuredEmails.emailId,
        messageId: structuredEmails.messageId,
        subject: structuredEmails.subject,
        fromData: structuredEmails.fromData,
        toData: structuredEmails.toData,
        ccData: structuredEmails.ccData,
        bccData: structuredEmails.bccData,
        replyToData: structuredEmails.replyToData,
        textBody: structuredEmails.textBody,
        htmlBody: structuredEmails.htmlBody,
        rawContent: structuredEmails.rawContent,
        attachments: structuredEmails.attachments,
        headers: structuredEmails.headers,
        priority: structuredEmails.priority,
        parseSuccess: structuredEmails.parseSuccess,
        parseError: structuredEmails.parseError,
        createdAt: structuredEmails.createdAt,
        updatedAt: structuredEmails.updatedAt,
        date: structuredEmails.date,
        readAt: structuredEmails.readAt,

        // ses
        spamVerdict: sesEvents.spamVerdict,
        virusVerdict: sesEvents.virusVerdict,
        spfVerdict: sesEvents.spfVerdict,
        dkimVerdict: sesEvents.dkimVerdict,
        dmarcVerdict: sesEvents.dmarcVerdict,
        processingTimeMillis: sesEvents.processingTimeMillis,
        timestamp: sesEvents.timestamp,
        receiptTimestamp: sesEvents.receiptTimestamp,
        commonHeaders: sesEvents.commonHeaders,
      })
      .from(structuredEmails)
      .leftJoin(sesEvents, eq(structuredEmails.sesEventId, sesEvents.id))
      .where(and(eq(structuredEmails.id, id), eq(structuredEmails.userId, userId)))
      .limit(1)

    if (details.length === 0) {
      redirect('/logs')
    }

    const row = details[0]
    const safeParse = (s: string | null) => {
      if (!s) return null
      try { return JSON.parse(s) } catch { return null }
    }

    const fromParsed = safeParse(row.fromData)
    const toParsed = safeParse(row.toData)
    const ccParsed = safeParse(row.ccData)
    const bccParsed = safeParse(row.bccData)
    const replyToParsed = safeParse(row.replyToData)
    const attachmentsParsed = safeParse(row.attachments) || []
    const headersParsed = safeParse(row.headers) || {}
    const commonHeadersParsed = safeParse(row.commonHeaders)

    // Fetch deliveries for this inbound email (by emailId)
    const deliveriesRaw = await db
      .select({
        id: endpointDeliveries.id,
        status: endpointDeliveries.status,
        deliveryType: endpointDeliveries.deliveryType,
        attempts: endpointDeliveries.attempts,
        lastAttemptAt: endpointDeliveries.lastAttemptAt,
        responseData: endpointDeliveries.responseData,
        endpointName: endpoints.name,
        endpointType: endpoints.type,
        endpointConfig: endpoints.config,
      })
      .from(endpointDeliveries)
      .leftJoin(endpoints, eq(endpointDeliveries.endpointId, endpoints.id))
      .where(eq(endpointDeliveries.emailId, row.emailId))
      .orderBy(desc(endpointDeliveries.lastAttemptAt))

    const deliveries = deliveriesRaw.map(d => {
      let parsedResponse: any = null
      let parsedConfig: any = null
      try { parsedResponse = d.responseData ? JSON.parse(d.responseData as unknown as string) : null } catch {}
      try { parsedConfig = d.endpointConfig ? JSON.parse(d.endpointConfig as unknown as string) : null } catch {}
      return {
        id: d.id,
        type: d.deliveryType || 'unknown',
        status: d.status || 'unknown',
        attempts: d.attempts || 0,
        lastAttemptAt: d.lastAttemptAt?.toISOString() || null,
        responseData: parsedResponse,
        config: {
          name: d.endpointName || 'Unknown Endpoint',
          type: d.endpointType || 'unknown',
          config: parsedConfig,
        }
      }
    })

    inboundDetails = {
      id: row.id,
      emailId: row.id, // keep consistent for links; primary id
      messageId: row.messageId,
      subject: row.subject,
      from: fromParsed?.addresses?.[0]?.address || 'unknown',
      fromName: fromParsed?.addresses?.[0]?.name || null,
      to: toParsed?.text || '',
      cc: ccParsed?.text || null,
      bcc: bccParsed?.text || null,
      replyTo: replyToParsed?.text || null,
      recipient: toParsed?.addresses?.[0]?.address || 'unknown',
      receivedAt: row.date || row.createdAt,
      isRead: true,
      readAt: row.readAt || row.createdAt,
      content: {
        textBody: row.textBody,
        htmlBody: row.htmlBody,
        rawContent: row.rawContent,
        attachments: attachmentsParsed,
        headers: headersParsed,
      },
      addresses: {
        from: fromParsed,
        to: toParsed,
        cc: ccParsed,
        bcc: bccParsed,
        replyTo: replyToParsed,
      },
      metadata: {
        inReplyTo: null,
        references: [],
        priority: row.priority,
        parseSuccess: row.parseSuccess,
        parseError: row.parseError,
        hasAttachments: attachmentsParsed.length > 0,
        attachmentCount: attachmentsParsed.length,
        hasTextBody: !!row.textBody,
        hasHtmlBody: !!row.htmlBody,
      },
      security: {
        spf: row.spfVerdict || 'UNKNOWN',
        dkim: row.dkimVerdict || 'UNKNOWN',
        dmarc: row.dmarcVerdict || 'UNKNOWN',
        spam: row.spamVerdict || 'UNKNOWN',
        virus: row.virusVerdict || 'UNKNOWN',
      },
      processing: {
        processingTimeMs: row.processingTimeMillis,
        timestamp: row.timestamp,
        receiptTimestamp: row.receiptTimestamp,
        actionType: null,
        s3Info: {
          bucketName: null,
          objectKey: null,
          contentFetched: null,
          contentSize: null,
          error: null,
        },
        commonHeaders: commonHeadersParsed,
      },
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      deliveries,
    }
  } else {
    // Outbound details from DB (richer than the API-only shape)
    const details = await db
      .select({
        id: sentEmails.id,
        from: sentEmails.from,
        to: sentEmails.to,
        cc: sentEmails.cc,
        bcc: sentEmails.bcc,
        replyTo: sentEmails.replyTo,
        subject: sentEmails.subject,
        htmlBody: sentEmails.htmlBody,
        textBody: sentEmails.textBody,
        createdAt: sentEmails.createdAt,
        status: sentEmails.status,
        provider: sentEmails.provider,
        providerResponse: sentEmails.providerResponse,
        failureReason: sentEmails.failureReason,
        sentAt: sentEmails.sentAt,
      })
      .from(sentEmails)
      .where(and(eq(sentEmails.id, id), eq(sentEmails.userId, userId)))
      .limit(1)

    if (details.length === 0) {
      redirect('/logs')
    }

    const row = details[0]
    const parseJSON = (s: string | null) => { try { return s ? JSON.parse(s) : [] } catch { return [] } }
    const to = parseJSON(row.to)
    const cc = parseJSON(row.cc)
    const bcc = parseJSON(row.bcc)
    const reply_to = parseJSON(row.replyTo)
    let providerResponse: any = null
    try { providerResponse = row.providerResponse ? JSON.parse(row.providerResponse) : null } catch {}

    outboundDetails = {
      object: 'email',
      id: row.id,
      to,
      from: row.from,
      created_at: row.createdAt?.toISOString() || new Date().toISOString(),
      subject: row.subject || 'No Subject',
      html: row.htmlBody,
      text: row.textBody,
      bcc: bcc.length ? bcc : [null],
      cc: cc.length ? cc : [null],
      reply_to: reply_to.length ? reply_to : [null],
      last_event: row.status === 'sent' ? 'delivered' : row.status || 'created',
      provider: row.provider || undefined,
      status: row.status || undefined,
      failureReason: row.failureReason || null,
      providerResponse,
    }
  }

  const isInbound = type === 'inbound'

  return (
    <div className="p-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/logs">
            <Button variant="primary">
              <ArrowBoldLeft className="h-4 w-4 mr-2" />
              Back to Logs
            </Button>
          </Link>
          <Badge variant={isInbound ? "secondary" : "default"} className="px-2.5 py-0.5">
            {isInbound ? 'Inbound' : 'Outbound'}
          </Badge>
        </div>

        <Card className="rounded-xl overflow-hidden mb-4">
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {isInbound ? (
                    <ArchiveDownload width="16" height="16" className="text-purple-600" />
                  ) : (
                    <ArchiveExport width="16" height="16" className="text-blue-600" />
                  )}
                  <h1 className="text-xl font-semibold tracking-tight">{(isInbound ? inboundDetails?.subject : outboundDetails?.subject) || 'No Subject'}</h1>
                </div>
                <div className="text-sm text-muted-foreground">
                  {(isInbound ? inboundDetails?.from : outboundDetails?.from) || 'unknown'} → {isInbound ? inboundDetails?.recipient : outboundDetails?.to?.[0]}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Card className="rounded-xl overflow-hidden">
              <CardContent className="p-6">
                <h3 className="text-sm font-semibold mb-3">Email Content</h3>
                <Tabs defaultValue="html" className="w-full">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="html">HTML</TabsTrigger>
                    <TabsTrigger value="text">Text</TabsTrigger>
                    <TabsTrigger value="raw">Raw</TabsTrigger>
                  </TabsList>
                  <TabsContent value="html" className="space-y-2">
                    {(isInbound ? inboundDetails?.content?.htmlBody : outboundDetails?.html) ? (
                      <div className="border rounded-lg p-4 bg-muted/20 max-h-[640px] overflow-auto">
                        <iframe
                          srcDoc={`<html><head><link href=\"https://fonts.googleapis.com/css2?family=Outfit:wght@100;200;300;400;500;600;700;800;900&display=swap\" rel=\"stylesheet\"><style>body{font-family:'Outfit',Arial,Helvetica,sans-serif;color:white;background-color:transparent;margin:0;padding:16px;}*{font-family:'Outfit',Arial,Helvetica,sans-serif;font-weight:400;color:white;}a{color:#60a5fa !important;}</style></head><body>${isInbound ? inboundDetails?.content?.htmlBody || '' : outboundDetails?.html || ''}</body></html>`}
                          className="w-full min-h-[300px] border-0"
                          sandbox="allow-same-origin"
                          title="Email HTML Content"
                        />
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No HTML content available</p>
                    )}
                  </TabsContent>
                  <TabsContent value="text" className="space-y-2">
                    {(isInbound ? inboundDetails?.content?.textBody : outboundDetails?.text) ? (
                      <pre className="text-sm bg-muted p-4 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-[640px] overflow-y-auto">{isInbound ? inboundDetails?.content?.textBody : outboundDetails?.text}</pre>
                    ) : (
                      <p className="text-sm text-muted-foreground">No text content available</p>
                    )}
                  </TabsContent>
                  <TabsContent value="raw" className="space-y-2">
                    {isInbound && inboundDetails?.content?.rawContent ? (
                      <pre className="text-xs bg-muted p-4 rounded-lg overflow-x-auto font-mono max-h-[640px] overflow-y-auto">{inboundDetails?.content?.rawContent}</pre>
                    ) : (
                      <p className="text-sm text-muted-foreground">{isInbound ? 'Raw content not available' : 'Raw content not available (outbound emails only store HTML/text)'}</p>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {isInbound && inboundDetails?.deliveries && (
              <Card className="rounded-xl overflow-hidden">
                <CardContent className="p-6">
                  <h3 className="text-sm font-semibold mb-3">Delivery Information</h3>
                  {inboundDetails.deliveries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No delivery configured for this email</p>
                  ) : (
                    <div className="divide-y divide-border rounded-lg border">
                      {inboundDetails.deliveries.map((delivery: any, idx: number) => (
                        <div key={delivery.id} className="p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-medium text-foreground">{delivery.config?.name || 'Unknown Endpoint'}</h4>
                              <p className="text-sm text-muted-foreground">{delivery.type === 'webhook' ? 'Webhook' : 'Email Forward'}</p>
                            </div>
                            <Badge 
                              variant={delivery.status === 'success' ? 'default' : delivery.status === 'failed' ? 'destructive' : 'secondary'}
                              className={delivery.status === 'success' ? 'bg-green-500/10 text-green-600 border-green-500/20' : delivery.status === 'failed' ? '' : 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'}
                            >
                              {String(delivery.status).toUpperCase()}
                            </Badge>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Attempts:</span>
                              <p className="font-medium">{delivery.attempts}</p>
                            </div>
                            {delivery.lastAttemptAt && (
                              <div>
                                <span className="text-muted-foreground">Last Attempt:</span>
                                <p className="font-medium">{format(new Date(delivery.lastAttemptAt), 'PPp')}</p>
                              </div>
                            )}
                          </div>
                          {delivery.responseData && (
                            <div className="mt-3">
                              <div className="text-muted-foreground text-xs mb-1">Response Data:</div>
                              <CodeBlock
                                code={JSON.stringify(delivery.responseData, null, 2)}
                                size="sm"
                                variant="default"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <Card className="rounded-xl overflow-hidden">
              <CardContent className="p-6">
                <h3 className="text-sm font-semibold mb-3">Details</h3>
                <div className="space-y-4 text-sm">
                  {/* Email ID - prominently displayed at the top */}
                  <div className="pb-2 border-b border-border space-y-3">
                    <div>
                      <span className="text-muted-foreground">{isInbound ? "Inbound Email ID" : "Outbound Email ID"}:</span>
                      <div className="mt-1">
                        <CodeBlock code={id} size="lg" />
                      </div>
                    </div>
                    {((isInbound && inboundDetails?.messageId) || (outboundDetails && 'id' in outboundDetails)) && (
                      <div>
                        <span className="text-muted-foreground">Message ID:</span>
                        <div className="mt-1">
                          <CodeBlock code={isInbound ? inboundDetails?.messageId || '' : outboundDetails?.id || ''} size="lg" />
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-muted-foreground">From:</span>
                      <p className="font-medium">{isInbound ? inboundDetails?.from : outboundDetails?.from}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">To:</span>
                      <div className="font-medium">
                        {isInbound ? (
                          inboundDetails?.recipient
                        ) : (
                          outboundDetails?.to?.map((r, i) => <div key={i}>{r}</div>)
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Subject:</span>
                      <p className="font-medium">{(isInbound ? inboundDetails?.subject : outboundDetails?.subject) || 'No Subject'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Date:</span>
                      <p className="font-medium">{format(new Date(isInbound ? (inboundDetails?.receivedAt || inboundDetails?.createdAt || new Date()) : (outboundDetails?.created_at || new Date())), 'PPpp')}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {isInbound ? (
              <Card className="rounded-xl overflow-hidden">
                <CardContent className="p-6">
                  <h3 className="text-sm font-semibold mb-3">Authentication</h3>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={inboundDetails?.security.spf === 'PASS' ? 'default' : 'destructive'} className={inboundDetails?.security.spf === 'PASS' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}>
                      {inboundDetails?.security.spf === 'PASS' ? <ShieldCheck width="12" height="12" className="mr-1" /> : <Ban2 width="12" height="12" className="mr-1" />} SPF: {inboundDetails?.security.spf}
                    </Badge>
                    <Badge variant={inboundDetails?.security.dkim === 'PASS' ? 'default' : 'destructive'} className={inboundDetails?.security.dkim === 'PASS' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}>
                      {inboundDetails?.security.dkim === 'PASS' ? <ShieldCheck width="12" height="12" className="mr-1" /> : <Ban2 width="12" height="12" className="mr-1" />} DKIM: {inboundDetails?.security.dkim}
                    </Badge>
                    <Badge variant={inboundDetails?.security.dmarc === 'PASS' ? 'default' : 'destructive'} className={inboundDetails?.security.dmarc === 'PASS' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}>
                      {inboundDetails?.security.dmarc === 'PASS' ? <ShieldCheck width="12" height="12" className="mr-1" /> : <Ban2 width="12" height="12" className="mr-1" />} DMARC: {inboundDetails?.security.dmarc}
                    </Badge>
                    <Badge variant={inboundDetails?.security.spam === 'PASS' ? 'default' : 'destructive'} className={inboundDetails?.security.spam === 'PASS' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}>
                      Spam: {inboundDetails?.security.spam}
                    </Badge>
                    <Badge variant={inboundDetails?.security.virus === 'PASS' ? 'default' : 'destructive'} className={inboundDetails?.security.virus === 'PASS' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}>
                      Virus: {inboundDetails?.security.virus}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="rounded-xl overflow-hidden">
                <CardContent className="p-6">
                  <h3 className="text-sm font-semibold mb-3">Sending Details</h3>
                  <div className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-muted-foreground">Status:</span>
                        <p className="font-medium capitalize">{outboundDetails?.status}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Provider:</span>
                        <p className="font-medium uppercase">{outboundDetails?.provider}</p>
                      </div>
                    </div>
                    {outboundDetails?.failureReason && (
                      <div className="p-3 bg-destructive/10 rounded-lg text-destructive">
                        {outboundDetails.failureReason}
                      </div>
                    )}
                    {outboundDetails?.providerResponse && (
                      <div>
                        <div className="text-muted-foreground text-xs mb-1">Provider Response:</div>
                        <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">{JSON.stringify(outboundDetails.providerResponse, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {isInbound && inboundDetails?.content?.attachments && inboundDetails.content.attachments.length > 0 && (
              <Card className="rounded-xl overflow-hidden">
                <CardContent className="p-6">
                  <h3 className="text-sm font-semibold mb-3">Attachments ({inboundDetails.content.attachments.length})</h3>
                  <AttachmentList 
                    emailId={inboundDetails.id} 
                    attachments={inboundDetails.content.attachments}
                  />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


