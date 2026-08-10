// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBomMaterialPreview } from '../use-bom-material-preview';
import { getBomWithInventory } from '@/actions/production/production';

vi.mock('@/actions/production/production', () => ({
    getBomWithInventory: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: { error: vi.fn() },
}));

const mockedGetBomWithInventory = vi.mocked(getBomWithInventory);

beforeEach(() => {
    vi.useFakeTimers();
    mockedGetBomWithInventory.mockReset();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('useBomMaterialPreview', () => {
    it('populates items from the nested safeAction data.data shape (regression: was reading flat result.data)', async () => {
        mockedGetBomWithInventory.mockResolvedValue({
            success: true,
            data: {
                data: [
                    {
                        productVariantId: 'pv-1',
                        name: 'PP Hijau D',
                        unit: 'KG',
                        stdQty: 10,
                        bomOutput: 1000,
                        requiredQty: 3,
                        currentStock: 100,
                        totalStock: 100,
                        sourceLocationId: 'loc-1',
                        sourceLocationName: 'Gudang Bahan Baku',
                    },
                ],
                meta: {
                    suggestedSourceLocationId: null,
                    suggestedSourceLocationName: null,
                },
            },
        } as never);

        const { result } = renderHook(() =>
            useBomMaterialPreview({
                bomId: 'bom-1',
                sourceLocationId: 'loc-1',
                plannedQty: 300,
                debounceMs: 500,
            }),
        );

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(result.current.items).toEqual([
            { productVariantId: 'pv-1', quantity: 3 },
        ]);
        expect(result.current.error).toBeNull();
        expect(result.current.materialInfo['pv-1']).toMatchObject({
            name: 'PP Hijau D',
            sourceLocationName: 'Gudang Bahan Baku',
        });
    });

    it('sets a suggested source when every material resolved to a different warehouse', async () => {
        mockedGetBomWithInventory.mockResolvedValue({
            success: true,
            data: {
                data: [
                    {
                        productVariantId: 'pv-1',
                        name: 'PP Hijau D',
                        unit: 'KG',
                        stdQty: 10,
                        bomOutput: 1000,
                        requiredQty: 3,
                        currentStock: 100,
                        totalStock: 100,
                        sourceLocationId: 'loc-2',
                        sourceLocationName: 'Gudang WIP',
                    },
                ],
                meta: {
                    suggestedSourceLocationId: 'loc-2',
                    suggestedSourceLocationName: 'Gudang WIP',
                },
            },
        } as never);

        const { result } = renderHook(() =>
            useBomMaterialPreview({
                bomId: 'bom-1',
                sourceLocationId: 'loc-1',
                plannedQty: 300,
                debounceMs: 500,
            }),
        );

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(result.current.suggestedSource).toEqual({
            id: 'loc-2',
            name: 'Gudang WIP',
        });
    });

    it('sets error state when the action reports failure', async () => {
        mockedGetBomWithInventory.mockResolvedValue({
            success: false,
            error: 'Recipe not found',
        } as never);

        const { result } = renderHook(() =>
            useBomMaterialPreview({
                bomId: 'bom-1',
                sourceLocationId: 'loc-1',
                plannedQty: 300,
                debounceMs: 500,
            }),
        );

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(result.current.error).toBe('Recipe not found');
        expect(result.current.items).toEqual([]);
    });

    it('sets a generic error when the action call rejects', async () => {
        mockedGetBomWithInventory.mockRejectedValue(new Error('network down'));

        const { result } = renderHook(() =>
            useBomMaterialPreview({
                bomId: 'bom-1',
                sourceLocationId: 'loc-1',
                plannedQty: 300,
                debounceMs: 500,
            }),
        );

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(result.current.error).toBe(
            'Terjadi kesalahan saat menghitung bahan',
        );
    });

    it('does not call the action when inputs are incomplete', async () => {
        renderHook(() =>
            useBomMaterialPreview({
                bomId: '',
                sourceLocationId: 'loc-1',
                plannedQty: 300,
                debounceMs: 500,
            }),
        );

        await act(async () => {
            vi.advanceTimersByTime(500);
        });

        expect(mockedGetBomWithInventory).not.toHaveBeenCalled();
    });
});
