"use client"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ChartContainer, ChartTooltip, ChartTooltipContent, ChartConfig } from "@/components/ui/chart"
import { MailIcon, TrendingUpIcon, ActivityIcon, AlertCircleIcon, ExternalLinkIcon, TrendingDownIcon, BarChart3Icon } from "lucide-react"
import { Area, AreaChart, CartesianGrid, XAxis, Line, LineChart, Bar, BarChart } from "recharts"

import inboundData from "@/lib/data.json"

// Sample chart data - in a real app this would come from your API
const emailsChartData = [
  { date: "2024-01-01", emails: 45, api: 32 },
  { date: "2024-01-02", emails: 52, api: 41 },
  { date: "2024-01-03", emails: 48, api: 35 },
  { date: "2024-01-04", emails: 61, api: 48 },
  { date: "2024-01-05", emails: 55, api: 42 },
  { date: "2024-01-06", emails: 67, api: 51 },
  { date: "2024-01-07", emails: 58, api: 45 },
]

const successRateData = [
  { date: "2024-01-01", rate: 94.2 },
  { date: "2024-01-02", rate: 96.1 },
  { date: "2024-01-03", rate: 95.8 },
  { date: "2024-01-04", rate: 97.2 },
  { date: "2024-01-05", rate: 96.5 },
  { date: "2024-01-06", rate: 98.1 },
  { date: "2024-01-07", rate: 96.2 },
]

const responseTimeData = [
  { date: "2024-01-01", time: 280 },
  { date: "2024-01-02", time: 245 },
  { date: "2024-01-03", time: 267 },
  { date: "2024-01-04", time: 234 },
  { date: "2024-01-05", time: 251 },
  { date: "2024-01-06", time: 223 },
  { date: "2024-01-07", time: 245 },
]

const chartConfig = {
  emails: {
    label: "Emails",
    color: "hsl(var(--chart-1))",
  },
  api: {
    label: "API Calls",
    color: "hsl(var(--chart-2))",
  },
  rate: {
    label: "Success Rate",
    color: "hsl(var(--chart-3))",
  },
  time: {
    label: "Response Time",
    color: "hsl(var(--chart-4))",
  },
} satisfies ChartConfig

export default function Page() {
    const { subscription, emailConfigurations, metrics } = inboundData
    return (
        <div className="flex flex-1 flex-col gap-6 p-6">
            {/* Metrics Cards with Charts */}
            <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-3">
                {/* Emails Received Card with Edge-to-Edge Chart */}
                <Card className="relative overflow-hidden p-0 h-[120px]">
                    {/* Background Chart - Edge to Edge */}
                    <div className="absolute inset-0 h-full w-full">
                        <ChartContainer config={chartConfig} className="h-full w-full">
                            <AreaChart data={emailsChartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="fillEmails" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6C47FF" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#6C47FF" stopOpacity={0.05} />
                                    </linearGradient>
                                </defs>
                                <Area
                                    dataKey="emails"
                                    type="linear"
                                    fill="url(#fillEmails)"
                                    stroke="#6C47FF"
                                    strokeWidth={1.5}
                                />
                            </AreaChart>
                        </ChartContainer>
                    </div>
                    
                    {/* Overlaid Content */}
                    <div className="relative z-10 p-6">
                        <div className="flex items-end justify-between mb-4">
                            <div>
                                <p className="text-xs text-muted-foreground mb-1">Emails Received</p>
                            </div>
                        </div>
                    </div>
                    <div className="absolute bottom-6 right-6 text-right">
                        <span className="text-2xl font-bold">{subscription.emailsReceived.toLocaleString()}</span>
                    </div>
                </Card>

                {/* API Requests Failed Card with Edge-to-Edge Chart */}
                <Card className="relative overflow-hidden p-0 h-[120px]">
                    {/* Background Chart - Edge to Edge */}
                    <div className="absolute inset-0 h-full w-full">
                        <ChartContainer config={chartConfig} className="h-full w-full">
                            <AreaChart data={emailsChartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="fillFailed" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                                    </linearGradient>
                                </defs>
                                <Area
                                    dataKey="api"
                                    type="linear"
                                    fill="url(#fillFailed)"
                                    stroke="#ef4444"
                                    strokeWidth={1.5}
                                />
                            </AreaChart>
                        </ChartContainer>
                    </div>
                    
                    {/* Overlaid Content */}
                    <div className="relative z-10 p-6">
                        <div className="flex items-end justify-between mb-4">
                            <div>
                                <p className="text-xs text-muted-foreground mb-1">API Requests Failed</p>
                            </div>
                        </div>
                    </div>
                    <div className="absolute bottom-6 right-6 text-right">
                        <span className="text-2xl font-bold">{subscription.errors.toLocaleString()}</span>
                    </div>
                </Card>

                {/* Usage & Limits Card with Edge-to-Edge Progress */}
                <Card className="relative overflow-hidden p-0 h-[120px]">
                    {/* Background Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-50/50 to-orange-100/30"></div>
                    
                    {/* Usage Progress Bar - Edge to Edge */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-secondary">
                        <div 
                            className="h-full bg-primary transition-all duration-300" 
                            style={{ width: `${(subscription.emailsReceived / subscription.monthlyLimit) * 100}%` }}
                        ></div>
                    </div>
                    
                    {/* Overlaid Content */}
                    <div className="relative z-10 p-6">
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <p className="text-xs text-muted-foreground mb-1">Usage & Limits</p>
                                <span className="text-2xl font-bold">{Math.round((subscription.emailsReceived / subscription.monthlyLimit) * 100)}%</span>
                            </div>
                            <BarChart3Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        
                        <div className="absolute bottom-6 right-6 text-right">
                            <p className="text-xs text-muted-foreground">Remaining</p>
                            <span className="text-lg font-semibold">{(subscription.monthlyLimit - subscription.emailsReceived).toLocaleString()}</span>
                        </div>
                    </div>
                </Card>
            </div>



            {/* Email Configurations Table */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Email Configurations</CardTitle>
                            <CardDescription>
                                Manage your inbound email configurations and webhooks
                            </CardDescription>
                        </div>
                        <Button asChild>
                            <a href="/addinbound">
                                <MailIcon className="h-4 w-4" />
                                Add Email Address
                            </a>
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Email Address</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Hits</TableHead>
                                <TableHead>Method</TableHead>
                                <TableHead>Last Updated</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {emailConfigurations.map((config: any) => (
                                <TableRow key={config.id}>
                                    <TableCell className="font-medium">{config.name}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-mono text-sm">{config.inboundEmail}</span>
                                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                                                {config.endpointUrl}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge 
                                            variant={config.status === 'active' ? 'default' : 'secondary'}
                                            className={config.status === 'active' ? 'bg-green-100 text-green-800' : ''}
                                        >
                                            {config.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="font-semibold">{config.hitCount.toLocaleString()}</span>
                                            <span className="text-xs text-muted-foreground">total hits</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="font-mono">
                                            {config.method}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span className="text-sm">
                                                {new Date(config.lastUpdated).toLocaleDateString()}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {new Date(config.lastUpdated).toLocaleTimeString()}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
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
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
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
                            <div className="mt-2 w-full bg-secondary rounded-full h-2">
                                <div 
                                    className="bg-primary h-2 rounded-full" 
                                    style={{ width: `${(subscription.emailsReceived / subscription.monthlyLimit) * 100}%` }}
                                ></div>
                            </div>
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