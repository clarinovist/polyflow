/**
 * One-off backfill for G1
 * (docs/plan/2026-08-08-fix-routing-run-lifecycle-gaps.md §4.3).
 *
 * ProductionRun rows that got stuck DRAFT/RELEASED/IN_PROGRESS forever
 * because all their orders finished as a mix of COMPLETED + CANCELLED — a
 * combination `syncProductionRunStatusFromOrders` didn't recognize as
 * terminal before the G1 fix in
 * src/services/production/routing-execution-guard.ts. The sync only runs
 * when an order's status changes, so runs that got stuck before the fix
 * shipped will not self-heal; this script backfills them once.
 *
 * Run: npx tsx scripts/patch-stuck-routing-runs.ts --preview
 *      npx tsx scripts/patch-stuck-routing-runs.ts --apply --confirm
 *
 * Decision rule is IDENTICAL to the live G1 fix because both import the same
 * module: src/lib/production/routing-run-terminal.ts (unit test at
 * src/lib/production/__tests__/routing-run-terminal.test.ts). There is only
 * one copy of the branching, so this script and syncProductionRunStatusFromOrders
 * cannot drift apart. Do not re-derive it here; change it there:
 *   - all orders CANCELLED               -> run CANCELLED
 *   - all orders terminal, >=1 COMPLETED -> run COMPLETED,
 *     actualEndDate = max(order.actualEndDate), or "now" if none of the
 *     orders ever recorded one (mirrors the `?? new Date()` fallback in
 *     syncProductionRunStatusFromOrders — a COMPLETED run is never left
 *     without an end date).
 *   - anything else (still genuinely in progress, or no orders) -> untouched
 *
 * Multi-tenant (see AGENTS.md § Operasi Produksi): this connects to whatever
 * DATABASE_URL is set in the environment it runs in — ONE tenant database
 * per invocation. It does NOT iterate multiple databases itself; run it
 * again per tenant. The target host/database name is printed (never
 * credentials) so you can confirm which tenant you're about to touch before
 * using --apply --confirm. Do not hardcode a database name or host here.
 *
 * --apply requires --confirm to write; otherwise it exits with code 1.
 * --preview (the default) never writes and prints affected-run counts per
 * resulting status, plus the run numbers, for verification before/after
 * deploy (see plan §4.3's verification query and §7's deploy notes).
 */

import { PrismaClient } from '@prisma/client';
import {
    decideRunTerminalPatch,
    type OrderTerminalSnapshot,
} from '@/lib/production/routing-run-terminal';

const prisma = new PrismaClient();

const PREVIEW_LIST_LIMIT = 50;

/**
 * Parse DATABASE_URL to extract host and database name.
 * Never returns user or password. Deliberately not shared with
 * scripts/seed-production-processes.ts so the two scripts stay independent.
 */
function parseDatabaseTarget(): { host: string; database: string } {
    const url = process.env.DATABASE_URL ?? '';
    try {
        const parsed = new URL(url);
        return {
            host: parsed.hostname,
            database: parsed.pathname.replace(/^\//, ''),
        };
    } catch {
        return { host: '(unknown)', database: '(unknown)' };
    }
}

function printRunList(label: string, rows: Array<{ runNumber: string }>) {
    if (rows.length === 0) return;
    console.log(`\n${label}:`);
    console.log(
        rows
            .slice(0, PREVIEW_LIST_LIMIT)
            .map((r) => `  ${r.runNumber}`)
            .join('\n'),
    );
    if (rows.length > PREVIEW_LIST_LIMIT) {
        console.log(`  ... and ${rows.length - PREVIEW_LIST_LIMIT} more`);
    }
}

async function main() {
    const args = process.argv.slice(2);
    const apply = args.includes('--apply');
    const confirm = args.includes('--confirm');
    const preview = !apply;

    if (apply && !confirm) {
        console.error(
            'ERROR: --apply requires --confirm. Run with --apply --confirm to write to the database.',
        );
        console.error(
            'Example: npx tsx scripts/patch-stuck-routing-runs.ts --apply --confirm',
        );
        process.exit(1);
    }

    const target = parseDatabaseTarget();
    console.log(`Target: ${target.host} / ${target.database}`);
    console.log(
        `Mode: ${preview ? 'PREVIEW (no write)' : 'APPLY (writing changes)'}`,
    );
    console.log(
        'Reminder: this connects to ONE tenant database (whatever DATABASE_URL points to in this environment). Run it again per tenant.\n',
    );

    // Candidate runs = not already terminal. Orders are fetched so the
    // decision is made in JS with decideRunTerminalPatch — the exact same
    // logic the live G1 fix uses — rather than re-deriving `bool_and` + max()
    // as raw SQL here (see plan §4.3 for the equivalent preview query).
    const candidates = await prisma.productionRun.findMany({
        where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
        select: {
            id: true,
            runNumber: true,
            status: true,
            orders: { select: { status: true, actualEndDate: true } },
        },
    });

    console.log(`Non-terminal runs scanned: ${candidates.length}`);

    const toCancel: Array<{ id: string; runNumber: string }> = [];
    const toComplete: Array<{
        id: string;
        runNumber: string;
        actualEndDate: Date | null;
    }> = [];

    for (const run of candidates) {
        const decision = decideRunTerminalPatch(
            run.orders as OrderTerminalSnapshot[],
        );
        if (decision.kind === 'CANCELLED') {
            toCancel.push({ id: run.id, runNumber: run.runNumber });
        } else if (decision.kind === 'COMPLETED') {
            toComplete.push({
                id: run.id,
                runNumber: run.runNumber,
                actualEndDate: decision.actualEndDate,
            });
        }
        // NO_OP: still genuinely in progress, or has no orders — leave alone.
    }

    const untouched = candidates.length - toCancel.length - toComplete.length;

    console.log('\n── Affected runs per resulting status (preview count) ──');
    console.log(`  -> CANCELLED: ${toCancel.length}`);
    console.log(`  -> COMPLETED: ${toComplete.length}`);
    console.log(
        `  (left alone, still legitimately non-terminal: ${untouched})`,
    );

    if (preview) {
        printRunList('Runs that would become CANCELLED', toCancel);
        printRunList('Runs that would become COMPLETED', toComplete);
    }

    let cancelledCount = 0;
    let completedCount = 0;

    if (!preview) {
        for (const r of toCancel) {
            await prisma.productionRun.update({
                where: { id: r.id },
                data: { status: 'CANCELLED' },
            });
            cancelledCount++;
        }
        for (const r of toComplete) {
            await prisma.productionRun.update({
                where: { id: r.id },
                data: {
                    status: 'COMPLETED',
                    // Mirror syncProductionRunStatusFromOrders's
                    // `latestEnd ?? opts?.completedAt ?? new Date()` fallback: a
                    // COMPLETED run is never left without an actualEndDate.
                    actualEndDate: r.actualEndDate ?? new Date(),
                },
            });
            completedCount++;
        }
    }

    console.log('\n── Summary ──');
    console.log(`Database: ${target.host} / ${target.database}`);
    console.log(`Mode: ${preview ? 'PREVIEW' : 'APPLY'}`);
    console.log(`Runs patched to CANCELLED: ${cancelledCount}`);
    console.log(`Runs patched to COMPLETED: ${completedCount}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
