const STOP_WORDS = new Set([
    'cara',
    'caranya',
    'bagaimana',
    'gimana',
    'gmn',
    'apa',
    'apakah',
    'ada',
    'yang',
    'ya',
    'nya',
    'ini',
    'itu',
    'di',
    'ke',
    'dari',
    'dan',
    'atau',
    'untuk',
    'dengan',
    'saya',
    'aku',
    'mau',
    'ingin',
    'tolong',
    'bisa',
    'halo',
    'kan',
    'dong',
    'baru',
    'buat',
    'bikin',
    'membuat',
    'mengisi',
    'isi',
    'create',
    'kenapa',
    'knp',
    'kok',
    'belum',
    'sudah',
    'masih',
]);
const SYNONYMS: Record<string, string[]> = {
    po: ['po', 'purchase', 'pembelian'],
    purchase: ['purchase', 'pembelian', 'po'],
    pembelian: ['pembelian', 'purchase', 'po'],
    close: ['tutup', 'penutupan', 'close', 'closed'],
    closed: ['tutup', 'penutupan', 'close', 'closed'],
    menutup: ['tutup', 'penutupan', 'close', 'closed'],
    mentup: ['tutup', 'penutupan', 'close', 'closed'],
    tutup: ['tutup', 'penutupan', 'close', 'closed'],
    hapus: ['hapus', 'penghapusan', 'delete'],
    menghapus: ['hapus', 'penghapusan', 'delete'],
    delete: ['hapus', 'penghapusan', 'delete'],
    retur: ['retur', 'return'],
    returan: ['retur', 'return'],
    return: ['retur', 'return'],
    coa: ['coa', 'akun'],
    akun: ['akun', 'coa'],
};

/** Groups preserve concepts: PO synonyms count once, not three extra hits. */
export function helpSearchTerms(query: string): string[][] {
    const words =
        query
            .toLowerCase()
            .slice(0, 300)
            .match(/[a-z0-9]+/g) ?? [];
    const groups = words
        .filter(
            (word) =>
                (word.length >= 3 || ['po', 'so', 'sj', 'gr'].includes(word)) &&
                !STOP_WORDS.has(word),
        )
        .map((word) => SYNONYMS[word] ?? [word]);
    return [
        ...new Map(
            groups.map((group) => [[...group].sort().join('|'), group]),
        ).values(),
    ].slice(0, 10);
}
