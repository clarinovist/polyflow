import { listAllPublishedArticlesForNav } from '@/lib/bot/help-articles';
import { DocsSidebar } from '@/components/support/docs-sidebar';

/**
 * Docs-portal shell for the "learn the app" support content
 * (`/support`, `/support/troubleshooting`, `/support/[slug]`) — sidebar
 * nav tree on the left, article content on the right. `/support/cs`
 * (Virtual CS chat) lives outside this route group and keeps its own
 * full-width layout untouched.
 */
export default async function SupportDocsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const items = await listAllPublishedArticlesForNav();

    return (
        <div className="p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-6xl">
                <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-8">
                    <div className="lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)] lg:self-start">
                        <DocsSidebar items={items} />
                    </div>
                    <div className="min-w-0">{children}</div>
                </div>
            </div>
        </div>
    );
}
