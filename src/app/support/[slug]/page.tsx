import { notFound } from 'next/navigation';
import { getPublishedArticleBySlug } from '@/lib/bot/help-articles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import Link from 'next/link';

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);

  if (!article) {
    notFound();
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/support"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Support
          </Link>

          <div className="rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/80 p-6 shadow-sm backdrop-blur-sm">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {article.modules.map((m) => (
                <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
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
          <div className="prose prose-slate dark:prose-invert max-w-none">
            {article.bodyMd.split('\n').map((line, i) => {
              if (line.startsWith('## ')) {
                return <h2 key={i} className="text-lg font-bold mt-6 mb-2">{line.replace('## ', '')}</h2>;
              }
              if (line.startsWith('### ')) {
                return <h3 key={i} className="text-base font-semibold mt-4 mb-1.5">{line.replace('### ', '')}</h3>;
              }
              if (line.startsWith('- ')) {
                return <li key={i} className="text-sm ml-4">{line.replace('- ', '')}</li>;
              }
              if (/^\d+\.\s/.test(line)) {
                return <li key={i} className="text-sm ml-4 list-decimal">{line.replace(/^\d+\.\s/, '')}</li>;
              }
              if (line.startsWith('> ')) {
                return <blockquote key={i} className="border-l-4 border-primary/30 pl-4 text-sm italic text-muted-foreground my-2">{line.replace('> ', '')}</blockquote>;
              }
              if (line.trim() === '') {
                return <br key={i} />;
              }
              return <p key={i} className="text-sm leading-relaxed">{line}</p>;
            })}
          </div>
        </div>

        {/* Footer CTA */}
        <div className="mt-6 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white/60 dark:bg-zinc-900/60 p-5 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            Masih butuh bantuan? Tanya Virtual CS untuk jawaban lebih spesifik.
          </p>
          <Link href="/support?tab=cs">
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
