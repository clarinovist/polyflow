// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { savePartner, toast } = vi.hoisted(() => ({
    savePartner: vi.fn(),
    toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/actions/finance/barter-actions', () => ({
    saveBarterPartner: savePartner,
}));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/components/ui/select', async () => {
    const ReactModule = await import('react');
    const Context = ReactModule.createContext<((value: string) => void) | null>(null);
    return {
        Select: ({ children, onValueChange }: { children: React.ReactNode; onValueChange: (value: string) => void }) => (
            <Context.Provider value={onValueChange}>{children}</Context.Provider>
        ),
        SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
        SelectTrigger: ({ children, id }: { children: React.ReactNode; id?: string }) => <div id={id}>{children}</div>,
        SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
        SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => {
            const onValueChange = ReactModule.useContext(Context);
            return <button type="button" onClick={() => onValueChange?.(value)}>{children}</button>;
        },
    };
});

import { CustomerBarterSettings } from '../CustomerBarterSettings';

const candidates = [
    { id: 'supplier-1', name: 'PT Sama', code: 'SUP-1' },
    { id: 'supplier-2', name: 'PT Sama', code: 'SUP-2' },
];

describe('CustomerBarterSettings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        savePartner.mockResolvedValue({ success: true, data: {} });
    });

    it('requires Admin to choose one candidate explicitly before activation', async () => {
        render(
            <CustomerBarterSettings
                customerId="customer-1"
                initialValue={{ partner: null, candidates }}
            />,
        );
        expect(
            (
                screen.getByRole('button', {
                    name: 'Simpan Pengaturan Barter',
                }) as HTMLButtonElement
            ).disabled,
        ).toBe(true);
        fireEvent.click(screen.getByRole('button', { name: /SUP-2/ }));
        fireEvent.click(screen.getByLabelText('Izinkan barter'));
        fireEvent.click(screen.getByRole('button', { name: 'Simpan Pengaturan Barter' }));

        await waitFor(() => {
            expect(savePartner).toHaveBeenCalledWith({
                customerId: 'customer-1',
                supplierId: 'supplier-2',
                isActive: true,
            });
        });
    });

    it('locks supplier identity after settlement history exists', () => {
        render(
            <CustomerBarterSettings
                customerId="customer-1"
                initialValue={{
                    partner: {
                        id: 'partner-1',
                        supplierId: 'supplier-1',
                        isActive: true,
                        supplier: candidates[0],
                        _count: { settlements: 1 },
                    },
                    candidates,
                }}
            />,
        );
        expect(screen.getByText(/pasangan terkunci/i)).toBeDefined();
    });
});
