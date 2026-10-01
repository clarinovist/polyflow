/**
 * Persentase affal terhadap output kotor: affal / (hasil bersih + affal).
 * Kedua nilai harus memakai satuan yang sama; pemanggil bertanggung jawab
 * untuk menolak data yang satuannya belum dapat dipastikan.
 */
export function affalPercent(
    produced: number,
    affal: number,
): number | null {
    const gross = produced + affal;
    if (gross <= 0) return null;
    return Math.round((affal / gross) * 1000) / 10;
}
