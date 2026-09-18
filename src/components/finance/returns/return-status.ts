import type { SalesReturnStatus } from '@prisma/client';

export const financeReturnStatuses: Record<SalesReturnStatus, string> = {
    DRAFT: 'Draft',
    CONFIRMED: 'Dikonfirmasi',
    RECEIVED: 'Diterima',
    COMPLETED: 'Selesai',
    CANCELLED: 'Dibatalkan',
};

export function financeReturnGuidance(status: SalesReturnStatus): string {
    switch (status) {
        case 'DRAFT':
            return 'Menunggu konfirmasi di Penjualan. Draft belum mengurangi piutang.';
        case 'CONFIRMED':
            return 'Menunggu penerimaan barang di Penjualan. Belum mengurangi piutang.';
        case 'RECEIVED':
        case 'COMPLETED':
            return 'Periksa jurnal retur dan invoice terkait. Status operasional ini bukan bukti saldo invoice sudah berkurang.';
        case 'CANCELLED':
            return 'Retur dibatalkan; bukan pengurang piutang.';
    }
}
