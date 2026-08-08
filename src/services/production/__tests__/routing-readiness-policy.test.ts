import { describe, it, expect } from 'vitest';
import {
  computeReadiness,
  canConsumeWip,
  validateRouteContinuity,
  type ValidateRouteInput,
} from '../routing-readiness-policy';

describe('routing-readiness-policy', () => {
  describe('computeReadiness', () => {
    it('first step always canStart', () => {
      const r = computeReadiness({ isFirstStep: true, predecessorOutputAvailable: 0, requiredQty: 100, allowsPartialHandoff: false, isLegacy: false });
      expect(r.canStart).toBe(true);
      expect(r.status).toBe('FIRST_STEP');
    });

    it('legacy always canStart', () => {
      const r = computeReadiness({ isFirstStep: false, predecessorOutputAvailable: 0, requiredQty: 100, allowsPartialHandoff: false, isLegacy: true });
      expect(r.canStart).toBe(true);
    });

    it('waiting when no WIP', () => {
      const r = computeReadiness({ isFirstStep: false, predecessorOutputAvailable: 0, requiredQty: 100, allowsPartialHandoff: false, isLegacy: false });
      expect(r.canStart).toBe(false);
      expect(r.status).toBe('WAITING_WIP');
    });

    it('ready when enough', () => {
      const r = computeReadiness({ isFirstStep: false, predecessorOutputAvailable: 150, requiredQty: 100, allowsPartialHandoff: false, isLegacy: false });
      expect(r.canStart).toBe(true);
      expect(r.status).toBe('READY');
    });

    it('partial allowed', () => {
      const r = computeReadiness({ isFirstStep: false, predecessorOutputAvailable: 50, requiredQty: 100, allowsPartialHandoff: true, isLegacy: false });
      expect(r.canStart).toBe(true);
      expect(r.status).toBe('PARTIAL_WIP');
    });

    it('partial not allowed => waiting', () => {
      const r = computeReadiness({ isFirstStep: false, predecessorOutputAvailable: 50, requiredQty: 100, allowsPartialHandoff: false, isLegacy: false });
      expect(r.canStart).toBe(false);
      expect(r.status).toBe('WAITING_WIP');
    });
  });

  describe('canConsumeWip', () => {
    it('reject zero', () => {
      expect(canConsumeWip(100, 0).allowed).toBe(false);
    });
    it('reject exceeds', () => {
      expect(canConsumeWip(10, 20).allowed).toBe(false);
    });
    it('allow exact', () => {
      expect(canConsumeWip(20, 20).allowed).toBe(true);
    });
    it('allow less', () => {
      expect(canConsumeWip(100, 10).allowed).toBe(true);
    });
  });

  describe('validateRouteContinuity', () => {
    const base: ValidateRouteInput = {
      finalProductVariantId: 'fg',
      steps: [
        {
          stepCode: 'MIX',
          sequence: 0,
          bomId: 'b1',
          bomOutputVariantId: 'wip1',
          bomIsActive: true,
          processCode: 'MIXING',
          processIsActive: true,
          processRequiresMachine: false,
          outputLocationId: 'loc-1',
          bomItems: [],
          hasCapableMachine: true,
        },
        {
          stepCode: 'EXT',
          sequence: 1,
          bomId: 'b2',
          bomOutputVariantId: 'fg',
          bomIsActive: true,
          processCode: 'EXTRUSION',
          processIsActive: true,
          processRequiresMachine: true,
          outputLocationId: 'loc-2',
          // Explicit source so the base fixture stays warning-free — the
          // ROUTE_MISSING_SOURCE_LOCATION case is covered separately below.
          materialSourceLocationId: 'loc-1',
          bomItems: [{ productVariantId: 'wip1' }],
          hasCapableMachine: true,
        },
      ],
    };

    it('valid case no issues', () => {
      const issues = validateRouteContinuity(base);
      expect(issues).toHaveLength(0);
    });

    it('[case 7] non-first step without materialSourceLocationId -> 1 WARNING, 0 BLOCKING, still publishable', () => {
      const missingSource: ValidateRouteInput = {
        ...base,
        steps: [base.steps[0], { ...base.steps[1], materialSourceLocationId: null }],
      };
      const issues = validateRouteContinuity(missingSource);
      const warnings = issues.filter((i) => i.severity === 'WARNING');
      const blocking = issues.filter((i) => i.severity === 'BLOCKING');
      expect(warnings.filter((i) => i.code === 'ROUTE_MISSING_SOURCE_LOCATION')).toHaveLength(1);
      expect(blocking).toHaveLength(0);
    });

    it('first step without materialSourceLocationId does NOT warn (RM intake, expected empty)', () => {
      const issues = validateRouteContinuity(base);
      expect(issues.some((i) => i.code === 'ROUTE_MISSING_SOURCE_LOCATION' && i.stepCode === 'MIX')).toBe(false);
    });

    it('no steps blocking', () => {
      const issues = validateRouteContinuity({ finalProductVariantId: 'fg', steps: [] });
      expect(issues.some((i) => i.code === 'ROUTE_NO_STEPS')).toBe(true);
    });

    it('final output mismatch', () => {
      const issues = validateRouteContinuity({ ...base, finalProductVariantId: 'other' });
      expect(issues.some((i) => i.code === 'ROUTE_FINAL_OUTPUT_MISMATCH')).toBe(true);
    });

    it('disconnected output', () => {
      const disconnected: ValidateRouteInput = {
        finalProductVariantId: 'fg',
        steps: [
          { ...base.steps[0], bomOutputVariantId: 'wip1', bomItems: [], outputLocationId: 'loc-1' },
          { ...base.steps[1], bomOutputVariantId: 'fg', bomItems: [{ productVariantId: 'other' }], outputLocationId: 'loc-2' },
        ],
      };
      const issues = validateRouteContinuity(disconnected);
      expect(issues.some((i) => i.code === 'ROUTE_STEP_OUTPUT_DISCONNECTED')).toBe(true);
    });

    it('duplicate sequence', () => {
      const dup: ValidateRouteInput = {
        finalProductVariantId: 'fg',
        steps: [
          { ...base.steps[0], sequence: 0, outputLocationId: 'loc-1' },
          { ...base.steps[1], sequence: 0, bomItems: [{ productVariantId: 'wip1' }], outputLocationId: 'loc-2' },
        ],
      };
      const issues = validateRouteContinuity(dup);
      expect(issues.some((i) => i.code === 'ROUTE_DUPLICATE_SEQUENCE')).toBe(true);
    });

    it('sequence gap', () => {
      const gap: ValidateRouteInput = {
        finalProductVariantId: 'fg',
        steps: [
          { ...base.steps[0], sequence: 0, outputLocationId: 'loc-1' },
          { ...base.steps[1], sequence: 2, bomItems: [{ productVariantId: 'wip1' }], outputLocationId: 'loc-2' },
        ],
      };
      const issues = validateRouteContinuity(gap);
      expect(issues.some((i) => i.code === 'ROUTE_SEQUENCE_GAP')).toBe(true);
    });

    it('missing output location', () => {
      const missing: ValidateRouteInput = {
        finalProductVariantId: 'fg',
        steps: [
          { ...base.steps[0], outputLocationId: null as unknown as string, bomItems: [] },
          { ...base.steps[1], outputLocationId: 'loc-2', bomItems: [{ productVariantId: 'wip1' }] },
        ],
      };
      const issues = validateRouteContinuity(missing);
      expect(issues.some((i) => i.code === 'ROUTE_MISSING_OUTPUT_LOCATION')).toBe(true);
    });

    it('inactive BOM blocking', () => {
      const inactive: ValidateRouteInput = {
        finalProductVariantId: 'fg',
        steps: [
          { ...base.steps[0], bomIsActive: false, outputLocationId: 'loc-1' },
          { ...base.steps[1], outputLocationId: 'loc-2' },
        ],
      };
      const issues = validateRouteContinuity(inactive);
      expect(issues.some((i) => i.code === 'ROUTE_INACTIVE_BOM')).toBe(true);
    });

    it('no capable machine blocking when requiresMachine', () => {
      const noCap: ValidateRouteInput = {
        finalProductVariantId: 'fg',
        steps: [
          { ...base.steps[0] },
          { ...base.steps[1], hasCapableMachine: false },
        ],
      };
      const issues = validateRouteContinuity(noCap);
      expect(issues.some((i) => i.code === 'ROUTE_NO_CAPABLE_MACHINE')).toBe(true);
    });

    it('risky output location', () => {
      const risky: ValidateRouteInput = {
        finalProductVariantId: 'fg',
        steps: [
          { ...base.steps[0], isRiskyOutput: true, outputLocationId: 'loc-1' },
          { ...base.steps[1], outputLocationId: 'loc-2' },
        ],
      };
      const issues = validateRouteContinuity(risky);
      expect(issues.some((i) => i.code === 'ROUTE_RISKY_OUTPUT_LOCATION')).toBe(true);
    });

    it('repeated process allowed (same processCode repeated not flagged as dup unless stepCode dup)', () => {
      const repeated: ValidateRouteInput = {
        finalProductVariantId: 'fg',
        steps: [
          { stepCode: 'PACK1', sequence: 0, bomId: 'b1', bomOutputVariantId: 'wip_pack1', bomIsActive: true, processCode: 'PACKING', processIsActive: true, processRequiresMachine: false, outputLocationId: 'loc-1', bomItems: [], hasCapableMachine: true },
          { stepCode: 'STER', sequence: 1, bomId: 'b2', bomOutputVariantId: 'wip_ster', bomIsActive: true, processCode: 'STERILIZATION', processIsActive: true, processRequiresMachine: false, outputLocationId: 'loc-2', materialSourceLocationId: 'loc-1', bomItems: [{ productVariantId: 'wip_pack1' }], hasCapableMachine: true },
          { stepCode: 'PACK2', sequence: 2, bomId: 'b3', bomOutputVariantId: 'fg', bomIsActive: true, processCode: 'PACKING', processIsActive: true, processRequiresMachine: false, outputLocationId: 'loc-3', materialSourceLocationId: 'loc-2', bomItems: [{ productVariantId: 'wip_ster' }], hasCapableMachine: true },
        ],
      };
      const issues = validateRouteContinuity(repeated);
      expect(issues).toHaveLength(0);
    });
  });
});
