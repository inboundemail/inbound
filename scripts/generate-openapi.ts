#!/usr/bin/env bun

import { Project, Node, TypeChecker, SourceFile } from 'ts-morph'
import { writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { OpenAPIV3 } from 'openapi-types'

interface RouteInfo {
  path: string
  method: string
  operationId: string
  summary: string
  description?: string
  requestType?: string
  responseType?: string
  sourceFile: string
  hasAuth: boolean
  tags: string[]
}

interface TypeInfo {
  name: string
  properties: Record<string, any>
  required: string[]
  description?: string
}

/**
 * OpenAPI Generator for Inbound v2 API
 * 
 * This script scans the /app/api/v2 directory and generates a complete OpenAPI 3.0 specification
 * by analyzing TypeScript interfaces and route handlers.
 */
class OpenAPIGenerator {
  private project: Project
  private typeChecker: TypeChecker
  private routes: RouteInfo[] = []
  private types: Map<string, TypeInfo> = new Map()
  private baseDir: string

  constructor() {
    this.baseDir = process.cwd()
    this.project = new Project({
      tsConfigFilePath: join(this.baseDir, 'tsconfig.json'),
    })
    
    // Add only API v2 route files to the project
    this.project.addSourceFilesAtPaths([
      'app/api/v2/**/*.ts'
    ])
    
    this.typeChecker = this.project.getTypeChecker()
  }

  /**
   * Generate the complete OpenAPI specification
   */
  async generate(): Promise<OpenAPIV3.Document> {
    console.log('🔍 Scanning API routes...')
    await this.scanRoutes()
    
    console.log('📝 Extracting TypeScript types...')
    await this.extractTypes()
    
    console.log('🏗️  Building OpenAPI specification...')
    const spec = this.buildOpenAPISpec()
    
    console.log('✅ OpenAPI specification generated successfully!')
    return spec
  }

  /**
   * Scan all route files and extract route information
   */
  private async scanRoutes(): Promise<void> {
    const routeFiles = this.project.getSourceFiles('app/api/v2/**/route.ts')
    
    for (const file of routeFiles) {
      const routeInfo = this.extractRouteInfo(file)
      this.routes.push(...routeInfo)
    }
    
    console.log(`📊 Found ${this.routes.length} API endpoints`)
  }

  /**
   * Extract route information from a route file
   */
  private extractRouteInfo(file: SourceFile): RouteInfo[] {
    const routes: RouteInfo[] = []
    const filePath = file.getFilePath()
    const relativePath = filePath.replace(this.baseDir, '').replace('/app/api/v2', '').replace('/route.ts', '')
    
    // Convert file path to API path
    const apiPath = this.convertFilePathToAPIPath(relativePath)
    
    // Extract HTTP methods and their types
    const httpMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
    
    for (const method of httpMethods) {
      const functionDeclaration = file.getFunction(method)
      if (functionDeclaration) {
        const route = this.extractRouteDetails(file, method, apiPath, filePath)
        if (route) {
          routes.push(route)
        }
      }
    }
    
    return routes
  }

  /**
   * Convert file path to API path
   */
  private convertFilePathToAPIPath(filePath: string): string {
    return filePath
      .replace(/\[([^\]]+)\]/g, '{$1}') // Convert [id] to {id}
      .replace(/\/$/, '') // Remove trailing slash
      || '/' // Root path
  }

  /**
   * Extract detailed route information
   */
  private extractRouteDetails(file: SourceFile, method: string, apiPath: string, filePath: string): RouteInfo | null {
    const comments = this.extractRouteComments(file, method)
    const types = this.extractRouteTypes(file, method)
    
    // Determine tags based on path
    const tags = this.determineTags(apiPath)
    
    return {
      path: `/api/v2${apiPath}`,
      method: method.toLowerCase(),
      operationId: this.generateOperationId(method, apiPath),
      summary: comments.summary || `${method} ${apiPath}`,
      description: comments.description,
      requestType: types.request,
      responseType: types.response,
      sourceFile: filePath,
      hasAuth: this.checkForAuth(file),
      tags
    }
  }

  /**
   * Extract comments from route functions
   */
  private extractRouteComments(file: SourceFile, method: string): { summary?: string; description?: string } {
    // Look for JSDoc comments above the function or in the file
    const content = file.getFullText()
    const methodRegex = new RegExp(`/\\*\\*[\\s\\S]*?\\*\\*/${method}`, 'g')
    const match = methodRegex.exec(content)
    
    if (match) {
      const comment = match[0]
      const summaryMatch = comment.match(/\* (.+)/)?.[1]
      return {
        summary: summaryMatch?.replace(/\*/g, '').trim(),
        description: comment
      }
    }
    
    return {}
  }

  /**
   * Extract request and response types for a route
   */
  private extractRouteTypes(file: SourceFile, method: string): { request?: string; response?: string } {
    const interfaces = file.getInterfaces()
    const methodPrefix = method.charAt(0).toUpperCase() + method.slice(1).toLowerCase()
    
    let requestType: string | undefined
    let responseType: string | undefined
    
    for (const iface of interfaces) {
      const name = iface.getName()
      if (name.includes(`${methodPrefix}`) && name.includes('Request')) {
        requestType = name
      }
      if (name.includes(`${methodPrefix}`) && name.includes('Response')) {
        responseType = name
      }
    }
    
    return { request: requestType, response: responseType }
  }

  /**
   * Check if route requires authentication
   */
  private checkForAuth(file: SourceFile): boolean {
    const content = file.getFullText()
    return content.includes('validateRequest')
  }

  /**
   * Determine tags based on API path
   */
  private determineTags(apiPath: string): string[] {
    const pathParts = apiPath.split('/').filter(Boolean)
    if (pathParts.length > 0) {
      return [pathParts[0]]
    }
    return ['general']
  }

  /**
   * Generate operation ID
   */
  private generateOperationId(method: string, path: string): string {
    const pathParts = path.split('/').filter(Boolean)
    const resource = pathParts[0] || 'root'
    const hasId = path.includes('{id}')
    
    const action = method.toLowerCase()
    const resourceName = resource.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
    
    if (hasId) {
      return `${action}${resourceName.charAt(0).toUpperCase() + resourceName.slice(1)}ById`
    } else if (action === 'get') {
      return `list${resourceName.charAt(0).toUpperCase() + resourceName.slice(1)}`
    } else {
      return `${action}${resourceName.charAt(0).toUpperCase() + resourceName.slice(1)}`
    }
  }

  /**
   * Extract TypeScript types and convert to OpenAPI schemas
   */
  private async extractTypes(): Promise<void> {
    // Only extract types from route files since that's where API interfaces are defined
    const routeFiles = this.project.getSourceFiles('app/api/v2/**/route.ts')
    
    for (const file of routeFiles) {
      const interfaces = file.getInterfaces()
      
      for (const iface of interfaces) {
        const typeInfo = this.convertInterfaceToTypeInfo(iface)
        if (typeInfo) {
          this.types.set(typeInfo.name, typeInfo)
        }
      }
    }
    
    console.log(`📝 Extracted ${this.types.size} type definitions from API route files`)
  }

  /**
   * Convert TypeScript interface to OpenAPI schema info
   */
  private convertInterfaceToTypeInfo(iface: any): TypeInfo | null {
    const name = iface.getName()
    const properties: Record<string, any> = {}
    const required: string[] = []
    
    for (const prop of iface.getProperties()) {
      const propName = prop.getName()
      const propType = prop.getType()
      const isOptional = prop.hasQuestionToken()
      
      if (!isOptional) {
        required.push(propName)
      }
      
      properties[propName] = this.convertTypeToOpenAPISchema(propType, prop)
    }
    
    return {
      name,
      properties,
      required,
      description: this.extractJSDocDescription(iface)
    }
  }

  /**
   * Convert TypeScript type to OpenAPI schema
   */
  private convertTypeToOpenAPISchema(type: any, prop: any): any {
    const typeText = type.getText()
    
    // Handle basic types
    if (typeText.includes('string')) {
      return { type: 'string' }
    }
    if (typeText.includes('number')) {
      return { type: 'number' }
    }
    if (typeText.includes('boolean')) {
      return { type: 'boolean' }
    }
    
    // Handle arrays
    if (typeText.includes('[]') || typeText.includes('Array<')) {
      const itemType = typeText.replace('[]', '').replace(/Array<(.+)>/, '$1').trim()
      return {
        type: 'array',
        items: this.convertStringTypeToSchema(itemType)
      }
    }
    
    // Handle union types (enums)
    if (typeText.includes('|')) {
      const values = typeText.split('|').map((v: string) => v.trim().replace(/['"]/g, ''))
      return {
        type: 'string',
        enum: values
      }
    }
    
    // Handle objects
    if (typeText.includes('{') || typeText === 'object') {
      return { type: 'object' }
    }
    
    // Default to string
    return { type: 'string' }
  }

  /**
   * Convert string type to OpenAPI schema
   */
  private convertStringTypeToSchema(typeStr: string): any {
    if (typeStr === 'string') return { type: 'string' }
    if (typeStr === 'number') return { type: 'number' }
    if (typeStr === 'boolean') return { type: 'boolean' }
    return { type: 'string' }
  }

  /**
   * Extract JSDoc description
   */
  private extractJSDocDescription(node: any): string | undefined {
    const jsDoc = node.getJsDocs()?.[0]
    return jsDoc?.getDescription()?.trim()
  }

  /**
   * Build the complete OpenAPI specification
   */
  private buildOpenAPISpec(): OpenAPIV3.Document {
    const spec: OpenAPIV3.Document = {
      openapi: '3.0.3',
      info: {
        title: 'Inbound Email API',
        description: 'Comprehensive API for managing inbound email processing, domains, endpoints, and email operations.',
        version: '2.0.0',
        contact: {
          name: 'Inbound Email Support',
          url: 'https://inbound.new',
          email: 'support@inbound.new'
        },
        license: {
          name: 'MIT',
          url: 'https://opensource.org/licenses/MIT'
        }
      },
      servers: [
        {
          url: 'https://inbound.new',
          description: 'Production server'
        },
        {
          url: 'http://localhost:3000',
          description: 'Development server'
        }
      ],
      paths: this.buildPaths(),
      components: {
        schemas: this.buildSchemas(),
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT'
          },
          ApiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'Authorization'
          }
        }
      },
      tags: this.buildTags()
    }

    return spec
  }

  /**
   * Build OpenAPI paths from routes
   */
  private buildPaths(): OpenAPIV3.PathsObject {
    const paths: OpenAPIV3.PathsObject = {}
    
    for (const route of this.routes) {
      if (!paths[route.path]) {
        paths[route.path] = {}
      }
      
      const operation: OpenAPIV3.OperationObject = {
        operationId: route.operationId,
        summary: route.summary,
        description: route.description,
        tags: route.tags,
        responses: this.buildResponses(route),
        security: route.hasAuth ? [{ BearerAuth: [] }, { ApiKeyAuth: [] }] : []
      }
      
      // Add request body for POST/PUT/PATCH
      if (['post', 'put', 'patch'].includes(route.method) && route.requestType) {
        operation.requestBody = {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: `#/components/schemas/${route.requestType}` }
            }
          }
        }
      }
      
      // Add parameters for GET requests
      if (route.method === 'get' && route.requestType) {
        operation.parameters = this.buildParameters(route.requestType)
      }
      
      // Add path parameters
      if (route.path.includes('{')) {
        operation.parameters = operation.parameters || []
        const pathParams = route.path.match(/\{([^}]+)\}/g) || []
        for (const param of pathParams) {
          const paramName = param.replace(/[{}]/g, '')
          operation.parameters.push({
            name: paramName,
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: `${paramName} identifier`
          })
        }
      }
      
      ;(paths[route.path] as any)[route.method] = operation
    }
    
    return paths
  }

  /**
   * Build response schemas
   */
  private buildResponses(route: RouteInfo): OpenAPIV3.ResponsesObject {
    const responses: OpenAPIV3.ResponsesObject = {
      '401': {
        description: 'Unauthorized - Invalid or missing authentication',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'string' }
              }
            }
          }
        }
      },
      '500': {
        description: 'Internal Server Error',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'string' }
              }
            }
          }
        }
      }
    }
    
    if (route.responseType) {
      responses['200'] = {
        description: 'Success',
        content: {
          'application/json': {
            schema: { $ref: `#/components/schemas/${route.responseType}` }
          }
        }
      }
    } else {
      responses['200'] = {
        description: 'Success',
        content: {
          'application/json': {
            schema: { type: 'object' }
          }
        }
      }
    }
    
    // Add specific error responses based on route
    if (['post', 'put', 'patch'].includes(route.method)) {
      responses['400'] = {
        description: 'Bad Request - Invalid input data',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                error: { type: 'string' },
                details: { type: 'object' }
              }
            }
          }
        }
      }
    }
    
    return responses
  }

  /**
   * Build query parameters for GET requests
   */
  private buildParameters(requestType: string): OpenAPIV3.ParameterObject[] {
    const typeInfo = this.types.get(requestType)
    if (!typeInfo) return []
    
    const parameters: OpenAPIV3.ParameterObject[] = []
    
    for (const [propName, propSchema] of Object.entries(typeInfo.properties)) {
      parameters.push({
        name: propName,
        in: 'query',
        required: typeInfo.required.includes(propName),
        schema: propSchema,
        description: `${propName} parameter`
      })
    }
    
    return parameters
  }

  /**
   * Build component schemas
   */
  private buildSchemas(): Record<string, OpenAPIV3.SchemaObject> {
    const schemas: Record<string, OpenAPIV3.SchemaObject> = {}
    
    for (const [name, typeInfo] of this.types) {
      schemas[name] = {
        type: 'object',
        properties: typeInfo.properties,
        required: typeInfo.required,
        description: typeInfo.description
      }
    }
    
    // Add common error schema
    schemas['Error'] = {
      type: 'object',
      properties: {
        error: { type: 'string' },
        details: { type: 'object' }
      },
      required: ['error']
    }
    
    return schemas
  }

  /**
   * Build API tags
   */
  private buildTags(): OpenAPIV3.TagObject[] {
    const tagSet = new Set<string>()
    
    for (const route of this.routes) {
      route.tags.forEach(tag => tagSet.add(tag))
    }
    
    const tagDescriptions: Record<string, string> = {
      emails: 'Email sending and management operations',
      domains: 'Domain verification and DNS management',
      endpoints: 'Webhook and endpoint configuration',
      mail: 'Inbound email processing and retrieval',
      'email-addresses': 'Email address management and configuration',
      onboarding: 'User onboarding and setup workflows',
      testing: 'Testing and validation utilities'
    }
    
    return Array.from(tagSet).map(tag => ({
      name: tag,
      description: tagDescriptions[tag] || `${tag} operations`
    }))
  }
}

