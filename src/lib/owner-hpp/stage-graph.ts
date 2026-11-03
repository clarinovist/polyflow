import type { OwnerHppStage } from './workspace-schema';

export interface StageOrderResult {
    /** Upstream stages first; empty when the graph is invalid. */
    order: OwnerHppStage[];
    error: string | null;
}

function failure(error: string): StageOrderResult {
    return { order: [], error };
}

function upstreamIds(stage: OwnerHppStage): string[] {
    return stage.materials.flatMap((material) =>
        material.kind === 'stage' ? [material.from] : [],
    );
}

/**
 * Topological order of stages (Kahn). A stage may consume the output of
 * several stages and one output may feed several stages (a DAG).
 */
export function orderStages(
    stages: readonly OwnerHppStage[],
): StageOrderResult {
    const byId = new Map(stages.map((stage) => [stage.id, stage]));

    for (const stage of stages) {
        for (const from of upstreamIds(stage)) {
            if (from === stage.id) {
                return failure(
                    `Tahap "${stage.name}" memakai dirinya sendiri.`,
                );
            }
            if (!byId.has(from)) {
                return failure(
                    `Tahap "${stage.name}" mengacu ke tahap yang tidak ditemukan.`,
                );
            }
        }
    }

    const remaining = new Map(
        stages.map((stage) => [stage.id, new Set(upstreamIds(stage))]),
    );
    const order: OwnerHppStage[] = [];
    const placed = new Set<string>();

    while (order.length < stages.length) {
        const ready = stages.filter(
            (stage) =>
                !placed.has(stage.id) &&
                [...(remaining.get(stage.id) ?? [])].every((from) =>
                    placed.has(from),
                ),
        );
        if (ready.length === 0) {
            const stuck = stages
                .filter((stage) => !placed.has(stage.id))
                .map((stage) => stage.name)
                .join(', ');
            return failure(`Ada siklus antar tahap: ${stuck}.`);
        }
        for (const stage of ready) {
            placed.add(stage.id);
            order.push(stage);
        }
    }
    return { order, error: null };
}
