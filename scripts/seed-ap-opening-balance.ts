/**
 * Import AP Opening Balance from Google Sheets into melindo tenant DB.
 * 
 * Usage: DATABASE_URL="postgresql://polyflow:***@localhost:5434/polyflow_melindojaya" npx tsx scripts/seed-ap-opening-balance.ts
 */

import { PrismaClient, PurchaseOrderStatus, PurchaseInvoiceStatus, JournalStatus, ReferenceType, AccountType, AccountCategory } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const AP_ACCOUNT_CODE = '21110';
const EQUITY_ACCOUNT_CODE = '30000';
const USER_ID = '64027d0b-84ed-4e3c-85ef-0f8d8cb9ad8e'; // admin@melindojaya.com

const SUPPLIER_MAP: Record<string, { code: string; name: string }> = {
    'FADILA': { code: 'SUP-FADILA', name: 'FADILA' },
    'SB PLAST / CHANDRA': { code: 'SUP-SBPLAST', name: 'SB PLAST / CHANDRA' },
    'INTERA LESTARI POLIMER, PT': { code: 'SUP-INTERA', name: 'PT INTERA LESTARI POLIMER' },
    'SOLO MULTIPACKING, PT': { code: 'SUP-SOLOMP', name: 'PT SOLO MULTIPACKING' },
    'BAHANA BUANABOX, PT': { code: 'SUP-BAHANA', name: 'PT BAHANA BUANABOX' },
    'SAHABAT ABADI, CV': { code: 'SUP-SAHABAT', name: 'CV SAHABAT ABADI' },
    'KEISHA CHEMICLAS, CV': { code: 'SUP-KEISHA', name: 'CV KEISHA CHEMICLAS' },
    'RUKUN SEJAHTERA, CV': { code: 'SUP-RUKUN', name: 'CV RUKUN SEJAHTERA' },
    'PT GUWATIRTA SEJAHTERA': { code: 'SUP-GUWATIRTA', name: 'PT GUWATIRTA SEJAHTERA' },
};

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
                where: {
                    entryDate: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) }
                },
                orderBy: { entryNumber: 'desc' }
            });
            const nextVal = latest ? parseInt(latest.entryNumber.split('-').pop()!) + 1 : 1;
            await tx.systemSequence.create({
                data: { key, value: nextVal + 1 }
            });
            return `JE - ${year} -${nextVal.toString().padStart(5, '0')}`;
        }
        throw error;
    }
}

