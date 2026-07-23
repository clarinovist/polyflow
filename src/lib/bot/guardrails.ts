export type GuardrailDecision = {
  allowed: boolean;
  reason?: string;
};

/**
 * intent_v2 guardrail: distinguishes how-to/panduan from mutation commands.
 *
 * How-to (ALLOW): "cara buat SO", "bagaimana cara update stok", "gimana input PO"
 * Mutation (BLOCK): "buatkan SO untuk Budi", "hapus invoice X", "update stok MP15 jadi 100"
 * Data query (ALLOW): "cek stok MP15", "kenapa SO Budi gagal"
 * Out of scope (SOFT REFUSE): "resep masakan", "siapa presiden"
 */

// Strong mutation verbs that indicate the user wants the system to DO something
const MUTATION_COMMAND_PATTERNS = [
  // Imperative "buatkan X untuk Y" (create FOR someone — not "cara buat")
  /\b(buatkan|buatin|tolong buat|tolong bikin)\b.+\b(untuk|ke|di)\b/i,
  // Direct delete/remove commands on specific entities
  /\b(hapus|delete|remove|hilangkan)\b.+\b(SO|PO|SPK|SJ|invoice|faktur|order|pesanan)\b\s*[-:#]?\s*\w+/i,
  // Direct update/edit on specific data
  /\b(update|ubah|edit|revisi|ganti|set)\b.+\b(jadi|menjadi|ke|=|:)\s*\d+/i,
  // Execute/run commands
  /\b(jalankan|run|eksekusi|execute)\b.*\b(script|bash|terminal|ssh|command|cmd)/i,
  // Direct create with specific data identifiers
  /\b(buat|create|tambah|insert)\b.+\b(SO|PO|SPK|SJ|invoice|faktur)\b\s*[-:#]?\s*\w+/i,
];

// Patterns that indicate how-to/guidance intent (should ALLOW)
const HOWTO_INDICATORS = [
  /\b(cara|bagaimana|gimana|tutorial|panduan|langkah|step|steps)\b/i,
  /\b(gimana sih|bagaimana ya|caranya|caranya gimana)\b/i,
  /\b(apa itu|apa sih|penjelasan|jelaskan|artinya)\b/i,
  /\b(bisa|bisa gak|bisa nggak|bisa tidak)\b.+\b(cara|pakai|gunakan|input|proses)\b/i,
];

// Out-of-scope topics
const OUT_OF_SCOPE_PATTERNS = [
  /\b(resep|makanan|masak|masakan|kuliner|restoran)\b/i,
  /\b(politik|pemilu|presiden|gubernur|partai)\b/i,
  /\b(jodoh|pacar|cinta|horoskop|ramalan|zodiak)\b/i,
  /\b(bola|sepakbola|liga|prediksi|skor|pertandingan)\b/i,
  /\b(crypto|bitcoin|trading|saham|investasi)\b/i,
  /\b(ikan|kucing|anjing|hewan peliharaan)\b/i,
];

export function enforceGuardrails(question: string): GuardrailDecision {
  const trimmed = question.trim();

  if (!trimmed) {
    return { allowed: false, reason: 'Pertanyaan kosong.' };
  }

  // Check if it's a how-to question first — these are always allowed
  const isHowTo = HOWTO_INDICATORS.some((pattern) => pattern.test(trimmed));
  if (isHowTo) {
    return { allowed: true };
  }

  // Check for direct mutation commands
  for (const pattern of MUTATION_COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        allowed: false,
        reason: 'Saya hanya bisa bantu baca data dan panduan penggunaan. Untuk melakukan perubahan data, silakan langsung melalui menu Polyflow.',
      };
    }
  }

  // Check for out-of-scope topics
  for (const pattern of OUT_OF_SCOPE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        allowed: false,
        reason: 'Maaf, pertanyaan tersebut di luar cakupan bantuan Polyflow. Saya bisa bantu seputar penggunaan sistem ERP pabrik ini.',
      };
    }
  }

  return { allowed: true };
}
