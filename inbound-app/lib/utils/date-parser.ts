/**
 * Natural Language Date Parser for Email Scheduling
 * Supports Resend-compatible date formats:
 * - Natural language: "in 1 min", "in 1 hour", "tomorrow at 9am"
 * - ISO 8601: "2024-08-05T11:52:01.858Z"
 */

export interface ParsedScheduleDate {
  date: Date
  timezone: string
  originalInput: string
  isValid: boolean
  error?: string
}

/**
 * Parse a scheduled_at string into a Date object
 * Supports both natural language and ISO 8601 formats
 */
export function parseScheduledAt(
  scheduledAt: string, 
  userTimezone: string = 'UTC'
): ParsedScheduleDate {
  const result: ParsedScheduleDate = {
    date: new Date(),
    timezone: userTimezone,
    originalInput: scheduledAt,
    isValid: false
  }

  try {
    // First, try to parse as ISO 8601 date
    if (isISO8601(scheduledAt)) {
      const date = new Date(scheduledAt)
      if (!isNaN(date.getTime())) {
        result.date = date
        result.isValid = true
        result.timezone = 'UTC' // ISO dates are always UTC
        return result
      }
    }

    // Parse natural language expressions
    const naturalDate = parseNaturalLanguage(scheduledAt, userTimezone)
    if (naturalDate) {
      result.date = naturalDate
      result.isValid = true
      return result
    }

    // If we get here, parsing failed
    result.error = `Unable to parse date: "${scheduledAt}". Use ISO 8601 format or natural language like "in 1 hour", "tomorrow at 9am"`
    return result

  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown parsing error'
    return result
  }
}

/**
 * Check if a string is in ISO 8601 format
 */
function isISO8601(dateString: string): boolean {
  const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/
  return iso8601Regex.test(dateString)
}

/**
 * Parse natural language date expressions
 * Supports: "in X min/hour/day", "tomorrow at X", etc.
 */
function parseNaturalLanguage(input: string, timezone: string): Date | null {
  const now = new Date()
  const trimmed = input.toLowerCase().trim()

  // Pattern: "in X minutes/min"
  const minutesMatch = trimmed.match(/^in\s+(\d+)\s+(minutes?|mins?)$/)
  if (minutesMatch) {
    const minutes = parseInt(minutesMatch[1])
    return new Date(now.getTime() + minutes * 60 * 1000)
  }

  // Pattern: "in X hours/hour"
  const hoursMatch = trimmed.match(/^in\s+(\d+)\s+(hours?|hrs?)$/)
  if (hoursMatch) {
    const hours = parseInt(hoursMatch[1])
    return new Date(now.getTime() + hours * 60 * 60 * 1000)
  }

  // Pattern: "in X days/day"
  const daysMatch = trimmed.match(/^in\s+(\d+)\s+(days?|day)$/)
  if (daysMatch) {
    const days = parseInt(daysMatch[1])
    return new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
  }

  // Pattern: "tomorrow at Xam/pm" or "tomorrow at X:XX"
  const tomorrowMatch = trimmed.match(/^tomorrow\s+at\s+(.+)$/)
  if (tomorrowMatch) {
    const timeStr = tomorrowMatch[1]
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    
    const timeDate = parseTimeString(timeStr, tomorrow)
    if (timeDate) return timeDate
  }

  // Pattern: "today at Xam/pm" or "today at X:XX"
  const todayMatch = trimmed.match(/^today\s+at\s+(.+)$/)
  if (todayMatch) {
    const timeStr = todayMatch[1]
    const today = new Date(now)
    
    const timeDate = parseTimeString(timeStr, today)
    if (timeDate) return timeDate
  }

  return null
}

/**
 * Parse time strings like "9am", "2:30pm", "14:30"
 */
function parseTimeString(timeStr: string, baseDate: Date): Date | null {
  const time = timeStr.toLowerCase().trim()
  
  // Pattern: "9am", "12pm"
  const ampmMatch = time.match(/^(\d{1,2})(am|pm)$/)
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1])
    const period = ampmMatch[2]
    
    if (period === 'pm' && hour !== 12) hour += 12
    if (period === 'am' && hour === 12) hour = 0
    
    const result = new Date(baseDate)
    result.setHours(hour, 0, 0, 0)
    return result
  }

  // Pattern: "9:30am", "2:45pm"
  const ampmWithMinutesMatch = time.match(/^(\d{1,2}):(\d{2})(am|pm)$/)
  if (ampmWithMinutesMatch) {
    let hour = parseInt(ampmWithMinutesMatch[1])
    const minute = parseInt(ampmWithMinutesMatch[2])
    const period = ampmWithMinutesMatch[3]
    
    if (period === 'pm' && hour !== 12) hour += 12
    if (period === 'am' && hour === 12) hour = 0
    
    const result = new Date(baseDate)
    result.setHours(hour, minute, 0, 0)
    return result
  }

  // Pattern: "14:30", "09:15" (24-hour format)
  const twentyFourHourMatch = time.match(/^(\d{1,2}):(\d{2})$/)
  if (twentyFourHourMatch) {
    const hour = parseInt(twentyFourHourMatch[1])
    const minute = parseInt(twentyFourHourMatch[2])
    
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      const result = new Date(baseDate)
      result.setHours(hour, minute, 0, 0)
      return result
    }
  }

  return null
}

/**
 * Validate that a scheduled date is in the future
 */
export function validateScheduledDate(date: Date, minMinutesFromNow: number = 1): {
  isValid: boolean
  error?: string
} {
  const now = new Date()
  const minTime = new Date(now.getTime() + minMinutesFromNow * 60 * 1000)
  
  if (date <= minTime) {
    return {
      isValid: false,
      error: `Scheduled time must be at least ${minMinutesFromNow} minute(s) in the future`
    }
  }
  
  // Don't allow scheduling more than 1 year in the future
  const maxTime = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
  if (date > maxTime) {
    return {
      isValid: false,
      error: 'Scheduled time cannot be more than 1 year in the future'
    }
  }
  
  return { isValid: true }
}

/**
 * Format a date for display in API responses
 */
export function formatScheduledDate(date: Date): string {
  return date.toISOString()
}

/**
 * Examples of supported formats for documentation
 */
export const SUPPORTED_DATE_FORMATS = {
  iso8601: [
    '2024-08-05T11:52:01.858Z',
    '2024-12-25T09:00:00Z'
  ],
  naturalLanguage: [
    'in 1 min',
    'in 30 minutes', 
    'in 2 hours',
    'in 1 day',
    'today at 3pm',
    'today at 15:30',
    'tomorrow at 9am',
    'tomorrow at 2:30pm'
  ]
} as const
