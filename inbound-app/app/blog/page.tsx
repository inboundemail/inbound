import { Pump } from "basehub/react-pump";
import { SiteHeader } from "@/components/site-header";
import { mapBlogPosts } from "@/features/blog/utils/blog-mapper";
import { BlogCard } from "@/features/blog";
import { generateBlogPostsQuery } from "@/features/blog/utils/blog-query";

export default async function BlogPage() {
  return (
    <>
      <SiteHeader />
      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
          Blog
        </h1>
        <p className="text-lg text-[var(--text-secondary)] max-w-2xl mx-auto mb-16 leading-relaxed">
          Stay updated with the latest news and updates from inbound.
        </p>
      </section>
      <div className="max-w-6xl mx-auto px-6 pb-20">
        <Pump
          queries={[
            {
              blogPosts: generateBlogPostsQuery(),
            },
          ]}
        >
          {async ([{ blogPosts }]) => {
            "use server";

            const blogs = mapBlogPosts(blogPosts);

            if (blogs.length === 0) {
              return (
                <div className="text-center py-12">
                  <p className="text-muted-foreground mb-4">
                    No blog posts found. Please check your Basehub
                    configuration.
                  </p>
                  <div className="text-sm text-muted-foreground">
                    <p>Make sure you have:</p>
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>Set up your BASEHUB_TOKEN in .env.local</li>
                      <li>Created blog posts in your Basehub dashboard</li>
                      <li>Published your content in Basehub</li>
                    </ul>
                  </div>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {blogs.map((blog) => (
                  <BlogCard key={blog.id} blog={blog} />
                ))}
              </div>
            );
          }}
        </Pump>
      </div>
    </>
  );
}
