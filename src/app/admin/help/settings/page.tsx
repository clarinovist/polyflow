'use client';

import { useEffect, useState } from 'react';
import { getHelpSettings, setHelpSetting } from '@/actions/admin/help-admin';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

type SettingRow = {
  key: string;
  valueJson: string;
  updatedAt: string | Date;
  updatedBy: string | null;
};

const SETTING_META: Record<string, { label: string; desc: string; type: 'bool' | 'number' | 'string' | 'json' }> = {
  virtualCsEnabled: { label: 'Virtual CS Enabled', desc: 'Master toggle Virtual CS', type: 'bool' },
  kbRetrievalEnabled: { label: 'KB Retrieval Enabled', desc: 'Apakah chat wajib coba KB dulu', type: 'bool' },
  autoLearnDraftEnabled: { label: 'Auto-learn Draft', desc: 'Buat draft otomatis dari cluster (Phase 3)', type: 'bool' },
  autoPublishEnabled: { label: 'Auto-publish (DANGER)', desc: 'HARUS OFF — supervised only', type: 'bool' },
  minClusterSizeForDraft: { label: 'Min Cluster Size for Draft', desc: 'Jumlah Q mirip sebelum buat draft', type: 'number' },
  feedbackThumbsEnabled: { label: 'Feedback Thumbs', desc: 'Tampilkan UP/DOWN di chat', type: 'bool' },
  guardrailMode: { label: 'Guardrail Mode', desc: 'intent_v2 recommended', type: 'string' },
  maxAgentToolLoops: { label: 'Max Agent Tool Loops', desc: 'Max iterasi agent LLM', type: 'number' },
  channels: { label: 'Channels', desc: 'Channel aktif (web, telegram)', type: 'json' },
  maxQuestionLength: { label: 'Max Question Length', desc: 'Batas karakter per pertanyaan', type: 'number' },
};

export default function HelpSettingsPage() {
  const [rows, setRows] = useState<SettingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  useEffect(() => {
    getHelpSettings()
      .then((data) => {
        setRows(data as SettingRow[]);
        const map: Record<string, string> = {};
        for (const r of data) map[r.key] = r.valueJson;
        setEditValues(map);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Gagal'))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (key: string) => {
    setSavingKey(key);
    setError('');
    try {
      const raw = editValues[key];
      // Validate JSON
      JSON.parse(raw);
      await setHelpSetting(key, raw);
      // refresh
      const data = await getHelpSettings();
      setRows(data as SettingRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal simpan');
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Help Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Feature flags & config Virtual CS / KB / auto-learn</p>
        </div>
        <Link href="/admin/help"><Button variant="outline" size="sm">← Dashboard</Button></Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 p-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <div className="grid gap-3">
        {rows.map((row) => {
          const meta = SETTING_META[row.key];
          const isBool = meta?.type === 'bool';
          const isJson = meta?.type === 'json';
          const currentVal = editValues[row.key] ?? row.valueJson;
          let parsed: unknown;
          try { parsed = JSON.parse(currentVal); } catch { parsed = currentVal; }
          const isDirty = currentVal !== row.valueJson;

          return (
            <Card key={row.key} className={row.key === 'autoPublishEnabled' ? 'border-red-200 dark:border-red-800' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    {meta?.label || row.key}
                    {row.key === 'autoPublishEnabled' && <Badge variant="destructive" className="text-[10px]">MUST OFF</Badge>}
                  </CardTitle>
                  <span className="text-[10px] text-muted-foreground">{new Date(row.updatedAt).toLocaleString('id-ID')}</span>
                </div>
                {meta?.desc && <CardDescription className="text-xs">{meta.desc}</CardDescription>}
              </CardHeader>
              <CardContent className="flex items-end gap-2">
                {isBool ? (
                  <select
                    value={currentVal}
                    onChange={(e) => setEditValues((p) => ({ ...p, [row.key]: e.target.value }))}
                    className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                    disabled={row.key === 'autoPublishEnabled'}
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <Input
                    value={currentVal}
                    onChange={(e) => setEditValues((p) => ({ ...p, [row.key]: e.target.value }))}
                    className={`flex-1 h-9 font-mono text-sm ${isJson ? 'min-w-[300px]' : ''}`}
                    placeholder={meta?.type === 'number' ? 'e.g. 3' : 'JSON value'}
                  />
                )}
                <Button
                  size="sm"
                  disabled={!isDirty || savingKey === row.key || (row.key === 'autoPublishEnabled' && parsed === true)}
                  onClick={() => handleSave(row.key)}
                  className="gap-1"
                >
                  {savingKey === row.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Simpan
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
