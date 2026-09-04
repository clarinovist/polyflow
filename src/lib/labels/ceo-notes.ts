/** Label halaman Catatan CEO */
export const ceoNotesLabels = {
    title: 'Catatan CEO',
    description:
        'Instruksi kerja dari CEO berdasarkan temuan sistem — klaim, kerjakan, atau laporkan kendala.',
    tabs: {
        active: 'Aktif',
        draft: 'Draft',
        done: 'Selesai',
        blocked: 'Terkendala',
    },
    empty: {
        active: 'Tidak ada catatan aktif. Semua aman.',
        draft: 'Tidak ada draft menunggu persetujuan.',
        done: 'Belum ada catatan yang selesai.',
        blocked: 'Tidak ada catatan yang terkendala.',
    },
    priority: {
        CRITICAL: 'Kritis',
        NORMAL: 'Rutin',
    },
    status: {
        DRAFT: 'Draft',
        PUBLISHED: 'Diterbitkan',
        CLAIMED: 'Dikerjakan',
        BLOCKED: 'Terkendala',
        RESOLVED: 'Selesai',
        DISCARDED: 'Dibuang',
    },
    actions: {
        claim: 'Klaim',
        resolve: 'Selesai',
        blocked: 'Terkendala',
        comment: 'Komentar',
        approve: 'Setujui & Kirim',
        discard: 'Buang',
        save: 'Simpan',
    },
} as const;
