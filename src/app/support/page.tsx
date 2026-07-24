import { redirect } from 'next/navigation';
import { listPublishedArticles } from '@/lib/bot/help-articles';
import {
  SupportModuleChips,
  SupportArticleGrid,
  SupportEmptyState,
  SupportPageHeader,
  SupportSearchBox,
} from '@/components/support/support-article-list';

export default async function SupportHowtoPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  // Legacy redirect: ?tab=cs or ?tab=troubleshoot
  const tab = typeof params.tab === 'string' ? params.tab : undefined;
  if (tab === 'cs') {
    const q = typeof params.q === 'string' ? `?q=${encodeURIComponent(params.q)}` : '';
    redirect(`/support/cs${q}`);
  }
  if (tab === 'troubleshoot') {
    const mod = typeof params.module === 'string' ? `?module=${params.module}` : '';
    redirect(`/support/troubleshooting${mod}`);
  }

  const moduleFilter = typeof params.module === 'string' ? params.module : undefined;
  const q = typeof params.q === 'string' ? params.q.slice(0, 200) : undefined;

  const articles = await listPublishedArticles({
    module: moduleFilter,
    q,
    limit: 30,
  });

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <SupportPageHeader title="Cara Pakai" subtitle="Panduan langkah demi langkah penggunaan Polyflow per modul." />

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <SupportSearchBox basePath="/support" q={q} />
            <SupportModuleChips module={moduleFilter} basePath="/support" />
          </div>

          {q && (
            <p className="text-xs text-muted-foreground">
              Hasil pencarian untuk <span className="font-medium">&ldquo;{q}&rdquo;</span> — {articles.length} artikel ditemukan.
            </p>
          )}

          {articles.length === 0 ? (
            <SupportEmptyState variant="howto" />
          ) : (
            <SupportArticleGrid articles={articles} />
          )}
        </div>
      </div>
    </div>
  );
}
