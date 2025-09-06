import { SiteHeader } from "@/components/site-header";
import Link from "next/link";

export default function BlogPostNotFound() {
  return (
    <>
      <SiteHeader />
      <div className="max-w-4xl mx-auto px-6 py-20 text-center">
        <div className="mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
            Blog Post Not Found
          </h1>
          <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
            The blog post you're looking for doesn't exist or has been moved.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/blog"
            className="inline-flex items-center justify-center px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            View All Blog Posts
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center px-6 py-3 border border-border rounded-lg hover:bg-muted transition-colors"
          >
            Go Home
          </Link>
        </div>
      </div>
    </>
  );
}
