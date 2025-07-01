export interface ZenBlogPost {
  title: string
  html_content: string
  slug: string
  category?: {
    name: string
    slug: string
  }
  tags?: Array<{
    name: string
    slug: string
  }>
  excerpt?: string
  published_at: string
  authors?: Array<{
    slug: string
    name: string
    image_url?: string
    website?: string
    twitter?: string
  }>
}

export interface ZenBlogPostsResponse {
  data: ZenBlogPost[]
  total?: number
  offset?: number
  limit?: number
}

export interface ZenBlogPostResponse {
  data: ZenBlogPost
}

export interface ZenBlogCategory {
  name: string
  slug: string
}

export interface ZenBlogCategoriesResponse {
  data: ZenBlogCategory[]
  total?: number
  offset?: number
  limit?: number
}

export interface ZenBlogTag {
  name: string
  slug: string
}

export interface ZenBlogTagsResponse {
  data: ZenBlogTag[]
  total?: number
  offset?: number
  limit?: number
}

export interface ZenBlogAuthor {
  name: string
  slug: string
  image_url?: string
  twitter?: string
  website?: string
  bio?: string
}

export interface ZenBlogAuthorsResponse {
  data: ZenBlogAuthor[]
  total?: number
  offset?: number
  limit?: number
}

export interface ZenBlogAuthorResponse {
  data: ZenBlogAuthor
}