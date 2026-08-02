# Inbound documentation

This standalone app is the migration target for the Mintlify content in the
repository's root `docs/` directory. It does not replace the production docs
rewrite until it is deployed separately.

Install dependencies and run the development server from this directory:

```bash
bun install
bun run dev
```

Open http://localhost:3000/docs.

## Explore

In the project, you can see:

- `lib/source.ts`: Code for content source adapter, [`loader()`](https://fumadocs.dev/docs/headless/source-api) provides the interface to access your content.
- `lib/layout.shared.tsx`: Shared options for layouts, optional but preferred to keep.

| Route                     | Description                                            |
| ------------------------- | ------------------------------------------------------ |
| `app/(home)`              | The route group for your landing page and other pages. |
| `app/docs`                | The documentation layout and pages.                    |
| `app/api/search/route.ts` | The Route Handler for search.                          |

### Fumadocs MDX

A `source.config.ts` config file has been included, you can customise different options like frontmatter schema.

Read the [Introduction](https://fumadocs.dev/docs/mdx) for further details.

The app uses Fumadocs MDX, Orama search, generated Open Graph images, and the
Fumadocs LLM text routes. Content navigation is configured with the `meta.json`
files under `content/docs`. API operation pages are generated virtually from
the local E2 OpenAPI contract when the app starts or builds.
