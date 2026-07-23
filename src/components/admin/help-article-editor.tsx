'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Save, Send, Archive, ArrowLeft, X } from 'lucide-react';
import Link from 'next/link';

const MODULE_OPTIONS = ['global', 'sales', 'warehouse', 'production', 'finance', 'hrd', 'purchasing', 'access'];

interface ArticleData {
  id?: string;
  title: string;
  slug: string;
  summary: string;
  bodyMd: string;
  status: string;
  modules: string[];
  tags: string[];
  errorCodes: string[];
  source: string;
  version: number;
}

interface Props {
  article?: ArticleData;
  onSave: (data: Record<string, unknown>) => Promise<{ id?: string; error?: string }>;
  onPublish?: (id: string) => Promise<{ error?: string }>;
  onArchive?: (id: string) => Promise<{ error?: string }>;
}

export function HelpArticleEditor({ article, onSave, onPublish, onArchive }: Props) {
  const router = useRouter();
  const isNew = !article?.id;

  const [title, setTitle] = useState(article?.title || '');
  const [slug, setSlug] = useState(article?.slug || '');
  const [summary, setSummary] = useState(article?.summary || '');
  const [bodyMd, setBodyMd] = useState(article?.bodyMd || '');
  const [modules, setModules] = useState<string[]>(article?.modules || ['global']);
  const [tags, setTags] = useState<string[]>(article?.tags || []);
  const [errorCodes, setErrorCodes] = useState<string[]>(article?.errorCodes || []);
  const [tagInput, setTagInput] = useState('');
  const [errorCodeInput, setErrorCodeInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const autoSlug = (t: string) =>
    t.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 120);

  const handleSave = async () => {
    if (!title.trim()) { setError('Judul wajib diisi.'); return; }
    if (!bodyMd.trim()) { setError('Konten wajib diisi.'); return; }

    setSaving(true);
    setError('');

    const result = await onSave({
      title: title.trim(),
      slug: slug.trim() || autoSlug(title),
      summary: summary.trim(),
      bodyMd: bodyMd.trim(),
      modules,
      tags,
      errorCodes,
    });

    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }

    if (isNew && result.id) {
      router.push(`/admin/help/articles/${result.id}`);
    } else {
      router.refresh();
    }
    setSaving(false);
  };

  const handlePublish = async () => {
    if (!article?.id || !onPublish) return;
    setSaving(true);
    const result = await onPublish(article.id);
    if (result.error) setError(result.error);
    else router.refresh();
    setSaving(false);
  };

  const handleArchive = async () => {
    if (!article?.id || !onArchive) return;
    if (!confirm('Arsipkan artikel ini? User tidak akan melihatnya lagi.')) return;
    setSaving(true);
    const result = await onArchive(article.id);
    if (result.error) setError(result.error);
    else router.refresh();
    setSaving(false);
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };

  const addErrorCode = () => {
    const e = errorCodeInput.trim().toUpperCase();
    if (e && !errorCodes.includes(e)) setErrorCodes([...errorCodes, e]);
    setErrorCodeInput('');
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/help/articles" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">{isNew ? 'Artikel Baru' : `Edit: ${article?.title}`}</h1>
        {article?.status && (
          <Badge className={
            article.status === 'PUBLISHED' ? 'bg-green-100 text-green-800' :
            article.status === 'DRAFT' ? 'bg-yellow-100 text-yellow-800' :
            'bg-gray-100 text-gray-800'
          }>
            {article.status} v{article.version}
          </Badge>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Konten</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Judul *</label>
                <Input
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (isNew || !slug) setSlug(autoSlug(e.target.value));
                  }}
                  placeholder="Cara buat Sales Order"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Slug</label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="cara-buat-sales-order"
                  className="mt-1 font-mono text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Ringkasan</label>
                <Input
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Ringkasan singkat untuk preview dan pencarian"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Konten (Markdown) *</label>
                <Textarea
                  value={bodyMd}
                  onChange={(e) => setBodyMd(e.target.value)}
                  placeholder={`## Langkah-langkah\n\n1. Buka menu **Sales** → **Sales Order**\n2. Klik tombol **+ Baru**\n3. ...\n\n## Tips\n- ...\n\n## Troubleshooting\n- ...`}
                  className="mt-1 min-h-[400px] font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Gunakan Markdown. Heading ## untuk judul section, list untuk langkah.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Modul</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {MODULE_OPTIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      if (m === 'global') {
                        setModules(['global']);
                      } else {
                        const filtered = modules.filter((x) => x !== 'global');
                        setModules(
                          filtered.includes(m)
                            ? filtered.filter((x) => x !== m)
                            : [...filtered, m]
                        );
                      }
                    }}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      modules.includes(m)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-input hover:bg-muted'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Tags</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  placeholder="tambah tag..."
                  className="h-8 text-sm"
                />
                <Button type="button" variant="outline" size="sm" onClick={addTag}>+</Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1 text-xs">
                    #{t}
                    <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Error Codes</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={errorCodeInput}
                  onChange={(e) => setErrorCodeInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addErrorCode())}
                  placeholder="STOCK_INSUFFICIENT"
                  className="h-8 text-sm font-mono"
                />
                <Button type="button" variant="outline" size="sm" onClick={addErrorCode}>+</Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {errorCodes.map((e) => (
                  <Badge key={e} variant="destructive" className="gap-1 text-xs font-mono">
                    {e}
                    <button type="button" onClick={() => setErrorCodes(errorCodes.filter((x) => x !== e))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="space-y-2">
            <Button onClick={handleSave} disabled={saving} className="w-full gap-2">
              <Save className="h-4 w-4" />
              {saving ? 'Menyimpan...' : isNew ? 'Simpan Draft' : 'Simpan Perubahan'}
            </Button>

            {!isNew && article?.status !== 'PUBLISHED' && onPublish && (
              <Button onClick={handlePublish} disabled={saving} variant="default" className="w-full gap-2">
                <Send className="h-4 w-4" />
                Publish
              </Button>
            )}

            {!isNew && article?.status !== 'ARCHIVED' && onArchive && (
              <Button onClick={handleArchive} disabled={saving} variant="outline" className="w-full gap-2">
                <Archive className="h-4 w-4" />
                Arsipkan
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
