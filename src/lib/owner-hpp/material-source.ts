import type { OwnerHppRawMaterial } from './workspace-schema';

export type MaterialSourceTag = 'erp' | 'edited' | 'manual' | 'empty';

/** Derived, never stored, so the tag can not drift from the numbers. */
export function materialSourceTag(
    material: Pick<OwnerHppRawMaterial, 'price' | 'erpPrice'>,
): MaterialSourceTag {
    if (material.erpPrice === null) {
        return material.price === 0 ? 'empty' : 'manual';
    }
    return material.price === material.erpPrice ? 'erp' : 'edited';
}
