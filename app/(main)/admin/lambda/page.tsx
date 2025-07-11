'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
// Import Nucleo icons
import Code2 from '@/components/icons/code-2'
import Refresh2 from '@/components/icons/refresh-2'
import MediaPause from '@/components/icons/media-pause'
import CirclePlay from '@/components/icons/circle-play'
import CloudDownload from '@/components/icons/cloud-download'
import Magnifier2 from '@/components/icons/magnifier-2'
import BulletList from '@/components/icons/bullet-list'
import Grid2 from '@/components/icons/grid-2'
import ChevronDown from '@/components/icons/chevron-down'
import ChevronRight from '@/components/icons/chevron-right'
import { toast } from 'sonner'
import { 
  getLambdaFunctionInfo, 
  getLambdaRecentLogs, 
  getLambdaMoreLogs,
  getLambdaLogStreams, 
  checkAWSConnection,
  type LambdaFunctionInfo,
  type LogEvent,
  type LogStreamInfo
} from '../actions/lambda'

export default function LambdaPage() {
  const [functionInfo, setFunctionInfo] = useState<LambdaFunctionInfo | null>(null)
  const [logStreams, setLogStreams] = useState<LogStreamInfo[]>([])
  const [logs, setLogs] = useState<LogEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLiveTailing, setIsLiveTailing] = useState(true)
  const [selectedTimeRange, setSelectedTimeRange] = useState('30')
  const [awsConnected, setAwsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [selectedLog, setSelectedLog] = useState<LogEvent | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [logSearchTerm, setLogSearchTerm] = useState('')
  const [nextToken, setNextToken] = useState<string | null>(null)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMoreLogs, setHasMoreLogs] = useState(true)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const [groupedMode, setGroupedMode] = useState(true)
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set())
  const [activeFilter, setActiveFilter] = useState<{ type: 'request' | 'email' | null, value: string | null }>({ type: null, value: null })

  // Check AWS connection on mount
  useEffect(() => {
    checkConnection()
  }, [])

  // Load data when AWS connection is established
  useEffect(() => {
    if (awsConnected) {
      // Reset pagination when time range changes
      setNextToken(null)
      setHasMoreLogs(true)
      loadAllData()
    }
  }, [awsConnected, selectedTimeRange])

  // Live tailing interval
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    
    if (isLiveTailing && awsConnected) {
      interval = setInterval(() => {
        loadLogs()
      }, 2000) // Refresh every 2 seconds for better real-time feel
    }
    
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [isLiveTailing, awsConnected, selectedTimeRange])

  // Infinite scroll handler
  useEffect(() => {
    const scrollArea = scrollAreaRef.current
    if (!scrollArea) return

    const handleScroll = (event: Event) => {
      const target = event.target as HTMLDivElement
      const { scrollTop, scrollHeight, clientHeight } = target
      
      // Load more when user is near the bottom (within 100px)
      if (scrollHeight - scrollTop - clientHeight < 100) {
        if (hasMoreLogs && !isLoadingMore) {
          loadMoreLogs()
        }
      }
    }

    // Find the scrollable element inside ScrollArea (Radix UI structure)
    const scrollableElement = scrollArea.querySelector('[data-radix-scroll-area-viewport]')
    if (scrollableElement) {
      scrollableElement.addEventListener('scroll', handleScroll)
      return () => {
        scrollableElement.removeEventListener('scroll', handleScroll)
      }
    }
  }, [hasMoreLogs, isLoadingMore])

  const checkConnection = async () => {
    try {
      const result = await checkAWSConnection()
      setAwsConnected(result.success)
      if (!result.success) {
        setError(result.error || 'AWS connection failed')
      }
    } catch (err) {
      setError('Failed to check AWS connection')
      setAwsConnected(false)
    }
  }

  const loadAllData = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      // Load function info and logs in parallel
      const [functionResult, logsResult, streamsResult] = await Promise.all([
        getLambdaFunctionInfo(),
        getLambdaRecentLogs(parseInt(selectedTimeRange)),
        getLambdaLogStreams()
      ])
      
      if (functionResult.success && functionResult.data) {
        setFunctionInfo(functionResult.data)
      } else {
        setError(functionResult.error || 'Failed to load function info')
      }
      
      if (logsResult.success && logsResult.data) {
        // Sort logs by timestamp, newest first
        const sortedLogs = logsResult.data.sort((a, b) => b.timestamp - a.timestamp)
        setLogs(sortedLogs)
        setNextToken(logsResult.nextToken || null)
        setHasMoreLogs(!!logsResult.nextToken)
      } else {
        setError(logsResult.error || 'Failed to load logs')
      }
      
      if (streamsResult.success && streamsResult.data) {
        setLogStreams(streamsResult.data)
      }
      
      setLastRefresh(new Date())
    } catch (err) {
      setError('Failed to load Lambda data')
    } finally {
      setIsLoading(false)
    }
  }

  const loadLogs = async () => {
    try {
      const result = await getLambdaRecentLogs(parseInt(selectedTimeRange))
      if (result.success && result.data) {
        // Sort logs by timestamp, newest first
        const sortedLogs = result.data.sort((a, b) => b.timestamp - a.timestamp)
        setLogs(sortedLogs)
        setNextToken(result.nextToken || null)
        setHasMoreLogs(!!result.nextToken)
        setLastRefresh(new Date())
      }
    } catch (err) {
      console.error('Failed to refresh logs:', err)
    }
  }

  const loadMoreLogs = async () => {
    if (!nextToken || isLoadingMore) return
    
    setIsLoadingMore(true)
    try {
      const result = await getLambdaMoreLogs(parseInt(selectedTimeRange), nextToken)
      if (result.success && result.data) {
        // Sort new logs and merge with existing logs
        const newLogs = result.data.sort((a, b) => b.timestamp - a.timestamp)
        setLogs(prevLogs => {
          // Combine and deduplicate by timestamp + message
          const combined = [...prevLogs, ...newLogs]
          const unique = combined.filter((log, index, self) => 
            index === self.findIndex(l => l.timestamp === log.timestamp && l.message === log.message)
          )
          return unique.sort((a, b) => b.timestamp - a.timestamp)
        })
        setNextToken(result.nextToken || null)
        setHasMoreLogs(!!result.nextToken)
      }
    } catch (err) {
      console.error('Failed to load more logs:', err)
    } finally {
      setIsLoadingMore(false)
    }
  }

  const toggleLiveTailing = () => {
    setIsLiveTailing(!isLiveTailing)
  }

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  const formatLogMessage = (message: string) => {
    // Basic log message formatting
    if (message.includes('ERROR') || message.includes('❌')) {
      return { type: 'error', content: message }
    }
    if (message.includes('WARN') || message.includes('⚠️')) {
      return { type: 'warning', content: message }
    }
    if (message.includes('✅') || message.includes('SUCCESS')) {
      return { type: 'success', content: message }
    }
    return { type: 'info', content: message }
  }

  const getLogSummary = (message: string) => {
    // Create short summaries for different log types
    if (message.includes('📧 Lambda - Received SES email event')) {
      return '📧 Received SES email event'
    }
    if (message.includes('📥 Lambda - Fetching email from S3')) {
      return '📥 Fetching email from S3'
    }
    if (message.includes('✅ Lambda - Successfully fetched email content')) {
      return '✅ Email content fetched'
    }
    if (message.includes('🚀 Lambda - Sending webhook request')) {
      return '🚀 Sending webhook request'
    }
    if (message.includes('✅ Lambda - Webhook response')) {
      return '✅ Webhook sent successfully'
    }
    if (message.includes('❌ Lambda')) {
      return '❌ Lambda error occurred'
    }
    if (message.includes('INIT_START')) {
      return '🔄 Lambda function initializing'
    }
    if (message.includes('START RequestId')) {
      return '▶️ Request started'
    }
    if (message.includes('END RequestId')) {
      return '✅ Request completed'
    }
    if (message.includes('REPORT RequestId')) {
      return '📊 Request metrics'
    }
    if (message.match(/^REPORT\s+RequestId:/)) {
      return '📊 Request metrics'
    }
    
    // Fallback to first 80 characters
    return message.length > 80 ? message.substring(0, 80) + '...' : message
  }

  const handleLogClick = (log: LogEvent) => {
    setSelectedLog(log)
    setIsSheetOpen(true)
    setSearchTerm('') // Reset search when opening new log
  }

  const getFilteredLogLines = () => {
    if (!selectedLog || !searchTerm) return selectedLog?.message.split('\n') || []
    
    return selectedLog.message.split('\n').filter(line => 
      line.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }

  const parseRequestInfo = (message: string) => {
    // CloudWatch logs come in tab-separated format:
    // TIMESTAMP\tREQUEST_ID\tLEVEL\tMESSAGE
    // Example: 2025-07-02T21:49:47.556Z\t1404d664-c507-4ead-95b2-e24672038331\tINFO\t✅ REQUEST_COMPLETE|1404d664-c507-4ead-95b2-e24672038331|SUCCESS|Request completed successfully
    
    // First, check if this is a tab-separated CloudWatch log
    const tabParts = message.split('\t')
    let actualMessage = message
    let embeddedRequestId: string | null = null
    
    if (tabParts.length >= 4) {
      // This is a CloudWatch log with tabs
      // Format: TIMESTAMP\tREQUEST_ID\tLEVEL\tMESSAGE
      embeddedRequestId = tabParts[1]
      actualMessage = tabParts.slice(3).join('\t') // Join the rest in case message has tabs
    } else if (tabParts.length === 2) {
      // Some logs like REPORT might only have TIMESTAMP\tMESSAGE format
      actualMessage = tabParts[1]
    }

    // Parse REQUEST_START logs (with optional emoji prefix)
    const requestStartMatch = actualMessage.match(/(?:🆔\s+)?REQUEST_START\|([^|]+)\|(.+)/)
    if (requestStartMatch) {
      return { type: 'REQUEST_START', requestId: requestStartMatch[1], message: requestStartMatch[2] }
    }

    // Parse EMAIL_TARGET logs (with optional emoji prefix)
    const emailTargetMatch = actualMessage.match(/(?:📧\s+)?EMAIL_TARGET\|([^|]+)\|([^|]+)\|(.+)/)
    if (emailTargetMatch) {
      return { type: 'EMAIL_TARGET', requestId: emailTargetMatch[1], email: emailTargetMatch[2], message: emailTargetMatch[3] }
    }

    // Parse REQUEST_COMPLETE logs (with optional emoji prefix)
    const requestCompleteMatch = actualMessage.match(/(?:✅\s+)?REQUEST_COMPLETE\|([^|]+)\|([^|]+)\|(.+)/)
    if (requestCompleteMatch) {
      return { type: 'REQUEST_COMPLETE', requestId: requestCompleteMatch[1], status: requestCompleteMatch[2], message: requestCompleteMatch[3] }
    }

    // Parse logs with emoji prefix and request ID (format: 📧 requestId|Lambda - message)
    const emojiPrefixedMatch = actualMessage.match(/^(?:[📧📥🔍🚀💥⚠️❌✅📨📭📍🧪📊]\s+)?([a-f0-9-]+)\|(.+)/)
    if (emojiPrefixedMatch) {
      return { type: 'LAMBDA_LOG', requestId: emojiPrefixedMatch[1], message: emojiPrefixedMatch[2] }
    }

    // If we found an embedded request ID from tab format, use it
    if (embeddedRequestId) {
      return { type: 'LAMBDA_LOG', requestId: embeddedRequestId, message: actualMessage }
    }

    // Parse logs with emoji prefix but no request ID (format: 📥 Lambda - message or ❌ Lambda - message)
    // These are logs where requestId was null/undefined
    const emojiOnlyMatch = actualMessage.match(/^([📧📥🔍🚀💥⚠️❌✅📨📭📍🧪📊])\s+(Lambda\s+-\s+.+|Error\s+details:|.+error.+)/)
    if (emojiOnlyMatch) {
      return { type: 'LAMBDA_LOG_NO_ID', requestId: null, message: actualMessage }
    }

    // Parse logs with request ID at the beginning (format: requestId|Lambda - message)
    const prefixedRequestIdMatch = actualMessage.match(/^([a-f0-9-]+)\|(.+)/)
    if (prefixedRequestIdMatch) {
      return { type: 'LAMBDA_LOG', requestId: prefixedRequestIdMatch[1], message: prefixedRequestIdMatch[2] }
    }

    // Extract request ID from standard Lambda logs (RequestId: xxx)
    // This handles START, END, and REPORT logs
    const requestIdMatch = actualMessage.match(/RequestId:\s*([a-f0-9-]+)/)
    if (requestIdMatch) {
      return { type: 'LAMBDA_LOG', requestId: requestIdMatch[1], message: actualMessage }
    }

    return { type: 'OTHER', requestId: null, message: actualMessage }
  }

  const groupLogsByRequest = (logs: LogEvent[]) => {
    const groups: { [requestId: string]: { 
      requestId: string, 
      logs: LogEvent[], 
      startTime: number, 
      endTime: number,
      status: 'RUNNING' | 'SUCCESS' | 'FAILED',
      emailTarget?: string,
      summary: string
    } } = {}

    logs.forEach(log => {
      const parsed = parseRequestInfo(log.message)
      
      if (parsed.requestId) {
        if (!groups[parsed.requestId]) {
          groups[parsed.requestId] = {
            requestId: parsed.requestId,
            logs: [],
            startTime: log.timestamp,
            endTime: log.timestamp,
            status: 'RUNNING',
            summary: 'Processing request...'
          }
        }

        groups[parsed.requestId].logs.push(log)
        groups[parsed.requestId].startTime = Math.min(groups[parsed.requestId].startTime, log.timestamp)
        groups[parsed.requestId].endTime = Math.max(groups[parsed.requestId].endTime, log.timestamp)

        // Update group info based on log type
        if (parsed.type === 'EMAIL_TARGET') {
          groups[parsed.requestId].emailTarget = parsed.email
          groups[parsed.requestId].summary = `Processing email for ${parsed.email}`
        } else if (parsed.type === 'REQUEST_COMPLETE') {
          groups[parsed.requestId].status = parsed.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED'
          groups[parsed.requestId].summary = parsed.status === 'SUCCESS' ? 'Request completed successfully' : 'Request failed'
        }
      }
    })

    return Object.values(groups).sort((a, b) => b.startTime - a.startTime)
  }

  const toggleRequestExpansion = (requestId: string) => {
    setExpandedRequests(prev => {
      const newSet = new Set(prev)
      if (newSet.has(requestId)) {
        newSet.delete(requestId)
      } else {
        newSet.add(requestId)
      }
      return newSet
    })
  }

  const filterByRequest = (requestId: string) => {
    setActiveFilter({ type: 'request', value: requestId })
    setLogSearchTerm('') // Clear search when filtering
  }

  const filterByEmail = (email: string) => {
    setActiveFilter({ type: 'email', value: email })
    setLogSearchTerm('') // Clear search when filtering
  }

  const clearFilter = () => {
    setActiveFilter({ type: null, value: null })
  }

  const downloadLogs = () => {
    const logsText = logs.map(log => 
      `${formatTimestamp(log.timestamp)} - ${log.message}`
    ).join('\n')
    
    const blob = new Blob([logsText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lambda-logs-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (!awsConnected) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Code2 width="32" height="32" />
              Lambda Monitoring
            </h1>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-red-600">AWS Connection Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              {error || 'Unable to connect to AWS services. Please check your AWS credentials and configuration.'}
            </p>
                          <Button onClick={checkConnection}>
                <Refresh2 width="16" height="16" className="mr-2" />
                Retry Connection
              </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col h-full p-6 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                          <Code2 width="32" height="32" />
              Lambda Monitoring
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              {isLiveTailing && (
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              )}
              Last refresh: {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <Button 
            variant="secondary" 
            onClick={toggleLiveTailing}
            className={isLiveTailing ? 'bg-green-50 border-green-200 text-green-700' : ''}
          >
                          {isLiveTailing ? (
                <>
                  <MediaPause width="16" height="16" className="mr-2" />
                  Live Streaming
                </>
              ) : (
                <>
                  <CirclePlay width="16" height="16" className="mr-2" />
                  Start Live Stream
                </>
              )}
          </Button>
                      <Button variant="secondary" onClick={loadAllData} disabled={isLoading}>
              <Refresh2 width="16" height="16" className="mr-2" />
              Refresh
            </Button>
        </div>
      </div>



      {/* Logs Section */}
      <Tabs defaultValue="logs" className="flex flex-col flex-1 gap-4">
        <TabsList>
          <TabsTrigger value="logs">Recent Logs</TabsTrigger>
          <TabsTrigger value="streams">Log Streams</TabsTrigger>
        </TabsList>

        <TabsContent value="logs" className="flex flex-col flex-1 gap-4">
          <div className="flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-4">
              <h3 className="text-lg font-semibold">Lambda Logs</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground bg-gray-100 px-2 py-1 rounded-md font-mono">
                  {(() => {
                    let filteredLogs = logs
                    if (activeFilter.type && activeFilter.value) {
                      if (activeFilter.type === 'request') {
                        filteredLogs = logs.filter(log => {
                          const parsed = parseRequestInfo(log.message)
                          return parsed.requestId === activeFilter.value
                        })
                      } else if (activeFilter.type === 'email') {
                        filteredLogs = logs.filter(log => {
                          const parsed = parseRequestInfo(log.message)
                          return parsed.type === 'EMAIL_TARGET' && parsed.email === activeFilter.value ||
                                 log.message.includes(activeFilter.value!)
                        })
                      }
                    }
                    filteredLogs = filteredLogs.filter(log => 
                      logSearchTerm === '' || 
                      log.message.toLowerCase().includes(logSearchTerm.toLowerCase()) ||
                      getLogSummary(log.message).toLowerCase().includes(logSearchTerm.toLowerCase())
                    )
                    return `${filteredLogs.length} logs`
                  })()}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setGroupedMode(!groupedMode)}
                  className="flex items-center gap-1"
                >
                                      {groupedMode ? <BulletList width="16" height="16" /> : <Grid2 width="16" height="16" />}
                    {groupedMode ? 'Grouped' : 'Individual'}
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {activeFilter.type && (
                <div className="flex items-center gap-2 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs">
                  <span className="text-blue-700">
                    {activeFilter.type === 'request' ? '🔍 Request:' : '📧 Email:'} {activeFilter.value}
                  </span>
                  <button onClick={clearFilter} className="text-blue-600 hover:text-blue-800">×</button>
                </div>
                              )}
                <div className="relative">
                  <Magnifier2 width="16" height="16" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder={activeFilter.type ? "Search filtered logs..." : "Search logs..."}
                  value={logSearchTerm}
                  onChange={(e) => setLogSearchTerm(e.target.value)}
                  className="pl-10 w-48"
                />
              </div>
              <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">Last 15 min</SelectItem>
                  <SelectItem value="30">Last 30 min</SelectItem>
                  <SelectItem value="60">Last 1 hour</SelectItem>
                  <SelectItem value="180">Last 3 hours</SelectItem>
                  <SelectItem value="720">Last 12 hours</SelectItem>
                </SelectContent>
              </Select>
                              <Button variant="secondary" onClick={downloadLogs}>
                  <CloudDownload width="16" height="16" className="mr-2" />
                  Download
                </Button>
            </div>
          </div>
          
          <ScrollArea className="flex-1 w-full" ref={scrollAreaRef}>
                        <div className="p-2 space-y-0.5 font-mono text-xs">
              {(() => {
                let filteredLogs = logs

                // Apply active filter first
                if (activeFilter.type && activeFilter.value) {
                  if (activeFilter.type === 'request') {
                    filteredLogs = logs.filter(log => {
                      const parsed = parseRequestInfo(log.message)
                      return parsed.requestId === activeFilter.value
                    })
                  } else if (activeFilter.type === 'email') {
                    filteredLogs = logs.filter(log => {
                      const parsed = parseRequestInfo(log.message)
                      return parsed.type === 'EMAIL_TARGET' && parsed.email === activeFilter.value ||
                             log.message.includes(activeFilter.value!)
                    })
                  }
                }

                // Then apply search filter
                filteredLogs = filteredLogs.filter(log => 
                  logSearchTerm === '' || 
                  log.message.toLowerCase().includes(logSearchTerm.toLowerCase()) ||
                  getLogSummary(log.message).toLowerCase().includes(logSearchTerm.toLowerCase())
                )
                
                if (filteredLogs.length === 0) {
                  let message = 'No logs found for the selected time range'
                  if (activeFilter.type && logSearchTerm) {
                    message = `No logs found matching "${logSearchTerm}" in filtered results`
                  } else if (activeFilter.type) {
                    message = `No logs found for ${activeFilter.type === 'request' ? 'request' : 'email'}: ${activeFilter.value}`
                  } else if (logSearchTerm) {
                    message = `No logs found matching "${logSearchTerm}"`
                  }
                  
                  return (
                    <div className="text-center text-muted-foreground py-6 text-xs">
                      {message}
                    </div>
                  )
                }

                if (groupedMode) {
                  // Grouped view with chronological inline ordering
                  const requestGroups = groupLogsByRequest(filteredLogs)
                  const ungroupedLogs = filteredLogs.filter(log => !parseRequestInfo(log.message).requestId)

                  // Create combined items array for chronological sorting
                  const combinedItems: Array<{
                    type: 'group' | 'log',
                    timestamp: number,
                    group?: typeof requestGroups[0],
                    log?: typeof ungroupedLogs[0],
                    originalIndex?: number
                  }> = [
                    ...requestGroups.map(group => ({
                      type: 'group' as const,
                      timestamp: group.startTime,
                      group
                    })),
                    ...ungroupedLogs.map((log, index) => ({
                      type: 'log' as const,
                      timestamp: log.timestamp,
                      log,
                      originalIndex: index
                    }))
                  ]

                  // Sort chronologically (newest first)
                  combinedItems.sort((a, b) => b.timestamp - a.timestamp)

                  return (
                    <>
                      {combinedItems.map((item, index) => {
                        if (item.type === 'group' && item.group) {
                          const group = item.group
                          return (
                            <div key={`group-${group.requestId}`} className="border rounded-md bg-white">
                              {/* Request Group Header */}
                              <div 
                                className={`px-3 py-2 transition-colors border-l-4 flex items-center gap-2 ${
                                  group.status === 'SUCCESS' ? 'bg-green-50/50 hover:bg-green-50 text-green-800 border-l-green-400' :
                                  group.status === 'FAILED' ? 'bg-red-50/50 hover:bg-red-50 text-red-800 border-l-red-400' :
                                  'bg-blue-50/50 hover:bg-blue-50 text-blue-800 border-l-blue-400'
                                }`}
                              >
                                <div 
                                  className="flex items-center gap-1 cursor-pointer"
                                  onClick={() => toggleRequestExpansion(group.requestId)}
                                >
                                                                      {expandedRequests.has(group.requestId) ? 
                                      <ChevronDown width="12" height="12" /> : 
                                      <ChevronRight width="12" height="12" />
                                    }
                                  <span className="text-[9px] text-muted-foreground whitespace-nowrap font-mono opacity-60">
                                    {new Date(group.startTime).toLocaleTimeString()}
                                  </span>
                                </div>
                                <div 
                                  className="font-medium text-xs flex-1 cursor-pointer"
                                  onClick={() => toggleRequestExpansion(group.requestId)}
                                >
                                  {group.emailTarget ? `Request for ${group.emailTarget}` : group.summary}
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {group.emailTarget && (
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        filterByEmail(group.emailTarget!)
                                      }}
                                      className="h-5 px-2 text-[10px] bg-blue-100 hover:bg-blue-200 text-blue-700"
                                    >
                                      📧 Email
                                    </Button>
                                  )}
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      filterByRequest(group.requestId)
                                    }}
                                    className="h-5 px-2 text-[10px] bg-purple-100 hover:bg-purple-200 text-purple-700"
                                  >
                                    🔍 Filter
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      navigator.clipboard.writeText(group.requestId)
                                      toast.success('Request ID copied to clipboard')
                                    }}
                                    className="h-5 px-2 text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-700"
                                    title={`Copy request ID: ${group.requestId}`}
                                  >
                                    📋 Copy ID
                                  </Button>
                                  <span className="text-[9px] text-muted-foreground opacity-60 font-mono">
                                    {group.logs.length} logs
                                  </span>
                                  <span className="text-[10px] px-1 py-0.5 rounded font-mono">
                                    {group.status === 'SUCCESS' ? '✅' : group.status === 'FAILED' ? '❌' : '⏳'}
                                  </span>
                                </div>
                              </div>

                              {/* Expanded Request Logs */}
                              {expandedRequests.has(group.requestId) && (
                                <div className="border-t bg-gray-50/30 space-y-0.5 p-2">
                                  {group.logs.map((log, logIndex) => {
                                    // Parse the log to extract the actual message content
                                    const parsed = parseRequestInfo(log.message)
                                    let displayMessage = log.message
                                    
                                    // If it's a CloudWatch format log, extract just the message part
                                    const tabParts = log.message.split('\t')
                                    if (tabParts.length >= 4) {
                                      // Skip timestamp, request ID, and log level to get the actual message
                                      displayMessage = tabParts.slice(3).join('\t')
                                    }
                                    
                                    // Remove all occurrences of the request ID from the message
                                    if (group.requestId) {
                                      displayMessage = displayMessage.replace(new RegExp(group.requestId, 'g'), '').trim()
                                      // Clean up any leftover pipes or double spaces
                                      displayMessage = displayMessage.replace(/\|\s*\|/g, '|').replace(/\s+/g, ' ').replace(/^\|/, '').trim()
                                      // Replace |Lambda - with just Lambda -
                                      displayMessage = displayMessage.replace(/\|Lambda\s+-\s+/g, 'Lambda - ')
                                    }
                                    
                                    const formatted = formatLogMessage(displayMessage)
                                    const summary = getLogSummary(displayMessage)
                                    
                                    return (
                                      <div 
                                        key={logIndex}
                                        onClick={() => handleLogClick(log)}
                                        className="px-2 py-1 hover:bg-white rounded cursor-pointer transition-colors text-xs"
                                      >
                                        <div className="flex items-start gap-2">
                                          <span className="text-[9px] text-muted-foreground whitespace-nowrap flex-shrink-0 font-mono opacity-50">
                                            {new Date(log.timestamp).toLocaleTimeString('en-US', { 
                                              hour12: false, 
                                              hour: '2-digit', 
                                              minute: '2-digit', 
                                              second: '2-digit' 
                                            })}
                                          </span>
                                          <div className="flex-1 break-words">
                                            {summary}
                                          </div>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        } else if (item.type === 'log' && item.log) {
                          const log = item.log
                          
                          // Extract the actual message content
                          let displayMessage = log.message
                          const tabParts = log.message.split('\t')
                          if (tabParts.length >= 4) {
                            displayMessage = tabParts.slice(3).join('\t')
                          }
                          
                          // Remove all occurrences of the request ID from the message
                          const parsed = parseRequestInfo(log.message)
                          if (parsed.requestId) {
                            displayMessage = displayMessage.replace(new RegExp(parsed.requestId, 'g'), '').trim()
                            // Clean up any leftover pipes or double spaces
                            displayMessage = displayMessage.replace(/\|\s*\|/g, '|').replace(/\s+/g, ' ').replace(/^\|/, '').trim()
                            // Replace |Lambda - with just Lambda -
                            displayMessage = displayMessage.replace(/\|Lambda\s+-\s+/g, 'Lambda - ')
                          }
                          
                          const formatted = formatLogMessage(displayMessage)
                          const summary = getLogSummary(displayMessage)
                          return (
                            <div 
                              key={`log-${item.originalIndex}`}
                              onClick={() => handleLogClick(log)}
                              className={`px-3 py-2 rounded-md cursor-pointer transition-colors border-l-2 h-8 flex items-center opacity-60 ${
                                formatted.type === 'error' ? 'bg-red-50/50 hover:bg-red-50 text-red-800 border-l-red-400' :
                                formatted.type === 'warning' ? 'bg-yellow-50/50 hover:bg-yellow-50 text-yellow-800 border-l-yellow-400' :
                                formatted.type === 'success' ? 'bg-green-50/50 hover:bg-green-50 text-green-800 border-l-green-400' :
                                'bg-gray-50/50 hover:bg-gray-50 border-l-gray-300'
                              }`}
                            >
                              <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0 font-mono opacity-60">
                                {new Date(log.timestamp).toLocaleTimeString('en-US', { 
                                  hour12: false, 
                                  hour: '2-digit', 
                                  minute: '2-digit', 
                                  second: '2-digit' 
                                })}
                              </span>
                              <div className="font-medium text-xs flex-1 mx-2 break-words">
                                {summary}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <span className="text-[10px] text-muted-foreground opacity-60 font-mono">
                                  {log.message.split('\n').length} lines
                                </span>
                                <div className="text-[10px] text-muted-foreground opacity-50">
                                  ↗
                                </div>
                              </div>
                            </div>
                          )
                        }
                        return null
                      })}
                    </>
                  )
                } else {
                  // Individual log view (original)
                  return filteredLogs.map((log, index) => {
                    // Extract the actual message content
                    let displayMessage = log.message
                    const tabParts = log.message.split('\t')
                    if (tabParts.length >= 4) {
                      displayMessage = tabParts.slice(3).join('\t')
                    }
                    
                    // Remove all occurrences of the request ID from the message
                    const parsed = parseRequestInfo(log.message)
                    if (parsed.requestId) {
                      displayMessage = displayMessage.replace(new RegExp(parsed.requestId, 'g'), '').trim()
                      // Clean up any leftover pipes or double spaces
                      displayMessage = displayMessage.replace(/\|\s*\|/g, '|').replace(/\s+/g, ' ').replace(/^\|/, '').trim()
                      // Replace |Lambda - with just Lambda -
                      displayMessage = displayMessage.replace(/\|Lambda\s+-\s+/g, 'Lambda - ')
                    }
                    
                    const formatted = formatLogMessage(displayMessage)
                    const summary = getLogSummary(displayMessage)
                    return (
                      <div 
                        key={index} 
                        onClick={() => handleLogClick(log)}
                        className={`px-3 py-2 rounded-md cursor-pointer transition-colors border-l-2 h-8 flex items-center ${
                          formatted.type === 'error' ? 'bg-red-50/50 hover:bg-red-50 text-red-800 border-l-red-400' :
                          formatted.type === 'warning' ? 'bg-yellow-50/50 hover:bg-yellow-50 text-yellow-800 border-l-yellow-400' :
                          formatted.type === 'success' ? 'bg-green-50/50 hover:bg-green-50 text-green-800 border-l-green-400' :
                          'bg-gray-50/50 hover:bg-gray-50 border-l-gray-300'
                        }`}
                      >
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0 font-mono opacity-60">
                          {new Date(log.timestamp).toLocaleTimeString('en-US', { 
                            hour12: false, 
                            hour: '2-digit', 
                            minute: '2-digit', 
                            second: '2-digit' 
                          })}
                        </span>
                        <div className="font-medium text-xs truncate flex-1 mx-2">
                          {summary}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-[10px] text-muted-foreground opacity-60 font-mono">
                            {log.message.split('\n').length} lines
                          </span>
                          <div className="text-[10px] text-muted-foreground opacity-50">
                            ↗
                          </div>
                        </div>
                      </div>
                    )
                  })
                }
              })()}
              
              {/* Loading indicator for infinite scroll */}
              {isLoadingMore && (
                <div className="flex items-center justify-center py-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin"></div>
                    Loading more logs...
                  </div>
                </div>
              )}
              
              {/* Load More button */}
              {hasMoreLogs && !isLoadingMore && logs.length > 0 && (
                <div className="text-center py-4">
                  <Button variant="secondary" size="sm" onClick={loadMoreLogs}>
                    Load More Logs
                  </Button>
                </div>
              )}
              
              {/* End of logs indicator */}
              {!hasMoreLogs && logs.length > 0 && (
                <div className="text-center py-4 text-xs text-muted-foreground">
                  No more logs available
                </div>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="streams" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Log Streams</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {logStreams.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No log streams found
                  </div>
                ) : (
                  logStreams.map((stream, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-mono text-sm">{stream.logStreamName}</div>
                        <div className="text-xs text-muted-foreground">
                          Created: {formatTimestamp(stream.creationTime)}
                        </div>
                      </div>
                      <div className="text-right">
                        {stream.lastEventTime && (
                          <div className="text-xs text-muted-foreground">
                            Last event: {formatTimestamp(stream.lastEventTime)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Log Detail Sheet */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent side="bottom" className="h-[80vh] flex flex-col">
          <SheetHeader className="pb-4">
            <div className="flex items-center justify-between">
              <SheetTitle>Log Details</SheetTitle>
              <div className="text-sm text-muted-foreground">
                {selectedLog && formatTimestamp(selectedLog.timestamp)}
              </div>
                          </div>
              <div className="relative">
                <Magnifier2 width="16" height="16" className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search in log..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </SheetHeader>
          
          <ScrollArea className="flex-1">
            <div className="font-mono text-sm space-y-1 p-4">
              {selectedLog && (
                searchTerm ? (
                  getFilteredLogLines().length > 0 ? (
                    getFilteredLogLines().map((line, index) => (
                      <div key={index} className="py-1 border-b border-gray-100 last:border-b-0">
                        <span className="text-muted-foreground text-xs mr-2">
                          {index + 1}
                        </span>
                        <span 
                          dangerouslySetInnerHTML={{
                            __html: line.replace(
                              new RegExp(searchTerm, 'gi'),
                              `<mark class="bg-yellow-200 text-yellow-900 px-1 rounded">$&</mark>`
                            )
                          }}
                        />
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-muted-foreground py-8">
                      No lines found matching "{searchTerm}"
                    </div>
                  )
                ) : (
                  selectedLog.message.split('\n').map((line, index) => {
                    const formatted = formatLogMessage(line)
                    return (
                      <div 
                        key={index} 
                        className={`py-1 border-b border-gray-100 last:border-b-0 ${
                          formatted.type === 'error' ? 'bg-red-50 text-red-700' :
                          formatted.type === 'warning' ? 'bg-yellow-50 text-yellow-700' :
                          formatted.type === 'success' ? 'bg-green-50 text-green-700' :
                          ''
                        }`}
                      >
                        <span className="text-muted-foreground text-xs mr-2 select-none">
                          {index + 1}
                        </span>
                        <span className="whitespace-pre-wrap break-words">
                          {line}
                        </span>
                      </div>
                    )
                  })
                )
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  )
} 