import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';

export type CitedArticle = {
    slug: string;
    title: string;
    summary?: string;
    modules?: string[];
};

export function CitedArticleCards({
    articles,
    relatedArticles,
}: {
    articles: CitedArticle[];
    relatedArticles?: CitedArticle[];
}) {
    if (!articles.length) return null;
    return (
        <div className="mt-3 space-y-2 pt-2 border-t border-border/40">
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5 text-emerald-500" /> Referensi
                Artikel Bantuan:
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
                {articles.slice(0, 3).map((a) => (
                    <Link
                        key={a.slug}
                        href={`/support/${a.slug}`}
                        className="group flex items-start gap-2.5 rounded-xl border border-border/60 bg-card/60 p-3 hover:bg-card hover:border-emerald-500/50 hover:shadow-sm transition-all duration-200"
                    >
                        <div className="mt-0.5 rounded-lg bg-emerald-500/10 p-1.5 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors shrink-0">
                            <BookOpen className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-foreground group-hover:text-emerald-600 dark:group-hover:text-emerald-400 line-clamp-1 transition-colors">
                                {a.title}
                            </p>
                            {a.summary && (
                                <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                                    {a.summary}
                                </p>
                            )}
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-emerald-500 group-hover:translate-x-0.5 transition-all self-center shrink-0" />
                    </Link>
                ))}
            </div>
            {relatedArticles && relatedArticles.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-muted-foreground">
                        Terkait:
                    </span>
                    {relatedArticles.slice(0, 3).map((a) => (
                        <Link
                            key={a.slug}
                            href={`/support/${a.slug}`}
                            className="text-[11px] px-2.5 py-1 rounded-full border border-border/50 bg-muted/40 hover:bg-muted text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                        >
                            {a.title.length > 35
                                ? a.title.slice(0, 35) + '…'
                                : a.title}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
