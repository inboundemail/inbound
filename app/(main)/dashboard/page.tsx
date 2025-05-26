import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MailIcon, TrendingUpIcon, ActivityIcon, AlertCircleIcon, ExternalLinkIcon } from "lucide-react"

import inboundData from "@/lib/data.json"

export default function Page() {
    const { subscription, emailConfigurations, metrics } = inboundData
    return (
        <div className="flex flex-1 flex-col gap-6 p-6">
            {/* Metrics Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Emails Received</CardTitle>
                        <MailIcon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{subscription.emailsReceived.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            +{metrics.emailsToday} today
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">API Calls</CardTitle>
                        <ActivityIcon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{subscription.apiCalls.toLocaleString()}</div>
                        <p className="text-xs text-muted-foreground">
                            +{metrics.apiCallsToday} today
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
                        <TrendingUpIcon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{metrics.successRate}%</div>
                        <p className="text-xs text-muted-foreground">
                            {subscription.successfulEndpoints}/{subscription.apiCalls} successful
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Errors</CardTitle>
                        <AlertCircleIcon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{subscription.errors}</div>
                        <p className="text-xs text-muted-foreground">
                            Avg response: {metrics.avgResponseTime}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Email Configurations Table */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Email Addresses</CardTitle>
                            <CardDescription>
                                Manage your inbound email configurations and webhooks
                            </CardDescription>
                        </div>
                        <Button asChild>
                            <a href="/emails/new">
                                <MailIcon className="h-4 w-4" />
                                Add Email Address
                            </a>
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {emailConfigurations.map((config: any) => (
                            <div key={config.id} className="flex items-center justify-between p-4 border rounded-lg">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-medium">{config.name}</h3>
                                        <Badge variant={config.status === 'active' ? 'default' : 'secondary'}>
                                            {config.status}
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground">{config.inboundEmail}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {config.hitCount} hits • Last updated {new Date(config.lastUpdated).toLocaleDateString()}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="sm" asChild>
                                        <a href={`/configure/${config.id}`}>
                                            Configure
                                        </a>
                                    </Button>
                                    <Button variant="ghost" size="sm" asChild>
                                        <a href={config.endpointUrl} target="_blank" rel="noopener noreferrer">
                                            <ExternalLinkIcon className="h-4 w-4" />
                                        </a>
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Subscription Info */}
            <Card>
                <CardHeader>
                    <CardTitle>Subscription</CardTitle>
                    <CardDescription>
                        Current plan and usage information
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium">{subscription.plan} Plan</p>
                            <p className="text-sm text-muted-foreground">
                                {subscription.emailsReceived.toLocaleString()} / {subscription.monthlyLimit.toLocaleString()} emails this month
                            </p>
                        </div>
                        <Button variant="secondary" asChild>
                            <a href="/subscription">
                                Manage Subscription
                            </a>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}