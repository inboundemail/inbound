import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CopyIcon, ExternalLinkIcon, SaveIcon, TestTubeIcon } from "lucide-react"

import inboundData from "@/lib/data.json"

interface ConfigurePageProps {
  params: {
    id: string
  }
}

export default function ConfigurePage({ params }: ConfigurePageProps) {
  const config = inboundData.emailConfigurations.find(c => c.id === params.id)
  
  if (!config) {
    return (
      <SidebarProvider>
        <AppSidebar variant="inset" />
        <SidebarInset>
          <SiteHeader title="Configuration Not Found" />
          <div className="flex flex-1 flex-col gap-6 p-6">
            <Card>
              <CardContent className="pt-6">
                <p>Configuration not found.</p>
                <Button asChild className="mt-4">
                  <a href="/">Back to Dashboard</a>
                </Button>
              </CardContent>
            </Card>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader title={`Configure ${config.name}`} />
        <div className="flex flex-1 flex-col gap-6 p-6">
          {/* Configuration Overview */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {config.name}
                    <Badge variant={config.status === 'active' ? 'default' : 'secondary'}>
                      {config.status}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Email configuration and webhook settings
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm">
                    <TestTubeIcon className="h-4 w-4" />
                    Test Webhook
                  </Button>
                  <Button size="sm">
                    <SaveIcon className="h-4 w-4" />
                    Save Changes
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Inbound Email Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Inbound Email</h3>
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <div className="flex gap-2">
                      <Input 
                        id="email" 
                        value={config.inboundEmail} 
                        readOnly 
                        className="bg-muted"
                      />
                      <Button variant="ghost" size="sm">
                        <CopyIcon className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      This is your inbound email address. Send emails to this address to trigger your webhook.
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="name">Configuration Name</Label>
                    <Input id="name" defaultValue={config.name} />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select defaultValue={config.status}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Webhook Settings */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium">Webhook Configuration</h3>
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="endpoint">Endpoint URL</Label>
                    <div className="flex gap-2">
                      <Input 
                        id="endpoint" 
                        defaultValue={config.endpointUrl}
                        placeholder="https://your-api.com/webhook"
                      />
                      <Button variant="ghost" size="sm" asChild>
                        <a href={config.endpointUrl} target="_blank" rel="noopener noreferrer">
                          <ExternalLinkIcon className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="method">HTTP Method</Label>
                    <Select defaultValue={config.method}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="POST">POST</SelectItem>
                        <SelectItem value="PUT">PUT</SelectItem>
                        <SelectItem value="PATCH">PATCH</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="headers">Headers (JSON)</Label>
                    <Input 
                      id="headers" 
                      defaultValue={JSON.stringify(config.headers, null, 2)}
                      className="font-mono text-sm"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Statistics */}
          <Card>
            <CardHeader>
              <CardTitle>Statistics</CardTitle>
              <CardDescription>
                Performance metrics for this email configuration
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Total Hits</p>
                  <p className="text-2xl font-bold">{config.hitCount}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Last Updated</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(config.lastUpdated).toLocaleString()}
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Status</p>
                  <Badge variant={config.status === 'active' ? 'default' : 'secondary'}>
                    {config.status}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
} 