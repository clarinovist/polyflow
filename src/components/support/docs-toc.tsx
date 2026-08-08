import type { ArticleHeading } from '@/lib/support/toc';

/**
 * "On this page" anchor list for article detail pages. Plain server
 * component — v1 has no scrollspy, just links to the `<h2>` ids that
 * `article-renderer.tsx` sets via the same `slugifyHeading`/
 * `createHeadingIdSequencer` pass as `extractHeadings`.
 */
export function DocsToc({ headings }: { headings: ArticleHeading[] }) {
    if (headings.length <= 1) return null;

    return (
        <nav aria-label="Di halaman ini" className="text-sm">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                Di halaman ini
            </h3>
            <ul className="space-y-1.5 border-l border-border">
                {headings.map((heading) => (
                    <li key={heading.id}>
                        <a
                            href={`#${heading.id}`}
                            className="block -ml-px border-l-2 border-transparent pl-3 text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                        >
                            {heading.text}
                        </a>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
