import { Button } from "@/components/ui/button"
import { HiArrowLeft, HiCalendar, HiUser, HiTag } from "react-icons/hi"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { fetchZenBlogPost, formatBlogDate } from "@/lib/zenblog"
import Link from "next/link"
import { notFound } from "next/navigation"

// Function to fetch GitHub stars (same as homepage)
async function getGitHubStars() {
  try {
    const response = await fetch('https://api.github.com/repos/R44VC0RP/inbound', {
      next: { revalidate: 3600 } // Cache for 1 hour
    })
    
    if (!response.ok) {
      throw new Error('Failed to fetch GitHub stars')
    }
    
    const data = await response.json()
    return data.stargazers_count + 876 || 0
  } catch (error) {
    console.error('Error fetching GitHub stars:', error)
    return 0 // Fallback to 0 if API fails
  }
}

interface BlogPostPageProps {
  params: Promise<{ slug: string }>
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params
  const session = await auth.api.getSession({
    headers: await headers()
  })

  // Fetch GitHub stars and blog post
  const [githubStars, blogPostResponse] = await Promise.all([
    getGitHubStars(),
    fetchZenBlogPost(slug)
  ])

  if (!blogPostResponse) {
    notFound()
  }

  const post = blogPostResponse.data

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Header (same as homepage) */}
      <header className="px-4 sm:px-6 py-4 sm:py-6 border-b border-gray-100">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/" className="flex items-center gap-2">
              <img src="/inbound-logo-3.png" alt="Email" width={32} height={32} className="inline-block align-bottom flex-shrink-0" />
              <div className="flex flex-col items-start gap-0 min-w-0">
                <span className="text-xl sm:text-2xl font-bold text-black truncate">inbound</span>
                <span className="text-xs text-gray-500 -mt-2 hidden sm:block">by exon</span>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {/* GitHub Star Button */}
            <Button variant="secondary" asChild className="hidden sm:flex">
              <a href="https://github.com/R44VC0RP/inbound" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.374 0 0 5.373 0 12 0 17.302 3.438 21.8 8.207 23.387c.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                </svg>
                <span className="hidden md:inline">Star</span> {githubStars > 0 && `(${githubStars})`}
              </a>
            </Button>
            
            {/* Discord Button */}
            <Button variant="secondary" asChild className="hidden sm:flex">
              <a href="https://discord.gg/JVdUrY9gJZ" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.0002 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9554 2.4189-2.1568 2.4189Z"/>
                </svg>
                Discord
              </a>
            </Button>
            
            {/* Blog Button */}
            <Button variant="secondary" asChild>
              <Link href="/blog">
                Blog
              </Link>
            </Button>
            
            {/* Auth Button */}
            {session ? (
              <Button variant="primary" asChild className="text-sm px-3 py-2">
                <a href="/mail">
                  <span className="hidden sm:inline">Go to Mail</span>
                  <span className="sm:hidden">Mail</span>
                </a>
              </Button>
            ) : (
              <Button variant="primary" asChild className="text-sm px-3 py-2">
                <a href="/login">
                  <span className="hidden sm:inline">Sign In</span>
                  <span className="sm:hidden">Login</span>
                </a>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 sm:px-6 py-12 sm:py-20">
        <div className="max-w-4xl mx-auto">
          {/* Back Button */}
          <div className="mb-6">
            <Button variant="ghost" asChild>
              <Link href="/blog" className="flex items-center gap-2">
                <HiArrowLeft className="w-4 h-4" />
                Back to Blog
              </Link>
            </Button>
          </div>

          {/* Article Header */}
          <article className="mb-8">
            <header className="mb-8">
              {/* Category */}
              {post.category && (
                <div className="mb-4">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-[#1C2894]/10 text-[#1C2894]">
                    {post.category.name}
                  </span>
                </div>
              )}
              
              {/* Title */}
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-6 leading-tight">
                {post.title}
              </h1>
              
              {/* Meta Information */}
              <div className="flex flex-wrap items-center gap-6 text-sm text-gray-600 mb-6">
                <div className="flex items-center gap-2">
                  <HiCalendar className="w-4 h-4" />
                  <span>{formatBlogDate(post.published_at)}</span>
                </div>
                
                {post.authors && post.authors.length > 0 && (
                  <div className="flex items-center gap-2">
                    <HiUser className="w-4 h-4" />
                    <span>By {post.authors.map(author => author.name).join(', ')}</span>
                  </div>
                )}
              </div>
              
              {/* Tags */}
              {post.tags && post.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-8">
                  {post.tags.map((tag) => (
                    <span key={tag.slug} className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-sm bg-gray-100 text-gray-600">
                      <HiTag className="w-4 h-4" />
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
            </header>

            {/* Article Content */}
            <div 
              className="prose prose-lg max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-[#1C2894] prose-a:no-underline hover:prose-a:underline prose-code:text-[#1C2894] prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-blockquote:border-l-[#1C2894] prose-blockquote:border-l-4 prose-blockquote:pl-4 prose-blockquote:text-gray-600"
              dangerouslySetInnerHTML={{ __html: post.html_content }}
            />
          </article>

          {/* Author Information */}
          {post.authors && post.authors.length > 0 && (
            <div className="border-t border-gray-200 pt-8 mt-12">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {post.authors.length === 1 ? 'About the Author' : 'About the Authors'}
              </h3>
              <div className="space-y-6">
                {post.authors.map((author) => (
                  <div key={author.slug} className="flex items-start gap-4">
                    {author.image_url && (
                      <img 
                        src={author.image_url} 
                        alt={author.name}
                        className="w-16 h-16 rounded-full object-cover flex-shrink-0"
                      />
                    )}
                                         <div className="flex-1">
                       <h4 className="font-semibold text-gray-900 mb-1">{author.name}</h4>
                       <div className="flex items-center gap-4 text-sm">
                        {author.website && (
                          <a 
                            href={author.website} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[#1C2894] hover:underline"
                          >
                            Website
                          </a>
                        )}
                        {author.twitter && (
                          <a 
                            href={`https://twitter.com/${author.twitter}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-[#1C2894] hover:underline"
                          >
                            Twitter
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Back to Blog */}
          <div className="border-t border-gray-200 pt-8 mt-12 text-center">
            <Button variant="primary" asChild>
              <Link href="/blog">
                ← Back to All Posts
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}