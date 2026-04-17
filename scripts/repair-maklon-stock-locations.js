/* eslint-disable no-console */
const { PrismaClient, MovementType } = require('@prisma/client');

const prisma = new PrismaClient();

const MAKLON_STAGE_LOCATIONS = [
  {
    slug: 'maklon_raw_material',
    name: 'Maklon Raw Material Storage',
    description: 'Customer-owned raw materials received for maklon production',
    locationType: 'CUSTOMER_OWNED'
  },
  {
    slug: 'maklon_wip',
    name: 'Maklon WIP Storage',
    description: 'Intermediate WIP for maklon production',
    locationType: 'CUSTOMER_OWNED'
  },
  {
    slug: 'maklon_fg',
    name: 'Maklon Finished Goods Storage',
    description: 'Finished goods held for maklon orders',
    locationType: 'CUSTOMER_OWNED'
  },
  {
    slug: 'maklon_packing',
    name: 'Maklon Packing Area',
    description: 'Packing stage for maklon production',
    locationType: 'CUSTOMER_OWNED'
  }
];

const STAGE_SLUG_SET = new Set(MAKLON_STAGE_LOCATIONS.map((location) => location.slug));

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  const execute = args.has('--execute') || args.has('--apply');
  const yes = args.has('--yes') || args.has('--confirm');

  return {
    execute,
    yes,
    dryRun: args.has('--dry-run') || !execute || !yes
  };
}

function toNumber(value) {
  return Number(value || 0);
}

