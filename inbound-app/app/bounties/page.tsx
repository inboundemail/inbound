"use client"

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import ExternalLink from '@/components/icons/link'
import DollarCircle from '@/components/icons/subscription-2'
import BugIcon from '@/components/icons/bug'
import SparklesIcon from '@/components/icons/sparkle-3'
import GithubIcon from '@/components/icons/github'
import InboundIcon from '@/components/InboundIcon'
import Link from 'next/link'
import ReactMarkdown, { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'

interface GitHubIssue {
  id: number
  number: number
  title: string
  body: string
  html_url: string
  created_at: string
  updated_at: string
  state: string
  labels: Array<{
    name: string
    color: string
  }>
  user: {
    login: string
    avatar_url: string
  }
}

interface Bounty {
  id: string
  title: string
  originalTitle: string
  description: string
  price: number
  currency: string
  githubUrl: string
  number: number
  type: 'bug' | 'feature' | 'enhancement' | 'documentation' | 'other'
  status: 'open' | 'closed'
  createdAt: string
  updatedAt: string
  author: {
    login: string
    avatar: string
  }
  labels: Array<{
    name: string
    color: string
  }>
}

// GitHub repository configuration
const GITHUB_REPO = 'R44VC0RP/inbound' // Replace with your actual repo
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/issues`

// Parse bounty price from title format: "$150 BOUNTY: Fix webhook issue"
const parseBountyFromTitle = (title: string): { price: number; cleanTitle: string; currency: string } => {
  const bountyMatch = title.match(/^\$(\d+)\s+BOUNTY:\s*(.+)$/i)
  if (bountyMatch) {
    return {
      price: parseInt(bountyMatch[1], 10),
      cleanTitle: bountyMatch[2].trim(),
      currency: 'USD'
    }
  }
  // Fallback if format doesn't match
  return {
    price: 0,
    cleanTitle: title,
    currency: 'USD'
  }
}

// Determine issue type from labels
const getIssueType = (labels: Array<{ name: string }>): Bounty['type'] => {
  const labelNames = labels.map(l => l.name.toLowerCase())
  
  if (labelNames.includes('bug')) return 'bug'
  if (labelNames.includes('feature') || labelNames.includes('enhancement')) return 'feature'
  if (labelNames.includes('documentation') || labelNames.includes('docs')) return 'documentation'
  if (labelNames.includes('improvement')) return 'enhancement'
  
  return 'other'
}

// Convert GitHub issue to Bounty
const convertGitHubIssueToBounty = (issue: GitHubIssue): Bounty => {
  const { price, cleanTitle, currency } = parseBountyFromTitle(issue.title)
  
  return {
    id: issue.id.toString(),
    title: cleanTitle,
    originalTitle: issue.title,
    description: issue.body || 'No description provided.',
    price,
    currency,
    githubUrl: issue.html_url,
    number: issue.number,
    type: getIssueType(issue.labels),
    status: issue.state === 'open' ? 'open' : 'closed',
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    author: {
      login: issue.user.login,
      avatar: issue.user.avatar_url
    },
    labels: issue.labels
  }
}

// Fetch bounties from GitHub API
const fetchBounties = async (): Promise<Bounty[]> => {
  try {
    const response = await fetch(`${GITHUB_API_URL}?labels=bounty&state=all&per_page=50`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        // Add GitHub token if available for higher rate limits
        ...(process.env.NEXT_PUBLIC_GITHUB_TOKEN && {
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_GITHUB_TOKEN}`
        })
      }
    })

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`)
    }

    const issues: GitHubIssue[] = await response.json()
    return issues
      .filter(issue => issue.title.toLowerCase().includes('bounty'))
      .map(convertGitHubIssueToBounty)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } catch (error) {
    console.error('Failed to fetch bounties from GitHub:', error)
    return []
  }
}

// Custom components for ReactMarkdown
const MarkdownComponents: Components = {
  // Headings
  h1: (props) => (
    <h1 className="text-2xl font-bold mt-6 mb-4 text-foreground">{props.children}</h1>
  ),
  h2: (props) => (
    <h2 className="text-xl font-semibold mt-5 mb-3 text-foreground">{props.children}</h2>
  ),
  h3: (props) => (
    <h3 className="text-lg font-semibold mt-4 mb-2 text-foreground">{props.children}</h3>
  ),
  h4: (props) => (
    <h4 className="text-base font-semibold mt-3 mb-2 text-foreground">{props.children}</h4>
  ),
  h5: (props) => (
    <h5 className="text-sm font-semibold mt-3 mb-2 text-foreground">{props.children}</h5>
  ),
  h6: (props) => (
    <h6 className="text-xs font-semibold mt-3 mb-2 text-foreground">{props.children}</h6>
  ),
  
  // Paragraphs
  p: (props) => (
    <p className="mb-3 text-foreground leading-relaxed">{props.children}</p>
  ),
  
  // Links
  a: (props) => (
    <a 
      href={props.href} 
      className="text-blue-500 hover:text-blue-600 underline decoration-blue-500/30 hover:decoration-blue-600" 
      target="_blank" 
      rel="noopener noreferrer"
    >
      {props.children}
    </a>
  ),
  
  // Code
  code: (props: any) => {
    if (props.inline) {
      return (
        <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground">
          {props.children}
        </code>
      )
    }
    return (
      <code className="block bg-muted p-3 rounded-md overflow-x-auto font-mono text-sm text-foreground">
        {props.children}
      </code>
    )
  },
  
  // Pre (code blocks)
  pre: (props) => (
    <pre className="bg-muted p-3 rounded-md overflow-x-auto my-3 font-mono text-sm text-foreground">
      {props.children}
    </pre>
  ),
  
  // Lists
  ul: (props) => (
    <ul className="list-disc list-inside mb-3 space-y-1 text-foreground">{props.children}</ul>
  ),
  ol: (props) => (
    <ol className="list-decimal list-inside mb-3 space-y-1 text-foreground">{props.children}</ol>
  ),
  li: (props) => (
    <li className="text-foreground">{props.children}</li>
  ),
  
  // Blockquotes
  blockquote: (props) => (
    <blockquote className="border-l-4 border-muted pl-4 my-3 italic text-foreground">
      {props.children}
    </blockquote>
  ),
  
  // Images
  img: (props) => (
    <img 
      src={props.src} 
      alt={props.alt} 
      className="max-w-full h-auto rounded-lg my-4 shadow-md border border-border/20"
      loading="lazy"
      onError={(e) => {
        // Fallback for broken images
        const target = e.target as HTMLImageElement;
        target.style.display = 'none';
      }}
    />
  ),
  
  // Tables
  table: (props) => (
    <div className="overflow-x-auto my-3">
      <table className="min-w-full border-collapse border border-border">
        {props.children}
      </table>
    </div>
  ),
  th: (props) => (
    <th className="border border-border px-3 py-2 bg-muted font-semibold text-left text-foreground">
      {props.children}
    </th>
  ),
  td: (props) => (
    <td className="border border-border px-3 py-2 text-foreground">
      {props.children}
    </td>
  ),
  
  // Horizontal rule
  hr: () => (
    <hr className="border-border my-6" />
  ),
  
  // Task list items (checkboxes)
  input: (props) => {
    if (props.type === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={props.checked}
          disabled={props.disabled}
          className="mr-2 mt-1 rounded border-2 border-border bg-background text-primary focus:ring-2 focus:ring-primary/20 focus:border-primary"
          readOnly
          style={{ 
            accentColor: 'var(--primary)',
            transform: 'scale(1.1)'
          }}
        />
      )
    }
    return <input {...props} />
  },
  
  // Videos (for HTML video tags in markdown)
  video: (props) => (
    <video 
      src={props.src} 
      controls={props.controls ?? true}
      className="max-w-full h-auto rounded-lg my-4 shadow-md border border-border/20"
      preload="metadata"
    >
      Your browser does not support the video tag.
    </video>
  ),
  
  // Additional support for embedded media
  iframe: (props: any) => (
    <iframe
      src={props.src}
      className="max-w-full rounded-lg my-4 shadow-md border border-border/20"
      width={props.width || "100%"}
      height={props.height || "315"}
      frameBorder="0"
      allowFullScreen
      loading="lazy"
    />
  ),
  
  // Div wrapper for any additional content
  div: (props: any) => (
    <div className={props.className || ""}>
      {props.children}
    </div>
  ),
  
  // Span for inline content
  span: (props: any) => (
    <span className={props.className || ""}>
      {props.children}
    </span>
  ),
}

// Preprocess markdown to convert GitHub asset URLs to proper media tags
const preprocessMarkdown = (markdown: string): string => {
  if (!markdown) return ''
  
  return markdown
    // Convert GitHub user-attachments URLs to both image and video tags
    .replace(
      /https:\/\/github\.com\/user-attachments\/assets\/([a-f0-9-]+)/g,
      (match) => {
        // GitHub user attachments can be images or videos
        // We'll create both tags and let the browser handle which one works
        return `<div class="github-media-container" style="margin: 1rem 0;">
          <img src="${match}" alt="GitHub attachment" style="max-width: 100%; height: auto; border-radius: 0.5rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border: 1px solid rgb(229 231 235 / 0.2); display: block;" onError="this.style.display='none'; this.nextElementSibling.style.display='block';" onLoad="console.log('Image loaded successfully');" />
          <video controls style="max-width: 100%; height: auto; border-radius: 0.5rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border: 1px solid rgb(229 231 235 / 0.2); display: none;" preload="metadata" onError="console.log('Video failed to load'); this.style.display='none'; this.previousElementSibling.style.display='block';" onLoadedMetadata="console.log('Video metadata loaded');">
            <source src="${match}" type="video/mp4">
            <source src="${match}" type="video/webm">
            <source src="${match}" type="video/mov">
            <p style="color: #ef4444; font-size: 0.875rem; margin: 1rem 0;">Unable to load media. <a href="${match}" target="_blank" style="color: #3b82f6; text-decoration: underline;">View original</a></p>
          </video>
        </div>`
      }
    )
    // Also handle direct GitHub asset links in markdown link format
    .replace(
      /!\[([^\]]*)\]\(https:\/\/github\.com\/user-attachments\/assets\/([a-f0-9-]+)\)/g,
      (match, alt, assetId) => {
        const url = `https://github.com/user-attachments/assets/${assetId}`
        return `<div class="github-media-container" style="margin: 1rem 0;">
          <img src="${url}" alt="${alt || 'GitHub attachment'}" style="max-width: 100%; height: auto; border-radius: 0.5rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border: 1px solid rgb(229 231 235 / 0.2); display: block;" onError="this.style.display='none'; this.nextElementSibling.style.display='block';" />
          <video controls style="max-width: 100%; height: auto; border-radius: 0.5rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border: 1px solid rgb(229 231 235 / 0.2); display: none;" preload="metadata" onError="console.log('Video failed to load'); this.style.display='none'; this.previousElementSibling.style.display='block';">
            <source src="${url}" type="video/mp4">
            <source src="${url}" type="video/webm">
            <source src="${url}" type="video/mov">
            <p style="color: #ef4444; font-size: 0.875rem; margin: 1rem 0;">Unable to load media. <a href="${url}" target="_blank" style="color: #3b82f6; text-decoration: underline;">View original</a></p>
          </video>
        </div>`
      }
    )
    // Handle other GitHub asset patterns (githubusercontent.com) - these are usually images
    .replace(
      /https:\/\/user-images\.githubusercontent\.com\/[^\s)]+/g,
      (match) => {
        return `<img src="${match}" alt="GitHub image" style="max-width: 100%;" />`
      }
    )
    // Handle markdown image links to GitHub assets
    .replace(
      /!\[([^\]]*)\]\(https:\/\/user-images\.githubusercontent\.com\/[^\s)]+\)/g,
      (match, alt) => {
        const imageUrl = match.match(/\(([^)]+)\)/)?.[1]
        return `<img src="${imageUrl}" alt="${alt || 'GitHub image'}" style="max-width: 100%;" />`
      }
    )
    // Handle raw GitHub asset URLs that appear on their own line (common in issue descriptions)
    .replace(
      /^https:\/\/github\.com\/user-attachments\/assets\/([a-f0-9-]+)$/gm,
      (match) => {
        return `<div class="github-media-container" style="margin: 1rem 0;">
          <img src="${match}" alt="GitHub attachment" style="max-width: 100%; height: auto; border-radius: 0.5rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border: 1px solid rgb(229 231 235 / 0.2); display: block;" onError="this.style.display='none'; this.nextElementSibling.style.display='block';" />
          <video controls style="max-width: 100%; height: auto; border-radius: 0.5rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border: 1px solid rgb(229 231 235 / 0.2); display: none;" preload="metadata" onError="console.log('Video failed to load'); this.style.display='none'; this.previousElementSibling.style.display='block';">
            <source src="${match}" type="video/mp4">
            <source src="${match}" type="video/webm">
            <source src="${match}" type="video/mov">
            <p style="color: #ef4444; font-size: 0.875rem; margin: 1rem 0;">Unable to load media. <a href="${match}" target="_blank" style="color: #3b82f6; text-decoration: underline;">View original</a></p>
          </video>
        </div>`
      }
    )
}

