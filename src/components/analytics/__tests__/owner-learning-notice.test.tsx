// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const session = vi.hoisted(() => vi.fn());
vi.mock('next-auth/react', () => ({ useSession: session }));
import { OwnerLearningNotice } from '../owner-learning-notice';
beforeEach(() => { sessionStorage.clear(); session.mockReturnValue({ status: 'authenticated', data: { user: { id: 'u', isSuperAdmin: false } } }); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ active: true, version: 'test-v1' }) })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('owner learning transparency', () => {
    it('shows purpose/retention and allows dismiss without treating it as consent', async () => {
        render(<OwnerLearningNotice />);
        await waitFor(() => expect(screen.getByLabelText('Informasi analisis penggunaan')).toBeTruthy());
        expect(screen.getByText(/Data turunan disimpan 90 hari/)).toBeTruthy();
        fireEvent.click(screen.getByText('Tutup informasi')); expect(screen.queryByLabelText('Informasi analisis penggunaan')).toBeNull();
    });
    it('does not fetch for unauthenticated visitors or superadmins', () => {
        session.mockReturnValue({ status: 'unauthenticated', data: null }); render(<OwnerLearningNotice />);
        expect(fetch).not.toHaveBeenCalled();
    });
});
