// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useProductionConfirm } from '../useProductionConfirm';

function Fixture({ result }: { result: (accepted: boolean) => void }) {
    const { confirm, confirmationDialog } = useProductionConfirm();
    return <>{confirmationDialog}<button onClick={async () => result(await confirm({ title: 'Konfirmasi', description: 'Uji sintetis' }))}>Mulai</button></>;
}
afterEach(cleanup);
describe('production application confirmation', () => {
    it('only resolves true after explicit acceptance', async () => {
        const result = vi.fn(); render(<Fixture result={result} />);
        fireEvent.click(screen.getByText('Mulai'));
        expect(result).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText('Lanjutkan'));
        await waitFor(() => expect(result).toHaveBeenCalledExactlyOnceWith(true));
    });
    it('cancels explicitly and can open again', async () => {
        const result = vi.fn(); render(<Fixture result={result} />);
        fireEvent.click(screen.getByText('Mulai')); fireEvent.click(screen.getByText('Batal'));
        await waitFor(() => expect(result).toHaveBeenCalledWith(false));
        fireEvent.click(screen.getByText('Mulai')); expect(screen.getByRole('alertdialog')).toBeTruthy();
    });
    it('resolves pending confirmation as cancelled on unmount', async () => {
        const result = vi.fn(); const { unmount } = render(<Fixture result={result} />);
        fireEvent.click(screen.getByText('Mulai')); unmount();
        await waitFor(() => expect(result).toHaveBeenCalledExactlyOnceWith(false));
    });
    it('cannot replace an unresolved decision with a duplicate click', async () => {
        const result = vi.fn(); render(<Fixture result={result} />);
        const trigger = screen.getByText('Mulai'); fireEvent.click(trigger); fireEvent.click(trigger);
        await waitFor(() => expect(result).toHaveBeenCalledExactlyOnceWith(false));
        fireEvent.click(screen.getByText('Lanjutkan'));
        await waitFor(() => expect(result).toHaveBeenLastCalledWith(true));
    });
});
