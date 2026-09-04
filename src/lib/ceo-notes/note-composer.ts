import OpenAI from 'openai';
import type { DetectionResult } from '@/lib/telegram/digest/detection-types';
import { formatMemoryForPrompt, type NoteMemory } from './note-memory';

export type ComposedNote = {
    title: string;
    body: string;
    suggestedSteps: string[];
    priority: 'CRITICAL' | 'NORMAL';
    requiredResources: string[];
    sourceDetectors: string[];
    sourceFingerprints: string[];
    dueAt?: string;
};

export type ComposerInput = {
    results: DetectionResult[];
    memory: NoteMemory;
    statsSummary: string;
};

export type ComposerOutcome = {
    notes: ComposedNote[];
    aiModel: string | null;
    usedFallback: boolean;
};

const MAX_ITEMS_PER_DETECTOR = 20;
const MAX_NOTES = 8;

const CRITICAL_DETECTORS = new Set([
    'missing_finance_journal',
    'overdue_ar',
    'overdue_ap',
    'critical_stock',
]);

function getOpenAIClient() {
    return new OpenAI({
        apiKey: process.env.LLM_API_KEY || '',
        baseURL: process.env.LLM_BASE_URL || 'http://localhost:11434/v1',
    });
}

function summarizeDetectors(results: DetectionResult[]): string {
    const lines: string[] = [];
    for (const r of results) {
        if (r.status !== 'ok') {
            lines.push(
                `- ${r.detector}: GAGAL (${r.status}${r.error ? `: ${r.error}` : ''}) — JANGAN tulis "semua aman" untuk area ini.`,
            );
            continue;
        }
        if (r.items.length === 0) {
            lines.push(`- ${r.detector}: tidak ada temuan.`);
            continue;
        }
        lines.push(`- ${r.detector} (${r.items.length} temuan):`);
        for (const item of r.items.slice(0, MAX_ITEMS_PER_DETECTOR)) {
            lines.push(
                `  - [${item.entityKey}] (${item.severity}) ${item.headline}${item.detail ? ` — ${item.detail}` : ''}`,
            );
        }
    }
    return lines.join('\n');
}

function buildPrompt(input: ComposerInput): string {
    return `Kamu adalah analis operasional Polyflow ERP (pabrik plastik). Tugas: olah hasil deteksi otomatis hari ini menjadi catatan kerja untuk CEO, dalam Bahasa Indonesia santai-profesional. Output HANYA JSON: {"notes": [{"title", "body", "suggestedSteps": string[], "priority": "CRITICAL"|"NORMAL", "requiredResources": string[], "sourceDetectors": string[], "sourceFingerprints": string[], "dueAt"?: "ISO-date-opsional"}]}.

Hasil deteksi hari ini:
${summarizeDetectors(input.results)}

Ingatan tenant ini:
${formatMemoryForPrompt(input.memory)}

Ringkasan angka hari ini:
${input.statsSummary}

Aturan:
- title: 1 baris, spesifik, sebut angka/nama bila ada. body: 2-4 kalimat — apa yang terjadi, kenapa penting, korelasi lintas modul bila terlihat dari data di atas. suggestedSteps: 1-3 langkah konkret yang bisa dikerjakan karyawan.
- Setiap catatan WAJIB merujuk minimal 1 fingerprint [entityKey] yang ADA di hasil deteksi di atas (tulis di sourceFingerprints). DILARANG mengarang angka, nama, atau fingerprint di luar input.
- DILARANG menyebut pola frekuensi ("sering", "tiap minggu", "X kali") kecuali polanya tertulis di Ingatan di atas.
- Isu yang di Ingatan disebut masih terbuka JANGAN dibuatkan catatan baru — abaikan saja, sistem mencatat kemunculan ulangnya otomatis.
- Detector berstatus GAGAL tidak boleh disimpulkan aman.
- priority: CRITICAL hanya untuk yang mengancam kas/produksi berhenti/data keuangan hilang; selebihnya NORMAL.
- requiredResources: salin dari detector yang dirujuk (mis. /warehouse/inventory). dueAt: isi hanya bila mendesak dengan tanggal konkret, format ISO, else hilangkan key-nya.
- Maksimal ${MAX_NOTES} catatan; gabungkan temuan sejenis jadi 1 catatan. Bila tidak ada yang layak dicatat, jawab {"notes": []}.`;
}

