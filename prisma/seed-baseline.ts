import { PrismaClient, ProductType, Unit } from '@prisma/client'

const prisma = new PrismaClient()

async function ensureLocations() {
  const locations = [
    {
      name: 'Raw Material Warehouse',
      slug: 'rm_warehouse',
      description: 'Storage for incoming raw materials',
    },
    {
      name: 'Mixing Warehouse',
      slug: 'mixing_warehouse',
      description: 'Storage for the output of the Mixing process',
    },
    {
      name: 'Finished Goods Warehouse',
      slug: 'fg_warehouse',
      description: 'Storage for finished goods',
    },
    {
      name: 'Scrap Warehouse',
      slug: 'scrap_warehouse',
      description: 'Storage for waste/afval',
    },
  ]

  await prisma.location.createMany({ data: locations, skipDuplicates: true })
}

async function ensureSupplierAndCustomer() {
  // Use unique optional `code` to keep idempotent.
  await prisma.supplier.upsert({
    where: { code: 'SUP-DEFAULT' },
    update: {
      name: 'Default Supplier',
      phone: '0000000000',
      address: '—',
      isActive: true,
    },
    create: {
      code: 'SUP-DEFAULT',
      name: 'Default Supplier',
      phone: '0000000000',
      address: '—',
      isActive: true,
    },
  })

  await prisma.customer.upsert({
    where: { code: 'CUST-DEFAULT' },
    update: {
      name: 'Default Customer',
      phone: '0000000000',
      billingAddress: '—',
      isActive: true,
    },
    create: {
      code: 'CUST-DEFAULT',
      name: 'Default Customer',
      phone: '0000000000',
      billingAddress: '—',
      isActive: true,
    },
  })
}

async function ensureExampleProducts() {
  // Idempotent: key off unique SKU codes.
  const examples = [
    {
      productName: 'Raw Material Example (PP)',
      productType: ProductType.RAW_MATERIAL,
      variant: {
        name: 'PP Granules Example',
        skuCode: 'RM-EXAMPLE-PP',
        primaryUnit: Unit.KG,
        salesUnit: Unit.KG,
        conversionFactor: 1.0,
        attributes: { material: 'PP', note: 'Baseline seed example' },
      },
    },
    {
      productName: 'Finished Good Example',
      productType: ProductType.FINISHED_GOOD,
      variant: {
        name: 'Rafia Roll Example',
        skuCode: 'FG-EXAMPLE-ROLL',
        primaryUnit: Unit.KG,
        salesUnit: Unit.ROLL,
        conversionFactor: 1.0,
        attributes: { note: 'Baseline seed example' },
      },
    },
    {
      productName: 'Scrap Example',
      productType: ProductType.SCRAP,
      variant: {
        name: 'Scrap Example',
        skuCode: 'SCRAP-EXAMPLE',
        primaryUnit: Unit.KG,
        salesUnit: Unit.KG,
        conversionFactor: 1.0,
        attributes: { note: 'Baseline seed example' },
      },
    },
  ] as const

  for (const ex of examples) {
    const existing = await prisma.productVariant.findUnique({ where: { skuCode: ex.variant.skuCode } })
    if (existing) continue

    await prisma.product.create({
      data: {
        name: ex.productName,
        productType: ex.productType,
        variants: {
          create: {
            name: ex.variant.name,
            skuCode: ex.variant.skuCode,
            primaryUnit: ex.variant.primaryUnit,
            salesUnit: ex.variant.salesUnit,
            conversionFactor: ex.variant.conversionFactor,
            attributes: ex.variant.attributes as any,
          },
        },
      },
    })
  }
}

async function main() {
  console.log('Seeding baseline master data (SAFE, no deletes)...')

  await ensureLocations()
  await ensureSupplierAndCustomer()
  await ensureExampleProducts()

  const [locations, products, variants, suppliers, customers] = await Promise.all([
    prisma.location.count(),
    prisma.product.count(),
    prisma.productVariant.count(),
    prisma.supplier.count(),
    prisma.customer.count(),
  ])

  console.log('Baseline seed done:', { locations, products, variants, suppliers, customers })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
