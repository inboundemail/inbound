import { BaseHubImage } from "basehub/next-image";
import { BlogPost } from "../types";
import Link from "next/link";

interface BlogCardProps {
  blog: BlogPost;
  className?: string;
}

export function BlogCard({ blog, className = "" }: BlogCardProps) {
  return (
    <Link href={`/blog/${blog.slug}`}>
      <article
        key={blog.id}
        className={`bg-card overflow-hidden group cursor-pointer flex flex-col gap-4 ${className}`}
      >
        {blog.image?.url && (
          <div
            className="w-full aspect-[16/9] bg-muted flex items-center justify-center 
      overflow-hidden rounded-2xl "
          >
            <BaseHubImage
              src={blog.image.url}
              alt={blog.title}
              width={640}
              height={360}
              className="object-cover w-full h-full group-hover:scale-105 transition-all 
          duration-300"
              style={{ display: "block" }}
            />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <h2
            className="text-xl font-medium text-foreground group-hover:text-primary 
        transition-colors"
          >
            {blog.title}
          </h2>
          <p className="text-sm text-muted-foreground line-clamp-3">
            {blog.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {blog.authorImage?.url && (
            <BaseHubImage
              src={blog.authorImage.url}
              alt={blog.authorName || ""}
              width={32}
              height={32}
              className="rounded-full"
            />
          )}
          <div className="flex flex-col">
            <p className="text-sm font-medium text-foreground">
              {blog.authorName}
            </p>
          </div>
        </div>
      </article>
    </Link>
  );
}
