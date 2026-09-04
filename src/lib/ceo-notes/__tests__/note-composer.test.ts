import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('openai', () => {
  const create = vi.fn();
  class FakeOpenAI {
    chat = { completions: { create } };
  }
  (globalThis as Record<string, unknown>).__ceoNotesCreateMock = create;
  return { default: FakeOpenAI };
});

import {
  composeNotes,
  defaultPriorityForDetector,
  type ComposerInput,
} from '../note-composer';

function createMock() {
  return vi.mocked(
    (globalThis as Record<string, unknown>)
      .__ceoNotesCreateMock as ReturnType<typeof vi.fn>,
  );
}

function makeInput(): ComposerInput {
  return {
    results: [
      {
        detector: 'critical_stock',
        status: 'ok',
        requiredResources: ['/warehouse/inventory'],
        items: [
          {
            entityKey: 'critical_stock:p-1',
            entityType: 'Product',
            entityId: 'p-1',
            severity: 'critical',
            headline: 'Karung: 5 < 20',
          },
        ],
      },
      {
        detector: 'stuck_so',
        status: 'failed',
        error: 'boom',
        requiredResources: ['/sales/orders'],
        items: [],
      },
    ],
    memory: { openRecurrences: [], patternLines: [] },
    statsSummary: 'Ringkasan.',
  };
}

describe('composeNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses AI JSON and keeps only fingerprints present in input', async () => {
    createMock().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              notes: [
                {
                  title: 'Stok karung kritis',
                  body: 'Karung tinggal 5.',
                  suggestedSteps: ['Order bahan'],
                  priority: 'CRITICAL',
                  requiredResources: ['/warehouse/inventory'],
                  sourceDetectors: ['critical_stock'],
                  sourceFingerprints: [
                    'critical_stock:p-1',
                    'critical_stock:NGARANG',
                  ],
                },
              ],
            }),
          },
        },
      ],
    });

    const outcome = await composeNotes(makeInput());
    expect(outcome.usedFallback).toBe(false);
    expect(outcome.aiModel).toBeTruthy();
    expect(outcome.notes).toHaveLength(1);
    expect(outcome.notes[0]?.sourceFingerprints).toEqual([
      'critical_stock:p-1',
    ]);
  });

  it('drops notes whose fingerprints are all hallucinated', async () => {
    createMock().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              notes: [
                {
                  title: 'Ngaco',
                  body: 'Data ngarang.',
                  suggestedSteps: [],
                  priority: 'NORMAL',
                  requiredResources: [],
                  sourceDetectors: ['x'],
                  sourceFingerprints: ['halu:1'],
                },
              ],
            }),
          },
        },
      ],
    });

    const outcome = await composeNotes(makeInput());
    expect(outcome.notes).toEqual([]);
  });

  it('falls back to template notes when the LLM fails', async () => {
    createMock().mockRejectedValue(new Error('LLM down'));

    const outcome = await composeNotes(makeInput());
    expect(outcome.usedFallback).toBe(true);
    expect(outcome.aiModel).toBeNull();
    expect(outcome.notes).toHaveLength(1);
    expect(outcome.notes[0]).toMatchObject({
      priority: 'CRITICAL',
      sourceFingerprints: ['critical_stock:p-1'],
    });
  });

  it('returns empty notes when only failed detectors have items', async () => {
    createMock().mockRejectedValue(new Error('LLM down'));
    const outcome = await composeNotes({
      ...makeInput(),
      results: [
        {
          detector: 'stuck_so',
          status: 'failed',
          error: 'boom',
          requiredResources: ['/sales/orders'],
          items: [],
        },
      ],
    });
    expect(outcome.notes).toEqual([]);
  });

  it('maps critical detectors deterministically', () => {
    expect(defaultPriorityForDetector('missing_finance_journal')).toBe(
      'CRITICAL',
    );
    expect(defaultPriorityForDetector('stuck_so')).toBe('NORMAL');
  });
});
