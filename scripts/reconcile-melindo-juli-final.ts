/**
 * Reconcile melindo_rafia opening balance agar akhir Juli 2026 = sheet "Opening Polyflow 1 Agustus"
 * Sheet ID 1JQgTFgYo42t1FLQlNVGSxnYqibt7uYpr0oib_nuTCw4
 * Approach: delta adjustment per account per 2026-07-31
 * Jalankan di VPS: DATABASE_URL=... npx tsx scripts/reconcile-melindo-juli-final.ts --dry-run
 * Lalu --apply
 * ponytail: single JE adjustment only, idempotent via reference MELINDO-ADJ-20260731
 */
import { PrismaClient, JournalStatus, ReferenceType } from '@prisma/client';

const prisma = new PrismaClient();
type Delta = { code: string; sheetDBnet: number; currentDBnet: number; delta: number };
const AUDIT: Delta[] = [
  { code: '1-112', sheetDBnet: 44939774.6, currentDBnet: -151031666.9, delta: 195971441.5 },
  { code: '1-113', sheetDBnet: 13172933.38, currentDBnet: 13197140.9, delta: -24207.52 },
  { code: '1-114', sheetDBnet: 7472510.7, currentDBnet: -3877488.35, delta: 11349999.05 },
  { code: '1-115b', sheetDBnet: 105861550, currentDBnet: -266925150, delta: 372786700 },
  { code: '1-117', sheetDBnet: 18490000, currentDBnet: 24840000, delta: -6350000 },
  { code: '1-125', sheetDBnet: 34835337, currentDBnet: 51502003, delta: -16666666 },
  { code: '1-127', sheetDBnet: 2446017.33, currentDBnet: 130731089.36, delta: -128285072.03 },
  { code: '1-128', sheetDBnet: 294700170.14, currentDBnet: 747865229.45, delta: -453165059.31 },
  { code: '1-130', sheetDBnet: 339490393.95, currentDBnet: 1538594159.29, delta: -1199103765.34 },
  { code: '1-131', sheetDBnet: 138570988.9, currentDBnet: 128531335.54, delta: 10039653.36 },
  { code: '1-132', sheetDBnet: 46736227.54, currentDBnet: 153043174.46, delta: -106306946.92 },
  { code: '1-134', sheetDBnet: 4818250.55, currentDBnet: 4994322.62, delta: -176072.07 },
  { code: '1-213b', sheetDBnet: 2226648880, currentDBnet: 2201648880, delta: 25000000 },
  { code: '1-216b', sheetDBnet: -94769518.2, currentDBnet: -95501580.75, delta: 732062.55 },
  { code: '1-217b', sheetDBnet: -821605100.7, currentDBnet: -921353337.17, delta: 99748236.47 },
  { code: '1-219b', sheetDBnet: -81433423.4, currentDBnet: -84807798.4, delta: 3374375 },
  { code: '2-110b', sheetDBnet: -1477596374.02, currentDBnet: -1603057254.16, delta: 125460880.14 },
  { code: '2-112', sheetDBnet: 0, currentDBnet: -242184036, delta: 242184036 },
  { code: '2-120b', sheetDBnet: -680829830.27, currentDBnet: -667916028.48, delta: -12913801.79 },
  { code: '2-130b', sheetDBnet: 199137864.59, currentDBnet: 22120247.71, delta: 177017616.88 },
  { code: '2-140b', sheetDBnet: -24331870, currentDBnet: 0, delta: -24331870 },
  { code: '2-340', sheetDBnet: -50000000, currentDBnet: 0, delta: -50000000 },
  { code: '2-350', sheetDBnet: -50000000, currentDBnet: 0, delta: -50000000 },
  { code: '2-360', sheetDBnet: -50000000, currentDBnet: 0, delta: -50000000 },
  { code: '2-370', sheetDBnet: -50000000, currentDBnet: 0, delta: -50000000 },
  { code: '3-200b', sheetDBnet: -557356915.73, currentDBnet: -1093158109.7, delta: 535801193.97 },
  { code: '3-201b', sheetDBnet: -70829361.92, currentDBnet: -316894821.57, delta: 246065459.65 },
];
const REFERENCE = 'MELINDO-ADJ-20260731';
const ENTRY_DATE = new Date('2026-07-31T23:59:00.000Z');
const args = typeof process !== 'undefined' ? process.argv : [];
const DRY = args.includes('--dry-run');
const APPLY = args.includes('--apply');

