/* eslint-disable no-console */
/**
 * One-shot recovery: record ad-hoc pelembab usage for WO-MROCE59ERPMRX2 (Kiyowo).
 *
 * Context:
 * - Pelembab was transferred RM→FG then returned FG→RM (net 0 transfer).
 * - Never issued to the WO / never hit HPP.
 * - Stock now sits in Raw Material Warehouse — issue from RM (not FG).
 *
 * Usage (on VPS inside polyflow-app):
 *   node scripts/repair/recover-wo-pelembab-adhoc.js --dry-run
 *   node scripts/repair/recover-wo-pelembab-adhoc.js --execute --yes
 */
const { PrismaClient, MovementType, JournalStatus, ReferenceType } = require('@prisma/client');

const prisma = new PrismaClient();

const ORDER_NUMBER = 'WO-MROCE59ERPMRX2';
const PELEMBAB_VARIANT_ID = '4b88c5d3-24ea-45c3-90db-c19715eb600e';
const QTY = 4.5;
const REQUEST_ID = 'RECOVERY-PELEMBAB-MROCE59ERPMRX2-20260717';
const REF = `PROD-ISSUE-${ORDER_NUMBER} REQ:${REQUEST_ID}`;

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  const execute = args.has('--execute') || args.has('--apply');
  const yes = args.has('--yes') || args.has('--confirm');
  return {
    execute: execute && yes,
    dryRun: !(execute && yes),
  };
}

function n(v) {
  return Number(v || 0);
}

