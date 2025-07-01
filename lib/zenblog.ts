import { ZenBlogPostsResponse, ZenBlogPostResponse } from './types/zenblog'

// You'll need to set your blog ID from the Zenblog dashboard
const BLOG_ID = process.env.ZENBLOG_BLOG_ID || 'your-blog-id'
const ZENBLOG_BASE_URL = 'https://api.zenblog.com'

export async function fetchZenBlogPosts(options?: {
  limit?: number
  offset?: number
  category?: string
  tags?: string[]
  author?: string
}): Promise<ZenBlogPostsResponse> {
  const params = new URLSearchParams()
  
  if (options?.limit) params.append('limit', options.limit.toString())
  if (options?.offset) params.append('offset', options.offset.toString())
  if (options?.category) params.append('category', options.category)
  if (options?.tags) params.append('tags', options.tags.join(','))
  if (options?.author) params.append('author', options.author)

  const url = `${ZENBLOG_BASE_URL}/blogs/${BLOG_ID}/posts?${params.toString()}`
  
  try {
    const response = await fetch(url, {
      next: { revalidate: 3600 } // Cache for 1 hour
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch blog posts: ${response.status}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error('Error fetching blog posts:', error)
    // Return empty response as fallback
    return { data: [] }
  }
}

export async function fetchZenBlogPost(slug: string): Promise<ZenBlogPostResponse | null> {
  const url = `${ZENBLOG_BASE_URL}/blogs/${BLOG_ID}/posts/${slug}`
  
  try {
    const response = await fetch(url, {
      next: { revalidate: 3600 } // Cache for 1 hour
    })
    
    if (!response.ok) {
      if (response.status === 404) {
        return null
      }
      throw new Error(`Failed to fetch blog post: ${response.status}`)
    }
    
    return await response.json()
  } catch (error) {
    console.error('Error fetching blog post:', error)
    return null
  }
}

// Utility function to format date
export function formatBlogDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

// Utility function to extract text from HTML content
export function extractTextFromHtml(htmlContent: string, maxLength: number = 150): string {
  // Simple HTML tag removal for excerpt
  const textContent = htmlContent.replace(/<[^>]*>/g, '')
  return textContent.length > maxLength 
    ? textContent.substring(0, maxLength) + '...'
    : textContent
}