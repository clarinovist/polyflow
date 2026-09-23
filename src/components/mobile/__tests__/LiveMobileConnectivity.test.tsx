// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, act } from '@testing-library/react';
import { LiveMobileConnectivity } from '../LiveMobileConnectivity';
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe('live mobile connectivity', () => {
    it('tracks browser offline/online events without claiming data freshness', () => {
        vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
        render(<LiveMobileConnectivity />);
        expect(screen.queryByText('Tidak ada koneksi internet')).toBeNull();
        act(() => window.dispatchEvent(new Event('offline')));
        expect(screen.getByText('Tidak ada koneksi internet')).toBeTruthy();
        expect(screen.queryByText(/Terakhir diperbarui/)).toBeNull();
        act(() => window.dispatchEvent(new Event('online')));
        expect(screen.queryByText('Tidak ada koneksi internet')).toBeNull();
    });
});
