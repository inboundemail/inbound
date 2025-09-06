import { KNOWN_BLOG_POSTS } from "../data";

export const BLOG_POST_FIELDS = {
  _id: true,
  _slug: true,
  _title: true,
  title: true,
  description: true,
  image: {
    url: true,
  },
  authorImage: {
    url: true,
  },
  authorName: true,
  authorPosition: true,
  publishedDate: true,
  content: {
    json: {
      content: true,
    },
  },
};

export function generateBlogPostsQuery() {
  const query: any = {
    _title: true,
  };

  KNOWN_BLOG_POSTS.forEach((blogPostKey) => {
    query[blogPostKey] = BLOG_POST_FIELDS;
  });

  return query;
}

export function hasBlogPost(blogPosts: any, key: string): boolean {
  return blogPosts && blogPosts[key] && blogPosts[key]._id;
}

export function getAvailableBlogPostKeys(blogPosts: any): string[] {
  if (!blogPosts) return [];

  return Object.keys(blogPosts).filter((key) => {
    if (key.startsWith("_") || key === "__typename") return false;
    return hasBlogPost(blogPosts, key);
  });
}
