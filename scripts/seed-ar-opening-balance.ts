/**
 * Import AR Opening Balance from Google Sheets into melindo tenant DB.
 * Creates: Customers, SalesOrders, Invoices, JournalEntries
 * Usage: DATABASE_URL="postgresql://polyflow:***@localhost:5434/polyflow_melindojaya" npx tsx scripts/seed-ar-opening-balance.ts
 */

import { PrismaClient, SalesOrderStatus, SalesOrderType, InvoiceStatus, JournalStatus, ReferenceType } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const AR_ACCOUNT_CODE = '11210'; // Trade Receivables - check actual code
const EQUITY_ACCOUNT_CODE = '30000';
const USER_ID = '64027d0b-84ed-4e3c-85ef-0f8d8cb9ad8e';

const MONTHS: Record<string, number> = {
    'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
    'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
};

function parseDate(s: string): Date {
    const p = s.trim().split(' ');
    return new Date(parseInt(p[2]), MONTHS[p[1]], parseInt(p[0]));
}

function parseCSV(content: string): Record<string, string>[] {
    const lines = content.split('\n').filter(l => l.trim());
    const headers = parseCSVLine(lines[0]);
    return lines.slice(1).map(line => {
        const vals = parseCSVLine(line);
        const row: Record<string, string> = {};
        headers.forEach((h, i) => row[h] = (vals[i] || '').trim());
        return row;
    });
}

function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { inQuotes = !inQuotes; }
        else if (c === ',' && !inQuotes) { result.push(current); current = ''; }
        else { current += c; }
    }
    result.push(current);
    return result;
}

async function generateEntryNumber(date: Date, tx: any): Promise<string> {
    const year = date.getFullYear();
    const key = `JOURNAL_ENTRY_${year}`;
    try {
        const seq = await tx.systemSequence.update({
            where: { key },
            data: { value: { increment: 1 } }
        });
        return `JE - ${year} -${(Number(seq.value) - 1).toString().padStart(5, '0')}`;
    } catch (error: any) {
        if (error.code === 'P2025') {
            const latest = await tx.journalEntry.findFirst({
                where: { entryDate: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } },
                orderBy: { entryNumber: 'desc' }
            });
            const nextVal = latest ? parseInt(latest.entryNumber.split('-').pop()!) + 1 : 1;
            await tx.systemSequence.create({ data: { key, value: nextVal + 1 } });
            return `JE - ${year} -${nextVal.toString().padStart(5, '0')}`;
        }
        throw error;
    }
}

