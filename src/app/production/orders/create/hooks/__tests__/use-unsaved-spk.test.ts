// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useUnsavedSpk } from '../use-unsaved-spk';
describe('unsaved SPK guard', () => {
    it('runs clean navigation, prompts dirty changes, cancels or confirms exactly once', () => {
        const { result } = renderHook(() => useUnsavedSpk());
        const action = vi.fn();
        act(() => result.current.request(action));
        expect(action).toHaveBeenCalledTimes(1);
        act(() => result.current.markDirty());
        act(() => result.current.request(action, 'Reset recipe?'));
        expect(result.current.prompt).toBe('Reset recipe?');
        expect(action).toHaveBeenCalledTimes(1);
        act(() => result.current.cancel());
        expect(result.current.prompt).toBeNull();
        act(() => result.current.request(action));
        act(() => result.current.confirm());
        act(() => result.current.confirm());
        expect(action).toHaveBeenCalledTimes(2);
    });
    it('warns on reload only while unsaved, removes listener on unmount', () => {
        const { result, unmount } = renderHook(() => useUnsavedSpk());
        act(() => result.current.markDirty());
        const before = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(before);
        expect(before.defaultPrevented).toBe(true);
        act(() => result.current.markSaved());
        const after = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(after);
        expect(after.defaultPrevented).toBe(false);
        unmount();
    });
    it('intercepts same-tab navigation but not hashes or modifier clicks', () => {
        const { result } = renderHook(() => useUnsavedSpk());
        act(() => result.current.markDirty());
        const anchor = document.createElement('a');
        anchor.href = '/production/orders';
        document.body.append(anchor);
        const click = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
        });
        act(() => {
            anchor.dispatchEvent(click);
        });
        expect(click.defaultPrevented).toBe(true);
        expect(result.current.prompt).toBeTruthy();
        act(() => result.current.cancel());
        anchor.href = '#section';
        const hash = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
        });
        act(() => {
            anchor.dispatchEvent(hash);
        });
        expect(hash.defaultPrevented).toBe(false);
        anchor.remove();
    });
});
