import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import File2 from '@/components/icons/file-2'
import Filter2 from '@/components/icons/filter-2'
import Magnifier2 from '@/components/icons/magnifier-2'
import Eye2 from '@/components/icons/eye-2'
import Link from 'next/link'
import { format } from 'date-fns'
import { getRecentEmails } from '@/app/actions/analytics'

export async function EmailLogsCard() {
  const recentRes = await getRecentEmails({ limit: 100, days: 7 })
  if (!recentRes.success) {
    return (
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Email Processing Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Failed to load email logs.</div>
        </CardContent>
      </Card>
    )
  }

  const recentEmails = recentRes.data.recentEmails

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2 text-foreground">
            <File2 width="16" height="16" className="text-muted-foreground" />
            Email Processing Logs ({recentEmails.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-auto p-1 text-xs">
              <Filter2 width="12" height="12" className="mr-1" />
              Filter
            </Button>
            <Button variant="ghost" size="sm" className="h-auto p-1 text-xs">
              <Magnifier2 width="12" height="12" className="mr-1" />
              Search
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {recentEmails.slice(0, 20).map((email) => (
            <div key={email.id} className="border border-border rounded-lg p-3 hover:bg-muted/50 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground font-mono w-16 flex-shrink-0 mt-0.5">
                    {format(new Date(email.receivedAt), 'HH:mm:ss')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge 
                        variant="secondary" 
                        className={`text-xs ${
                          email.status === 'forwarded' ? 'bg-green-500/20 text-green-500 border-green-500/20' :
                          email.status === 'failed' ? 'bg-destructive/20 text-destructive border-destructive/20' :
                          email.status === 'processing' ? 'bg-amber-500/20 text-amber-500 border-amber-500/20' :
                          'bg-blue-500/20 text-blue-500 border-blue-500/20'
                        }`}>
                        {email.status.toUpperCase()}
                      </Badge>
                      {email.contentSize && (
                        <Badge variant="secondary" className="bg-muted text-muted-foreground border-border text-xs">
                          {Math.round(email.contentSize / 1024)}KB
                        </Badge>
                      )}
                      <div className="flex gap-1">
                        {email.authResults.spf === 'PASS' && (
                          <Badge variant="secondary" className="bg-green-500/20 text-green-500 border-green-500/20 text-xs">SPF</Badge>
                        )}
                        {email.authResults.dkim === 'PASS' && (
                          <Badge variant="secondary" className="bg-green-500/20 text-green-500 border-green-500/20 text-xs">DKIM</Badge>
                        )}
                        {email.authResults.spf === 'FAIL' && (
                          <Badge variant="secondary" className="bg-destructive/20 text-destructive border-destructive/20 text-xs">SPF✗</Badge>
                        )}
                        {email.authResults.dkim === 'FAIL' && (
                          <Badge variant="secondary" className="bg-destructive/20 text-destructive border-destructive/20 text-xs">DKIM✗</Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-foreground mb-1">
                      <span className="font-medium">{email.from}</span> → <span className="font-medium">{email.recipient}</span>
                    </div>
                    <div className="text-sm text-muted-foreground truncate mb-1">{email.subject}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {email.messageId} • {email.domain}
                      {(email.authResults.spf === 'FAIL' || email.authResults.dkim === 'FAIL') && (
                        <span className="text-destructive ml-2">Auth Failed</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-4">
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <Eye2 width="12" height="12" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {recentEmails.length > 20 && (
          <div className="text-center pt-4">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/analytics?view=all">View All {recentEmails.length} Logs</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}


