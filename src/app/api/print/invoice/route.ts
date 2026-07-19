import { NextRequest, NextResponse } from 'next/server';
import { withTenantRoute } from '@/lib/core/tenant';
import { requireAuth } from '@/lib/tools/auth-checks';
import { prisma } from '@/lib/core/prisma';
import { getCompanyConfigWithOverridesAsync } from '@/lib/config/company-settings';
import {
    generateEscpInvoice,
    toUint8Array,
    type EscpInvoiceData,
} from '@/services/printing/escp-generator';

function toSafeDownloadFilename(value: string): string {
    return value
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim() || 'invoice';
}

export const GET = withTenantRoute(async (req: NextRequest) => {
    try {
        await requireAuth();

        const invoiceId = req.nextUrl.searchParams.get('id');
        if (!invoiceId) {
            return NextResponse.json(
                { error: 'Missing invoice id' },
                { status: 400 }
            );
        }

        // Fetch sales invoice with all relations
        const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
            include: {
                salesOrder: {
                    include: {
                        customer: true,
                        items: {
                            include: {
                                productVariant: {
                                    include: { product: true },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!invoice) {
            return NextResponse.json(
                { error: 'Invoice not found' },
                { status: 404 }
            );
        }

        const so = invoice.salesOrder;
        const customer = so?.customer;
        const items = so?.items ?? [];

        // Calculate totals
        const subtotal = items.reduce(
            (sum, item) => sum + Number(item.subtotal || 0),
            0
        );
        const totalQty = items.reduce(
            (sum, item) => sum + Number(item.quantity || 0),
            0
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
        const bankAccounts = isPPN ? company.bankAccountsPPN : company.bankAccountsNonPPN;
        const bankAcc = bankAccounts[0];

        const escpData: EscpInvoiceData = {
            companyName: company.name,
            companyAddress: company.address.replace(/\n/g, ', '),
            companyPhone: company.phone,
            companyEmail: company.email,
            customerName: customer?.name || '-',
            customerAddress: customer?.billingAddress || '-',
            customerTaxId: customer?.taxId || '-',
            invoiceNumber: invoice.invoiceNumber,
            invoiceDate: new Date(invoice.invoiceDate),
            dueDate: invoice.dueDate ? new Date(invoice.dueDate) : null,
            items: items.map(item => ({
                name: item.productVariant?.name || item.productVariant?.product?.name || '-',
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
        };

        const escpBytes = generateEscpInvoice(escpData);
        const uint8 = toUint8Array(escpBytes);
        const buffer = Buffer.from(uint8);

        const filename = toSafeDownloadFilename(invoice.invoiceNumber);

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${filename}.prn"`,
                'Content-Length': buffer.length.toString(),
            },
        });
    } catch (error) {
        console.error('[ESC/P Download] Error:', error);
        return NextResponse.json(
            { error: 'Failed to generate ESC/P file' },
            { status: 500 }
        );
    }
});
