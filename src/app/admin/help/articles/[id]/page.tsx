'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getHelpArticle, updateHelpArticle, publishHelpArticle, archiveHelpArticle } from '@/actions/admin/help-articles';
import { HelpArticleEditor } from '@/components/admin/help-article-editor';
import { Loader2 } from 'lucide-react';

export default function EditHelpArticlePage() {
  const params = useParams();
  const id = params.id as string;

  const [article, setArticle] = useState<Awaited<ReturnType<typeof getHelpArticle>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getHelpArticle(id)
      .then(setArticle)
      .catch((e) => setError(e instanceof Error ? e.message : 'Gagal memuat artikel.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="text-center py-20">
        <p className="text-red-600">{error || 'Artikel tidak ditemukan.'}</p>
      </div>
    );
  }

  return (
    <HelpArticleEditor
      article={{
        id: article.id,
        title: article.title,
        slug: article.slug,
        summary: article.summary,
        bodyMd: article.bodyMd,
        status: article.status,
        modules: article.modules,
        tags: article.tags,
        errorCodes: article.errorCodes,
        source: article.source,
        version: article.version,
      }}
      onSave={async (data) => {
        try {
          await updateHelpArticle(id, data as unknown as Parameters<typeof updateHelpArticle>[1]);
          return { id };
        } catch (e) {
          return { error: e instanceof Error ? e.message : 'Gagal menyimpan.' };
        }
      }}
      onPublish={async (articleId) => {
        try {
          await publishHelpArticle(articleId);
          return {};
        } catch (e) {
          return { error: e instanceof Error ? e.message : 'Gagal publish.' };
        }
      }}
      onArchive={async (articleId) => {
        try {
          await archiveHelpArticle(articleId);
          return {};
        } catch (e) {
          return { error: e instanceof Error ? e.message : 'Gagal arsipkan.' };
        }
      }}
    />
  );
}
