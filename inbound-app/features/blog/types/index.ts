import { BlogPosts } from "@/basehub-types";

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  description: string;
  image?: {
    url: string;
  };
  authorImage?: {
    url: string;
  };
  authorName?: string | null;
  authorPosition?: string | null;
  date?: string | null;
  content?: {
    json: {
      content: any;
    };
  };
};

export type BlogPostsCollection = BlogPosts;

export type ExtractBlogPosts<T> = T extends { blogPosts: infer U } ? U : never;