async function main() {
    console.log('=== AP Opening Balance Import ===\n');

    const csvPath = path.join(__dirname, '../docs/data-import/melindo-initial/ap-opening-detail-from-sheets.csv');
    const rows = parseCSV(fs.readFileSync(csvPath, 'utf-8'));
    console.log(`Read ${rows.length} rows from CSV`);

    // Verify accounts
    const apAccount = await prisma.account.findUnique({ where: { code: AP_ACCOUNT_CODE } });
    if (!apAccount) throw new Error(`AP Account ${AP_ACCOUNT_CODE} not found!`);

    let equityAccount = await prisma.account.findUnique({ where: { code: EQUITY_ACCOUNT_CODE } });
    if (!equityAccount) {
        equityAccount = await prisma.account.create({
            data: { code: EQUITY_ACCOUNT_CODE, name: 'Opening Balance Equity', type: AccountType.EQUITY, category: AccountCategory.CAPITAL }
        });
        console.log(`Created equity account: ${EQUITY_ACCOUNT_CODE}`);
    }
    console.log(`AP: ${apAccount.code} (${apAccount.id})`);
    console.log(`Equity: ${equityAccount.code} (${equityAccount.id})`);
    console.log(`User: ${USER_ID}\n`);

    // Create suppliers
    console.log('--- Suppliers ---');
    const supplierIds: Record<string, string> = {};
    for (const [sheetName, info] of Object.entries(SUPPLIER_MAP)) {
        let s = await prisma.supplier.findFirst({ where: { code: info.code } });
        if (!s) {
            s = await prisma.supplier.create({
                data: { code: info.code, name: info.name, isActive: true }
            });
            console.log(`  + ${info.code}: ${info.name}`);
        } else {
            console.log(`  = ${info.code}: ${info.name}`);
        }
        supplierIds[sheetName] = s.id;
    }

    // Check existing
    const existingPOs = await prisma.purchaseOrder.findMany({
        where: { orderNumber: { startsWith: 'PO-OPEN-' } },
        select: { orderNumber: true }
    });
    const existingSet = new Set(existingPOs.map(po => po.orderNumber));
    if (existingPOs.length > 0) {
        console.log(`\n⚠ ${existingPOs.length} existing PO-OPEN — will skip.`);
    }

    // Import
    console.log('\n--- Importing ---');
    let created = 0, skipped = 0, errors = 0;

    for (const row of rows) {
        const supplierName = row['nama_supplier'];
        const invoiceNumber = row['nomor_tagihan'];
        const amount = parseInt(row['nilai_hutang'], 10);
        const invoiceDate = parseDate(row['tanggal_tagihan']);
        const dueDate = parseDate(row['tanggal_jatuh_tempo']);
        const supplierId = supplierIds[supplierName];
        const poNumber = `PO-OPEN-${invoiceNumber}`;

        if (!supplierId) { console.log(`  ✗ Unknown: ${supplierName}`); errors++; continue; }
        if (existingSet.has(poNumber)) { skipped++; continue; }
        if (isNaN(amount) || amount <= 0) { console.log(`  ✗ Bad amount: ${invoiceNumber}`); errors++; continue; }

        try {
            await prisma.$transaction(async (tx) => {
                const po = await tx.purchaseOrder.create({
                    data: {
                        orderNumber: poNumber,
                        supplierId,
                        orderDate: invoiceDate,
                        status: PurchaseOrderStatus.RECEIVED,
                        totalAmount: amount,
                        notes: 'Opening Balance Entry',
                        createdById: USER_ID,
                    }
                });

                const pi = await tx.purchaseInvoice.create({
                    data: {
                        invoiceNumber,
                        purchaseOrderId: po.id,
                        invoiceDate,
                        dueDate,
                        status: PurchaseInvoiceStatus.UNPAID,
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
                        description: `Opening Balance AP - Inv #${invoiceNumber}`,
                        reference: invoiceNumber,
                        referenceType: ReferenceType.PURCHASE_INVOICE,
                        referenceId: pi.id,
                        isAutoGenerated: true,
                        status: JournalStatus.POSTED,
                        createdById: USER_ID,
                        approvedById: USER_ID,
                        lines: {
                            create: [
                                { accountId: equityAccount.id, debit: amount, credit: 0, description: 'Opening Equity Offset' },
                                { accountId: apAccount.id, debit: 0, credit: amount, description: 'Opening Balance Payable' },
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

    // Verify
    const totalSuppliers = await prisma.supplier.count();
    const totalPOs = await prisma.purchaseOrder.count({ where: { orderNumber: { startsWith: 'PO-OPEN-' } } });
    const totalPIs = await prisma.purchaseInvoice.count();
    const totalAP = await prisma.purchaseInvoice.aggregate({ _sum: { totalAmount: true } });
    const jlStats = await prisma.journalLine.aggregate({
        where: { journalEntry: { description: { contains: 'Opening Balance AP' }, status: JournalStatus.POSTED } },
        _sum: { debit: true, credit: true }
    });

    console.log(`\nDB Verify:`);
    console.log(`  Suppliers:    ${totalSuppliers}`);
    console.log(`  PO-OPEN:      ${totalPOs}`);
    console.log(`  PurchInvoice: ${totalPIs}`);
    console.log(`  Total AP:     Rp ${Number(totalAP._sum.totalAmount || 0).toLocaleString('id-ID')}`);
    const dr = Number(jlStats._sum.debit || 0);
    const cr = Number(jlStats._sum.credit || 0);
    console.log(`  Jrnl Debit:   Rp ${dr.toLocaleString('id-ID')}`);
    console.log(`  Jrnl Credit:  Rp ${cr.toLocaleString('id-ID')}`);
    console.log(`  Balanced:     ${Math.abs(dr - cr) < 0.01 ? '✓' : '✗ diff ' + (dr - cr)}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