/**
 * Main execution function
 */
async function main() {
  try {
    console.log('🚀 Starting OpenAPI specification generation...')
    
    const generator = new OpenAPIGenerator()
    const spec = await generator.generate()
    
    // Write to file
    const outputPath = join(process.cwd(), 'public', 'openapi.json')
    writeFileSync(outputPath, JSON.stringify(spec, null, 2))
    
    console.log(`📄 OpenAPI specification written to: ${outputPath}`)
    console.log(`📊 Generated specification includes:`)
    console.log(`   - ${Object.keys(spec.paths || {}).length} API endpoints`)
    console.log(`   - ${Object.keys(spec.components?.schemas || {}).length} type definitions`)
    console.log(`   - ${spec.tags?.length || 0} API tags`)
    
    // Also write a YAML version if requested
    const yamlPath = join(process.cwd(), 'public', 'openapi.yaml')
    try {
      const yaml = await import('yaml')
      writeFileSync(yamlPath, yaml.stringify(spec))
      console.log(`📄 YAML version written to: ${yamlPath}`)
    } catch {
      console.log('⚠️  YAML package not available, skipping YAML output')
    }
    
    console.log('✅ OpenAPI generation completed successfully!')
    
  } catch (error) {
    console.error('❌ Error generating OpenAPI specification:', error)
    process.exit(1)
  }
}

// Run if called directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  main()
}

export { OpenAPIGenerator }
