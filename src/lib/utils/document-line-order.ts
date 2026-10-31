/**
 * Shared line order for printed documents (Surat Jalan, invoice).
 * SO items carry no line number, so every document sorts by the printed name:
 * A–Z with numeric awareness ("UNGU 9" before "UNGU 15"). Ties keep input order.
 */
const lineNameCollator = new Intl.Collator('id', {
    numeric: true,
    sensitivity: 'base',
});

export function sortByDocumentLineName<T>(
    items: readonly T[],
    nameOf: (item: T) => string | null | undefined,
): T[] {
    return [...items].sort((a, b) =>
        lineNameCollator.compare(nameOf(a) ?? '', nameOf(b) ?? ''),
    );
}

interface VariantNamedLine {
    productVariant?: {
        name?: string | null;
        product?: { name?: string | null } | null;
    } | null;
}

/** Same fallback chain the prints use for "Nama Barang". */
export function documentLineName(item: VariantNamedLine): string {
    return (
        item.productVariant?.name || item.productVariant?.product?.name || ''
    );
}
