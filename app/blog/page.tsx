import { Button } from "@/components/ui/button"
import { HiArrowRight, HiCalendar, HiUser, HiTag } from "react-icons/hi"
import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { fetchZenBlogPosts, formatBlogDate, extractTextFromHtml } from "@/lib/zenblog"
import Link from "next/link"

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

export default async function BlogPage() {
  const session = await auth.api.getSession({
    headers: await headers()
  })

  // Fetch GitHub stars and blog posts
  const [githubStars, blogPosts] = await Promise.all([
    getGitHubStars(),
    fetchZenBlogPosts({ limit: 12 }) // Fetch more posts for the main blog page
  ])

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
            
            {/* Home Button */}
            <Button variant="secondary" asChild>
              <Link href="/">
                Home
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
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <div className="text-center mb-12 sm:mb-16">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4 sm:mb-6 leading-tight">
              <span className="text-[#1C2894]">inbound</span> blog
            </h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 mb-4 max-w-3xl mx-auto leading-relaxed px-4">
              insights, tutorials, and updates from the team behind the easiest way to turn emails into endpoints.
            </p>
          </div>

          {/* Blog Posts Grid */}
          {blogPosts.data.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {blogPosts.data.map((post) => (
                <article key={post.slug} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-300 overflow-hidden">
                  <div className="p-6">
                    {/* Category */}
                    {post.category && (
                      <div className="mb-3">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[#1C2894]/10 text-[#1C2894]">
                          {post.category.name}
                        </span>
                      </div>
                    )}
                    
                    {/* Title */}
                    <h2 className="text-xl font-bold text-gray-900 mb-3 leading-tight">
                      <Link href={`/blog/${post.slug}`} className="hover:text-[#1C2894] transition-colors">
                        {post.title}
                      </Link>
                    </h2>
                    
                    {/* Excerpt */}
                    <p className="text-gray-600 text-sm mb-4 leading-relaxed">
                      {post.excerpt || extractTextFromHtml(post.html_content)}
                    </p>
                    
                    {/* Meta Info */}
                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 mb-4">
                      <div className="flex items-center gap-1">
                        <HiCalendar className="w-3 h-3" />
                        <span>{formatBlogDate(post.published_at)}</span>
                      </div>
                      
                      {post.authors && post.authors.length > 0 && (
                        <div className="flex items-center gap-1">
                          <HiUser className="w-3 h-3" />
                          <span>{post.authors[0].name}</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Tags */}
                    {post.tags && post.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {post.tags.slice(0, 3).map((tag) => (
                          <span key={tag.slug} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-gray-100 text-gray-600">
                            <HiTag className="w-3 h-3" />
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                    
                    {/* Read More Link */}
                    <Link 
                      href={`/blog/${post.slug}`}
                      className="inline-flex items-center gap-2 text-sm font-medium text-[#1C2894] hover:text-[#1C2894]/80 transition-colors"
                    >
                      Read more
                      <HiArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            /* Empty State */
            <div className="text-center py-12">
              <div className="max-w-md mx-auto">
                <div className="mb-6">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No blog posts yet</h3>
                  <p className="text-gray-600 mb-6">
                    We're working on some great content. Check back soon!
                  </p>
                  <Button variant="primary" asChild>
                    <Link href="/">
                      Back to Home
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}