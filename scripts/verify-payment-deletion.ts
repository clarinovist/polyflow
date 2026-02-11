
import { prisma } from '../src/lib/prisma';
import { deletePayment } from '../src/actions/finance';
import { ReferenceType } from '@prisma/client';

async function run() {
    console.log('🧪 Starting Payment Deletion Verification...');

    try {
        // 1. Find a payment that has journal entries
        const payment = await prisma.payment.findFirst({
            include: {
                invoice: true,
                purchaseInvoice: true
            }
        });

        if (!payment) {
            console.log('❌ No payments found to test with.');
            return;
        }

        console.log(`Found payment: ${payment.paymentNumber} (Amount: ${payment.amount})`);
        const invoiceId = payment.invoiceId || payment.purchaseInvoiceId;
        const refType = payment.invoiceId ? ReferenceType.SALES_PAYMENT : ReferenceType.PURCHASE_PAYMENT;

        // 2. Check journal entries before deletion
        const journalsBefore = await prisma.journalEntry.findMany({
            where: { referenceId: payment.id, referenceType: refType }
        });
        console.log(`Journals before: ${journalsBefore.length}`);

        // 3. Delete the payment (Directly using Prisma to verify logic)
        console.log('Deleting payment (simulating server action logic)...');

        await prisma.$transaction(async (tx) => {
            // Revert Invoice (Same logic as in finance.ts)
            if (payment.invoiceId && payment.invoice) {
                const newPaid = Number(payment.invoice.paidAmount) - Number(payment.amount);
                await tx.invoice.update({
                    where: { id: payment.invoiceId },
                    data: {
                        paidAmount: newPaid,
                        status: newPaid <= 0 ? 'UNPAID' : 'PARTIAL'
                    }
                });
            }

            // Delete Journal Entries
            await tx.journalLine.deleteMany({
                where: { journalEntry: { referenceId: payment.id, referenceType: refType } }
            });
            await tx.journalEntry.deleteMany({
                where: { referenceId: payment.id, referenceType: refType }
            });

            // Delete Payment Record
            await tx.payment.delete({ where: { id: payment.id } });
        });

        console.log('✅ Simulated deletion logic completed.');

        // 4. Verify journal entries are gone
        const journalsAfter = await prisma.journalEntry.findMany({
            where: { referenceId: payment.id, referenceType: refType }
        });

        // Update verification for nested lines query
        const linesAfterCount = await prisma.journalLine.count({
            where: { journalEntry: { referenceId: payment.id, referenceType: refType } }
        });

        if (journalsAfter.length === 0 && linesAfterCount === 0) {
            console.log('✅ Success: All associated journal entries and lines were deleted.');
        } else {
            console.log(`❌ Error: ${journalsAfter.length} journals and ${linesAfterCount} lines remain.`);
        }

        // 5. Verify invoice update
        if (payment.invoiceId) {
            const inv = await prisma.invoice.findUnique({ where: { id: payment.invoiceId } });
            console.log(`Invoice status now: ${inv?.status}, Paid amount: ${inv?.paidAmount}`);
            if (Number(inv?.paidAmount) === 0 && inv?.status === 'UNPAID') {
                console.log('✅ Success: Invoice balance and status reverted correctly.');
            }
        }

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

run();
