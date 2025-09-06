import { BlogPost } from "../types";

type BaseBlogPost = {
  _id: string;
  _slug: string;
  title: string;
  description: string;
  image?: { url?: string } | null;
  authorImage?: { url?: string } | null;
  authorName?: string | null;
  authorPosition?: string | null;
  publishedDate?: string | null;
  content?: { json?: { content?: any } } | null;
};

export function mapBlogPost(blog: BaseBlogPost): BlogPost {
  return {
    id: blog._id,
    slug: blog._slug,
    title: blog.title,
    description: blog.description,
    image: blog.image?.url ? { url: blog.image.url } : undefined,
    authorImage: blog.authorImage?.url
      ? { url: blog.authorImage.url }
      : undefined,
    authorName: blog.authorName,
    authorPosition: blog.authorPosition,
    date: blog.publishedDate,
    content: blog.content
      ? {
          json: {
            content: blog.content.json?.content,
          },
        }
      : undefined,
  };
}

export function mapBlogPosts(blogPosts: any): BlogPost[] {
  const blogs: BlogPost[] = [];

  Object.keys(blogPosts).forEach((key) => {
    if (key.startsWith("_") || key === "__typename") {
      return; // Skip system properties
    }

    const blogPost = blogPosts[key];

    if (
      blogPost &&
      typeof blogPost === "object" &&
      blogPost._id &&
      blogPost._slug &&
      blogPost.title &&
      blogPost.description
    ) {
      try {
        blogs.push(mapBlogPost(blogPost as BaseBlogPost));
      } catch (error) {
        console.warn(`Failed to map blog post "${key}":`, error);
      }
    }
  });

  return blogs;
}

export function getBlogPostBySlug(
  blogPosts: any,
  slug: string
): BlogPost | undefined {
  const blogs = mapBlogPosts(blogPosts);
  return blogs.find((blog) => blog.slug === slug);
}

export function getBlogPostById(
  blogPosts: any,
  id: string
): BlogPost | undefined {
  const blogs = mapBlogPosts(blogPosts);
  return blogs.find((blog) => blog.id === id);
}

export function getBlogPostsSorted(blogPosts: any): BlogPost[] {
  const blogs = mapBlogPosts(blogPosts);
  // Sort by date (newest first) - you can change this to oldest first if needed
  return blogs.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });
}

export function getPreviousBlogPost(
  blogPosts: any,
  currentSlug: string
): BlogPost | undefined {
  const sortedBlogs = getBlogPostsSorted(blogPosts);
  const currentIndex = sortedBlogs.findIndex(
    (blog) => blog.slug === currentSlug
  );

  if (currentIndex === -1 || currentIndex === sortedBlogs.length - 1) {
    return undefined;
  }

  return sortedBlogs[currentIndex + 1];
}

export function getNextBlogPost(
  blogPosts: any,
  currentSlug: string
): BlogPost | undefined {
  const sortedBlogs = getBlogPostsSorted(blogPosts);
  const currentIndex = sortedBlogs.findIndex(
    (blog) => blog.slug === currentSlug
  );

  if (currentIndex === -1 || currentIndex === 0) {
    return undefined;
  }

  return sortedBlogs[currentIndex - 1];
}
