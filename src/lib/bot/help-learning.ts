/**
 * Phase 3: Supervised auto-learn — draft generation from clusters.
 * No auto-publish; drafts go to PENDING_REVIEW queue, super-admin approves.
 */

import { getMainPrisma } from '@/lib/core/prisma';
import OpenAI from 'openai';

const DEFAULT_MIN_CLUSTER = 3;

export interface DraftGenerationResult {
  created: number;
  skipped: number;
  errors: string[];
}

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.LLM_API_KEY || '',
    baseURL: process.env.LLM_BASE_URL || 'http://localhost:11434/v1',
  });
}

async function generateDraftFromCluster(cluster: {
  id: string;
  canonicalQuestion: string;
  sampleQuestions: string[];
  suggestedModule?: string | null;
  hitCount: number;
}): Promise<{ title: string; bodyMd: string; summary: string } | null> {
  const openai = getOpenAIClient();
  const suggestedMod = cluster.suggestedModule || 'global';
  const samples = cluster.sampleQuestions.slice(0, 5).join('\n- ');

  const prompt = `Kamu adalah technical writer Polyflow ERP (pabrik plastik). Tugas: buat DRAFT artikel panduan dari cluster pertanyaan user berikut. Output HANYA JSON dengan keys: title, summary, bodyMd (markdown langkah-langkah).

Cluster:
- Canonical: ${cluster.canonicalQuestion}
- Hit count: ${cluster.hitCount}
- Module: ${suggestedMod}
- Sample Q:
- ${samples}

Aturan:
- title: singkat, jelas, bahasa Indonesia, tanpa tanda kutip.
- summary: 1 kalimat manfaat artikel.
- bodyMd: markdown, struktur: ## Penyebab / Langkah-langkah / Tips / Troubleshooting. Langkah UI nyata menu Polyflow bila bisa ditebak (mis. Sales → Sales Order). Jangan hallucinate nomor dokumen / nama customer / saldo. Jangan minta password. Gunakan placeholder [CONTOH].
- Bahasa: Indonesia santai-profesional.
- Jawab JSON saja, no prose lain.`;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.LLM_MODEL || 'deepseek-r1:7b',
      messages: [
        { role: 'system', content: 'Kamu adalah technical writer ERP. Output JSON saja, no extra prose.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    });

    const content = completion.choices[0]?.message?.content?.trim() || '';
    const jsonStr = content.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(jsonStr) as { title?: string; summary?: string; bodyMd?: string };
    if (!parsed.title || !parsed.bodyMd) return null;
    return {
      title: parsed.title.slice(0, 200),
      summary: (parsed.summary || '').slice(0, 500),
      bodyMd: parsed.bodyMd.slice(0, 8000),
    };
  } catch {
    return null;
  }
}

export async function runLearningDraftJob(minClusterSize = DEFAULT_MIN_CLUSTER, maxDrafts = 10): Promise<DraftGenerationResult> {
  const mainDb = getMainPrisma();
  const result: DraftGenerationResult = { created: 0, skipped: 0, errors: [] };

  // Check if auto-learn enabled via HelpSettings (default off unless set)
  try {
    const row = await mainDb.helpSettings.findUnique({ where: { key: 'autoLearnDraftEnabled' } });
    if (row) {
      const enabled = JSON.parse(row.valueJson);
      if (enabled === false) {
        result.errors.push('autoLearnDraftEnabled is OFF — job skipped');
        return result;
      }
    }
  } catch { /* ignore — run anyway if no setting */ }

  // Find minClusterSize from settings if exists
  try {
    const row = await mainDb.helpSettings.findUnique({ where: { key: 'minClusterSizeForDraft' } });
    if (row) {
      const n = JSON.parse(row.valueJson);
      if (typeof n === 'number' && n > 0) minClusterSize = n;
    }
  } catch { /* keep default */ }

  const clusters = await mainDb.helpQuestionCluster.findMany({
    where: {
      status: 'OPEN',
      hitCount: { gte: minClusterSize },
    },
    orderBy: [{ hitCount: 'desc' }],
    take: maxDrafts * 2, // over-fetch to filter already-drafted
  });

  // Only pick clusters without existing PENDING/APPROVED draft
  const draftClusterIds = new Set(
    (
      await mainDb.helpLearningDraft.findMany({
        where: { status: { in: ['PENDING_REVIEW', 'APPROVED'] } },
        select: { clusterId: true },
      })
    )
      .map((d) => d.clusterId)
      .filter(Boolean) as string[]
  );

  const candidates = clusters.filter((c) => !draftClusterIds.has(c.id)).slice(0, maxDrafts);

  for (const cluster of candidates) {
    try {
      const draft = await generateDraftFromCluster(cluster);
      if (!draft) {
        result.skipped++;
        continue;
      }

      await mainDb.helpLearningDraft.create({
        data: {
          clusterId: cluster.id,
          draftTitle: draft.title,
          draftBodyMd: draft.bodyMd,
          summary: draft.summary,
          modules: cluster.suggestedModule ? [cluster.suggestedModule] : ['global'],
          tags: ['auto-learn'],
          status: 'PENDING_REVIEW',
          sourceSampleCount: cluster.hitCount,
          modelMeta: JSON.stringify({
            model: process.env.LLM_MODEL || 'unknown',
            clusterId: cluster.id,
            generatedAt: new Date().toISOString(),
          }),
        },
      });

      await mainDb.helpQuestionCluster.update({
        where: { id: cluster.id },
        data: { status: 'DRAFTED' },
      });

      result.created++;
    } catch (e) {
      result.errors.push(`${cluster.id}: ${e instanceof Error ? e.message : String(e)}`);
      result.skipped++;
    }
  }

  return result;
}
