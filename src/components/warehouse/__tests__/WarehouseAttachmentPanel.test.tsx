// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn(), remove: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock('@/actions/warehouse/operational-attachments', () => ({
    createWarehouseAttachment: mocks.create,
    deleteWarehouseAttachment: mocks.remove,
}));
vi.mock('sonner', () => ({ toast: { error: mocks.error, success: mocks.success } }));
vi.mock('@/lib/media/compress-image', () => ({ compressImageForUpload: async (file: File) => file }));

import { WarehouseAttachmentPanel } from '../WarehouseAttachmentPanel';

function selectFile(onAttachmentChange = vi.fn()) {
    render(<WarehouseAttachmentPanel entityId="do-1" entityLabel="Delivery" entityType="deliveryOrderId" checkpoint="LOAD" attachments={[]} onAttachmentChange={onAttachmentChange} />);
    fireEvent.click(screen.getByRole('button'));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'proof.jpg', { type: 'image/jpeg' })] } });
    return onAttachmentChange;
}

function response(status: number, body: unknown, contentType = 'application/json') {
    return {
        ok: status === 200, status, redirected: false,
        headers: new Headers({ 'content-type': contentType }),
        json: vi.fn(async () => body),
    };
}

describe('WarehouseAttachmentPanel upload contract', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.fetch = vi.fn();
        mocks.create.mockResolvedValue({ success: true });
    });

    it.each(['application/json', 'text/html'])('shows session expiry for 401 %s before parsing body or creating attachment', async (contentType) => {
        const denied = response(401, { error: 'Unauthorized' }, contentType);
        vi.mocked(global.fetch).mockResolvedValue(denied as unknown as Response);
        const changed = selectFile();
        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Sesi berakhir, silakan login kembali.'));
        expect(denied.json).not.toHaveBeenCalled();
        expect(mocks.create).not.toHaveBeenCalled();
        expect(changed).not.toHaveBeenCalled();
        expect(mocks.success).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Foto' }).hasAttribute('disabled')).toBe(false);
    });

    it.each([403, 500])('preserves server error for HTTP %s without create action', async (status) => {
        vi.mocked(global.fetch).mockResolvedValue(response(status, { error: 'Existing upload error' }) as unknown as Response);
        const changed = selectFile();
        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Existing upload error'));
        expect(mocks.create).not.toHaveBeenCalled();
        expect(changed).not.toHaveBeenCalled();
    });

    it('preserves redirected/non-JSON mobile denial behavior', async () => {
        vi.mocked(global.fetch).mockResolvedValue(response(200, '', 'text/html') as unknown as Response);
        selectFile();
        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining('Upload ditolak (akses mobile)')));
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it('creates attachment only after a successful upload and refreshes', async () => {
        vi.mocked(global.fetch).mockResolvedValue(response(200, { key: 'fixture/proof.jpg', url: '/api/images/fixture/proof.jpg' }) as unknown as Response);
        const changed = selectFile();
        await waitFor(() => expect(changed).toHaveBeenCalledOnce());
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
            deliveryOrderId: 'do-1', checkpoint: 'LOAD', documentType: 'PHOTO',
            storageKey: 'fixture/proof.jpg', url: '/api/images/fixture/proof.jpg',
        }));
        expect(mocks.error).not.toHaveBeenCalled();
        expect(mocks.success).toHaveBeenCalledWith('Foto berhasil diupload');
    });
});