function formatQty(value) {
  const numeric = Number(value || 0);
  if (Number.isInteger(numeric)) {
    return String(numeric);
  }

  return numeric.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function resolveProductionDestinationSlug(category) {
  switch (category) {
    case 'MIXING':
      return 'maklon_wip';
    case 'EXTRUSION':
      return 'maklon_fg';
    case 'PACKING':
      return 'maklon_packing';
    case 'REWORK':
      return 'maklon_fg';
    default:
      return 'maklon_fg';
  }
}

function makeTaskKey(sourceLocationId, destinationLocationId, productVariantId) {
  return `${sourceLocationId}:${destinationLocationId}:${productVariantId}`;
}

async function ensureLocation(tx, location) {
  return tx.location.upsert({
    where: { slug: location.slug },
    update: {
      name: location.name,
      description: location.description,
      locationType: location.locationType
    },
    create: location
  });
}

async function resolveRepairUserId(tx) {
  if (process.env.REPAIR_USER_ID) {
    return process.env.REPAIR_USER_ID;
  }

  if (process.env.REPAIR_USER_EMAIL) {
    const user = await tx.user.findUnique({
      where: { email: process.env.REPAIR_USER_EMAIL },
      select: { id: true }
    });

    if (user?.id) {
      return user.id;
    }
  }

  const admin = await tx.user.findFirst({
    where: { role: 'ADMIN' },
    select: { id: true }
  });

  return admin?.id || null;
}

async function getCurrentQuantity(tx, locationId, productVariantId) {
  const inventory = await tx.inventory.findUnique({
    where: {
      locationId_productVariantId: {
        locationId,
        productVariantId
      }
    },
    select: { quantity: true }
  });

  return toNumber(inventory?.quantity);
}

async function transferStock(tx, params) {
  const { sourceLocationId, destinationLocationId, productVariantId, quantity, reference, createdById } = params;

  const currentQty = await getCurrentQuantity(tx, sourceLocationId, productVariantId);
  const moveQty = Math.min(currentQty, quantity);

  if (moveQty <= 0 || sourceLocationId === destinationLocationId) {
    return { movedQty: 0, currentQty };
  }

  const sourceInventory = await tx.inventory.findUnique({
    where: {
      locationId_productVariantId: {
        locationId: sourceLocationId,
        productVariantId
      }
    },
    select: { id: true }
  });

  if (!sourceInventory) {
    return { movedQty: 0, currentQty };
  }

  await tx.inventory.update({
    where: {
      locationId_productVariantId: {
        locationId: sourceLocationId,
        productVariantId
      }
    },
    data: {
      quantity: { decrement: moveQty }
    }
  });

  await tx.inventory.upsert({
    where: {
      locationId_productVariantId: {
        locationId: destinationLocationId,
        productVariantId
      }
    },
    update: {
      quantity: { increment: moveQty }
    },
    create: {
      locationId: destinationLocationId,
      productVariantId,
      quantity: moveQty
    }
  });

  await tx.stockMovement.create({
    data: {
      type: MovementType.TRANSFER,
      productVariantId,
      fromLocationId: sourceLocationId,
      toLocationId: destinationLocationId,
      quantity: moveQty,
      reference,
      createdById
    }
  });

  return { movedQty: moveQty, currentQty };
}

async function buildTasks(tx) {
  const targetLocations = await Promise.all(MAKLON_STAGE_LOCATIONS.map((location) => ensureLocation(tx, location)));
  const destinationBySlug = new Map(targetLocations.map((location) => [location.slug, location]));

  const tasks = new Map();

  const maklonReceipts = await tx.goodsReceipt.findMany({
    where: { isMaklon: true },
    include: {
      location: { select: { id: true, name: true, slug: true } },
      items: {
        include: {
          productVariant: { select: { id: true, skuCode: true, name: true } }
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  for (const receipt of maklonReceipts) {
    if (receipt.location?.slug && STAGE_SLUG_SET.has(receipt.location.slug)) {
      continue;
    }

    const destination = destinationBySlug.get('maklon_raw_material');

    for (const item of receipt.items) {
      const key = makeTaskKey(receipt.locationId, destination.id, item.productVariantId);
      const existing = tasks.get(key) || {
        sourceLocationId: receipt.locationId,
        sourceLocationName: receipt.location?.name || receipt.locationId,
        destinationLocationId: destination.id,
        destinationLocationName: destination.name,
        productVariantId: item.productVariantId,
        productVariantSku: item.productVariant.skuCode,
        productVariantName: item.productVariant.name,
        expectedQty: 0,
        reasons: []
      };

      existing.expectedQty += toNumber(item.receivedQty);
      existing.reasons.push(`GR ${receipt.receiptNumber}`);
      tasks.set(key, existing);
    }
  }

  const maklonOrders = await tx.productionOrder.findMany({
    where: { isMaklon: true },
    include: {
      location: { select: { id: true, name: true, slug: true } },
      bom: { select: { category: true, productVariantId: true } },
      executions: { select: { quantityProduced: true } }
    },
    orderBy: { createdAt: 'asc' }
  });

  for (const order of maklonOrders) {
    if (!order.bom?.productVariantId) {
      continue;
    }

    if (order.location?.slug && STAGE_SLUG_SET.has(order.location.slug)) {
      continue;
    }

    const destinationSlug = resolveProductionDestinationSlug(order.bom?.category);
    const destination = destinationBySlug.get(destinationSlug);

    const producedQtyFromExecutions = order.executions.reduce((sum, execution) => sum + toNumber(execution.quantityProduced), 0);
    const producedQty = toNumber(order.actualQuantity) > 0 ? toNumber(order.actualQuantity) : producedQtyFromExecutions;

    if (producedQty <= 0) {
      continue;
    }

    const key = makeTaskKey(order.locationId, destination.id, order.bom.productVariantId);
    const existing = tasks.get(key) || {
      sourceLocationId: order.locationId,
      sourceLocationName: order.location?.name || order.locationId,
      destinationLocationId: destination.id,
      destinationLocationName: destination.name,
      productVariantId: order.bom.productVariantId,
      productVariantSku: null,
      productVariantName: null,
      expectedQty: 0,
      reasons: []
    };

    existing.expectedQty += producedQty;
    existing.reasons.push(`WO ${order.orderNumber} (${order.bom.category || 'UNKNOWN'})`);
    tasks.set(key, existing);
  }

  return {
    tasks: Array.from(tasks.values()).sort((left, right) => {
      if (left.sourceLocationName === right.sourceLocationName) {
        return left.productVariantId.localeCompare(right.productVariantId);
      }

      return left.sourceLocationName.localeCompare(right.sourceLocationName);
    })
  };
}

async function printCurrentSnapshot(tx, tasks) {
  for (const task of tasks) {
    const currentQty = await getCurrentQuantity(tx, task.sourceLocationId, task.productVariantId);
    const moveQty = Math.min(currentQty, task.expectedQty);

    console.log(
      JSON.stringify(
        {
          source: task.sourceLocationName,
          destination: task.destinationLocationName,
          skuCode: task.productVariantSku,
          productVariantId: task.productVariantId,
          expectedQty: formatQty(task.expectedQty),
          currentQty: formatQty(currentQty),
          moveQty: formatQty(moveQty),
          reasons: task.reasons
        },
        null,
        2
      )
    );
  }
}

async function main() {
  const args = parseArgs(process.argv);

  console.log('Maklon stock repair start');
  console.log(`Mode: ${args.execute && args.yes ? 'EXECUTE' : 'DRY-RUN'}`);

  await prisma.$transaction(async (tx) => {
    const userId = await resolveRepairUserId(tx);
    const { tasks } = await buildTasks(tx);

    if (tasks.length === 0) {
      console.log('No maklon stock repair tasks found.');
      return;
    }

    console.log(`Planned repair tasks: ${tasks.length}`);
    await printCurrentSnapshot(tx, tasks);

    if (!args.execute || !args.yes) {
      console.log('Dry-run complete. Re-run with --execute --yes to apply the transfer movements.');
      return;
    }

    let movedTasks = 0;
    let movedQtyTotal = 0;

    for (const task of tasks) {
      const currentQty = await getCurrentQuantity(tx, task.sourceLocationId, task.productVariantId);
      const moveQty = Math.min(currentQty, task.expectedQty);

      if (moveQty <= 0) {
        continue;
      }

      const result = await transferStock(tx, {
        sourceLocationId: task.sourceLocationId,
        destinationLocationId: task.destinationLocationId,
        productVariantId: task.productVariantId,
        quantity: moveQty,
        reference: `Maklon repair: ${task.reasons.join(' | ')}`,
        createdById: userId
      });

      if (result.movedQty > 0) {
        movedTasks += 1;
        movedQtyTotal += result.movedQty;
        console.log(
          `Moved ${formatQty(result.movedQty)} of ${task.productVariantId} from ${task.sourceLocationName} to ${task.destinationLocationName}`
        );
      }
    }

    console.log(`Repair complete. Tasks moved: ${movedTasks}. Total qty moved: ${formatQty(movedQtyTotal)}.`);

    console.log('Verification snapshot after repair:');
    await printCurrentSnapshot(tx, tasks);
  });
}

main()
  .catch((error) => {
    console.error('Maklon stock repair failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });