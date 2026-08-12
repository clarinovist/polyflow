/**
 * Bahan kemasan (karung/zak/roll) dikeluarkan gudang per kontainer utuh, bukan
 * hasil timbang presisi ke qty rencana BOM. Helper ini menghitung berapa yang
 * perlu ditransfer secara fisik: sisa kebutuhan setelah floor stock yang sudah
 * ada dipakai, dibulatkan ke atas ke kelipatan ukuran kontainer.
 *
 * Pencatatan biaya SPK (MaterialIssue STAGED) tetap pakai plannedQty apa
 * adanya — capping itu sudah ditangani terpisah di material-service.ts.
 */
export function resolvePackagingTransferQuantity({
    plannedQty,
    floorStock = 0,
    containerSize,
}: {
    plannedQty: number;
    floorStock?: number;
    containerSize: number | null | undefined;
}): number {
    if (!containerSize || containerSize <= 0) {
        return plannedQty;
    }

    const shortfall = Math.max(0, plannedQty - floorStock);
    if (shortfall === 0) {
        return 0;
    }

    return Math.ceil(shortfall / containerSize) * containerSize;
}
