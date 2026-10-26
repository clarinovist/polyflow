// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sessionInfo: vi.fn(), endSession: vi.fn() }));
vi.mock('@/actions/production/kiosk-operator-session', () => ({
    getKioskOperatorSessionInfo: () => mocks.sessionInfo(),
    endKioskOperatorSession: () => mocks.endSession(),
}));

import {
    KIOSK_OPERATOR_STORAGE_KEY,
    useVerifiedKioskOperator,
} from '../useVerifiedKioskOperator';

beforeEach(() => {
    sessionStorage.clear();
    mocks.sessionInfo.mockReset();
    mocks.endSession.mockReset();
    mocks.endSession.mockResolvedValue({ success: true, data: null });
});

describe('useVerifiedKioskOperator', () => {
    it('is ready with no operator when nothing is stored', async () => {
        const { result } = renderHook(() => useVerifiedKioskOperator());

        await waitFor(() => expect(result.current.isReady).toBe(true));
        expect(result.current.operatorId).toBeNull();
        expect(mocks.sessionInfo).not.toHaveBeenCalled();
    });

    it('keeps a stored operator whose PIN session matches', async () => {
        sessionStorage.setItem(KIOSK_OPERATOR_STORAGE_KEY, 'emp-1');
        mocks.sessionInfo.mockResolvedValue({ success: true, data: { id: 'emp-1', name: 'Operator 1', code: 'OP-01' } });

        const { result } = renderHook(() => useVerifiedKioskOperator());

        await waitFor(() => expect(result.current.isReady).toBe(true));
        expect(result.current).toMatchObject({ operatorId: 'emp-1', operatorName: 'Operator 1', expired: false });
    });

    it('drops a stored operator without a matching server session', async () => {
        sessionStorage.setItem(KIOSK_OPERATOR_STORAGE_KEY, 'emp-1');
        mocks.sessionInfo.mockResolvedValue({ success: true, data: null });

        const { result } = renderHook(() => useVerifiedKioskOperator());

        await waitFor(() => expect(result.current.isReady).toBe(true));
        expect(result.current).toMatchObject({ operatorId: null, expired: true });
        expect(sessionStorage.getItem(KIOSK_OPERATOR_STORAGE_KEY)).toBeNull();
    });

    it('keeps the operator when the check itself fails; the server still guards every mutation', async () => {
        sessionStorage.setItem(KIOSK_OPERATOR_STORAGE_KEY, 'emp-1');
        mocks.sessionInfo.mockRejectedValue(new Error('offline'));

        const { result } = renderHook(() => useVerifiedKioskOperator());

        await waitFor(() => expect(result.current.isReady).toBe(true));
        expect(result.current.operatorId).toBe('emp-1');
    });

    it('stores a newly verified operator and ends the server session on forget', async () => {
        const { result } = renderHook(() => useVerifiedKioskOperator());
        await waitFor(() => expect(result.current.isReady).toBe(true));

        act(() => result.current.select('emp-2', 'Operator 2'));
        expect(result.current).toMatchObject({ operatorId: 'emp-2', operatorName: 'Operator 2' });
        expect(sessionStorage.getItem(KIOSK_OPERATOR_STORAGE_KEY)).toBe('emp-2');

        act(() => result.current.forget());
        expect(result.current.operatorId).toBeNull();
        expect(sessionStorage.getItem(KIOSK_OPERATOR_STORAGE_KEY)).toBeNull();
        expect(mocks.endSession).toHaveBeenCalled();
    });
});
