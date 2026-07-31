// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
    OpnameEntryEditor,
    type OpnameEntryView,
} from '../OpnameEntryEditor';

// Stub formatQuantity to simple representation for assertions if needed;
// but real implementation uses id-ID locale which we also rely on.
// We'll assert against actual DOM text instead.

const makeEntries = (): OpnameEntryView[] => [
    { id: 'e1', quantity: 45.3, status: 'saved' as const },
    { id: 'e2', quantity: 44, status: 'saved' as const },
    { id: 'e3', quantity: 30.5, status: 'saved' as const, label: 'Roll C' },
];

function renderEditor(
    props: Partial<React.ComponentProps<typeof OpnameEntryEditor>> = {},
) {
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const onRetry = vi.fn();
    const utils = render(
        <OpnameEntryEditor
            entries={makeEntries()}
            unit="KG"
            onAdd={onAdd}
            onRemove={onRemove}
            onRetry={onRetry}
            {...props}
        />,
    );
    return { onAdd, onRemove, onRetry, ...utils };
}

describe('OpnameEntryEditor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('menampilkan jumlah entri dan total dalam satuan yang benar', () => {
        // Arrange & Act
        renderEditor();

        // Assert — 3 entri, total = 45.3+44+30.5 = 119.8
        const summary = screen.getByTestId('entry-summary');
        expect(summary.textContent).toContain('3 entri');
        expect(summary.textContent).toContain('KG');
        // total formatting via formatQuantity (id-ID) so just assert contains unit + count phrase
        // Numbers via id-ID may use comma as decimal; at least "119" part visible
        expect(summary.textContent).toMatch(/119/);
    });

    it('memanggil onAdd dengan angka hasil parse saat tombol Tambah ditekan (koma)', () => {
        // Arrange — ini inti bug: "45,3" harus jadi 45.3, bukan 45
        const { onAdd } = renderEditor({ entries: [] });

        // Act
        const input = screen.getByTestId('entry-input') as HTMLInputElement;
        fireEvent.change(input, { target: { value: '45,3' } });
        fireEvent.click(screen.getByTestId('add-button'));

        // Assert
        expect(onAdd).toHaveBeenCalledWith(45.3);
    });

    it('memanggil onAdd saat menekan Enter di input', () => {
        // Arrange
        const { onAdd } = renderEditor({ entries: [] });

        // Act
        const input = screen.getByTestId('entry-input');
        fireEvent.change(input, { target: { value: '10.5' } });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

        // Assert
        expect(onAdd).toHaveBeenCalledWith(10.5);
    });

    it('mengosongkan input setelah entri ditambahkan', () => {
        // Arrange
        renderEditor({ entries: [] });
        const input = screen.getByTestId('entry-input') as HTMLInputElement;

        // Act
        fireEvent.change(input, { target: { value: '12.5' } });
        fireEvent.click(screen.getByTestId('add-button'));

        // Assert — input dikosongkan
        expect(input.value).toBe('');
    });

    it('menolak input tidak valid tanpa memanggil onAdd', () => {
        // Arrange
        const { onAdd } = renderEditor({ entries: [] });

        // Act — invalid input
        const input = screen.getByTestId('entry-input') as HTMLInputElement;
        fireEvent.change(input, { target: { value: 'abc' } });
        fireEvent.click(screen.getByTestId('add-button'));

        // Assert
        expect(onAdd).not.toHaveBeenCalled();
        expect(screen.getByTestId('input-error')).toBeDefined();
        // Input tidak dikosongkan saat invalid
        expect(input.value).toBe('abc');
    });

    it('menolak input nol tanpa memanggil onAdd', () => {
        // Arrange
        const { onAdd } = renderEditor({ entries: [] });

        // Act
        const input = screen.getByTestId('entry-input');
        fireEvent.change(input, { target: { value: '0' } });
        fireEvent.click(screen.getByTestId('add-button'));

        // Assert
        expect(onAdd).not.toHaveBeenCalled();
    });

    it('menampilkan tombol coba lagi hanya untuk entri berstatus failed', () => {
        // Arrange
        const entries: OpnameEntryView[] = [
            { id: 'saved-1', quantity: 10, status: 'saved' },
            { id: 'failed-1', quantity: 20, status: 'failed' },
            { id: 'pending-1', quantity: 30, status: 'pending' },
        ];

        // Act
        renderEditor({ entries });

        // Assert
        expect(screen.queryByTestId('retry-button-saved-1')).toBeNull();
        expect(screen.queryByTestId('retry-button-pending-1')).toBeNull();
        expect(screen.getByTestId('retry-button-failed-1')).toBeDefined();
    });

    it('memanggil onRemove dengan id entri yang benar', () => {
        // Arrange
        const { onRemove } = renderEditor();

        // Act — hapus entri kedua
        fireEvent.click(screen.getByTestId('remove-button-e2'));

        // Assert
        expect(onRemove).toHaveBeenCalledWith('e2');
    });

    it('memanggil onRetry dengan id entri yang benar', () => {
        // Arrange
        const entries: OpnameEntryView[] = [
            { id: 'f1', quantity: 5, status: 'failed' },
        ];
        const { onRetry } = renderEditor({ entries });

        // Act
        fireEvent.click(screen.getByTestId('retry-button-f1'));

        // Assert
        expect(onRetry).toHaveBeenCalledWith('f1');
    });

    it('menyembunyikan kontrol input saat readOnly', () => {
        // Arrange & Act
        renderEditor({ readOnly: true });

        // Assert
        expect(screen.queryByTestId('entry-input')).toBeNull();
        expect(screen.queryByTestId('add-button')).toBeNull();
        expect(screen.queryByTestId('remove-button-e1')).toBeNull();
        // Ringkasan + list tetap ada
        expect(screen.getByTestId('entry-summary')).toBeDefined();
        expect(screen.getByTestId('entry-list')).toBeDefined();
    });

    it('menyembunyikan tombol coba lagi saat readOnly', () => {
        // Arrange
        const entries: OpnameEntryView[] = [
            { id: 'failed-1', quantity: 20, status: 'failed' },
        ];

        // Act
        renderEditor({ entries, readOnly: true });

        // Assert
        expect(screen.queryByTestId('retry-button-failed-1')).toBeNull();
    });

    it('menampilkan label jika ada', () => {
        // Arrange & Act
        renderEditor();

        // Assert
        expect(screen.getByText('Roll C')).toBeDefined();
    });

    it('menampilkan spinner untuk entri pending', () => {
        // Arrange
        const entries: OpnameEntryView[] = [
            { id: 'p1', quantity: 10, status: 'pending' },
        ];

        // Act
        renderEditor({ entries });

        // Assert
        expect(screen.getByTestId('pending-spinner')).toBeDefined();
    });
});
