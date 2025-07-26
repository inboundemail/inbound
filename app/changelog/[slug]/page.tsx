import { promises as fs } from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { format } from 'date-fns'
import Link from 'next/link'
import { MDXRemote } from 'next-mdx-remote/rsc'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{
    slug: string
  }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const entry = await getChangelogEntry(slug)
  
  if (!entry) {
    return {
      title: 'Entry Not Found - Changelog - Inbound',
    }
  }
  
  const title = `${entry.title} - Changelog - Inbound`
  const description = entry.summary || `${entry.title} - Version ${entry.version}`
  
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [
        {
          url: `/changelog/${slug}/opengraph-image`,
          width: 1200,
          height: 630,
          alt: `${entry.title} - v${entry.version}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`/changelog/${slug}/opengraph-image`],
    },
  }
}

async function getChangelogEntry(slug: string) {
  const entriesDirectory = path.join(process.cwd(), 'app/changelog/entries')
  const fullPath = path.join(entriesDirectory, `${slug}.mdx`)
  
  try {
    const fileContents = await fs.readFile(fullPath, 'utf8')
    const { data, content } = matter(fileContents)
    
    return {
      slug,
      title: data.title || 'Untitled',
      date: new Date(data.date || Date.now()),
      version: data.version || '1.0',
      content: content,
      summary: data.summary
    }
  } catch (error) {
    return null
  }
}

const components = {
  h1: (props: any) => <h1 className="text-3xl font-semibold mb-6 text-foreground" {...props} />,
  h2: (props: any) => <h2 className="text-2xl font-semibold mb-4 mt-8 text-foreground" {...props} />,
  h3: (props: any) => <h3 className="text-xl font-semibold mb-3 mt-6 text-foreground" {...props} />,
  p: (props: any) => <p className="text-muted-foreground mb-4 leading-relaxed" {...props} />,
  ul: (props: any) => <ul className="list-disc list-inside mb-4 text-muted-foreground space-y-2" {...props} />,
  ol: (props: any) => <ol className="list-decimal list-inside mb-4 text-muted-foreground space-y-2" {...props} />,
  li: (props: any) => <li className="ml-4" {...props} />,
  code: (props: any) => {
    if (props.className) {
      return <code className="block bg-muted/30 rounded-lg p-4 mb-4 overflow-x-auto" {...props} />
    }
    return <code className="bg-muted/30 px-1.5 py-0.5 rounded text-sm" {...props} />
  },
  pre: (props: any) => <pre className="bg-muted/30 rounded-lg p-4 mb-4 overflow-x-auto" {...props} />,
  blockquote: (props: any) => (
    <blockquote className="border-l-4 border-primary pl-4 my-4 italic text-muted-foreground" {...props} />
  ),
  a: (props: any) => (
    <a className="text-primary hover:text-primary/80 underline transition-colors" {...props} />
  ),
  img: (props: any) => (
    <img className="rounded-lg my-6 max-w-full" {...props} />
  ),
}

export default async function ChangelogEntryPage({ params }: Props) {
  const { slug } = await params
  const entry = await getChangelogEntry(slug)
  
  if (!entry) {
    notFound()
  }
  
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-6 py-16">
        {/* Back link */}
        <Link 
          href="/changelog"
          className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <svg 
            className="mr-2 w-4 h-4" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M11 17l-5-5m0 0l5-5m-5 5h12" 
            />
          </svg>
          Back to changelog
        </Link>
        
        {/* Header */}
        <header className="mb-12 pb-8 border-b border-border">
          <div className="flex items-baseline gap-4 mb-4">
            <time className="text-muted-foreground text-sm font-medium">
              {format(entry.date, 'MMMM d, yyyy')}
            </time>
            <span className="text-xs px-2.5 py-1 bg-primary/10 text-primary rounded-md font-medium">
              v{entry.version}
            </span>
          </div>
          
          <h1 className="text-4xl sm:text-5xl font-semibold mb-4 text-foreground">
            {entry.title}
          </h1>
          
          {entry.summary && (
            <p className="text-muted-foreground text-lg sm:text-xl leading-relaxed">
              {entry.summary}
            </p>
          )}
        </header>
        
        {/* Content */}
        <div className="prose prose-invert max-w-none">
          <MDXRemote source={entry.content} components={components} />
        </div>
      </div>
    </div>
  )
} 