const getTypeIcon = (type: Bounty['type']) => {
  switch (type) {
    case 'bug':
      return <BugIcon className="w-4 h-4" />
    case 'feature':
      return <SparklesIcon className="w-4 h-4" />
    case 'enhancement':
      return <SparklesIcon className="w-4 h-4" />
    case 'documentation':
      return <ExternalLink className="w-4 h-4" />
    default:
      return <SparklesIcon className="w-4 h-4" />
  }
}

const getTypeColor = (type: Bounty['type']) => {
  switch (type) {
    case 'bug':
      return 'bg-red-500 text-white'
    case 'feature':
      return 'bg-blue-500 text-white'
    case 'enhancement':
      return 'bg-purple-500 text-white'
    case 'documentation':
      return 'bg-green-500 text-white'
    default:
      return 'bg-gray-500 text-white'
  }
}

const getStatusColor = (status: Bounty['status']) => {
  switch (status) {
    case 'open':
      return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800'
    case 'closed':
      return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-800'
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-800'
  }
}

// Background SVG component (from login page)
const BackgroundSvg = () => {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 1920 1080"
      xmlns="http://www.w3.org/2000/svg"
      className="absolute inset-0"
    >
      <rect
        width="100%"
        height="100%"
        fill="url(#dotPattern)"
        mask="url(#circleMask)"
      />
      <defs>
        <pattern
          id="dotPattern"
          width="14"
          height="14"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="7" cy="7" r="2" className="fill-foreground/10" />
        </pattern>
        <mask id="circleMask">
          <circle
            filter="blur(100px)"
            cx="960"
            cy="590"
            r="340"
            fill="url(#white-linear-gradient)"
          />
        </mask>
        <linearGradient id="white-linear-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="10%" stopColor="black" />
          <stop offset="100%" stopColor="white" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default function BountiesPage() {
  const [bounties, setBounties] = useState<Bounty[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set())

  useEffect(() => {
    const loadBounties = async () => {
      try {
        setLoading(true)
        setError(null)
        const fetchedBounties = await fetchBounties()
        setBounties(fetchedBounties)
      } catch (err) {
        console.error('Error loading bounties:', err)
        setError('Failed to load bounties from GitHub')
      } finally {
        setLoading(false)
      }
    }

    loadBounties()
  }, [])

  const openBounties = bounties.filter(b => b.status === 'open')
  const totalValue = openBounties.reduce((sum, b) => sum + b.price, 0)

  if (loading) {
    return (
      <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center" style={{ overscrollBehaviorY: "none" }}>
        <BackgroundSvg />
        <div className="flex items-center gap-2 text-foreground z-10">
          <InboundIcon className="w-7 h-7" />
          <span className="text-xl">Loading bounties...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden" style={{ overscrollBehaviorY: "none" }}>
      <BackgroundSvg />
      
      {/* Main content */}
      <div className="relative z-10 min-h-screen">
        {/* Header */}
        <div className="w-full max-w-6xl mx-auto px-4 pt-8">
          <Link href="/">
            <div className="flex items-center gap-3 mb-8">
              <InboundIcon width={44} height={44} />
              <div className="flex flex-col">
                <p className="text-2xl font-semibold text-foreground">Bounty Program</p>
                <p className="text-sm text-muted-foreground">
                  Help improve Inbound and earn rewards for your contributions
                </p>
              </div>
            </div>
          </Link>

          {/* Stats */}
          {!error && (
            <div className="bg-card rounded-2xl shadow-sm p-6 border border-border mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-foreground">{bounties.length}</div>
                    <div className="text-sm text-muted-foreground">Total Bounties</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{openBounties.length}</div>
                    <div className="text-sm text-muted-foreground">Open</div>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center gap-1 text-2xl font-bold text-green-600">
                      
                      $ {totalValue}
                    </div>
                    <div className="text-sm text-muted-foreground">Available</div>
            </div>
          </div>
            <Button
                  variant="outline"
                  onClick={() => window.open(`https://github.com/${GITHUB_REPO}/issues?q=is%3Aissue+label%3Abounty`, '_blank')}
                >
                  <GithubIcon className="w-4 h-4 mr-2" />
              View on GitHub
            </Button>
          </div>
        </div>
          )}
        </div>

        {/* Content */}
        <div className="w-full max-w-6xl mx-auto px-4 pb-8">
          {error ? (
            <div className="bg-card rounded-2xl shadow-sm p-8 border border-border text-center">
              <div className="text-destructive mb-4">
                <GithubIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="font-semibold">Failed to load bounties</p>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
              </div>
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Try Again
              </Button>
            </div>
          ) : bounties.length === 0 ? (
            <div className="bg-card rounded-2xl shadow-sm p-8 border border-border text-center">

              <p className="font-semibold text-foreground mb-2">No bounties available</p>
              <p className="text-sm text-muted-foreground mb-4">
                Check back later or create an issue on GitHub to suggest a bounty
              </p>
              <Button
                variant="outline"
                onClick={() => window.open(`https://github.com/${GITHUB_REPO}/issues/new`, '_blank')}
              >
                <GithubIcon className="w-4 h-4 mr-2" />
                Create Issue
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
          {bounties.map((bounty) => (
                <div
              key={bounty.id}
                  className="bg-card rounded-2xl shadow-sm border border-border hover:shadow-md transition-all duration-300"
                >
                  <div className="p-6">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={bounty.author.avatar}
                          alt={bounty.author.login}
                          className="w-8 h-8 rounded-full"
                        />
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={`${getTypeColor(bounty.type)} rounded-full px-2.5 py-0.5 text-xs font-medium shadow-sm`}>
                      {getTypeIcon(bounty.type)}
                      <span className="ml-1 capitalize">{bounty.type}</span>
                    </Badge>
                            <Badge className={`${getStatusColor(bounty.status)} rounded-full px-2.5 py-0.5 text-xs font-medium border`}>
                              {bounty.status}
                    </Badge>
                  </div>
                          <div className="text-xs text-muted-foreground">
                            #{bounty.number} opened by {bounty.author.login} on {new Date(bounty.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-xl font-bold text-green-600">
                        $
                        {bounty.price} {bounty.currency}
                      </div>
                </div>

                    {/* Title */}
                    <h2 className="text-xl font-semibold text-foreground mb-3 leading-tight">
                  {bounty.title}
                    </h2>

                    {/* Description */}
                    <div className="text-sm mb-4 max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[
                          rehypeRaw,
                          [rehypeSanitize, {
                            allowedTags: [
                              'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                              'p', 'br', 'strong', 'em', 'u', 'del', 's',
                              'a', 'img', 'video', 'iframe', 'source',
                              'ul', 'ol', 'li',
                              'table', 'thead', 'tbody', 'tr', 'th', 'td',
                              'blockquote', 'code', 'pre',
                              'hr', 'div', 'span',
                              'input'
                            ],
                            allowedAttributes: {
                              '*': ['class', 'id', 'style'],
                              'a': ['href', 'target', 'rel', 'style'],
                              'img': ['src', 'alt', 'width', 'height', 'loading', 'style', 'onError', 'onLoad'],
                              'video': ['src', 'controls', 'preload', 'width', 'height', 'style', 'onError', 'onLoadedMetadata'],
                              'iframe': ['src', 'width', 'height', 'frameborder', 'allowfullscreen'],
                              'input': ['type', 'checked', 'disabled'],
                              'div': ['class', 'style'],
                              'p': ['style'],
                              'source': ['src', 'type']
                            },
                            allowedSchemes: ['http', 'https', 'mailto', 'data'],
                            allowedSchemesByTag: {
                              'img': ['http', 'https', 'data'],
                              'video': ['http', 'https', 'data'],
                              'iframe': ['http', 'https']
                            }
                          }]
                        ]}
                        components={MarkdownComponents}
                      >
                        {expandedDescriptions.has(bounty.id) || bounty.description.length <= 800
                          ? preprocessMarkdown(bounty.description)
                          : preprocessMarkdown(bounty.description.substring(0, 800) + '...')
                        }
                      </ReactMarkdown>
                      {bounty.description.length > 800 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 p-0 h-auto text-xs text-blue-500 hover:text-blue-600"
                          onClick={() => {
                            const newExpanded = new Set(expandedDescriptions)
                            if (expandedDescriptions.has(bounty.id)) {
                              newExpanded.delete(bounty.id)
                            } else {
                              newExpanded.add(bounty.id)
                            }
                            setExpandedDescriptions(newExpanded)
                          }}
                        >
                          {expandedDescriptions.has(bounty.id) ? 'Show less' : 'Show more'}
                        </Button>
                      )}
                    </div>

                    {/* Labels */}
                    {bounty.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {bounty.labels.slice(0, 5).map((label) => (
                          <span
                            key={label.name}
                            className="inline-block text-xs px-2 py-0.5 rounded-full text-white"
                            style={{ backgroundColor: `#${label.color}` }}
                          >
                            {label.name}
                      </span>
                    ))}
                        {bounty.labels.length > 5 && (
                          <span className="inline-block bg-muted text-muted-foreground text-xs px-2 py-0.5 rounded-full">
                            +{bounty.labels.length - 5} more
                          </span>
                        )}
                  </div>
                )}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="primary"
                        onClick={() => window.open(bounty.githubUrl, '_blank')}
                        className="flex-1 sm:flex-none"
                      >
                        <GithubIcon className="w-4 h-4 mr-2" />
                        View Issue
                        <ExternalLink className="w-3 h-3 ml-2" />
                      </Button>
                      
                    </div>
                  </div>
                </div>
          ))}
        </div>
          )}

          {/* How it works */}
          {bounties.length > 0 && (
            <div className="bg-card rounded-2xl shadow-sm p-6 border border-border mt-8">
              <h3 className="text-lg font-semibold text-foreground mb-4">How it works</h3>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="text-center">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-2 text-sm font-semibold">
                  1
                </div>
                  <h4 className="font-medium text-sm mb-1 text-foreground">Choose a bounty</h4>
                <p className="text-xs text-muted-foreground">
                  Browse available bounties and pick one that matches your skills
                </p>
              </div>
              <div className="text-center">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-2 text-sm font-semibold">
                  2
                </div>
                  <h4 className="font-medium text-sm mb-1 text-foreground">Submit your work</h4>
                <p className="text-xs text-muted-foreground">
                  Create a pull request with your solution and reference the issue
                </p>
              </div>
              <div className="text-center">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-2 text-sm font-semibold">
                  3
                </div>
                  <h4 className="font-medium text-sm mb-1 text-foreground">Get rewarded</h4>
                <p className="text-xs text-muted-foreground">
                  Once merged, you'll receive the bounty reward via your preferred method
                </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
