/**
 * Sales invoice: database row → ESC/P byte stream.
 *

 * See docs/plan/2026-08-07-escp-surat-jalan-dan-cetak-gabungan.md.
 */

import { prisma } from '@/lib/core/prisma';
import { getCompanyConfigWithOverridesAsync } from '@/lib/config/company-settings';
import { loadLogoBitmap, type EscpDocument } from './escp-documents';
import { generateEscpInvoice, type EscpInvoiceData } from './escp-generator';

/** Sales invoice. Returns null when the id does not exist. */
export async function buildInvoiceDocument(
    invoiceId: string,
): Promise<EscpDocument | null> {
    const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
            salesOrder: {
                include: {
                    customer: true,
                    items: {
                        include: {
                            productVariant: { include: { product: true } },
                        },
                    },
                },
            },
        },
    });

    if (!invoice) return null;

    const so = invoice.salesOrder;
    const customer = so?.customer;
    const items = so?.items ?? [];

    const subtotal = items.reduce(
        (sum, item) => sum + Number(item.subtotal || 0),
        0,
    );
    const totalQty = items.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0,
    );
    const taxAmount = Number(so?.taxAmount || 0);
    const discountAmount = Number(so?.discountAmount || 0);
    const shippingCost = Number(so?.shippingCost || 0);
    const grandTotal = Number(invoice.totalAmount);
    const dpp = subtotal - taxAmount;
    const sisaTagihan = grandTotal - Number(invoice.paidAmount);
    const rawSubtotal = subtotal + discountAmount - taxAmount;

    const isPPN = taxAmount > 0;
    const company = await getCompanyConfigWithOverridesAsync();
    const bankAccounts = isPPN
        ? company.bankAccountsPPN
        : company.bankAccountsNonPPN;
    const bankAcc = bankAccounts[0];
    const logoBitmap = await loadLogoBitmap(company);

    const escpData: EscpInvoiceData = {
        companyName: company.name,
        companyAddress: company.address.replace(/\n/g, ', '),
        companyPhone: company.phone,
        companyWhatsapp: company.whatsapp,
        companyEmail: company.email,
        customerName: customer?.name || '-',
        customerAddress: customer?.billingAddress || '-',
        customerTaxId: customer?.taxId || '-',
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: new Date(invoice.invoiceDate),
        dueDate: invoice.dueDate ? new Date(invoice.dueDate) : null,
        items: items.map((item) => ({
            name:
                item.productVariant?.name ||
                item.productVariant?.product?.name ||
                '-',
            qty: Number(item.quantity || 0),
            unit: item.productVariant?.primaryUnit || 'pcs',
            unitPrice: Number(item.unitPrice || 0),
            lineTotal: Number(item.subtotal || 0),
        })),
        subtotal: rawSubtotal,
        discountAmount,
        dpp,
        taxAmount,
        shippingCost,
        grandTotal,
        paidAmount: Number(invoice.paidAmount),
        remainingBalance: sisaTagihan,
        totalQty,
        bankHolder: bankAcc?.holder || company.name,
        bankName: bankAcc?.bank || '-',
        bankAccount: bankAcc?.account || '-',
        isPPN,
        footerNote: company.footerNote,
        signerName: company.signerName,
        paperHeightCm: company.paperSize.heightCm,
        paperWidthCm: company.paperSize.widthCm,
        logoBitmap,
    };

    return {
        bytes: generateEscpInvoice(escpData),
        documentNumber: invoice.invoiceNumber,
    };
}
