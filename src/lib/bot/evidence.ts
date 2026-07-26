import type { ToolEvidence, ToolEvidenceFact, ToolEvidenceEntity, AssistantEvidenceChip } from './assistant-types';

/**
 * Create a ToolEvidence object with current timestamp.
 */
export function createEvidence(input: {
  summary: string;
  facts: ToolEvidenceFact[];
  entities?: ToolEvidenceEntity[];
  source: ToolEvidence['source'];
  completeness?: ToolEvidence['completeness'];
}): ToolEvidence {
  return {
    summary: input.summary,
    facts: input.facts,
    entities: input.entities,
    source: input.source,
    checkedAt: new Date().toISOString(),
    completeness: input.completeness ?? 'complete',
  };
}

/**
 * Convert a ToolEvidence into a compact text summary for LLM consumption.
 */
export function evidenceToText(evidence: ToolEvidence): string {
  const lines: string[] = [];

  lines.push(evidence.summary);

  if (evidence.facts.length > 0) {
    lines.push('');
    for (const fact of evidence.facts) {
      lines.push(`- ${fact.label}: ${fact.value}`);
    }
  }

  if (evidence.entities && evidence.entities.length > 0) {
    lines.push('');
    for (const entity of evidence.entities) {
      const href = entity.href ? ` → ${entity.href}` : '';
      lines.push(`- ${entity.type} ${entity.id} (${entity.label})${href}`);
    }
  }

  const sourceLabel =
    evidence.source === 'tenant-data' ? 'Data tenant' :
    evidence.source === 'global-kb' ? 'Panduan resmi Polyflow' :
    evidence.source === 'tenant-kb' ? 'SOP internal perusahaan' :
    'Audit log';

  lines.push(`\n[Sumber: ${sourceLabel} — dicek ${new Date(evidence.checkedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}]`);

  return lines.join('\n');
}

/**
 * Convert ToolEvidence into evidence chips for UI display.
 */
export function evidenceToChips(evidence: ToolEvidence[]): AssistantEvidenceChip[] {
  return evidence.map((e) => ({
    source: e.source,
    label:
      e.source === 'tenant-data' ? `Data tenant — dicek ${formatTime(e.checkedAt)}` :
      e.source === 'global-kb' ? 'Panduan resmi Polyflow' :
      e.source === 'tenant-kb' ? 'SOP internal perusahaan' :
      'Audit log',
    checkedAt: e.checkedAt,
    href: e.entities?.[0]?.href,
  }));
}

/**
 * Format ISO timestamp to WIB time string.
 */
function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Merge multiple evidence objects into a single combined evidence.
 */
export function mergeEvidence(evidences: ToolEvidence[]): ToolEvidence {
  const allFacts: ToolEvidenceFact[] = [];
  const allEntities: ToolEvidenceEntity[] = [];
  let hasPartial = false;

  for (const e of evidences) {
    allFacts.push(...e.facts);
    if (e.entities) allEntities.push(...e.entities);
    if (e.completeness === 'partial') hasPartial = true;
  }

  return {
    summary: evidences.map((e) => e.summary).join('\n\n'),
    facts: allFacts,
    entities: allEntities.length > 0 ? allEntities : undefined,
    source: evidences[0]?.source ?? 'tenant-data',
    checkedAt: new Date().toISOString(),
    completeness: hasPartial ? 'partial' : 'complete',
  };
}
