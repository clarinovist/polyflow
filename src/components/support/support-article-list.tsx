import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HelpCircle, MessageCircle, Search } from 'lucide-react';

export const MODULE_FILTERS = ['global', 'sales', 'warehouse', 'production', 'finance', 'hrd', 'purchasing', 'access'];

const MODULE_LABELS: Record<string, string> = {
  global: 'Umum',
  sales: 'Penjualan',
  warehouse: 'Gudang',
  production: 'Produksi',
  finance: 'Finance',
  hrd: 'HRD',
  purchasing: 'Pembelian',
  access: 'Akses',
};

export function getModuleLabel(m: string): string {
  return MODULE_LABELS[m] ?? m;
}

export type SupportArticleListItem = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  modules: string[];
  tags: string[];
  errorCodes: string[];
  helpfulCount: number;
  notHelpfulCount: number;
  publishedAt: Date | null;
};

export function SupportSearchBox({ basePath, q }: { basePath: string; q?: string }) {
  return (
    <form method="GET" action={basePath} className="relative max-w-sm">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <input
        type="text"
        name="q"
        defaultValue={q}
        placeholder="Cari artikel..."
        className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      />
    </form>
  );
}

export function SupportModuleChips({ module, basePath }: { module?: string; basePath: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={basePath}
        className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
          !module ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted'
        }`}
      >
        Semua
      </Link>
      {MODULE_FILTERS.map((m) => (
        <Link
          key={m}
          href={`${basePath}?module=${m}`}
          className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
            module === m ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-muted'
          }`}
        >
          {getModuleLabel(m)}
        </Link>
      ))}
    </div>
  );
}

export function SupportArticleGrid({ articles, from }: { articles: SupportArticleListItem[]; from?: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {articles.map((article) => (
        <Link key={article.id} href={`/support/${article.slug}${from ? `?from=${from}` : ''}`}>
          <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold text-foreground mb-1 line-clamp-2">{article.title}</h3>
              {article.summary && (
                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{article.summary}</p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {article.modules.slice(0, 2).map((m) => (
                  <Badge key={m} variant="outline" className="text-xs">
                    {getModuleLabel(m)}
                  </Badge>
                ))}
                {article.helpfulCount > 0 && (
                  <span className="text-xs text-muted-foreground">{article.helpfulCount} 👍</span>
                )}
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export function SupportEmptyState({ variant }: { variant: 'howto' | 'troubleshoot' }) {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <HelpCircle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">
          {variant === 'troubleshoot' ? 'Belum ada artikel troubleshooting.' : 'Belum ada artikel panduan.'}
        </p>
        <p className="text-sm text-muted-foreground mt-1">Coba tanyakan ke Virtual CS—langsung jawab pakai panduan yang ada.</p>
        <div className="mt-4 flex justify-center gap-2">
          <Link href="/support/cs">
            <Button size="sm" className="gap-1.5">
              <MessageCircle className="h-4 w-4" /> Tanya Virtual CS
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export function SupportPageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link href="/support" className="hover:text-foreground">
          Bantuan
        </Link>
        {title !== 'Cara Pakai' && (
          <>
            <span>›</span>
            <span className="text-foreground">{title}</span>
          </>
        )}
      </div>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}
