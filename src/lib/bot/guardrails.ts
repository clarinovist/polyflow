const MUTATION_PATTERNS = [
  /\b(update|ubah|edit|revisi|delete|hapus|remove|insert|tambah|create|buatkan|drop|truncate|alter)\b/i,
  /\b(jalankan|run|eksekusi|execute)\b.*\b(script|bash|terminal|ssh|command|cmd)\b/i,
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

  // Topic validation is now entirely handled by the LLM system prompt
  // which will politely reject non-operational queries based on the provided data context.

  return { allowed: true };
}
