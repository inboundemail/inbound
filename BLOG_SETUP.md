# Zenblog Integration Setup

This project integrates with Zenblog, a headless CMS for blog content. Follow these steps to set up the blog functionality:

## 1. Install Dependencies

The zenblog package has already been installed:

```bash
npm install zenblog --legacy-peer-deps
```

## 2. Environment Configuration

Add your Zenblog Blog ID to your environment variables:

```bash
# .env.local or your environment
ZENBLOG_BLOG_ID=your-blog-id-from-zenblog-dashboard
```

To get your Blog ID:
1. Log in to your Zenblog dashboard
2. Navigate to your blog settings
3. Copy the Blog ID

## 3. Blog Features

The integration includes:

### Homepage Blog Section
- Shows the latest 3 blog posts
- Only appears if blog posts are available
- Links to individual blog posts and the main blog page

### Blog Pages
- **`/blog`** - Main blog listing page with all posts
- **`/blog/[slug]`** - Individual blog post pages

### Blog Navigation
- Blog button added to the main header navigation
- Links between blog pages and back to homepage

## 4. Customization

### Styling
The blog uses the same design system as the rest of the site:
- Consistent color scheme (`#1C2894` for primary blue)
- Same typography and spacing
- Responsive design for mobile and desktop

### Content Types
The integration supports:
- Post titles and content (HTML)
- Categories and tags
- Author information
- Publication dates
- Featured excerpts

## 5. API Usage

The integration uses the Zenblog REST API:
- **GET** `/blogs/:blogId/posts` - List posts
- **GET** `/blogs/:blogId/posts/:slug` - Get individual post

### Caching
- Content is cached for 1 hour using Next.js ISR
- Fallback support for when API is unavailable

## 6. TypeScript Support

Full TypeScript types are provided:
- `ZenBlogPost` - Individual blog post
- `ZenBlogPostsResponse` - API response for post listing
- All related types for categories, tags, and authors

## 7. Fallback Behavior

When no blog posts are available:
- Homepage blog section is hidden
- Blog page shows a friendly empty state
- No errors are thrown - graceful degradation

## Files Created/Modified

- `lib/types/zenblog.ts` - TypeScript type definitions
- `lib/zenblog.ts` - API client functions
- `app/blog/page.tsx` - Main blog listing page
- `app/blog/[slug]/page.tsx` - Individual blog post page
- `app/page.tsx` - Homepage with blog section added

## Need Help?

If you need help setting up Zenblog or have questions about the integration, refer to the [Zenblog documentation](https://zenblog.com/docs) or contact support.