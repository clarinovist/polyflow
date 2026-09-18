import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors/errors';
import { allocateReturnValue } from '@/lib/finance/sales-return-allocation';

type BasisLine = {
    sourceItemId: string;
    productVariantId: string;
    quantity: string;
    netAmount: string;
    taxAmount: string;
    discountAmount: string;
};
export type OriginalInvoiceEvidence = {
    totalAmount: string;
    roundingAmount: string;
    shippingAmount: string;
    journalTaxAmount: string;
    lines: BasisLine[];
};

/** Only original issuance evidence is accepted; callers must never pass current master pricing. */
export function buildInvoiceReturnBasis(
    evidence: OriginalInvoiceEvidence,
): BasisLine[] {
    const money = (value: string) => {
        const amount = new Prisma.Decimal(value);
        if (!amount.isFinite() || amount.lt(0) || amount.decimalPlaces() > 2)
            throw new BusinessRuleError('Nilai dokumen sumber tidak valid.');
        return amount;
    };
    if (
        !evidence.lines.length ||
        new Set(evidence.lines.map((line) => line.sourceItemId)).size !==
            evidence.lines.length
    ) {
        throw new BusinessRuleError(
            'Baris invoice sumber kosong atau duplikat.',
        );
    }
    let total = money(evidence.shippingAmount).plus(
        money(evidence.roundingAmount),
    );
    let tax = new Prisma.Decimal(0);
    for (const line of evidence.lines) {
        if (!line.sourceItemId || !line.productVariantId)
            throw new BusinessRuleError(
                'Identitas baris invoice sumber tidak lengkap.',
            );
        const value = allocateReturnValue(line, '0', line.quantity);
        total = total.plus(value.totalAmount);
        tax = tax.plus(value.taxAmount);
    }
    if (
        !total.equals(money(evidence.totalAmount)) ||
        !tax.equals(money(evidence.journalTaxAmount))
    ) {
        throw new BusinessRuleError(
            'Snapshot barang/pajak tidak sama dengan invoice dan jurnal asal. Pemeriksaan Finance diperlukan.',
        );
    }
    return evidence.lines.map((line) => ({ ...line }));
}
