// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    addRouteStep,
    archiveRoute,
    deleteRouteStep,
    publishRoute,
    reorderRouteSteps,
    updateRouteStep,
    validateRouteAction,
} from '@/actions/production/production-routings';
import { toast } from 'sonner';
import { RouteBuilderClient } from '../RouteBuilderClient';

// Only network, server actions and notifications are mocked. The subject,
// pickers, inputs, buttons and RouteFlowChain are the actual components.
vi.mock('@/actions/production/production-routings', () => ({
    addRouteStep: vi.fn(),
    updateRouteStep: vi.fn(),
    deleteRouteStep: vi.fn(),
    reorderRouteSteps: vi.fn(),
    validateRouteAction: vi.fn(),
    publishRoute: vi.fn(),
    archiveRoute: vi.fn(),
}));
vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

type Route = ComponentProps<typeof RouteBuilderClient>['initialRoute'];
const process = { id: 'process-1', code: 'MIX', name: 'Synthetic mixing', requiresMachine: true };
const source = { id: 'source-1', name: 'Synthetic source', slug: 'source' };
const output = { id: 'output-1', name: 'Synthetic output', slug: 'output' };
const bom = {
    id: 'bom-1', name: 'Synthetic BOM', productVariantId: 'variant-wip',
    productVariant: { skuCode: 'WIP-TEST', name: 'Intermediate', product: { name: 'Synthetic' } },
    isDefault: true, chainMatch: true,
};
const step = (sequence: number): Route['steps'][number] => ({
    id: `step-${sequence}`, sequence, stepCode: `STEP_${sequence}`, label: `Synthetic stage ${sequence}`,
    processId: process.id, process, bomId: bom.id,
    bom: { ...bom, productVariantId: `variant-${sequence}` },
    materialSourceLocationId: source.id, materialSourceLocation: source,
    outputLocationId: output.id, outputLocation: output,
    allowsPartialHandoff: true, requiresQualityGate: true,
});
const route = (steps: Route['steps'] = [], status = 'DRAFT'): Route => ({
    id: 'route-1', code: 'ROUTE_TEST', name: 'Synthetic routing', version: 2,
    status, isDefault: true, productVariantId: 'variant-final',
    productVariant: { skuCode: 'FG-TEST', name: 'Final', product: { name: 'Synthetic' } },
    steps,
});
const fetchMock = vi.fn<typeof fetch>();
let wrapped = false;
let wrapProcesses = false;

