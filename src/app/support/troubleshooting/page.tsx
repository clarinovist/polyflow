import { redirect } from 'next/navigation';
import { listPublishedArticles } from '@/lib/bot/help-articles';
import {
  SupportModuleChips,
  SupportArticleGrid,
  SupportEmptyState,
  SupportPageHeader,
  SupportSearchBox,
} from '@/components/support/support-article-list';

export default async function SupportTroubleshootPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  const tab = typeof params.tab === 'string' ? params.tab : undefined;
  if (tab === 'cs') {
    const q = typeof params.q === 'string' ? `?q=${encodeURIComponent(params.q)}` : '';
    redirect(`/support/cs${q}`);
  }

  const moduleFilter = typeof params.module === 'string' ? params.module : undefined;
  const q = typeof params.q === 'string' ? params.q.slice(0, 200) : undefined;

  const articles = await listPublishedArticles({
    module: moduleFilter,
    tag: 'troubleshoot',
    q,
    limit: 30,
  });

  // Also include articles that have errorCodes (even if not tagged)
  const withErrorCodes = await listPublishedArticles({
    module: moduleFilter,
    q,
    limit: 30,
  }).then((all) => all.filter((a) => a.errorCodes.length > 0));

  // Merge dedupe
  const merged = [...articles];
  const seen = new Set(articles.map((a) => a.id));
  for (const a of withErrorCodes) {
    if (!seen.has(a.id)) {
      merged.push(a);
      seen.add(a.id);
    }
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <SupportPageHeader title="Troubleshooting" subtitle="Solusi untuk error umum, stok, period locked, permission, dan backflush." />

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <SupportSearchBox basePath="/support/troubleshooting" q={q} />
            <SupportModuleChips module={moduleFilter} basePath="/support/troubleshooting" />
          </div>

          {q && (
            <p className="text-xs text-muted-foreground">
              Hasil pencarian untuk <span className="font-medium">&ldquo;{q}&rdquo;</span> — {merged.length} artikel ditemukan.
            </p>
          )}

          {merged.length === 0 ? (
            <SupportEmptyState variant="troubleshoot" />
          ) : (
            <SupportArticleGrid articles={merged} from="troubleshooting" />
          )}
        </div>
      </div>
    </div>
  );
}
