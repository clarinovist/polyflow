import { notFound } from 'next/navigation';
import { getPublishedArticleBySlug } from '@/lib/bot/help-articles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { ArticleBodyRenderer } from '@/components/support/article-renderer';
import { ArticleVoteButton } from '@/components/support/article-vote-button';
import { getModuleLabel } from '@/components/support/support-article-list';

export default async function ArticleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const article = await getPublishedArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  // Determine back link based on context
  const backHref = sp.from === 'troubleshooting' ? '/support/troubleshooting' : '/support';
  const backLabel = sp.from === 'troubleshooting' ? 'Kembali ke Troubleshooting' : 'Kembali ke Cara Pakai';

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-6">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>

          <div className="rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/80 p-6 shadow-sm backdrop-blur-sm">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {article.modules.map((m) => (
                <Badge key={m} variant="outline" className="text-xs">{getModuleLabel(m)}</Badge>
              ))}
              {article.tags.map((t) => (
                <span key={t} className="text-xs text-muted-foreground">#{t}</span>
              ))}
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {article.title}
            </h1>
            {article.summary && (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                {article.summary}
              </p>
            )}
            {article.errorCodes.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {article.errorCodes.map((ec) => (
                  <Badge key={ec} variant="destructive" className="text-xs font-mono">{ec}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Article Body */}
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/80 p-6 shadow-sm backdrop-blur-sm">
          <article className="prose prose-slate dark:prose-invert max-w-none">
            <ArticleBodyRenderer bodyMd={article.bodyMd} />
          </article>
        </div>

        {/* Vote */}
        <div className="mt-4 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white/60 dark:bg-zinc-900/60 p-4">
          <ArticleVoteButton
            articleId={article.id}
            helpfulCount={article.helpfulCount}
            notHelpfulCount={article.notHelpfulCount}
          />
        </div>

        {/* Footer CTA */}
        <div className="mt-4 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white/60 dark:bg-zinc-900/60 p-5 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            Masih butuh bantuan? Tanya Virtual CS untuk jawaban lebih spesifik.
          </p>
          <Link href={`/support/cs?q=${encodeURIComponent(article.title)}`}>
            <Button className="gap-2">
              <MessageCircle className="h-4 w-4" />
              Tanya Virtual CS
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
