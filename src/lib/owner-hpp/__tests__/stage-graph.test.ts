import { describe, expect, it } from 'vitest';
import { chainScenario } from './fixtures';
import { orderStages } from '../stage-graph';

describe('orderStages', () => {
    it('orders upstream stages before the stages that consume them', () => {
        const scenario = chainScenario();
        // Shuffle so the declared order is not already topological.
        const shuffled = [...scenario.stages].reverse();

        const result = orderStages(shuffled);

        expect(result.error).toBeNull();
        expect(result.order.map((stage) => stage.id)).toEqual([
            'ext',
            'cut',
            'pack',
        ]);
    });

    it('reports a cycle instead of looping', () => {
        const scenario = chainScenario();
        const cyclic = scenario.stages.map((stage) =>
            stage.id === 'ext'
                ? {
                      ...stage,
                      materials: [
                          ...stage.materials,
                          {
                              id: 'loop',
                              kind: 'stage' as const,
                              from: 'pack',
                              qty: 1,
                              scrapPercent: 0,
                          },
                      ],
                  }
                : stage,
        );

        const result = orderStages(cyclic);

        expect(result.error).toMatch(/siklus/i);
        expect(result.order).toEqual([]);
    });

    it('rejects a reference to a stage that does not exist', () => {
        const scenario = chainScenario();
        const broken = scenario.stages.map((stage) =>
            stage.id === 'cut'
                ? {
                      ...stage,
                      materials: [
                          {
                              id: 'm4',
                              kind: 'stage' as const,
                              from: 'ghost',
                              qty: 1,
                              scrapPercent: 0,
                          },
                      ],
                  }
                : stage,
        );

        expect(orderStages(broken).error).toMatch(/tidak ditemukan/i);
    });

    it('rejects a stage that consumes itself', () => {
        const scenario = chainScenario();
        const selfRef = scenario.stages.map((stage) =>
            stage.id === 'ext'
                ? {
                      ...stage,
                      materials: [
                          {
                              id: 'self',
                              kind: 'stage' as const,
                              from: 'ext',
                              qty: 1,
                              scrapPercent: 0,
                          },
                      ],
                  }
                : stage,
        );

        expect(orderStages(selfRef).error).toMatch(/dirinya sendiri/i);
    });
});
