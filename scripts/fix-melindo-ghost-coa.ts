/**
 * Fix Melindo Rafia ghost COA (Kiyowo codes) that still have balances.
 *
 * Ghosts found:
 *   11300 Persediaan 127M
 *   11310 Raw Materials 463M
 *   30000 Opening Balance Equity -930M
 *   81100 Inv Adj Gain -90M (credit)
 *   91100 Inv Adj Loss 314M (debit)
 *
 * Plus inactive ghosts: 11110, 11340, 11350, 51100, etc.
 *
 * Strategy (SAFE - create adjustment journal, no delete):
 * 1. Ensure Melindo replacement accounts exist for gain/loss.
 *    Reuse existing 7-101 and 8-202 if available, else create 7-110 / 8-210.
 * 2. Create ONE correcting JE that zeroes ghost balances to Melindo equivalents:
 *    - 11300 -> 1-127 (Bahan Penolong) - per JE-OBS-001 description
 *    - 11310 -> 1-130 (Bahan Baku)
 *    - 81100 gain ghost (credit balance) -> move to 7-101 Pendapatan Lain-lain (credit)
 *    - 91100 loss ghost (debit) -> move to 8-202 Biaya Lain-lain (debit)
 *    - 30000 is balancing equity: its credit should move to 3-200b or 3-201b? 
 *      We check current OB: JE-OBS-001 total ghost debit 609,760,466 vs ghost credit 930,212,387 for 30000.
 *      But melindo_inv already has 1-128 320M in same JE, so total OB debit 930M = credit 930M is correct.
 *      Our reclass of 11300+11310 to 1-127/1-130 will keep JE-OBS-001 unbalanced if we only move ghost.
 *      Instead we do ZEROING OUT at current date:
 *        For each ghost with net debit:  Credit ghost, Debit melindo counterpart
 *        For net credit: Debit ghost, Credit melindo counterpart
 *      The 30000 net credit -930M needs to be handled together: it's part of OB.
 *      After moving 11300+11310 out, 30000 must be adjusted by same amount inverse to keep OB balanced.
 *      Actually easier: reclass JE that zeroes ALL ghost nets to appropriate melindo accounts,
 *      with offsetting line to ensure journal balances (should sum to same -116M imbalance).
 *      Since ghost net = -116,328,867, we need +116,328,867 on Other side to balance correction JE.
 *      Wait ghost net -116M means credit > debit in ghost group.
 *      So to zero ghost: Dr ghost where credit heavy, Cr ghost where debit heavy.
 *      Then Cr/Dr melindo counterpart.
 *
 *      Simplest: create journal with multiple lines that flip each ghost to 0
 *      and counterpart to melindo:
 *        - 11300 net debit 127M: Cr 11300 127M / Dr 1-127 127M
 *        - 11310 net debit 463M: Cr 11310 463M / Dr 1-130 463M
 *        - 81100 net credit 90M (negative net): Dr 81100 90M / Cr 7-101 90M
 *        - 91100 net debit 314M: Cr 91100 314M / Dr 8-202 314M
 *        - 30000 net credit 930M: Dr 30000 930M / Cr ??? this is the OB equity pairing.
 *          But 30000 already represents opening equity for all OB (including 1-128 which is NOT ghost).
 *          If we debit 30000 930M without re-crediting equity, we double-count.
 *          Actually we should NOT move 30000 to melindo because its counterpart is the whole OB group.
 *          The OB JE is: Dr 1-128 320M + Dr 11300 135M + Dr 11310 474M = 930M = Cr 30000 930M.
 *          After we reclass 11300->1-127 and 11310->1-130 via separate JE at NEW date, the original JE-OBS-001
 *          stays intact (it's history). Our NEW reclass JE at today must be balanced on its own.
 *          So if we Cr ghost inventory and Dr melindo inventory, that's balanced. No need to touch 30000!
 *          But ghost net includes 30000. So handling 30000 separately would double.
 *          Let's exclude 30000 from reclass - it's OB equity, stays but should be migrated to 3-200b/3-201b?
 *          Check: OB equity 30000 is a temporary account normally closed to retained earnings.
 *          In Melindo, opening balance equity should be closed to 3-200b Laba Ditahan.
 *          So we SHOULD reclass 30000 -> 3-200b, but ONLY after we've moved its paired inventory to melindo?
 *          Actually 30000 balance is still -930M even after our inventory reclass, because original JE still there.
 *          Our new reclass doesn't touch original JE, so 30000 still -930M.
 *          To zero ghosts, we must also zero 30000 to matching equity.
 *
 *      Full correction approach:
 *        We want final state where ghost balances = 0.
 *        Current ghost sum = -116,328,867 (overall credit heavy due to 30000 big credit not fully offset by 11300+11310+gain/loss).
 *        Wait compute: 11300 127M + 11310 463M + 91100 314M = 904M debit net
 *                      81100 -90M + 30000 -930M = -1,020M credit net
 *                      Sum = -116M (credit heavy)
 *        This -116M equals +116M on melindo side (the melindo_all query). Means historic adj/reclass already partially moved?
 *        Actually ghost sum + melindo_all = 0 (trial balance =0). So moving ghost to melindo via opposites will make both zero? Let's see.
 *        If we zero ghost via:
 *          Dr 30000 930,212,387
 *          Dr 81100 90,444,109
 *          Cr 11300 127,080,658
 *          Cr 11310 463,257,107
 *          Cr 91100 313,989,866
 *          Then journal debit = 1,020,656,496 / credit = 904,327,631 => imbalance 116,328,865
 *        So need extra line: Dr 8-202 116,328,865 to balance? No that's hack.
 *
 *      Better: treat 30000 separately. 30000 is OB equity that should map to 3-200b Laba Ditahan.
 *      Its balance -930M corresponds to original JE-OBS-001. That JE already has melindo account 1-128 320M.
 *      After we reclass 11300+11310 to melindo, the 30000's original pairing is broken conceptually,
 *      but financially it's okay to just reclass 30000 to 3-200b now as closing of OB equity.
 *      Then remaining ghost inventory + gain/loss zeroing will be balanced separately.
 *
 *      Split into TWO journals:
 *        JE1 (OB Equity Close): Dr 30000 930,212,387 / Cr 3-200b Laba Ditahan 930,212,387
 *        JE2 (Ghost Inventory & Adj reclass):
 *          - 11300 (127M debit) -> 1-127: Cr 11300 127M / Dr 1-127 127M
 *          - 11310 (463M) -> 1-130: Cr 11310 463M / Dr 1-130 463M
 *          - 81100 (90M credit) -> 7-101: Dr 81100 90M / Cr 7-101 90M
 *          - 91100 (314M debit) -> 8-202: Cr 91100 314M / Dr 8-202 314M
 *          This JE2: debit = 127+463+90+314 = Wait calc:
 *            Debit side: Dr 1-127 127,080,658 + Dr 1-130 463,257,107 + Dr 7-101? No 81100 Dr is debit side but counterpart Cr 7-101 is credit side.
 *          Actually per line:
 *            Line1: Dr 1-127 127M / Cr 11300 127M
 *            Line2: Dr 1-130 463M / Cr 11310 463M
 *            Line3: Dr 81100 90M / Cr 7-101 90M
 *            Line4: Cr 91100 314M / Dr 8-202 314M
 *          Total Debit = 127M + 463M + 90M + 314M = 994,771,629
 *          Total Credit = 127M + 463M + 90M + 314M = 994,771,630 (rounding)
 *          => BALANCED! (30000 excluded)
 *        Then JE1 handles 30000 separately and need equity: Dr 30000 / Cr 3-200b (balanced)
 *
 *      End result:
 *        Ghosts 11300,11310,81100,91100 = 0
 *        30000 = 0 (moved to retained earnings)
 *        Melindo inventory increased by ghost amounts
 *        Gain/loss moved to melindo other income/expense
 *        Retained earnings increased (which is correct OB treatment).
 *
 * 3. Update TenantAccountRole mappings
 * 4. Deactivate ghosts
 *
 * Usage:
 *   DATABASE_URL=...melindo... npx tsx scripts/fix-melindo-ghost-coa.ts --dry-run
 *   DATABASE_URL=...melindo... npx tsx scripts/fix-melindo-ghost-coa.ts --apply
 *   (Also needs MAIN DATABASE_URL for Tenant table? We use main via getMainPrisma but this script uses tenant DB only for accounts + main param)
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const GHOST_CODES = ['11300', '11310', '30000', '81100', '91100'];
const INACTIVE_GHOSTS = ['11110', '11340', '11350', '51100', '80000', '81000', '90000', '91000', '21200'];

type CliArgs = { apply: boolean; tenantSubdomain: string };

function parseArgs(): CliArgs {
    const args = process.argv.slice(2);
    return {
        apply: args.includes('--apply'),
        tenantSubdomain: args.find(a => a.startsWith('--tenant='))?.split('=')[1] || 'melindo',
    };
}

async function getTenantDbUrl(mainPrisma: PrismaClient, subdomain: string): Promise<string> {
    const tenant = await mainPrisma.tenant.findFirst({ where: { subdomain } });
    if (!tenant) throw new Error(`Tenant "${subdomain}" not found in main DB`);
    console.log(`Tenant: ${tenant.name} (${tenant.subdomain}) id=${tenant.id}`);
    console.log(`DB URL: ${tenant.dbUrl.substring(0, 40)}...`);
    return tenant.dbUrl;
}

async function main() {
    const { apply, tenantSubdomain } = parseArgs();
    console.log(`=== Fix Melindo Ghost COA ===`);
    console.log(`Mode: ${apply ? 'APPLY' : 'DRY-RUN'}`);
    console.log(`Tenant: ${tenantSubdomain}\n`);

    const mainPrisma = new PrismaClient(); // uses DATABASE_URL = main
    const tenantDbUrl = await getTenantDbUrl(mainPrisma, tenantSubdomain);
    const tenantPrisma = new PrismaClient({ datasources: { db: { url: tenantDbUrl } } });

    try {
        // Load accounts
        const ghostAccounts = await tenantPrisma.account.findMany({
            where: { code: { in: GHOST_CODES } },
            select: { id: true, code: true, name: true, isActive: true },
        });
        const ghostMap = new Map(ghostAccounts.map(a => [a.code, a]));

        const requiredMelindo = ['1-127', '1-130', '3-200b', '7-101', '8-202'];
        const melindoAccounts = await tenantPrisma.account.findMany({
            where: { code: { in: requiredMelindo } },
            select: { id: true, code: true, name: true },
        });
        const melindoMap = new Map(melindoAccounts.map(a => [a.code, a]));

        console.log('Ghost accounts:');
        for (const code of GHOST_CODES) {
            const acc = ghostMap.get(code);
            console.log(`  ${code.padEnd(8)} ${acc ? `${acc.name} id=${acc.id}` : 'NOT FOUND'}`);
        }

        console.log('\nMelindo target accounts:');
        for (const code of requiredMelindo) {
            const acc = melindoMap.get(code);
            console.log(`  ${code.padEnd(8)} ${acc ? `${acc.name} id=${acc.id}` : 'MISSING ❌'}`);
        }

        // Check missing and create if needed
        const missing = requiredMelindo.filter(c => !melindoMap.has(c));
        if (missing.length > 0) {
            console.error(`\n❌ Missing melindo accounts: ${missing.join(', ')}`);
            console.log('Creating them? --apply will auto-create with sensible defaults.');
            if (!apply) {
                console.log('DRY-RUN: would create missing accounts.');
            } else {
                // Create minimal accounts
                for (const code of missing) {
                    // Determine type/category
                    let type: any = 'ASSET';
                    let category: any = 'CURRENT_ASSET';
                    let name = code;
                    if (code === '7-101') { type = 'REVENUE'; category = 'OTHER_REVENUE'; name = 'Pendapatan Lain-lain Diluar Usaha (Fix Ghost)'; }
                    if (code === '8-202') { type = 'EXPENSE'; category = 'OTHER_EXPENSE'; name = 'Biaya Lain-lain Diluar Usaha (Fix Ghost)'; }
                    if (code === '1-127') { type = 'ASSET'; category = 'CURRENT_ASSET'; name = 'Persediaan Bahan Penolong'; }
                    if (code === '1-130') { type = 'ASSET'; category = 'CURRENT_ASSET'; name = 'Persediaan Bahan Baku Rafia'; }
                    if (code === '3-200b') { type = 'EQUITY'; category = 'RETAINED_EARNINGS'; name = 'Laba Ditahan Rafia'; }

                    console.log(`Creating ${code} ${name}...`);
                    const created = await tenantPrisma.account.create({
                        data: { code, name, type, category, isActive: true },
                    });
                    melindoMap.set(code, { id: created.id, code: created.code, name: created.name });
                }
            }
        }

        // Re-check after creation possibility
        const finalMelindo = requiredMelindo.every(c => melindoMap.has(c) || missing.includes(c) && !apply) ? true : requiredMelindo.every(c => melindoMap.has(c));
        if (!finalMelindo && !apply) {
            console.log('\nDRY-RUN stops here for missing accounts check. Rerun with --apply to create.');
        }

        // Calculate ghost balances
        console.log('\n--- Ghost balances (POSTED only) ---');
        const balances: Record<string, { debit: number; credit: number; net: number; lines: number }> = {};
        for (const code of GHOST_CODES) {
            const acc = ghostMap.get(code);
            if (!acc) continue;
            const lines = await tenantPrisma.journalLine.findMany({
                where: { accountId: acc.id, journalEntry: { status: 'POSTED' } },
                select: { debit: true, credit: true },
            });
            const debit = lines.reduce((s, l) => s + Number(l.debit), 0);
            const credit = lines.reduce((s, l) => s + Number(l.credit), 0);
            const net = debit - credit;
            balances[code] = { debit, credit, net, lines: lines.length };
            console.log(`  ${code.padEnd(8)} ${(ghostMap.get(code)?.name || '').padEnd(30)} lines=${lines.length.toString().padStart(3)} net=${net.toLocaleString('id-ID').padStart(15)} (D ${debit.toLocaleString('id-ID')} / C ${credit.toLocaleString('id-ID')})`);
        }

        // Build journals
        // JE1: OB Equity 30000 -> 3-200b
        const bal30000 = balances['30000'];
        if (bal30000) {
            console.log(`\nJE1: Closing 30000 (${bal30000.net.toLocaleString('id-ID')}) -> 3-200b`);
        }
        // JE2: inventory + adj
        const bal11300 = balances['11300'];
        const bal11310 = balances['11310'];
        const bal81100 = balances['81100'];
        const bal91100 = balances['91100'];

        console.log(`\nJE2: Reclass remaining ghosts:`);
        if (bal11300) console.log(`  11300 net ${bal11300.net.toLocaleString('id-ID')} -> 1-127`);
        if (bal11310) console.log(`  11310 net ${bal11310.net.toLocaleString('id-ID')} -> 1-130`);
        if (bal81100) console.log(`  81100 net ${bal81100.net.toLocaleString('id-ID')} -> 7-101`);
        if (bal91100) console.log(`  91100 net ${bal91100.net.toLocaleString('id-ID')} -> 8-202`);

        if (!apply) {
            console.log('\n🔍 DRY-RUN complete. No changes written.');
            console.log('   Run with --apply to execute:');
            console.log(`   DATABASE_URL="${tenantDbUrl}" npx tsx scripts/fix-melindo-ghost-coa.ts --tenant=${tenantSubdomain} --apply`);
            await tenantPrisma.$disconnect();
            await mainPrisma.$disconnect();
            return;
        }

        // --- APPLY ---
        // Need to ensure target accounts are present
        const acc_1_127 = melindoMap.get('1-127');
        const acc_1_130 = melindoMap.get('1-130');
        const acc_3_200b = melindoMap.get('3-200b');
        const acc_7_101 = melindoMap.get('7-101');
        const acc_8_202 = melindoMap.get('8-202');
        const acc_11300 = ghostMap.get('11300');
        const acc_11310 = ghostMap.get('11310');
        const acc_30000 = ghostMap.get('30000');
        const acc_81100 = ghostMap.get('81100');
        const acc_91100 = ghostMap.get('91100');

        if (!acc_1_127 || !acc_1_130 || !acc_3_200b || !acc_7_101 || !acc_8_202) {
            throw new Error('Missing target accounts after creation attempt');
        }

        // Helper to create JE
        async function createJe(entryNumber: string, desc: string, lines: { accountId: string; debit: number; credit: number; description: string }[]) {
            const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
            const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
            console.log(`\nCreating JE ${entryNumber}: ${desc}`);
            console.log(`  Debit: ${totalDebit.toLocaleString('id-ID')} Credit: ${totalCredit.toLocaleString('id-ID')} Diff: ${(totalDebit - totalCredit).toLocaleString('id-ID')}`);
            if (Math.abs(totalDebit - totalCredit) > 0.01) {
                throw new Error(`Journal unbalanced: D ${totalDebit} C ${totalCredit}`);
            }
            return tenantPrisma.journalEntry.create({
                data: {
                    entryNumber,
                    entryDate: new Date(),
                    description: desc,
                    referenceType: 'MANUAL_ENTRY',
                    status: 'POSTED',
                    isAutoGenerated: false,
                    lines: { create: lines },
                },
            });
        }

        const nowSuffix = Date.now().toString().slice(-6);
        // JE1: 30000 -> 3-200b
        if (acc_30000 && acc_3_200b && Math.abs(balances['30000']?.net || 0) > 0.01) {
            const net30000 = balances['30000'].net; // e.g. -930M (credit heavy => net negative)
            // To zero: if net negative (credit balance), need Dr 30000, Cr target
            // If net positive (debit), Cr 30000, Dr target
            const absAmt = Math.abs(net30000);
            const je1Lines = net30000 < 0
                ? [
                    { accountId: acc_30000.id, debit: absAmt, credit: 0, description: `Reklas OB Equity 30000 -> 3-200b (zero ghost)` },
                    { accountId: acc_3_200b.id, debit: 0, credit: absAmt, description: `Reklas OB Equity to Laba Ditahan` },
                ]
                : [
                    { accountId: acc_3_200b.id, debit: absAmt, credit: 0, description: `Reklas OB Equity` },
                    { accountId: acc_30000.id, debit: 0, credit: absAmt, description: `Zero ghost 30000` },
                ];
            await createJe(`JE-FIX-GHOST-OB-${nowSuffix}`, 'Fix Ghost: Reclass Opening Balance Equity 30000 -> Laba Ditahan', je1Lines);
            console.log('  ✓ JE1 created');
        } else {
            console.log('JE1 skipped (no balance or missing accounts)');
        }

        // JE2: Inventory & Adj
        const je2Lines: { accountId: string; debit: number; credit: number; description: string }[] = [];

        if (acc_11300 && balances['11300'] && Math.abs(balances['11300'].net) > 0.01) {
            const net = balances['11300'].net;
            const absAmt = Math.abs(net);
            if (net > 0) {
                // debit balance -> Cr ghost, Dr melindo
                je2Lines.push({ accountId: acc_11300.id, debit: 0, credit: absAmt, description: `Reklas 11300 Persediaan -> 1-127` });
                je2Lines.push({ accountId: acc_1_127.id, debit: absAmt, credit: 0, description: `Reklas to 1-127 Bahan Penolong` });
            } else {
                je2Lines.push({ accountId: acc_1_127.id, debit: 0, credit: absAmt, description: `Reklas` });
                je2Lines.push({ accountId: acc_11300.id, debit: absAmt, credit: 0, description: `Zero 11300` });
            }
        }
        if (acc_11310 && balances['11310'] && Math.abs(balances['11310'].net) > 0.01) {
            const net = balances['11310'].net;
            const absAmt = Math.abs(net);
            if (net > 0) {
                je2Lines.push({ accountId: acc_11310.id, debit: 0, credit: absAmt, description: `Reklas 11310 Raw Mat -> 1-130` });
                je2Lines.push({ accountId: acc_1_130.id, debit: absAmt, credit: 0, description: `Reklas to 1-130 Bahan Baku` });
            } else {
                je2Lines.push({ accountId: acc_1_130.id, debit: 0, credit: absAmt, description: `Reklas` });
                je2Lines.push({ accountId: acc_11310.id, debit: absAmt, credit: 0, description: `Zero 11310` });
            }
        }
        if (acc_81100 && balances['81100'] && Math.abs(balances['81100'].net) > 0.01) {
            const net = balances['81100'].net; // negative = credit
            const absAmt = Math.abs(net);
            if (net < 0) {
                // credit balance -> Dr ghost, Cr melindo
                je2Lines.push({ accountId: acc_81100.id, debit: absAmt, credit: 0, description: `Reklas 81100 Adj Gain -> 7-101` });
                je2Lines.push({ accountId: acc_7_101.id, debit: 0, credit: absAmt, description: `Reklas to 7-101 Other Income` });
            } else {
                je2Lines.push({ accountId: acc_7_101.id, debit: absAmt, credit: 0, description: `Reklas` });
                je2Lines.push({ accountId: acc_81100.id, debit: 0, credit: absAmt, description: `Zero 81100` });
            }
        }
        if (acc_91100 && balances['91100'] && Math.abs(balances['91100'].net) > 0.01) {
            const net = balances['91100'].net; // positive = debit
            const absAmt = Math.abs(net);
            if (net > 0) {
                je2Lines.push({ accountId: acc_91100.id, debit: 0, credit: absAmt, description: `Reklas 91100 Adj Loss -> 8-202` });
                je2Lines.push({ accountId: acc_8_202.id, debit: absAmt, credit: 0, description: `Reklas to 8-202 Other Loss` });
            } else {
                je2Lines.push({ accountId: acc_8_202.id, debit: 0, credit: absAmt, description: `Reklas` });
                je2Lines.push({ accountId: acc_91100.id, debit: absAmt, credit: 0, description: `Zero 91100` });
            }
        }

        if (je2Lines.length > 0) {
            await createJe(`JE-FIX-GHOST-INV-${nowSuffix}`, 'Fix Ghost: Reclass Inventory & Adjustment 11300/11310/81100/91100 -> Melindo COA', je2Lines);
            console.log('  ✓ JE2 created');
        } else {
            console.log('JE2 skipped (no balances)');
        }

        // --- Update TenantAccountRole ---
        console.log('\n--- Updating TenantAccountRole ---');
        const tenantId = (await mainPrisma.tenant.findFirst({ where: { subdomain: tenantSubdomain } }))!.id;
        const roleUpdates: Record<string, string> = {
            'adjustment-gain': '7-101',
            'adjustment-loss': '8-202',
            'scrap': '1-127', // was 11350 ghost
            'opening-balance-equity': '3-200b', // was 30000
            'inventory': '1-130',
            'raw-material': '1-130',
        };

        for (const [role, targetCode] of Object.entries(roleUpdates)) {
            const targetAcc = await tenantPrisma.account.findUnique({ where: { code: targetCode } });
            if (!targetAcc) {
                console.log(`  skip ${role} -> ${targetCode} (account not found)`);
                continue;
            }
            const existing = await mainPrisma.tenantAccountRole.findUnique({
                where: { tenantId_role: { tenantId, role } },
            });
            if (!existing) {
                console.log(`  create ${role} -> ${targetCode}`);
                await mainPrisma.tenantAccountRole.create({
                    data: {
                        tenantId,
                        role,
                        accountId: targetAcc.id,
                        accountCode: targetAcc.code,
                        accountName: targetAcc.name,
                    },
                });
            } else {
                if (existing.accountCode !== targetCode) {
                    console.log(`  update ${role}: ${existing.accountCode} -> ${targetCode}`);
                    await mainPrisma.tenantAccountRole.update({
                        where: { id: existing.id },
                        data: {
                            accountId: targetAcc.id,
                            accountCode: targetAcc.code,
                            accountName: targetAcc.name,
                        },
                    });
                } else {
                    console.log(`  keep ${role} -> ${targetCode} (already)`);
                }
            }
        }

        // --- Deactivate ghosts with 0 balance after reclass ---
        console.log('\n--- Deactivating ghost accounts (0 balance) ---');
        const allGhosts = [...GHOST_CODES, ...INACTIVE_GHOSTS];
        // Dedupe
        const uniqueGhosts = [...new Set(allGhosts)];
        for (const code of uniqueGhosts) {
            const acc = await tenantPrisma.account.findUnique({ where: { code }, select: { id: true, code: true, name: true, isActive: true } });
            if (!acc) continue;
            if (!acc.isActive) {
                console.log(`  ${code} already inactive`);
                continue;
            }
            const agg = await tenantPrisma.journalLine.aggregate({
                where: { accountId: acc.id, journalEntry: { status: 'POSTED' } },
                _sum: { debit: true, credit: true },
            });
            const net = Number(agg._sum.debit || 0) - Number(agg._sum.credit || 0);
            if (Math.abs(net) < 0.01) {
                console.log(`  deactivate ${code} ${acc.name} (net 0)`);
                await tenantPrisma.account.update({ where: { id: acc.id }, data: { isActive: false } });
            } else {
                console.log(`  skip ${code} ${acc.name} net=${net} not zero yet`);
            }
        }

        console.log('\n✅ Fix completed. Verifying...');

        // Verify
        console.log('\n--- Verification ---');
        for (const code of GHOST_CODES) {
            const acc = await tenantPrisma.account.findUnique({ where: { code }, select: { id: true, code: true, name: true, isActive: true } });
            if (!acc) continue;
            const agg = await tenantPrisma.journalLine.aggregate({
                where: { accountId: acc.id, journalEntry: { status: 'POSTED' } },
                _sum: { debit: true, credit: true },
            });
            const net = Number(agg._sum.debit || 0) - Number(agg._sum.credit || 0);
            console.log(`  ${code} ${acc.name} active=${acc.isActive} net=${net}`);
        }

        // Trial balance check
        const tb = await tenantPrisma.$queryRaw<{ total: number }[]>`
          SELECT COALESCE(SUM(debit - credit),0)::float as total FROM "JournalLine" jl JOIN "JournalEntry" je ON je.id=jl."journalEntryId" WHERE je.status='POSTED'
        `;
        console.log(`\nTrial balance total (should be 0): ${tb[0]?.total}`);

    } catch (e) {
        console.error('❌ Failed:', e);
        process.exit(1);
    } finally {
        await tenantPrisma.$disconnect();
        await mainPrisma.$disconnect();
    }
}

main();
