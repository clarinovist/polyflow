'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileText, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  listEmployeeDocuments,
  createEmployeeDocument,
  archiveEmployeeDocument,
  restoreEmployeeDocument,
} from '@/actions/hrd/employee-document';
import {
  EMPLOYEE_DOCUMENT_CATEGORIES,
  employeeDocumentCategoryLabels,
} from '@/lib/labels/hrd-employees';

type Doc = {
  id: string;
  category: string;
  name: string;
  fileUrl: string;
  status: string;
  createdAt: string | Date;
};

interface Props {
  employeeId: string;
}

export function Employee360DocumentsTab({ employeeId }: Props) {
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [_loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docForm, setDocForm] = useState({ category: 'KTP', name: '', notes: '' });
  const [docFile, setDocFile] = useState<File | null>(null);

  const loadDocs = useCallback(async (archived = false) => {
    const res = await listEmployeeDocuments(employeeId, archived);
    setDocuments(res.success ? ((res.data ?? []) as unknown as Doc[]) : []);
    setLoading(false);
  }, [employeeId]);

  useEffect(() => { loadDocs(false); }, [loadDocs]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docForm.name.trim()) { toast.error('Judul dokumen wajib diisi'); return; }
    if (!docFile) { toast.error('Pilih file dokumen'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', docFile);
      fd.append('entityId', employeeId);
      fd.append('category', 'employee');
      const up = await fetch('/api/upload/hrd-doc', { method: 'POST', body: fd });
      if (!up.ok) {
        const err = (await up.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error || 'Gagal upload file');
        return;
      }
      const json = (await up.json()) as { publicUrl?: string };
      if (!json.publicUrl) { toast.error('Upload gagal: URL tidak diterima'); return; }
      const res = await createEmployeeDocument({
        employeeId,
        category: docForm.category,
        name: docForm.name.trim(),
        fileUrl: json.publicUrl,
        fileSize: docFile.size,
        mimeType: docFile.type,
        notes: docForm.notes.trim() || undefined,
      });
      if (res.success) {
        toast.success('Dokumen diunggah');
        setDocForm({ category: 'KTP', name: '', notes: '' });
        setDocFile(null);
        await loadDocs(showArchived);
      } else {
        toast.error(res.error || 'Gagal menyimpan dokumen');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal upload');
    } finally {
      setUploading(false);
    }
  };

  const fmtDate = (d: string | Date) =>
    new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-primary" />
          <CardTitle className="text-sm">Dokumen Karyawan</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Upload form */}
        <form onSubmit={handleUpload} className="rounded-md border border-border/60 bg-muted/10 p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-tight text-muted-foreground flex items-center gap-1.5">
            <Upload className="h-3 w-3" /> Unggah dokumen
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px]">Kategori</Label>
              <select
                className="w-full h-9 rounded-md border bg-background px-2 text-xs"
                value={docForm.category}
                onChange={(e) => setDocForm({ ...docForm, category: e.target.value })}
              >
                {EMPLOYEE_DOCUMENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{employeeDocumentCategoryLabels[c] ?? c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px]">Judul</Label>
              <Input className="h-9 text-xs" placeholder="KTP - Nama Karyawan" value={docForm.name}
                onChange={(e) => setDocForm({ ...docForm, name: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">File (PDF/JPG/PNG, max 2MB)</Label>
            <Input type="file" accept="image/*,application/pdf" className="h-9 text-xs"
              onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Catatan (opsional)</Label>
            <Input className="h-9 text-xs" value={docForm.notes}
              onChange={(e) => setDocForm({ ...docForm, notes: e.target.value })} />
          </div>
          <Button type="submit" size="sm" disabled={uploading || !docFile || !docForm.name.trim()}>
            {uploading ? 'Mengunggah…' : 'Unggah dokumen'}
          </Button>
        </form>

        {/* Document list */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {documents.length === 0 ? 'Belum ada dokumen.' : `${documents.length} dokumen`}
          </p>
          <button type="button" className="text-xs underline text-muted-foreground"
            onClick={async () => { const next = !showArchived; setShowArchived(next); await loadDocs(next); }}>
            {showArchived ? 'Sembunyikan arsip' : 'Tampilkan arsip'}
          </button>
        </div>
        {documents.map((d) => (
          <div key={d.id} className="border-b border-border/50 py-2 flex items-start justify-between gap-2">
            <div>
              <div className="font-medium text-sm">
                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-muted/50 mr-1.5">
                  {employeeDocumentCategoryLabels[d.category] ?? d.category}
                </span>
                {d.name}
                {d.status === 'ARCHIVED' && <span className="ml-1 text-[10px] text-muted-foreground">(arsip)</span>}
              </div>
              <div className="text-xs text-muted-foreground">{fmtDate(d.createdAt)}</div>
            </div>
            <div className="flex gap-1 shrink-0">
              <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-xs underline text-primary">Buka</a>
              {d.status === 'ACTIVE' ? (
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={async () => {
                    const res = await archiveEmployeeDocument(d.id);
                    if (res.success) { toast.success('Dokumen diarsipkan'); await loadDocs(showArchived); }
                    else toast.error(res.error || 'Gagal');
                  }}>Arsip</button>
              ) : (
                <button type="button" className="text-xs text-primary hover:underline"
                  onClick={async () => {
                    const res = await restoreEmployeeDocument(d.id);
                    if (res.success) { toast.success('Dokumen dipulihkan'); await loadDocs(showArchived); }
                    else toast.error(res.error || 'Gagal');
                  }}>Pulihkan</button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