function sanitizeNotes(
    raw: unknown,
    validFingerprints: Set<string>,
): ComposedNote[] {
    if (!raw || typeof raw !== 'object') return [];
    const list = (raw as { notes?: unknown }).notes;
    if (!Array.isArray(list)) return [];
    const out: ComposedNote[] = [];
    for (const n of list.slice(0, MAX_NOTES)) {
        if (!n || typeof n !== 'object') continue;
        const c = n as Record<string, unknown>;
        if (typeof c.title !== 'string' || !c.title.trim()) continue;
        if (typeof c.body !== 'string' || !c.body.trim()) continue;
        const fingerprints = Array.isArray(c.sourceFingerprints)
            ? (c.sourceFingerprints as unknown[]).filter(
                  (f): f is string =>
                      typeof f === 'string' && validFingerprints.has(f),
              )
            : [];
        if (fingerprints.length === 0) continue;
        const detectors = Array.isArray(c.sourceDetectors)
            ? (c.sourceDetectors as unknown[]).filter(
                  (d): d is string => typeof d === 'string',
              )
            : [];
        const resources = Array.isArray(c.requiredResources)
            ? (c.requiredResources as unknown[]).filter(
                  (r): r is string => typeof r === 'string',
              )
            : [];
        const steps = Array.isArray(c.suggestedSteps)
            ? (c.suggestedSteps as unknown[])
                  .filter((s): s is string => typeof s === 'string')
                  .slice(0, 3)
            : [];
        out.push({
            title: c.title.slice(0, 200),
            body: c.body.slice(0, 4000),
            suggestedSteps: steps,
            priority: c.priority === 'CRITICAL' ? 'CRITICAL' : 'NORMAL',
            requiredResources: resources,
            sourceDetectors: detectors,
            sourceFingerprints: fingerprints,
            ...(typeof c.dueAt === 'string' && !Number.isNaN(Date.parse(c.dueAt))
                ? { dueAt: c.dueAt }
                : {}),
        });
    }
    return out;
}

function fallbackNotes(results: DetectionResult[]): ComposedNote[] {
    const out: ComposedNote[] = [];
    for (const r of results) {
        if (r.status !== 'ok') continue;
        for (const item of r.items.slice(0, 3)) {
            out.push({
                title: item.headline.slice(0, 200),
                body: `${item.headline}${item.detail ? `. ${item.detail}` : ''} (catatan otomatis tanpa olahan AI — LLM tidak tersedia saat penyusunan).`,
                suggestedSteps: [],
                priority: CRITICAL_DETECTORS.has(r.detector) ? 'CRITICAL' : 'NORMAL',
                requiredResources: r.requiredResources,
                sourceDetectors: [r.detector],
                sourceFingerprints: [item.entityKey],
            });
            if (out.length >= MAX_NOTES) return out;
        }
        if (out.length >= MAX_NOTES) break;
    }
    return out;
}

export async function composeNotes(
    input: ComposerInput,
): Promise<ComposerOutcome> {
    const validFingerprints = new Set<string>();
    for (const r of input.results) {
        for (const item of r.items) validFingerprints.add(item.entityKey);
    }

    const model = process.env.LLM_MODEL || 'deepseek-r1:7b';
    try {
        const openai = getOpenAIClient();
        const completion = await openai.chat.completions.create({
            model,
            messages: [
                {
                    role: 'system',
                    content:
                        'Kamu analis operasional ERP. Output JSON saja, no extra prose. Jangan halusinasi angka/nama di luar input.',
                },
                { role: 'user', content: buildPrompt(input) },
            ],
            temperature: 0.3,
        });
        const content =
            completion.choices[0]?.message?.content?.trim() || '';
        const parsed = JSON.parse(content.replace(/```json|```/g, '').trim());
        const notes = sanitizeNotes(parsed, validFingerprints);
        return { notes, aiModel: model, usedFallback: false };
    } catch {
        return {
            notes: fallbackNotes(input.results),
            aiModel: null,
            usedFallback: true,
        };
    }
}

export function defaultPriorityForDetector(detector: string): 'CRITICAL' | 'NORMAL' {
    return CRITICAL_DETECTORS.has(detector) ? 'CRITICAL' : 'NORMAL';
}
