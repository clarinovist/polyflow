const MUTATION_PATTERNS = [
  /\b(update|ubah|edit|revisi|delete|hapus|remove|insert|tambah|create|buatkan|drop|truncate|alter)\b/i,
  /\b(jalankan|run|eksekusi|execute)\b.*\b(script|bash|terminal|ssh|command|cmd)\b/i,
];

const POLYFLOW_TOPICS = [
  'stok',
  'gudang',
  'inventory',
  'persediaan',
  'produksi',
  'spk',
  'sales',
  'penjualan',
  'invoice',
  'piutang',
  'hutang',
  'finance',
  'mutasi',
  'opname',
  'polyflow',
  'sop',
  'cara',
  'bagaimana',
  'modul',
  'menu',
  'dashboard',
];

export type GuardrailDecision = {
  allowed: boolean;
  reason?: string;
};

export function enforceGuardrails(question: string): GuardrailDecision {
  const trimmed = question.trim();

  if (!trimmed) {
    return { allowed: false, reason: 'Pertanyaan kosong.' };
  }

  for (const pattern of MUTATION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        allowed: false,
        reason: 'Saya hanya bisa bantu baca data dan panduan penggunaan. Perubahan data tetap dilakukan manual di UI Polyflow.',
      };
    }
  }

  const isPolyflowTopic = POLYFLOW_TOPICS.some((topic) =>
    trimmed.toLowerCase().includes(topic)
  );

  if (!isPolyflowTopic) {
    return {
      allowed: false,
      reason: 'Topik di luar layanan saya. Saya hanya melayani pertanyaan operasional Polyflow dan SOP penggunaan.',
    };
  }

  return { allowed: true };
}
