import { describeServerActionFailure } from '@/lib/utils/server-action-errors';

export type InputScope = 'production' | 'usage' | 'adjustment' | 'opname' | 'void';
export interface InputFailure {
    title: string;
    message: string;
    code?: string;
}
type Rejection = { error?: string; code?: string; details?: Record<string, unknown> };

const titles: Record<InputScope, string> = {
    production: 'Hasil belum tersimpan',
    usage: 'Pemakaian belum dicatat',
    adjustment: 'Penyesuaian belum tersimpan',
    opname: 'Opname belum difinalisasi',
    void: 'Pembatalan belum dilakukan',
};
const history: Record<InputScope, string> = {
    production: 'riwayat hasil pada SPK',
    usage: 'riwayat pemakaian internal',
    adjustment: 'mutasi stok',
    opname: 'status opname dan mutasi stok',
    void: 'status hasil produksi dan riwayat pembatalan',
};

// Only codes with a known business rejection get an explicit "not saved" title.
// Other errors can follow a committed transaction (e.g. revalidation failure).
const messages: Record<string, string> = {
    PRODUCTION_COST_PERIOD_INVALID:
        'Batas biaya SPK perlu diperiksa Finance. Catatan lama harus tetap utuh; jangan mengubah jumlah hasil atau mengulang dengan angka berbeda.',
    PRODUCTION_WIP_UNRESOLVED:
        'Catatan biaya SPK ini belum cocok. Minta admin meneruskan nomor SPK ke Finance untuk diperiksa. Tetap gunakan jumlah hasil sesuai produksi sebenarnya.',
    PRODUCTION_CONVERSION_UNFUNDED:
        'Biaya pengolahan pada SPK ini belum siap dicatat. Minta Finance memeriksa biaya SPK sebelum melanjutkan.',
    PRODUCTION_COST_RECONCILIATION_REQUIRED:
        'Catatan biaya hasil sebelumnya perlu diperiksa. Minta Finance memeriksa SPK ini; jangan mengubah jumlah produksi hanya agar bisa menyimpan.',
    PRODUCTION_REVERSAL_UNRESOLVED:
        'Catatan biaya hasil produksi ini perlu diperiksa sebelum dibatalkan. Hubungi admin atau Finance dengan nomor SPK ini.',
    INTERNAL_USAGE_MISSING_MAPPING:
        'Pengaturan biaya ATK belum siap. Minta Finance memeriksa pengaturan pemakaian internal untuk barang ini.',
    INTERNAL_USAGE_MISSING_COST:
        'Harga pokok barang di gudang ini belum tersedia. Minta Finance memeriksa harga pada penerimaan atau saldo awal barang.',
    INTERNAL_USAGE_MISSING_SOURCE_BASIS:
        'Catatan nilai barang belum lengkap atau belum cukup untuk pemakaian ini. Minta Finance memeriksa penerimaan dan saldo awal. Jangan mengubah jumlah hanya agar bisa disimpan.',
    INTERNAL_USAGE_SOURCE_ACCOUNT_MISMATCH:
        'Catatan biaya barang ini perlu diselaraskan oleh Finance. Minta Finance memeriksa penerimaan dan saldo awal sebelum pemakaian dilanjutkan.',
    INTERNAL_USAGE_INSUFFICIENT_GL:
        'Saldo pembukuan barang belum cukup untuk pemakaian ini. Minta Finance memeriksanya; ini bukan perintah untuk menambah stok.',
    INVENTORY_GL_INSUFFICIENT:
        'Saldo pembukuan persediaan belum cukup untuk transaksi ini. Minta Finance memeriksa catatan biaya barang. Jangan menambah atau mengubah stok hanya agar transaksi bisa disimpan.',
    OPERATIONAL_STOCK_COST_REQUIRED:
        'Harga pokok ATK belum tersedia. Minta Finance memeriksa harga penerimaan atau saldo awal barang sebelum melanjutkan penyesuaian atau opname.',
    OPERATIONAL_ADJUSTMENT_MISSING_SOURCE_BASIS:
        'Catatan nilai ATK belum cukup untuk penyesuaian ini. Minta Finance memeriksa penerimaan atau saldo awal. Tetap gunakan jumlah sesuai hasil hitung fisik.',
    OPNAME_LEDGER_MISMATCH:
        'Jumlah stok di sistem berbeda dengan riwayat keluar-masuk barang. Minta admin gudang memeriksa kartu stok sebelum finalisasi. Tetap gunakan hasil hitung fisik yang benar.',
    OPNAME_NEGATIVE_LIVE_STOCK:
        'Finalisasi ini akan membuat stok saat ini kurang dari nol. Periksa hasil hitung bersama admin gudang, termasuk transaksi setelah tanggal opname.',
};

/** Present returned business failures, not raw thrown exceptions. */
export function inputFailure(result: Rejection, scope: InputScope): InputFailure {
    const code = result.code;
    if (code === 'INTERNAL_ERROR' || code === 'EXTERNAL_SERVICE_ERROR') {
        return interruptedInput(undefined, scope);
    }
    if (code === 'PACKAGED_REQUEST_REUSED') {
        return {
            title: 'Periksa riwayat hasil',
            message: 'Permintaan ini sudah dipakai oleh catatan sebelumnya atau catatannya sudah dibatalkan. Periksa riwayat SPK; kirim lagi hanya jika memang perlu membuat catatan baru.',
            code,
        };
    }
    if (code === 'AUTHENTICATION_ERROR' || code === 'KIOSK_OPERATOR_SESSION_REQUIRED') {
        return { title: 'Sesi perlu diperbarui', message: 'Catat isian Anda terlebih dahulu, lalu masuk atau pilih operator dengan PIN kembali sebelum melanjutkan.', code };
    }
    if (code === 'AUTHORIZATION_ERROR') {
        return { title: 'Akses belum tersedia', message: 'Akun Anda belum memiliki akses untuk tindakan ini. Hubungi admin untuk memeriksa izin akses.', code };
    }
    if (code && messages[code]) {
        const item = result.details?.productName ?? result.details?.skuCode;
        return { title: titles[scope], message: `${typeof item === 'string' ? `Barang: ${item}. ` : ''}${messages[code]}`, code };
    }
    return {
        title: 'Proses belum dapat dilanjutkan',
        message: result.error || 'Periksa riwayat transaksi terlebih dahulu. Jika kendala berulang, hubungi admin.',
        code,
    };
}

/** A lost response is not proof that the transaction rolled back. */
export function interruptedInput(error: unknown, scope: InputScope): InputFailure {
    const failure = describeServerActionFailure(error, '');
    if (failure.isStaleDeploy) {
        return {
            title: 'Halaman perlu dimuat ulang',
            message: `Aplikasi sudah diperbarui. Catat isian Anda sebelum memuat ulang halaman. Periksa ${history[scope]} sebelum mengirim kembali.`,
        };
    }
    return {
        title: 'Status penyimpanan belum diketahui',
        message: `${failure.isNetworkError ? 'Koneksi terputus atau respons server tidak diterima.' : 'Konfirmasi dari server belum dapat diperoleh.'} Periksa ${history[scope]} sebelum mencoba lagi agar tidak membuat catatan ganda.`,
    };
}
