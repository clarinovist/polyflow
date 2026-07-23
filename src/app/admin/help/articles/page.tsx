import { listHelpArticles } from '@/actions/admin/help-articles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { Plus, Search, FileText, Eye, Pencil } from 'lucide-react';

export const dynamic = 'force-dynamic';

const statusColors: Record<string, string> = {
  DRAFT: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  PUBLISHED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  ARCHIVED: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
};

const MODULE_OPTIONS = ['global', 'sales', 'warehouse', 'production', 'finance', 'hrd', 'purchasing', 'access'];

export default async function HelpArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const page = Number(params.page) || 1;
  const status = typeof params.status === 'string' ? params.status as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' : undefined;
  const moduleFilter = typeof params.module === 'string' ? params.module : undefined;
  const q = typeof params.q === 'string' ? params.q : undefined;

  const { articles, total, limit } = await listHelpArticles({ page, limit: 20, status, module: moduleFilter, q });
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Base Articles</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total} artikel · Kelola panduan & troubleshooting untuk user
          </p>
        </div>
        <Link href="/admin/help/articles/new">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Artikel Baru
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <form className="flex flex-wrap gap-3 items-end" method="GET">
            <div className="flex-1 min-w-[200px]">
              <Input
                name="q"
                placeholder="Cari judul / tag..."
                defaultValue={q}
                className="h-9"
              />
            </div>
            <select
              name="status"
              defaultValue={status || ''}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Semua status</option>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </select>
            <select
              name="module"
              defaultValue={moduleFilter || ''}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Semua modul</option>
              {MODULE_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <Button type="submit" variant="outline" size="sm" className="gap-1">
              <Search className="h-3.5 w-3.5" />
              Filter
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Article List */}
      {articles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Belum ada artikel. Buat artikel pertama untuk memulai.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {articles.map((article) => (
            <Card key={article.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/admin/help/articles/${article.id}`}
                        className="text-sm font-semibold text-foreground hover:underline truncate"
                      >
                        {article.title}
                      </Link>
                      <Badge className={statusColors[article.status] || ''}>
                        {article.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">v{article.version}</span>
                    </div>
                    {article.summary && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{article.summary}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {article.modules.map((m) => (
                        <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
                      ))}
                      {article.tags.slice(0, 3).map((t) => (
                        <span key={t} className="text-xs text-muted-foreground">#{t}</span>
                      ))}
                      <span className="text-xs text-muted-foreground">
                        {article.helpfulCount} 👍 · {article.notHelpfulCount} 👎
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {article.source}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link href={`/admin/help/articles/${article.id}`}>
                      <Button variant="outline" size="sm" className="gap-1">
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                    </Link>
                    {article.status === 'PUBLISHED' && (
                      <Link href={`/support/${article.slug}`} target="_blank">
                        <Button variant="ghost" size="sm" className="gap-1">
                          <Eye className="h-3.5 w-3.5" />
                          Lihat
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/admin/help/articles?page=${p}${status ? `&status=${status}` : ''}${moduleFilter ? `&module=${moduleFilter}` : ''}${q ? `&q=${q}` : ''}`}
              className={`px-3 py-1.5 text-sm rounded-md ${p === page ? 'bg-primary text-primary-foreground' : 'border hover:bg-muted'}`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
