/**
 * React component renderer for email templates
 * Converts React components to HTML strings for email sending
 */

import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactEmailComponent } from './types'

/**
 * Renders a React component to static HTML markup
 * @param component - React component or element to render
 * @returns HTML string suitable for email clients
 */
export function renderReactToHtml(component: ReactEmailComponent): string {
  try {
    // Handle both component types and elements
    const element = React.isValidElement(component) 
      ? component 
      : React.createElement(component as React.ComponentType<any>)
    
    // Render to static HTML (no hydration needed for emails)
    const html = renderToStaticMarkup(element)
    
    return html
  } catch (error) {
    throw new Error(`Failed to render React component: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Validates that React dependencies are available
 * @returns boolean indicating if React rendering is supported
 */
export function isReactRenderingSupported(): boolean {
  try {
    return typeof React !== 'undefined' && typeof renderToStaticMarkup !== 'undefined'
  } catch {
    return false
  }
}

/**
 * Gets a helpful error message when React rendering is not available
 */
export function getReactRenderingError(): string {
  return 'React rendering is not available. Please install react and react-dom dependencies: npm install react react-dom'
}