async function nextEntryNumber(tx) {
  const year = new Date().getFullYear();
  const prefix = `JE - ${year} -`;
  const last = await tx.journalEntry.findFirst({
    where: { entryNumber: { startsWith: prefix } },
    orderBy: { entryNumber: 'desc' },
    select: { entryNumber: true },
  });
  let seq = 1;
  if (last?.entryNumber) {
    const m = last.entryNumber.match(/(\d+)\s*$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(seq).padStart(5, '0')}`;
}

async function main() {
  const { dryRun, execute } = parseArgs(process.argv);
  console.log('=== recover-wo-pelembab-adhoc ===');
  console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'EXECUTE'}`);
  console.log(`Order: ${ORDER_NUMBER} | Pelembab qty: ${QTY}`);
  console.log(`Reference: ${REF}`);

  const existingMovement = await prisma.stockMovement.findFirst({
    where: { reference: { contains: `REQ:${REQUEST_ID}` } },
  });
  if (existingMovement) {
    console.log('Already recovered (movement exists). Aborting.');
    console.log(existingMovement.id, existingMovement.reference);
    return;
  }

  const order = await prisma.productionOrder.findFirst({
    where: { orderNumber: ORDER_NUMBER },
    include: { plannedMaterials: true },
  });
  if (!order) throw new Error(`Order ${ORDER_NUMBER} not found`);
  if (!['RELEASED', 'IN_PROGRESS'].includes(order.status)) {
    throw new Error(`Order status ${order.status} not allowed for issue`);
  }

  const pelembab = await prisma.productVariant.findUnique({
    where: { id: PELEMBAB_VARIANT_ID },
    include: { product: true },
  });
  if (!pelembab) throw new Error('Pelembab variant not found');

  const rmLoc = await prisma.location.findUnique({ where: { slug: 'rm_warehouse' } });
  if (!rmLoc) throw new Error('rm_warehouse not found');

  const inv = await prisma.inventory.findUnique({
    where: {
      locationId_productVariantId: {
        locationId: rmLoc.id,
        productVariantId: PELEMBAB_VARIANT_ID,
      },
    },
  });
  const available = n(inv?.quantity);
  const unitCost = n(inv?.averageCost) || n(pelembab.standardCost) || n(pelembab.buyPrice) || 0;
  const totalAmount = QTY * unitCost;

  console.log('Order id:', order.id, 'status:', order.status);
  console.log('RM location:', rmLoc.id, rmLoc.name);
  console.log('RM pelembab stock:', available, '| need:', QTY);
  console.log('Unit cost:', unitCost, '| total:', totalAmount);
  console.log('Inv account:', pelembab.product.inventoryAccountId);
  console.log('WIP account:', pelembab.product.wipAccountId);

  if (available + 1e-9 < QTY) {
    throw new Error(`Insufficient pelembab at RM: have ${available}, need ${QTY}`);
  }
  if (!pelembab.product.inventoryAccountId || !pelembab.product.wipAccountId) {
    throw new Error('Pelembab product missing inventoryAccountId or wipAccountId');
  }
  if (totalAmount <= 0) {
    throw new Error(`Invalid totalAmount ${totalAmount}`);
  }

  const existingPlan = order.plannedMaterials.find(
    (pm) => pm.productVariantId === PELEMBAB_VARIANT_ID
  );
  console.log('Existing pelembab plan:', existingPlan ? n(existingPlan.quantity) : '(none)');

  if (dryRun) {
    console.log('DRY-RUN complete. Re-run with --execute --yes to apply.');
    return;
  }

  if (!execute) {
    throw new Error('Refuse to execute without --execute --yes');
  }

  const result = await prisma.$transaction(async (tx) => {
    // re-check idempotency inside tx
    const again = await tx.stockMovement.findFirst({
      where: { reference: { contains: `REQ:${REQUEST_ID}` } },
    });
    if (again) {
      return { skipped: true, movementId: again.id };
    }

    const locked = await tx.inventory.findUnique({
      where: {
        locationId_productVariantId: {
          locationId: rmLoc.id,
          productVariantId: PELEMBAB_VARIANT_ID,
        },
      },
    });
    if (!locked || n(locked.quantity) + 1e-9 < QTY) {
      throw new Error(`Insufficient stock under lock: ${n(locked?.quantity)}`);
    }

    await tx.inventory.update({
      where: {
        locationId_productVariantId: {
          locationId: rmLoc.id,
          productVariantId: PELEMBAB_VARIANT_ID,
        },
      },
      data: { quantity: { decrement: QTY } },
    });

    const movement = await tx.stockMovement.create({
      data: {
        type: MovementType.OUT,
        productVariantId: PELEMBAB_VARIANT_ID,
        fromLocationId: rmLoc.id,
        toLocationId: null,
        quantity: QTY,
        cost: unitCost,
        reference: REF,
        productionOrderId: order.id,
      },
    });

    const issue = await tx.materialIssue.create({
      data: {
        productionOrderId: order.id,
        productVariantId: PELEMBAB_VARIANT_ID,
        quantity: QTY,
        locationId: rmLoc.id,
        status: 'ISSUED',
      },
    });

    const issues = await tx.materialIssue.findMany({
      where: {
        productionOrderId: order.id,
        productVariantId: PELEMBAB_VARIANT_ID,
        status: { not: 'VOIDED' },
      },
      select: { quantity: true },
    });
    const totalIssued = issues.reduce((s, mi) => s + n(mi.quantity), 0);

    let planId;
    if (existingPlan) {
      const newPlanQty = Math.max(n(existingPlan.quantity), totalIssued);
      await tx.productionMaterial.update({
        where: { id: existingPlan.id },
        data: { quantity: newPlanQty },
      });
      planId = existingPlan.id;
    } else {
      const created = await tx.productionMaterial.create({
        data: {
          productionOrderId: order.id,
          productVariantId: PELEMBAB_VARIANT_ID,
          quantity: totalIssued,
        },
      });
      planId = created.id;
    }

    // GL: Dr WIP, Cr Raw Materials (same as inventory-link OUT production)
    const entryNumber = await nextEntryNumber(tx);
    const journal = await tx.journalEntry.create({
      data: {
        entryNumber,
        entryDate: new Date(),
        description: `Production Issue: ${pelembab.name} (recovery ${ORDER_NUMBER})`,
        reference: REF,
        referenceType: ReferenceType.MATERIAL_ISSUE,
        referenceId: issue.id,
        status: JournalStatus.POSTED,
        isAutoGenerated: true,
        lines: {
          create: [
            {
              accountId: pelembab.product.wipAccountId,
              debit: totalAmount,
              credit: 0,
              description: `Production Issue: ${pelembab.name}`,
            },
            {
              accountId: pelembab.product.inventoryAccountId,
              debit: 0,
              credit: totalAmount,
              description: 'Material Consumed',
            },
          ],
        },
      },
      include: { lines: true },
    });

    return {
      skipped: false,
      movementId: movement.id,
      issueId: issue.id,
      planId,
      journalId: journal.id,
      entryNumber: journal.entryNumber,
      totalIssued,
      totalAmount,
    };
  });

  console.log('RESULT:', JSON.stringify(result, null, 2));

  // Post-verify
  const invAfter = await prisma.inventory.findUnique({
    where: {
      locationId_productVariantId: {
        locationId: rmLoc.id,
        productVariantId: PELEMBAB_VARIANT_ID,
      },
    },
  });
  const issuesAfter = await prisma.materialIssue.findMany({
    where: {
      productionOrderId: order.id,
      productVariantId: PELEMBAB_VARIANT_ID,
    },
  });
  const planAfter = await prisma.productionMaterial.findMany({
    where: { productionOrderId: order.id },
    include: { productVariant: { select: { name: true } } },
  });

  console.log('RM pelembab after:', n(invAfter?.quantity));
  console.log('Pelembab issues:', issuesAfter.map((i) => ({ id: i.id, qty: n(i.quantity) })));
  console.log(
    'Plan materials:',
    planAfter.map((p) => ({ name: p.productVariant.name, qty: n(p.quantity) }))
  );
  console.log('DONE');
}

main()
  .catch((err) => {
    console.error('FATAL:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
