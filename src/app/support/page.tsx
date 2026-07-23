import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { PolyflowChatPanel } from '@/components/support/polyflow-chat-panel';
import { listPublishedArticles } from '@/lib/bot/help-articles';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { BookOpen, AlertTriangle, MessageCircle, HelpCircle } from 'lucide-react';
import Link from 'next/link';

const TAB_PARAM = 'tab';

const MODULE_FILTERS = ['global', 'sales', 'warehouse', 'production', 'finance', 'hrd', 'purchasing', 'access'];

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const params = await searchParams;
  const tab = typeof params[TAB_PARAM] === 'string' ? params[TAB_PARAM] as string : 'howto';
  const moduleFilter = typeof params.module === 'string' ? params.module : undefined;

  const isTroubleshoot = tab === 'troubleshoot';

  const articles = await listPublishedArticles({
    module: moduleFilter,
    tag: isTroubleshoot ? 'troubleshoot' : undefined,
    limit: 30,
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 via-white to-slate-100 dark:from-zinc-900 dark:via-zinc-950 dark:to-zinc-900 p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 rounded-2xl border border-slate-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-900/80 p-5 shadow-sm backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700 dark:text-teal-400">Support Center</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">Bantuan Polyflow</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Panduan penggunaan, troubleshooting, dan Virtual CS.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-4 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white/60 dark:bg-zinc-900/60 p-1">
          <Link
            href="/support?tab=howto"
            className={`flex items-center gap-2 flex-1 justify-center px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'howto'
                ? 'bg-white dark:bg-zinc-800 shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BookOpen className="h-4 w-4" />
            Cara Pakai
          </Link>
          <Link
            href="/support?tab=troubleshoot"
            className={`flex items-center gap-2 flex-1 justify-center px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'troubleshoot'
                ? 'bg-white dark:bg-zinc-800 shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
            Troubleshooting
          </Link>
          <Link
            href="/support?tab=cs"
            className={`flex items-center gap-2 flex-1 justify-center px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'cs'
                ? 'bg-white dark:bg-zinc-800 shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <MessageCircle className="h-4 w-4" />
            Tanya CS
          </Link>
        </div>

        {/* Tab Content */}
        {tab === 'cs' ? (
          <PolyflowChatPanel embedded />
        ) : (
          <div className="space-y-4">
            {/* Module filter chips */}
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/support?tab=${tab}`}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  !moduleFilter ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted'
                }`}
              >
                Semua
              </Link>
              {MODULE_FILTERS.map((m) => (
                <Link
                  key={m}
                  href={`/support?tab=${tab}&module=${m}`}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    moduleFilter === m ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted'
                  }`}
                >
                  {m}
                </Link>
              ))}
            </div>

            {/* Article list */}
            {articles.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <HelpCircle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground">
                    {tab === 'troubleshoot'
                      ? 'Belum ada artikel troubleshooting.'
                      : 'Belum ada artikel panduan.'}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Coba tanyakan ke Virtual CS di tab &quot;Tanya CS&quot;.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {articles.map((article) => (
                  <Link key={article.id} href={`/support/${article.slug}`}>
                    <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="p-4">
                        <h3 className="text-sm font-semibold text-foreground mb-1 line-clamp-2">
                          {article.title}
                        </h3>
                        {article.summary && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                            {article.summary}
                          </p>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          {article.modules.slice(0, 2).map((m) => (
                            <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
                          ))}
                          {article.helpfulCount > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {article.helpfulCount} 👍
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
