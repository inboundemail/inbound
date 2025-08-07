'use server'

import { 
  CloudWatchLogsClient, 
  DescribeLogGroupsCommand, 
  DescribeLogStreamsCommand, 
  GetLogEventsCommand,
  FilterLogEventsCommand
} from "@aws-sdk/client-cloudwatch-logs"
import { 
  LambdaClient, 
  GetFunctionCommand, 
  GetFunctionConfigurationCommand,
  ListFunctionsCommand
} from "@aws-sdk/client-lambda"

// Initialize AWS clients
const cloudWatchLogsClient = new CloudWatchLogsClient({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

const LAMBDA_FUNCTION_NAME = process.env.LAMBDA_FUNCTION_NAME || 'inbound-email-processor'

export interface LogEvent {
  timestamp: number
  message: string
  ingestionTime: number
}

export interface LogStreamInfo {
  logStreamName: string
  creationTime: number
  lastEventTime?: number
  lastIngestionTime?: number
  uploadSequenceToken?: string
}

export interface LambdaFunctionInfo {
  functionName: string
  runtime: string
  handler: string
  codeSize: number
  description: string
  timeout: number
  memorySize: number
  lastModified: string
  version: string
  state: string
  environment?: Record<string, string>
}

export async function getLambdaFunctionInfo(): Promise<{ success: boolean; data?: LambdaFunctionInfo; error?: string }> {
  try {
    const command = new GetFunctionConfigurationCommand({
      FunctionName: LAMBDA_FUNCTION_NAME,
    })
    
    const response = await lambdaClient.send(command)
    
    return {
      success: true,
      data: {
        functionName: response.FunctionName || '',
        runtime: response.Runtime || '',
        handler: response.Handler || '',
        codeSize: response.CodeSize || 0,
        description: response.Description || '',
        timeout: response.Timeout || 0,
        memorySize: response.MemorySize || 0,
        lastModified: response.LastModified || '',
        version: response.Version || '',
        state: response.State || '',
        environment: response.Environment?.Variables || {},
      }
    }
  } catch (error) {
    console.error('Error fetching Lambda function info:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

export async function getLambdaLogStreams(): Promise<{ success: boolean; data?: LogStreamInfo[]; error?: string }> {
  try {
    const logGroupName = `/aws/lambda/${LAMBDA_FUNCTION_NAME}`
    
    const command = new DescribeLogStreamsCommand({
      logGroupName,
      orderBy: 'LastEventTime',
      descending: true,
      limit: 10, // Get latest 10 log streams
    })
    
    const response = await cloudWatchLogsClient.send(command)
    
    const logStreams: LogStreamInfo[] = (response.logStreams || []).map(stream => ({
      logStreamName: stream.logStreamName || '',
      creationTime: stream.creationTime || 0,
      lastEventTime: (stream as any).lastEventTime || 0,
      lastIngestionTime: (stream as any).lastIngestionTime || 0,
      uploadSequenceToken: stream.uploadSequenceToken,
    }))
    
    return {
      success: true,
      data: logStreams
    }
  } catch (error) {
    console.error('Error fetching log streams:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

export async function getLambdaLogs(
  logStreamName?: string,
  startTime?: number,
  limit: number = 100
): Promise<{ success: boolean; data?: LogEvent[]; nextToken?: string; error?: string }> {
  try {
    const logGroupName = `/aws/lambda/${LAMBDA_FUNCTION_NAME}`
    
    if (logStreamName) {
      // Get logs from specific stream
      const command = new GetLogEventsCommand({
        logGroupName,
        logStreamName,
        startTime,
        limit,
        startFromHead: false, // Get most recent logs first
      })
      
      const response = await cloudWatchLogsClient.send(command)
      
      const events: LogEvent[] = (response.events || []).map(event => ({
        timestamp: event.timestamp || 0,
        message: event.message || '',
        ingestionTime: event.ingestionTime || 0,
      }))
      
      return {
        success: true,
        data: events,
        nextToken: response.nextForwardToken,
      }
    } else {
      // Get logs from all streams using filter
      const command = new FilterLogEventsCommand({
        logGroupName,
        startTime,
        limit,
      })
      
      const response = await cloudWatchLogsClient.send(command)
      
      const events: LogEvent[] = (response.events || []).map(event => ({
        timestamp: event.timestamp || 0,
        message: event.message || '',
        ingestionTime: event.ingestionTime || 0,
      }))
      
      return {
        success: true,
        data: events,
        nextToken: response.nextToken,
      }
    }
  } catch (error) {
    console.error('Error fetching Lambda logs:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

export async function getLambdaRecentLogs(
  minutes: number = 30,
  limit: number = 500
): Promise<{ success: boolean; data?: LogEvent[]; nextToken?: string; error?: string }> {
  try {
    const startTime = Date.now() - (minutes * 60 * 1000)
    
    const result = await getLambdaLogs(undefined, startTime, limit)
    return result
  } catch (error) {
    console.error('Error fetching recent Lambda logs:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

export async function getLambdaMoreLogs(
  minutes: number = 30,
  nextToken: string,
  limit: number = 200
): Promise<{ success: boolean; data?: LogEvent[]; nextToken?: string; error?: string }> {
  try {
    const logGroupName = `/aws/lambda/${LAMBDA_FUNCTION_NAME}`
    const startTime = Date.now() - (minutes * 60 * 1000)
    
    const command = new FilterLogEventsCommand({
      logGroupName,
      startTime,
      limit,
      nextToken,
    })
    
    const response = await cloudWatchLogsClient.send(command)
    
    const events: LogEvent[] = (response.events || []).map(event => ({
      timestamp: event.timestamp || 0,
      message: event.message || '',
      ingestionTime: event.ingestionTime || 0,
    }))
    
    return {
      success: true,
      data: events,
      nextToken: response.nextToken,
    }
  } catch (error) {
    console.error('Error fetching more Lambda logs:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// AWS initialization check
export async function checkAWSConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    // Try to list functions to test connection
    const command = new ListFunctionsCommand({
      MaxItems: 1,
    })
    
    await lambdaClient.send(command)
    
    return { success: true }
  } catch (error) {
    console.error('AWS connection error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
} 