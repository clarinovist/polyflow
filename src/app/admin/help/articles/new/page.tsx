'use client';

import { createHelpArticle } from '@/actions/admin/help-articles';
import { HelpArticleEditor } from '@/components/admin/help-article-editor';

export default function NewHelpArticlePage() {
  return (
    <HelpArticleEditor
      onSave={async (data) => {
        try {
          const article = await createHelpArticle(data as unknown as Parameters<typeof createHelpArticle>[0]);
          return { id: article.id };
        } catch (e) {
          return { error: e instanceof Error ? e.message : 'Gagal menyimpan.' };
        }
      }}
    />
  );
}
