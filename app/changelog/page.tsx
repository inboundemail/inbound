import { promises as fs } from 'fs'
import path from 'path'
import matter from 'gray-matter'
import { format } from 'date-fns'
import Link from 'next/link'

interface ChangelogEntry {
  slug: string
  title: string
  date: Date
  version: string
  content: string
  summary?: string
}

async function getChangelogEntries(): Promise<ChangelogEntry[]> {
  const entriesDirectory = path.join(process.cwd(), 'app/changelog/entries')
  
  try {
    const fileNames = await fs.readdir(entriesDirectory)
    const mdxFiles = fileNames.filter(fileName => fileName.endsWith('.mdx'))
    
    const entries = await Promise.all(
      mdxFiles.map(async (fileName) => {
        const fullPath = path.join(entriesDirectory, fileName)
        const fileContents = await fs.readFile(fullPath, 'utf8')
        const { data, content } = matter(fileContents)
        
        return {
          slug: fileName.replace(/\.mdx$/, ''),
          title: data.title || 'Untitled',
          date: new Date(data.date || Date.now()),
          version: data.version || '1.0',
          content: content,
          summary: data.summary
        }
      })
    )
    
    // Sort by date, newest first
    return entries.sort((a, b) => b.date.getTime() - a.date.getTime())
  } catch (error) {
    console.error('Error reading changelog entries:', error)
    return []
  }
}

export default async function ChangelogPage() {
  const entries = await getChangelogEntries()
  
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-16 border-b border-border pb-8">
          <h1 className="text-5xl sm:text-6xl font-light tracking-tight mb-4">Changelog</h1>
          <p className="text-muted-foreground text-lg">
            All the latest updates, improvements, and fixes to Inbound
          </p>
        </div>
        
        {/* Entries */}
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-8 top-0 bottom-0 w-px bg-border" />
          
          <div className="space-y-16">
            {entries.length === 0 ? (
              <p className="text-muted-foreground ml-20">No changelog entries yet.</p>
            ) : (
              entries.map((entry, index) => (
                <article key={entry.slug} className="relative">
                  {/* Timeline dot */}
                  <div className="absolute left-8 top-0 -translate-x-1/2">
                    <div className="w-4 h-4 bg-background border-2 border-primary rounded-full" />
                  </div>
                  
                  <div className="ml-20">
                    {/* Date and version */}
                    <div className="flex items-baseline gap-4 mb-4">
                      <time className="text-muted-foreground text-sm font-medium">
                        {format(entry.date, 'MMMM d, yyyy')}
                      </time>
                      <span className="text-xs px-2.5 py-1 bg-primary/10 text-primary rounded-md font-medium">
                        v{entry.version}
                      </span>
                    </div>
                    
                    {/* Title */}
                    <h2 className="text-2xl sm:text-3xl font-semibold mb-4 text-foreground">
                      {entry.title}
                    </h2>
                    
                    {/* Summary */}
                    {entry.summary && (
                      <p className="text-muted-foreground mb-6 text-base sm:text-lg leading-relaxed">
                        {entry.summary}
                      </p>
                    )}
                    
                    {/* Read more link */}
                    <Link 
                      href={`/changelog/${entry.slug}`}
                      className="inline-flex items-center text-primary hover:text-primary/80 transition-colors font-medium"
                    >
                      Read full update
                      <svg 
                        className="ml-2 w-4 h-4" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={2} 
                          d="M13 7l5 5m0 0l-5 5m5-5H6" 
                        />
                      </svg>
                    </Link>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
} 