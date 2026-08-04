// @vitest-environment jsdom

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { LoadVerifyPanel } from '../LoadVerifyPanel';

const {
    mockRefresh,
    mockToast,
    mockSaveDeliveryLoadVerification,
    mockConfirmDeliveryLoadVerified,
    mockCorrectDeliveryQtyToVerified,
} = vi.hoisted(() => ({
    mockRefresh: vi.fn(),
    mockToast: { success: vi.fn(), error: vi.fn() },
    mockSaveDeliveryLoadVerification: vi.fn(),
    mockConfirmDeliveryLoadVerified: vi.fn(),
    mockCorrectDeliveryQtyToVerified: vi.fn(),
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock('sonner', () => ({ toast: mockToast }));

vi.mock('@/actions/inventory/deliveries', () => ({
    saveDeliveryLoadVerification: (...args: unknown[]) =>
        mockSaveDeliveryLoadVerification(...args),
    confirmDeliveryLoadVerified: (...args: unknown[]) =>
        mockConfirmDeliveryLoadVerified(...args),
    correctDeliveryQtyToVerified: (...args: unknown[]) =>
        mockCorrectDeliveryQtyToVerified(...args),
}));

// Order line: 5 BAL entered at order time, 1 BAL = 25 KG -> quantity stored as 125 KG (primaryUnit).
const balItem = {
    id: 'item-1',
    quantity: 125,
    verifiedQuantity: null as number | null,
    enteredQuantity: 5,
    enteredUnit: 'BAL',
    conversionFactorSnapshot: 25,
    productVariant: {
        name: 'UNGU 15',
        skuCode: 'PKHUR001',
        primaryUnit: 'KG',
        product: { name: 'HD UNGU' },
    },
};

function renderPanel(
    props: Partial<React.ComponentProps<typeof LoadVerifyPanel>> = {},
) {
    return render(
        <LoadVerifyPanel
            deliveryOrderId="do-1"
            items={[balItem]}
            isVerified={false}
            canEdit={true}
            {...props}
        />,
    );
}

beforeEach(() => {
    vi.clearAllMocks();
    mockSaveDeliveryLoadVerification.mockResolvedValue({ success: true });
    mockConfirmDeliveryLoadVerified.mockResolvedValue({ success: true });
});

describe('LoadVerifyPanel — satuan BAL vs KG', () => {
    it('menampilkan Perintah (qty) dalam satuan enteredUnit (5 BAL) beserta konversi KG', () => {
        // Arrange & Act
        renderPanel();

        // Assert — bukan "125.00 KG" polos, harus tampil qty dalam BAL + konversi KG
        expect(screen.getByText(/5 BAL/)).toBeTruthy();
        expect(screen.getByText(/125.*KG/)).toBeTruthy();
    });

    it('status "Sesuai" saat operator isi qty fisik dalam BAL sesuai perintah (bukan Selisih palsu)', () => {
        // Arrange — ini reproduksi bug: input diberi label BAL, harus dibandingkan dalam BAL
        renderPanel();
        const input = screen.getByPlaceholderText('0');

        // Act
        fireEvent.change(input, { target: { value: '5' } });

        // Assert
        expect(screen.getByText('Sesuai')).toBeTruthy();
        expect(screen.queryByText('Selisih')).toBeNull();
    });

    it('"Samakan semua ke perintah" mengisi draft dalam BAL (5), bukan KG (125)', () => {
        // Arrange
        renderPanel();

        // Act
        fireEvent.click(
            screen.getByRole('button', { name: /Samakan semua ke perintah/i }),
        );

        // Assert
        const input = screen.getByPlaceholderText('0') as HTMLInputElement;
        expect(input.value).toBe('5');
    });

    it('Simpan Verifikasi mengonversi qty BAL ke KG sebelum dikirim ke server', async () => {
        // Arrange
        renderPanel();
        const input = screen.getByPlaceholderText('0');
        fireEvent.change(input, { target: { value: '5' } });

        // Act
        fireEvent.click(
            screen.getByRole('button', { name: /Simpan Verifikasi/i }),
        );

        // Assert — server tetap menerima verifiedQuantity dalam primaryUnit (KG)
        await waitFor(() => {
            expect(mockSaveDeliveryLoadVerification).toHaveBeenCalledWith({
                deliveryOrderId: 'do-1',
                items: [{ id: 'item-1', verifiedQuantity: 125 }],
            });
        });
    });

    it('memuat ulang draft tersimpan (verifiedQuantity 125 KG) sebagai 5 BAL di input, langsung Sesuai', () => {
        // Arrange & Act — simulasi reload setelah verifiedQuantity sudah tersimpan di DB
        renderPanel({ items: [{ ...balItem, verifiedQuantity: 125 }] });

        // Assert
        const input = screen.getByPlaceholderText('0') as HTMLInputElement;
        expect(input.value).toBe('5');
        expect(screen.getByText('Sesuai')).toBeTruthy();
    });

    it('item tanpa satuan alternatif (KG saja) tetap dibandingkan apa adanya', () => {
        // Arrange — item tanpa enteredUnit/conversionFactorSnapshot, quantity 50 KG
        const kgItem = {
            id: 'item-2',
            quantity: 50,
            verifiedQuantity: null,
            enteredQuantity: null,
            enteredUnit: null,
            conversionFactorSnapshot: null,
            productVariant: {
                name: 'HITAM 10',
                skuCode: 'PKHTM001',
                primaryUnit: 'KG',
                product: { name: 'HD HITAM' },
            },
        };
        renderPanel({ items: [kgItem] });
        const input = screen.getByPlaceholderText('0');

        // Act
        fireEvent.change(input, { target: { value: '50' } });

        // Assert
        expect(screen.getByText('Sesuai')).toBeTruthy();
    });
});