async function main() {
    console.log('=== AR Opening Balance Import ===\n');

    const csvPath = path.join(__dirname, '../docs/data-import/melindo-initial/ar-opening-detail-from-sheets.csv');
    const rows = parseCSV(fs.readFileSync(csvPath, 'utf-8'));
    console.log(`Read ${rows.length} rows from CSV`);

    // Find AR account - try multiple codes
    let arAccount = await prisma.account.findFirst({ where: { code: '11210' } });
    if (!arAccount) arAccount = await prisma.account.findFirst({ where: { code: '1-115b' } });
    if (!arAccount) arAccount = await prisma.account.findFirst({ where: { code: { contains: '115' }, type: 'ASSET' } });
    if (!arAccount) throw new Error('AR Account not found! Searched: 11210, 1-115b');
    console.log(`AR Account: ${arAccount.code} - ${arAccount.name} (${arAccount.id})`);

    const equityAccount = await prisma.account.findUnique({ where: { code: EQUITY_ACCOUNT_CODE } });
    if (!equityAccount) throw new Error('Equity Account 30000 not found!');
    console.log(`Equity Account: ${equityAccount.code} (${equityAccount.id})`);

    // Create customers
    console.log('\n--- Customers ---');
    const customerIds: Record<string, string> = {};
    for (const row of rows) {
        const name = row['nama_customer'];
        if (customerIds[name]) continue;
        
        let customer = await prisma.customer.findFirst({ where: { name } });
        if (!customer) {
            const code = 'CUST-' + name.replace(/[^A-Z0-9]/gi, '').substring(0, 15).toUpperCase();
            customer = await prisma.customer.create({
                data: { name, code, isActive: true }
            });
            console.log(`  + ${code}: ${name}`);
        } else {
            console.log(`  = ${customer.code}: ${name}`);
        }
        customerIds[name] = customer.id;
    }

    // Check existing
    const existingSOs = await prisma.salesOrder.findMany({
        where: { orderNumber: { startsWith: 'SO-OPEN-' } },
        select: { orderNumber: true }
    });
    const existingSet = new Set(existingSOs.map(so => so.orderNumber));

    // Import
    console.log('\n--- Importing AR Entries ---');
    let created = 0, skipped = 0, errors = 0;

    for (const row of rows) {
        const customerName = row['nama_customer'];
        const invoiceNumber = row['nomor_invoice'];
        const amount = parseInt(row['nilai_piutang'], 10);
        const invoiceDate = parseDate(row['tanggal_invoice']);
        const dueDate = parseDate(row['tanggal_jatuh_tempo']);
        const customerId = customerIds[customerName];
        const soNumber = `SO-OPEN-${invoiceNumber}`;

        if (!customerId) { console.log(`  ✗ Unknown customer: ${customerName}`); errors++; continue; }
        if (existingSet.has(soNumber)) { skipped++; continue; }
        if (isNaN(amount) || amount <= 0) { console.log(`  ✗ Bad amount: ${invoiceNumber}`); errors++; continue; }

        try {
            await prisma.$transaction(async (tx) => {
                const so = await tx.salesOrder.create({
                    data: {
                        orderNumber: soNumber,
                        customerId,
                        orderDate: invoiceDate,
                        status: SalesOrderStatus.DELIVERED,
                        orderType: SalesOrderType.MAKE_TO_STOCK,
                        totalAmount: amount,
                        notes: 'Opening Balance Entry',
                        createdById: USER_ID,
                    }
                });

                const invoice = await tx.invoice.create({
                    data: {
                        invoiceNumber,
                        salesOrderId: so.id,
                        invoiceDate,
                        dueDate,
                        status: InvoiceStatus.UNPAID,
                        totalAmount: amount,
                        termOfPaymentDays: 0,
                        notes: row['keterangan'] || 'Opening Balance Transfer',
                    }
                });

                const entryNumber = await generateEntryNumber(invoiceDate, tx);

                await tx.journalEntry.create({
                    data: {
                        entryNumber,
                        entryDate: invoiceDate,
                        description: `Opening Balance AR - Inv #${invoiceNumber}`,
                        reference: invoiceNumber,
                        referenceType: ReferenceType.SALES_INVOICE,
                        referenceId: invoice.id,
                        isAutoGenerated: true,
                        status: JournalStatus.POSTED,
                        createdById: USER_ID,
                        approvedById: USER_ID,
                        lines: {
                            create: [
                                { accountId: arAccount.id, debit: amount, credit: 0, description: 'Opening Balance Receivable' },
                                { accountId: equityAccount.id, debit: 0, credit: amount, description: 'Opening Equity Offset' },
                            ]
                        }
                    }
                });
            }, { timeout: 15000 });
            created++;
        } catch (err: any) {
            console.log(`  ✗ ${invoiceNumber}: ${err.message}`);
            errors++;
        }
    }

    // Summary
    console.log('\n=== SUMMARY ===');
    console.log(`CSV rows:  ${rows.length}`);
    console.log(`Created:   ${created}`);
    console.log(`Skipped:   ${skipped}`);
    console.log(`Errors:    ${errors}`);

    const totalCust = await prisma.customer.count();
    const totalSOs = await prisma.salesOrder.count({ where: { orderNumber: { startsWith: 'SO-OPEN-' } } });
    const totalInv = await prisma.invoice.count();
    const totalAR = await prisma.invoice.aggregate({ _sum: { totalAmount: true } });
    const jlStats = await prisma.journalLine.aggregate({
        where: { journalEntry: { description: { contains: 'Opening Balance AR' }, status: JournalStatus.POSTED } },
        _sum: { debit: true, credit: true }
    });

    console.log(`\nDB Verify:`);
    console.log(`  Customers:    ${totalCust}`);
    console.log(`  SO-OPEN:      ${totalSOs}`);
    console.log(`  Invoices:     ${totalInv}`);
    console.log(`  Total AR:     Rp ${Number(totalAR._sum.totalAmount || 0).toLocaleString('id-ID')}`);
    const dr = Number(jlStats._sum.debit || 0);
    const cr = Number(jlStats._sum.credit || 0);
    console.log(`  Jrnl Debit:   Rp ${dr.toLocaleString('id-ID')}`);
    console.log(`  Jrnl Credit:  Rp ${cr.toLocaleString('id-ID')}`);
    console.log(`  Balanced:     ${Math.abs(dr - cr) < 0.01 ? '✓' : '✗ diff ' + (dr - cr)}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
