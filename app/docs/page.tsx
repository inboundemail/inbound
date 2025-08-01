import { DocsPage, DocsBody } from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
import { getPage, getPages } from '@/app/source';

interface Param {
  slug?: string[];
}

export default function Page({ params }: { params: Param }) {
  const page = getPage(params.slug);

  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsBody>
        <h1>{page.data.title}</h1>
        <p className="text-muted-foreground text-xl">{page.data.description}</p>
        <div className="mt-8">
          <h2>Welcome to Inbound.new Documentation</h2>
          <p>This documentation site is powered by Fumadocs. You can now add MDX files to create comprehensive documentation.</p>
          
          <div className="mt-6">
            <h3>Next Steps</h3>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Create MDX files in the <code>docs/</code> directory</li>
              <li>Configure the source to load your MDX content</li>
              <li>Customize the layout and navigation</li>
              <li>Add search functionality</li>
            </ul>
          </div>
        </div>
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return getPages().map((page) => ({
    slug: page.slugs,
  }));
}

export function generateMetadata({ params }: { params: Param }) {
  const page = getPage(params.slug);

  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
} 