async function main() {
  console.log(`Mode: ${DRY ? 'DRY-RUN' : APPLY ? 'APPLY' : 'DRY-RUN (default)'}`);
  console.log(`Reference: ${REFERENCE}, Date: ${ENTRY_DATE.toISOString()}`);
  const codes = AUDIT.map((d) => d.code);
  const accounts = await prisma.account.findMany({ where: { code: { in: codes } } });
  const map = new Map(accounts.map((a) => [a.code, a]));
  const missing = codes.filter((c) => !map.has(c));
  if (missing.length) {
    console.error(`Missing accounts: ${missing.join(', ')}`);
    process.exit(1);
  }
  const existing = await prisma.journalEntry.findFirst({ where: { reference: REFERENCE } });
  if (existing) {
    console.log(`Existing JE found: ${existing.entryNumber} id=${existing.id} status=${existing.status}`);
    if (DRY) {
      console.log('DRY: skip because JE exists');
      return;
    }
  }
  type Line = { accountId: string; code: string; debit: number; credit: number; description: string };
  const lines: Line[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  for (const d of AUDIT) {
    if (Math.abs(d.delta) < 0.5) continue;
    const acc = map.get(d.code)!;
    let debit = 0;
    let credit = 0;
    if (d.delta > 0) debit = d.delta;
    else credit = -d.delta;
    lines.push({
      accountId: acc.id,
      code: d.code,
      debit,
      credit,
      description: `Adj ${d.code}: ${d.currentDBnet.toFixed(2)} -> ${d.sheetDBnet.toFixed(2)} delta ${d.delta.toFixed(2)}`,
    });
    totalDebit += debit;
    totalCredit += credit;
  }
  const sumDelta = AUDIT.reduce((s, d) => s + d.delta, 0);
  console.log(`Sum(delta) = ${sumDelta.toFixed(2)}`);
  const openingEquity = await prisma.account.findFirst({ where: { code: '30000' } });
  if (!openingEquity) throw new Error('Account 30000 not found');
  if (Math.abs(totalDebit - totalCredit) > 0.5) {
    if (totalCredit > totalDebit) {
      const diff = totalCredit - totalDebit;
      lines.push({
        accountId: openingEquity.id,
        code: '30000',
        debit: diff,
        credit: 0,
        description: `Balancing offset Juli closing match sheet — prev unbalanced ${sumDelta.toFixed(2)}`,
      });
      totalDebit += diff;
    } else {
      const diff = totalDebit - totalCredit;
      lines.push({
        accountId: openingEquity.id,
        code: '30000',
        debit: 0,
        credit: diff,
        description: `Balancing offset Juli closing match sheet`,
      });
      totalCredit += diff;
    }
  }
  console.log(`Total lines: ${lines.length}, Debit ${totalDebit.toFixed(2)} Credit ${totalCredit.toFixed(2)} balanced=${Math.abs(totalDebit - totalCredit) < 0.01}`);
  console.table(
    lines.map((l) => ({ code: l.code, debit: l.debit.toFixed(2), credit: l.credit.toFixed(2), desc: l.description.slice(0, 80) })),
  );
  if (DRY || !APPLY) {
    console.log('DRY-RUN done. Run with --apply to post.');
    return;
  }
  const admin = await prisma.user.findUnique({ where: { email: 'admin@melindo.polyflow.uk' } });
  if (!admin) throw new Error('admin user not found');
  if (existing) {
    console.log(`Deleting existing JE ${existing.entryNumber}...`);
    await prisma.$transaction(async (tx) => {
      await tx.journalLine.deleteMany({ where: { journalEntryId: existing.id } });
      await tx.journalEntry.delete({ where: { id: existing.id } });
    });
  }
  const entryNumber = `JE-ADJ-${Date.now()}`;
  const created = await prisma.$transaction(async (tx) => {
    const je = await tx.journalEntry.create({
      data: {
        entryNumber,
        entryDate: ENTRY_DATE,
        description: `Opening Adj Closing Juli 2026 Final / Opening Agustus match Sheet 1JQgTFgYo (NR ${AUDIT.length} akun)`,
        reference: REFERENCE,
        referenceType: ReferenceType.MANUAL_ENTRY,
        status: JournalStatus.POSTED,
        createdById: admin.id,
      },
    });
    for (const l of lines) {
      await tx.journalLine.create({
        data: {
          journalEntryId: je.id,
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
          description: l.description,
        },
      });
    }
    return je;
  });
  console.log(`Created JE ${created.entryNumber} id=${created.id}`);
  // Use $queryRawUnsafe replacement to avoid template tag issues - use queryRaw with Prisma.sql not needed, just use find
  const balances = await prisma.$queryRaw<{ code: string; net: number }[]>`SELECT a.code, SUM(jl.debit - jl.credit)::float as net FROM "JournalLine" jl JOIN "Account" a ON jl."accountId"=a.id JOIN "JournalEntry" je ON jl."journalEntryId"=je.id WHERE je.status='POSTED' AND je."entryDate" <= '2026-07-31 23:59:59.999' GROUP BY a.code ORDER BY a.code`;
  console.log('Trial balance after per 31 Juli:');
  let total = 0;
  for (const b of balances) {
    total += b.net;
  }
  console.log(`Total net after: ${total.toFixed(2)} (should ~0)`);
}
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
