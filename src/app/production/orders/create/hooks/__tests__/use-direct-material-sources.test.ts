// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRealtimeStock } from '@/actions/inventory/inventory';
import { useDirectMaterialSources } from '../use-direct-material-sources';
vi.mock('@/actions/inventory/inventory', () => ({ getRealtimeStock: vi.fn() }));
const args = {
    enabled: true,
    bomId: 'bom',
    items: [{ productVariantId: 'wrap', quantity: 5 }],
    materialInfo: {
        wrap: {
            productVariantId: 'wrap',
            name: 'Kemasan',
            unit: 'KG',
            stdQty: 5,
            bomOutput: 10,
            currentStock: 100,
            totalStock: 100,
            sourceLocationId: 'pack',
            sourceLocationName: 'Pengemas',
        },
    },
    locations: [
        { id: 'pack', name: 'Pengemas' },
        { id: 'fg', name: 'Hasil' },
    ],
};
beforeEach(() => {
    vi.mocked(getRealtimeStock).mockReset();
    vi.mocked(getRealtimeStock).mockResolvedValue({ success: true, data: 10 });
});
describe('direct warehouse stock selection', () => {
    it('checks chosen stock, not the cross-warehouse total', async () => {
        const { result } = renderHook(() => useDirectMaterialSources(args));
        expect(result.current.ready).toBe(false);
        await waitFor(() => expect(result.current.ready).toBe(true));
        expect(result.current.materialInfo.wrap.totalStock).toBe(10);
        act(() => result.current.setSource('wrap', 'fg'));
        await waitFor(() => expect(result.current.ready).toBe(true));
        expect(getRealtimeStock).toHaveBeenLastCalledWith('fg', 'wrap');
        expect(result.current.materialInfo.wrap.sourceLocationName).toBe(
            'Hasil',
        );
    });
    it('resets overrides for a different recipe', async () => {
        const { result, rerender } = renderHook(
            ({ bomId }) => useDirectMaterialSources({ ...args, bomId }),
            { initialProps: { bomId: 'bom' } },
        );
        act(() => result.current.setSource('wrap', 'fg'));
        await waitFor(() => expect(result.current.ready).toBe(true));
        rerender({ bomId: 'new-bom' });
        await waitFor(() => expect(result.current.ready).toBe(true));
        expect(result.current.materialInfo.wrap.sourceLocationId).toBe('pack');
    });
    it('blocks on errors and supports retry', async () => {
        vi.mocked(getRealtimeStock).mockResolvedValueOnce({
            success: false,
            error: 'Unavailable',
            code: 'UNAVAILABLE',
        });
        const { result } = renderHook(() => useDirectMaterialSources(args));
        await waitFor(() => expect(result.current.error).toMatch(/Gagal/));
        expect(result.current.ready).toBe(false);
        act(() => result.current.retry());
        await waitFor(() => expect(result.current.ready).toBe(true));
    });
    it('does not query stock in transfer mode', () => {
        const { result } = renderHook(() =>
            useDirectMaterialSources({ ...args, enabled: false }),
        );
        expect(result.current.materialInfo).toBe(args.materialInfo);
        expect(getRealtimeStock).not.toHaveBeenCalled();
    });
    it('rejects an unavailable warehouse rather than falling back silently', async () => {
        const { result } = renderHook(() =>
            useDirectMaterialSources({ ...args, locations: [] }),
        );
        await waitFor(() =>
            expect(result.current.error).toMatch(/Pilih gudang/),
        );
        expect(result.current.ready).toBe(false);
    });
});