function input(placeholder: string) {
    return screen.getByPlaceholderText<HTMLInputElement>(placeholder);
}
function change(placeholder: string, value: string) {
    fireEvent.change(input(placeholder), { target: { value } });
}
function picker(placeholder: string) {
    const parent = input(placeholder).parentElement;
    if (!parent) throw new Error(`Missing picker: ${placeholder}`);
    return within(parent);
}
function button(name: string) {
    return screen.getByRole<HTMLButtonElement>('button', { name });
}
async function ready(initialRoute = route()) {
    const result = render(<RouteBuilderClient initialRoute={initialRoute} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    if (initialRoute.status === 'DRAFT') {
        await screen.findByRole('button', { name: /Synthetic BOM/ });
    }
    return result;
}
async function fillBasics() {
    change('MIX, EXTRUDE, REWIND, BALING', 'mix_test');
    change('Mix Bahan / Extrusi Sedotan', 'Synthetic new stage');
    fireEvent.click(await screen.findByRole('button', { name: /MIX — Synthetic mixing/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Synthetic BOM/ }));
}
function chooseOutput() {
    fireEvent.click(picker('Cari lokasi output...').getByRole('button', { name: 'Synthetic output (output)' }));
}

beforeEach(() => {
    vi.clearAllMocks();
    wrapped = false;
    wrapProcesses = false;
    fetchMock.mockImplementation(async (request) => {
        const url = String(request);
        const data = url.startsWith('/api/production/processes')
            ? (wrapProcesses ? { data: [process] } : [process])
            : url.startsWith('/api/boms')
              ? (wrapped ? { data: [bom] } : [bom])
              : (wrapped ? { data: [source, output] } : [source, output]);
        return new Response(JSON.stringify(data), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('confirm', vi.fn(() => false));
    for (const action of [addRouteStep, updateRouteStep, deleteRouteStep, reorderRouteSteps, publishRoute, archiveRoute]) {
        vi.mocked(action).mockResolvedValue({ success: false, error: 'Synthetic action failure', code: 'TEST_FAILURE' });
    }
    vi.mocked(validateRouteAction).mockResolvedValue({ success: false, error: 'Synthetic validation failure', code: 'TEST_FAILURE' });
});
afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('RouteBuilderClient characterization', () => {
    it('maps array lookup responses, machine/default/chain labels, and separate source/output selection', async () => {
        await ready();
        expect(screen.getByRole('button', { name: 'MIX — Synthetic mixingbutuh mesin' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Synthetic BOM ✓ Nyambung WIP-TEST — Synthetic Intermediate • default' })).toBeTruthy();
        expect(screen.getByText('Stok umum (tidak spesifik lokasi)')).toBeTruthy();
        fireEvent.click(picker('Cari lokasi sumber...').getByRole('button', { name: 'Synthetic source (source)' }));
        expect(picker('Cari lokasi sumber...').getByRole('button', { name: 'Hapus' })).toBeTruthy();
        expect(picker('Cari lokasi output...').queryByRole('button', { name: 'Ganti' })).toBeNull();
        chooseOutput();
        fireEvent.click(picker('Cari lokasi sumber...').getByRole('button', { name: 'Hapus' }));
        expect(screen.getByText('Stok umum (tidak spesifik lokasi)')).toBeTruthy();
        expect(picker('Cari lokasi output...').getByRole('button', { name: 'Ganti' })).toBeTruthy();
    });

    it('accepts wrapped BOM/location responses but preserves array-only process handling', async () => {
        wrapped = true;
        wrapProcesses = true;
        await ready();
        expect(screen.queryByRole('button', { name: /MIX — Synthetic mixing/ })).toBeNull();
        expect(screen.getByText('Tidak ada proses. Tambah di Kelola Proses.')).toBeTruthy();
        expect(screen.getByRole('button', { name: /Synthetic BOM/ })).toBeTruthy();
        expect(picker('Cari lokasi sumber...').getByRole('button', { name: 'Synthetic source (source)' })).toBeTruthy();
        expect(picker('Cari lokasi output...').getByRole('button', { name: 'Synthetic output (output)' })).toBeTruthy();
    });

    it('keeps chain-aware BOM and four independent search requests tied to the initial route', async () => {
        const view = await ready(route([step(1), step(0)]));
        expect(fetchMock).toHaveBeenCalledWith('/api/boms?continuesFromVariantId=variant-1');
        expect(screen.getByText('Kosong = otomatis ikut lokasi output tahap sebelumnya')).toBeTruthy();
        change('Cari BoM...', 'a & b');
        change('Cari proses...', 'mix & cut');
        change('Cari lokasi sumber...', 'raw & source');
        change('Cari lokasi output...', 'finished & output');
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(8));
        expect(fetchMock).toHaveBeenCalledWith('/api/boms?q=a+%26+b&continuesFromVariantId=variant-1');
        expect(fetchMock).toHaveBeenCalledWith('/api/production/processes?q=mix%20%26%20cut');
        expect(fetchMock).toHaveBeenCalledWith('/api/locations?q=raw%20%26%20source');
        expect(fetchMock).toHaveBeenCalledWith('/api/locations?q=finished%20%26%20output');
        view.rerender(<RouteBuilderClient initialRoute={route([], 'ACTIVE')} />);
        expect(button('Publish')).toBeTruthy();
        expect(screen.getByText('Urutan Tahap (2)')).toBeTruthy();
        expect(fetchMock).toHaveBeenCalledTimes(8);
    });

    it('shows draft editing controls only, hides archive when archived, and retains the real flow chain', async () => {
        for (const status of ['DRAFT', 'ACTIVE', 'ARCHIVED']) {
            fetchMock.mockClear();
            const view = await ready(route([step(0)], status));
            expect(screen.getByText('Alur Tahap (1 tahap)')).toBeTruthy();
            expect(Boolean(screen.queryByRole('button', { name: 'Publish' }))).toBe(status === 'DRAFT');
            expect(Boolean(screen.queryByRole('button', { name: 'Edit' }))).toBe(status === 'DRAFT');
            expect(Boolean(screen.queryByPlaceholderText('Cari proses...'))).toBe(status === 'DRAFT');
            expect(Boolean(screen.queryByRole('button', { name: 'Arsipkan' }))).toBe(status !== 'ARCHIVED');
            expect(button('Validasi')).toBeTruthy();
            view.unmount();
        }
    });

    it('hydrates edits, preserves input identity/focus across updates, and resets selections but not searches on cancel', async () => {
        await ready(route([step(1), step(0)]));
        change('Cari proses...', 'retained search');
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
        fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
        expect(input('MIX, EXTRUDE, REWIND, BALING').value).toBe('STEP_0');
        expect(input('Mix Bahan / Extrusi Sedotan').value).toBe('Synthetic stage 0');
        expect(picker('Cari BoM...').getByRole('button', { name: 'Ganti' })).toBeTruthy();
        expect(picker('Cari lokasi sumber...').getByRole('button', { name: 'Hapus' })).toBeTruthy();
        expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Butuh QC' }).checked).toBe(true);
        const label = input('Mix Bahan / Extrusi Sedotan');
        label.focus();
        change('Mix Bahan / Extrusi Sedotan', 'Edited label');
        expect(input('Mix Bahan / Extrusi Sedotan')).toBe(label);
        expect(document.activeElement).toBe(label);
        expect(screen.getByText('Ambil bahan dari (opsional — tahap pertama, stok umum)')).toBeTruthy();
        fireEvent.click(button('Batal'));
        expect(input('Mix Bahan / Extrusi Sedotan').value).toBe('');
        expect(input('MIX, EXTRUDE, REWIND, BALING').value).toBe('');
        expect(input('Cari proses...').value).toBe('retained search');
        expect(picker('Cari BoM...').queryByRole('button', { name: 'Ganti' })).toBeNull();
        expect(picker('Cari lokasi sumber...').queryByRole('button', { name: 'Hapus' })).toBeNull();
        expect(picker('Cari lokasi output...').queryByRole('button', { name: 'Ganti' })).toBeNull();
        expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Butuh QC' }).checked).toBe(false);
        expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Boleh estafet sebagian' }).checked).toBe(false);
        expect(button('Tambah Tahap').disabled).toBe(true);
    });

    it('requires code, label, process, BOM and output while source remains optional', async () => {
        await ready();
        expect(button('Tambah Tahap').disabled).toBe(true);
        fireEvent.click(button('Tambah Tahap'));
        expect(addRouteStep).not.toHaveBeenCalled();
        await fillBasics();
        expect(button('Tambah Tahap').disabled).toBe(true);
        chooseOutput();
        expect(button('Tambah Tahap').disabled).toBe(false);
        change('Mix Bahan / Extrusi Sedotan', '');
        expect(button('Tambah Tahap').disabled).toBe(true);
        change('Mix Bahan / Extrusi Sedotan', 'Synthetic new stage');
        change('MIX, EXTRUDE, REWIND, BALING', '');
        expect(button('Tambah Tahap').disabled).toBe(true);
        change('MIX, EXTRUDE, REWIND, BALING', 'mix_test');
        fireEvent.click(picker('Cari lokasi output...').getByRole('button', { name: 'Ganti' }));
        expect(button('Tambah Tahap').disabled).toBe(true);
        expect(addRouteStep).not.toHaveBeenCalled();
    });

    it('sends the exact uppercase create payload with null source and both quality flags; failure retains the editor', async () => {
        // jsdom reload is non-configurable. Failure paths must not attempt it:
        // such an attempt would emit a jsdom navigation error captured here.
        const errors = vi.spyOn(console, 'error');
        await ready();
        await fillBasics();
        chooseOutput();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Boleh estafet sebagian' }));
        fireEvent.click(screen.getByRole('checkbox', { name: 'Butuh QC' }));
        fireEvent.click(button('Tambah Tahap'));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Synthetic action failure'));
        expect(addRouteStep).toHaveBeenCalledExactlyOnceWith({
            routeId: 'route-1', stepCode: 'MIX_TEST', label: 'Synthetic new stage',
            processId: process.id, bomId: bom.id, materialSourceLocationId: null,
            outputLocationId: output.id, allowsPartialHandoff: true, requiresQualityGate: true,
        });
        expect(updateRouteStep).not.toHaveBeenCalled();
        expect(input('MIX, EXTRUDE, REWIND, BALING').value).toBe('MIX_TEST');
        expect(toast.success).not.toHaveBeenCalled();
        expect(errors).not.toHaveBeenCalled();
    });

    it('sends the exact update payload, clears nullable source and quality flags, and preserves edit mode on failure', async () => {
        await ready(route([step(0)]));
        fireEvent.click(button('Edit'));
        change('MIX, EXTRUDE, REWIND, BALING', 'new_code');
        fireEvent.click(picker('Cari lokasi sumber...').getByRole('button', { name: 'Hapus' }));
        fireEvent.click(screen.getByRole('checkbox', { name: 'Boleh estafet sebagian' }));
        fireEvent.click(screen.getByRole('checkbox', { name: 'Butuh QC' }));
        fireEvent.click(button('Simpan Perubahan'));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Synthetic action failure'));
        expect(updateRouteStep).toHaveBeenCalledExactlyOnceWith({
            id: 'step-0', stepCode: 'NEW_CODE', label: 'Synthetic stage 0',
            processId: process.id, bomId: bom.id, materialSourceLocationId: null,
            outputLocationId: output.id, allowsPartialHandoff: false, requiresQualityGate: false,
        });
        expect(addRouteStep).not.toHaveBeenCalled();
        expect(button('Batal')).toBeTruthy();
    });

    it('keeps sorted reorder identity and disabled edge guards without reloading a failed move', async () => {
        const errors = vi.spyOn(console, 'error');
        await ready(route([step(1), step(0)]));
        const up = screen.getAllByRole<HTMLButtonElement>('button', { name: '↑' });
        const down = screen.getAllByRole<HTMLButtonElement>('button', { name: '↓' });
        expect(up[0].disabled).toBe(true);
        expect(down[1].disabled).toBe(true);
        fireEvent.click(up[0]);
        fireEvent.click(down[1]);
        expect(reorderRouteSteps).not.toHaveBeenCalled();
        fireEvent.click(down[0]);
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Synthetic action failure'));
        expect(reorderRouteSteps).toHaveBeenCalledExactlyOnceWith({ routeId: 'route-1', orderedIds: ['step-1', 'step-0'] });
        expect(up[0].disabled).toBe(true);
        expect(errors).not.toHaveBeenCalled();
    });

    it('displays blocking and warning validation issues and flags the matching step', async () => {
        vi.mocked(validateRouteAction).mockResolvedValue({
            success: true, data: { valid: false, issues: [
                { code: 'CHAIN_TEST', severity: 'BLOCKING', message: 'Synthetic chain gap', stepCode: 'STEP_0' },
                { code: 'WARN_TEST', severity: 'WARNING', message: 'Synthetic warning' },
            ] },
        });
        await ready(route([step(0)]));
        fireEvent.click(button('Validasi'));
        await screen.findByText('Synthetic chain gap');
        expect(validateRouteAction).toHaveBeenCalledExactlyOnceWith('route-1');
        expect(screen.getByText('Blocking (1) — publish dilarang:')).toBeTruthy();
        expect(screen.getByText('Peringatan (1):')).toBeTruthy();
        expect(screen.getByText('WARN_TEST: Synthetic warning')).toBeTruthy();
        expect(screen.getByText('issue')).toBeTruthy();
        expect(toast.warning).toHaveBeenCalledWith('1 blocking issue — cek di bawah');
        // Existing UI still permits the action; server validation owns publication.
        expect(button('Publish').disabled).toBe(false);
    });

    it('shows valid warning-only results and reports subsequent validation failure without clearing issues', async () => {
        vi.mocked(validateRouteAction).mockResolvedValueOnce({
            success: true, data: { valid: true, issues: [
                { code: 'WARN_TEST', severity: 'WARNING', message: 'Synthetic warning' },
            ] },
        });
        await ready();
        fireEvent.click(button('Validasi'));
        await screen.findByText('✓ Valid — siap publish');
        expect(toast.success).toHaveBeenCalledWith('Routing valid — siap publish');
        fireEvent.click(button('Validasi'));
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Synthetic validation failure'));
        expect(screen.getByText('WARN_TEST: Synthetic warning')).toBeTruthy();
    });

    it('preserves publish/archive/delete IDs, confirmation cancellation and failure behavior', async () => {
        const errors = vi.spyOn(console, 'error');
        await ready(route([step(0)]));
        fireEvent.click(button('Publish'));
        await waitFor(() => expect(publishRoute).toHaveBeenCalledExactlyOnceWith('route-1'));
        fireEvent.click(button('Arsipkan'));
        expect(confirm).toHaveBeenCalledWith('Arsipkan routing ini? Run baru tidak bisa pakai routing ini.');
        expect(archiveRoute).not.toHaveBeenCalled();
        fireEvent.click(button('Hapus'));
        expect(confirm).toHaveBeenCalledWith('Hapus tahap ini? Chain output/input bisa putus.');
        expect(deleteRouteStep).not.toHaveBeenCalled();
        vi.mocked(confirm).mockReturnValue(true);
        fireEvent.click(button('Arsipkan'));
        fireEvent.click(button('Hapus'));
        await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(3));
        expect(archiveRoute).toHaveBeenCalledExactlyOnceWith('route-1');
        expect(deleteRouteStep).toHaveBeenCalledExactlyOnceWith('step-0');
        expect(toast.success).not.toHaveBeenCalled();
        expect(errors).not.toHaveBeenCalled();
    });
});
