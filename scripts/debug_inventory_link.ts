import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // The exact logic from inventory-link-service.ts
    const goodsReceiptId = 'cca8ae9e-eba5-42bc-b992-6d99545a055c'; // GR-2026-0018
    let billAlreadyExists = false;

    const gr = await prisma.goodsReceipt.findUnique({
        where: { id: goodsReceiptId },
        select: { purchaseOrderId: true }
    });
    console.log("GR purchaseOrderId:", gr?.purchaseOrderId);

    if (gr?.purchaseOrderId) {
        const existingBill = await prisma.purchaseInvoice.findFirst({
            where: { purchaseOrderId: gr.purchaseOrderId }
        });
        console.log("existingBill:", existingBill?.id, "invoiceNumber:", existingBill?.invoiceNumber);

        if (existingBill) {
            const billJournal = await prisma.journalEntry.findFirst({
                where: { referenceId: existingBill.id, status: 'POSTED' },
                include: { lines: true }
            });
            console.log("billJournal:", billJournal?.id);

            const acc11310 = await prisma.account.findUnique({ where: { code: '11310' } });
            console.log("acc11310:", acc11310?.id);

            if (billJournal && acc11310) {
                const directDebit = billJournal.lines.some(
                    l => l.accountId === acc11310.id && Number(l.debit) > 0
                );
                console.log("directDebit:", directDebit);
                if (directDebit) billAlreadyExists = true;
            }
        }
    }
    console.log("Final billAlreadyExists:", billAlreadyExists);
}

main()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error("Error executing script:", e);
        process.exit(1);
    });
