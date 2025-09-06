import { BlogPost } from "../types";
import { BlogCard } from "./blog-card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import ChevronLeft from "@/components/icons/chevron-left";
import ChevronRight from "@/components/icons/chevron-right";

interface BlogNavigationProps {
  previousPost?: BlogPost;
  nextPost?: BlogPost;
  currentPostTitle: string;
}

export function BlogNavigation({
  previousPost,
  nextPost,
  currentPostTitle,
}: BlogNavigationProps) {
  return (
    <nav>
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Previous Post */}
          <div className="flex flex-col">
            {previousPost ? (
              <div className="flex flex-col gap-3">
                <div className="group">
                  <BlogCard
                    blog={previousPost}
                    className="h-full border border-border rounded-3xl p-4 hover:border-primary/50 transition-colors"
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-6 border border-border rounded-3xl bg-muted/30">
                <div className="text-muted-foreground">
                  <ChevronLeft
                    width="24"
                    height="24"
                    className="mx-auto mb-2 opacity-50"
                  />
                  <p className="text-sm">No previous post</p>
                  <p className="text-xs mt-1">You're at the beginning!</p>
                </div>
              </div>
            )}
          </div>

          {/* Next Post */}
          <div className="flex flex-col">
            {nextPost ? (
              <div className="flex flex-col gap-3">
                <div className="group">
                  <BlogCard
                    blog={nextPost}
                    className="h-full border border-border rounded-3xl p-4 hover:border-primary/50 transition-colors"
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center p-6 border border-border rounded-3xl bg-muted/30">
                <div className="text-muted-foreground">
                  <ChevronRight
                    width="24"
                    height="24"
                    className="mx-auto mb-2 opacity-50"
                  />
                  <p className="text-sm">No next post</p>
                  <p className="text-xs mt-1">You've reached the end!</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Back to Blog Button */}
        <div className="flex justify-center pt-4">
          <Button variant="outline" asChild>
            <Link href="/blog">
              <ChevronLeft width="16" height="16" />
              Back to All Posts
            </Link>
          </Button>
        </div>
      </div>
    </nav>
  );
}
