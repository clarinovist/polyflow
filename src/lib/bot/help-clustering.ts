/**
 * Help question clustering — simple, no vector dep yet.
 * Groups similar questions by normalized key, updates hitCount.
 * YAGNI: embedding later; keyword normalize is enough for Phase 3 thin.
 */

function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\b(cara|gimana|bagaimana|kenapa|apa|tolong|minta|bisa|tidak|nggak|gak)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .sort()
    .join('_')
    .slice(0, 120);
}

function canonicalizeQuestion(q: string): string {
  return q.trim().slice(0, 200);
}

function suggestModule(question: string): string | null {
  const lower = question.toLowerCase();
  if (/(sales|so\b|order|invoice|faktur|customer|pelanggan|pengiriman|surat jalan|sj\b)/.test(lower)) return 'sales';
  if (/(stok|stock|gudang|warehouse|inventory|lokasi|rak|opname|incoming|outgoing|terima barang)/.test(lower)) return 'warehouse';
  if (/(spk|produksi|production|bom\b|kiosk|mesin|batch|backflush|bahan baku)/.test(lower)) return 'production';
  if (/(finance|keuangan|jurnal|journal|period|tutup buku|hutang|piutang|petty cash)/.test(lower)) return 'finance';
  if (/(role|permission|akses|access|user|menu tidak muncul)/.test(lower)) return 'access';
  if (/(hrd|karyawan|employee|cuti|gaji|sanksi)/.test(lower)) return 'hrd';
  if (/(purchasing|po\b|supplier|pembelian|walk-in)/.test(lower)) return 'purchasing';
  return 'global';
}

export type ClusterInput = {
  question: string;
  redactedSample: string; // already sanitized
};

export async function upsertCluster(input: ClusterInput) {
  // Lazy import to avoid circular
  const { getMainPrisma } = await import('@/lib/core/prisma');
  const mainDb = getMainPrisma();

  const normalizedKey = normalizeQuestion(input.question);
  if (!normalizedKey) return null;

  const canonical = canonicalizeQuestion(input.question);
  const suggestedMod = suggestModule(input.question);

  try {
    const existing = await mainDb.helpQuestionCluster.findUnique({
      where: { normalizedKey },
    });

    if (existing) {
      const samples = existing.sampleQuestions || [];
      const newSamples = samples.includes(input.redactedSample)
        ? samples
        : [input.redactedSample, ...samples].slice(0, 5);

      const updated = await mainDb.helpQuestionCluster.update({
        where: { id: existing.id },
        data: {
          hitCount: { increment: 1 },
          sampleQuestions: newSamples,
          lastSeenAt: new Date(),
          // Keep canonical as most recent representative
          canonicalQuestion: canonical,
        },
      });
      return updated;
    }

    const created = await mainDb.helpQuestionCluster.create({
      data: {
        canonicalQuestion: canonical,
        normalizedKey,
        hitCount: 1,
        suggestedModule: suggestedMod,
        sampleQuestions: [input.redactedSample],
        status: 'OPEN',
      },
    });
    return created;
  } catch {
    return null;
  }
}

export async function listClustersForDrafting(minHitCount = 3, limit = 20) {
  const { getMainPrisma } = await import('@/lib/core/prisma');
  const mainDb = getMainPrisma();

  const clusters = await mainDb.helpQuestionCluster.findMany({
    where: {
      status: 'OPEN',
      hitCount: { gte: minHitCount },
    },
    orderBy: [{ hitCount: 'desc' }, { lastSeenAt: 'desc' }],
    take: limit,
  });

  return clusters;
}
