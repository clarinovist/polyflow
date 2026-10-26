// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KioskIdleWarning, useKioskIdleSession } from '../KioskIdleSession';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('useKioskIdleSession', () => {
    it('warns before the timeout, ends the session once, then clears the warning', () => {
        // Arrange
        const onIdle = vi.fn();
        const { result } = renderHook(() =>
            useKioskIdleSession({ timeoutMs: 5000, warningMs: 3000, onIdle }),
        );

        // Act
        act(() => vi.advanceTimersByTime(3000));

        // Assert
        expect(result.current.showWarning).toBe(true);
        expect(result.current.timeLeft).toBe(2);

        act(() => vi.advanceTimersByTime(2000));
        expect(onIdle).toHaveBeenCalledTimes(1);
        expect(result.current.showWarning).toBe(false);

        act(() => vi.advanceTimersByTime(1000));
        expect(onIdle).toHaveBeenCalledTimes(1);
    });
});

describe('KioskIdleWarning', () => {
    it('speaks of the operator session in Indonesian', () => {
        render(<KioskIdleWarning timeLeft={42} onDismiss={vi.fn()} />);

        expect(screen.getByRole('heading').textContent).toBe('Sesi hampir habis');
        expect(screen.getByText(/42 detik/)).toBeTruthy();
        expect(screen.queryByText(/Session/)).toBeNull();
    });
});
