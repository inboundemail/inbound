/**
 * Base context that's available to all v3 API procedures
 * This gets populated from the request and passed through middleware
 */
export interface BaseContext {
  headers: Record<string, string | string[] | undefined>
  ip?: string
  userAgent?: string
}

/**
 * Context after authentication middleware
 * Contains the authenticated user's information
 */
export interface AuthenticatedContext extends BaseContext {
  userId: string
  sessionId: string | undefined
  authMethod: 'session' | 'api-key'
}

/**
 * Converts Next.js Headers object to plain object
 */
function headersToObject(headers: Headers): Record<string, string | string[] | undefined> {
  const obj: Record<string, string | string[] | undefined> = {}
  headers.forEach((value, key) => {
    obj[key.toLowerCase()] = value
  })
  return obj
}

/**
 * Creates the initial context from an incoming request
 */
export async function createContext(opts: {
  headers: Headers
  ip?: string
}): Promise<BaseContext> {
  const headersObj = headersToObject(opts.headers)
  
  return {
    headers: headersObj,
    ip: opts.ip,
    userAgent: headersObj['user-agent'] as string | undefined,
  }
}

