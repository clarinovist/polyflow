import type {
    ToolEvidence,
    ToolEvidenceFact,
    ToolEvidenceEntity,
    } from './assistant-types';

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
            lines.push(
                `- ${entity.type} ${entity.id} (${entity.label})${href}`,
            );
        }
    }

    const sourceLabel =
        evidence.source === 'tenant-data'
            ? 'Data tenant'
            : evidence.source === 'global-kb'
              ? 'Panduan resmi Polyflow'
              : evidence.source === 'tenant-kb'
                ? 'SOP internal perusahaan'
                : 'Audit log';

    lines.push(
        `\n[Sumber: ${sourceLabel} — dicek ${new Date(evidence.checkedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}]`,
    );

    return lines.join('\n');
}