import { PrismaClient, ProductType, ContactType, Unit, Role, MovementType, MachineType, MachineStatus, BatchStatus, ReservationType, ReservationStatus, ProductionStatus, EmployeeStatus } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('Seeding database...')

    // 0. Cleanup
    await prisma.qualityInspection.deleteMany()
    await prisma.scrapRecord.deleteMany()
    await prisma.materialIssue.deleteMany()
    await prisma.productionShift.deleteMany() // Clean shifts before orders
    await prisma.productionOrder.deleteMany()
    await prisma.stockReservation.deleteMany()
    await prisma.stockOpnameItem.deleteMany()
    await prisma.stockOpname.deleteMany()
    await prisma.batch.deleteMany()
    await prisma.bomItem.deleteMany()
    await prisma.bom.deleteMany()
    await prisma.stockMovement.deleteMany()
    await prisma.inventory.deleteMany()
    await prisma.machine.deleteMany()
    await prisma.employee.deleteMany() // Clean employees
    await prisma.jobRole.deleteMany() // Clean job roles
    await prisma.productVariant.deleteMany()
    await prisma.product.deleteMany()
    await prisma.contact.deleteMany()
    await prisma.location.deleteMany()
    await prisma.user.deleteMany()

    // 0.5. Default Admin User
    console.log('Seeding users...')
    await prisma.user.create({
        data: {
            email: 'admin@polyflow.com',
            name: 'Admin PolyFlow',
            password: '$2b$10$1TAWXOzHiTqlZQp6RdqQAONldCEoq0UcPuv8wk1N63juj0cmvPGoq', // admin123
            role: Role.ADMIN,
        }
    })

    // 1. Locations (Factory Stages)
    const locations = [
        { name: 'Raw Material Warehouse', slug: 'rm_warehouse', description: 'Storage for incoming raw materials' },
        { name: 'Mixing Warehouse', slug: 'mixing_warehouse', description: 'Storage for the output of the Mixing process (Mixed/Compounded Material)' },
        // Extrusion output now goes to FG, so no separate Extrusion Warehouse.
        { name: 'Finished Goods Warehouse', slug: 'fg_warehouse', description: 'Hold Extrusion Output (Jumbo Rolls) and Packing Output (Small Packs)' },
        { name: 'Scrap Warehouse', slug: 'scrap_warehouse', description: 'Storage for waste/afval' },
    ]

    for (const loc of locations) {
        await prisma.location.create({ data: loc })
    }

    // 2. Contacts
    await prisma.contact.create({
        data: { name: 'Petrokem', type: ContactType.SUPPLIER, phone: '08123456789', address: 'Industrial Estate Block A' },
    })

    await prisma.contact.create({
        data: { name: 'Plastic Shop Jaya', type: ContactType.CUSTOMER, phone: '08987654321', address: 'Downtown Market' },
    })

    // 3. Products & Stocks (Full Production Cycle) - BLACK CHAIN (Recycle)

    // --- RAW MATERIALS (Recycle Base & Masterbatch) ---
    // 1. PP Karung Recycle
    const rmPPKarung = await prisma.product.create({
        data: {
            name: 'PP Karung Recycle',
            productType: ProductType.RAW_MATERIAL,
            variants: {
                create: {
                    name: 'PP Karung Recycle Standard',
                    skuCode: 'RM-PP-KARUNG',
                    price: 12000,
                    primaryUnit: Unit.KG,
                    salesUnit: Unit.KG,
                    conversionFactor: 1.0,
                    attributes: { color: 'Mixed', material: 'PP' },
                },
            },
        },
    })

    // 2. PP Sablon Recycle
    const rmPPSablon = await prisma.product.create({
        data: {
            name: 'PP Sablon Recycle',
            productType: ProductType.RAW_MATERIAL,
            variants: {
                create: {
                    name: 'PP Sablon Recycle Standard',
                    skuCode: 'RM-PP-SABLON',
                    price: 11000,
                    primaryUnit: Unit.KG,
                    salesUnit: Unit.KG,
                    conversionFactor: 1.0,
                    attributes: { color: 'Mixed', material: 'PP' },
                },
            },
        },
    })

    // 3. PP Green Recycle
    const rmPPGreen = await prisma.product.create({
        data: {
            name: 'PP Green Recycle',
            productType: ProductType.RAW_MATERIAL,
            variants: {
                create: {
                    name: 'PP Green Recycle Standard',
                    skuCode: 'RM-PP-GREEN-REC',
                    price: 10000,
                    primaryUnit: Unit.KG,
                    salesUnit: Unit.KG,
                    conversionFactor: 1.0,
                    attributes: { color: 'Green', material: 'PP' },
                },
            },
        },
    })

    // 4. Masterbatch Black
    const rmMasterbatch = await prisma.product.create({
        data: {
            name: 'Masterbatch Black',
            productType: ProductType.RAW_MATERIAL,
            variants: {
                create: {
                    name: 'Masterbatch Black Premium',
                    skuCode: 'RM-MB-BLACK',
                    price: 45000,
                    primaryUnit: Unit.KG,
                    salesUnit: Unit.KG,
                    conversionFactor: 1.0,
                    attributes: { color: 'Black' },
                },
            },
        },
    })

    // --- LEVEL 1: MIXING (Output: Black Mixed Resin) ---
    const interMixed = await prisma.product.create({
        data: {
            name: 'Black Mixed Resin',
            productType: ProductType.INTERMEDIATE,
            variants: {
                create: {
                    name: 'Black Mixed Resin',
                    skuCode: 'INT-MIX-BLACK',
                    price: 13500, // Derived estimate
                    primaryUnit: Unit.KG,
                    salesUnit: Unit.KG,
                    conversionFactor: 1.0,
                    attributes: { color: 'Black' },
                },
            },
        },
    })

    // --- LEVEL 2: EXTRUSION (Output: Black Jumbo Roll) ---
    // Output stored in Finished Goods Warehouse
    const fgJumbo = await prisma.product.create({
        data: {
            name: 'Black Jumbo Roll',
            productType: ProductType.FINISHED_GOOD,
            variants: {
                create: {
                    name: 'Black Jumbo Roll',
                    skuCode: 'FG-JUMBO-BLACK',
                    price: 16000,
                    primaryUnit: Unit.KG,
                    salesUnit: Unit.ROLL,
                    conversionFactor: 1.0,
                    attributes: { color: 'Black', thickness: 'Standard' },
                },
            },
        },
    })

    // --- LEVEL 3: PACKING (Output: Rafia Black Pack 1kg) ---
    const fgPack = await prisma.product.create({
        data: {
            name: 'Rafia Black Pack 1kg',
            productType: ProductType.FINISHED_GOOD,
            variants: {
                create: {
                    name: 'Rafia Black Pack 1kg',
                    skuCode: 'FG-PACK-BLACK-1KG',
                    price: 18000,
                    sellPrice: 20000,
                    primaryUnit: Unit.BAL, // Selling Unit
                    salesUnit: Unit.BAL,
                    conversionFactor: 1.0,
                    attributes: { color: 'Black', weight: '1kg packs' },
                },
            },
        },
    })

    // --- SCRAP (Waste) ---
    // 1. Affal Prongkol (Lumps/Chunks)
    await prisma.product.create({
        data: {
            name: 'Affal Prongkol',
            productType: ProductType.SCRAP,
            variants: {
                create: {
                    name: 'Affal Prongkol',
                    skuCode: 'SCRAP-PRONGKOL',
                    price: 2000,
                    sellPrice: 3000,
                    primaryUnit: Unit.KG,
                    salesUnit: Unit.KG,
                    conversionFactor: 1.0,
                    attributes: { type: 'Lumps', material: 'Mixed' },
                },
            },
        },
    })

    // 2. Affal Daun (Trim/Film Waste)
    await prisma.product.create({
        data: {
            name: 'Affal Daun',
            productType: ProductType.SCRAP,
            variants: {
                create: {
                    name: 'Affal Daun',
                    skuCode: 'SCRAP-DAUN',
                    price: 1500,
                    sellPrice: 2000,
                    primaryUnit: Unit.KG,
                    salesUnit: Unit.KG,
                    conversionFactor: 1.0,
                    attributes: { type: 'Trim', material: 'Mixed' },
                },
            },
        },
    })

    // 4. Initial Stock & Movements
    const locRM = (await prisma.location.findUnique({ where: { slug: 'rm_warehouse' } }))!
    const locMix = (await prisma.location.findUnique({ where: { slug: 'mixing_warehouse' } }))!
    const locFG = (await prisma.location.findUnique({ where: { slug: 'fg_warehouse' } }))!
    const locScrap = (await prisma.location.findUnique({ where: { slug: 'scrap_warehouse' } }))!

    // Helper to seed inventory + movement
    const seedStock = async (product: any, location: any, qty: number, variantIndex = 0) => {
        const variants = await prisma.productVariant.findMany({ where: { productId: product.id } })
        const variant = variants[variantIndex]

        await prisma.inventory.create({
            data: {
                locationId: location.id,
                productVariantId: variant.id,
                quantity: qty,
            },
        })

        await prisma.stockMovement.create({
            data: {
                type: MovementType.ADJUSTMENT,
                productVariantId: variant.id,
                toLocationId: location.id,
                quantity: qty,
                reference: 'Initial Seed Stock',
            }
        })
    }

    // A. RM Stocks
    await seedStock(rmPPKarung, locRM, 2000)
    await seedStock(rmPPSablon, locRM, 2000)
    await seedStock(rmPPGreen, locRM, 2000)
    await seedStock(rmMasterbatch, locRM, 500)

    // B. Intermediate Stocks
    await seedStock(interMixed, locMix, 200)

    // C. Jumbo Roll
    await seedStock(fgJumbo, locFG, 100)

    // 5. Bill of Materials (Recipes)

    // A. LEVEL 1: MIXING -> "Formula Adonan Hitam Standard"
    // Output: 102 KG "Black Mixed Resin" (Sum of inputs)
    // Inputs:
    // - 40 KG PP Karung
    // - 30 KG PP Sablon
    // - 30 KG PP Green
    // - 2 KG Masterbatch Black
    const vMixed = await prisma.productVariant.findFirst({ where: { skuCode: 'INT-MIX-BLACK' } })
    const vPPKarung = await prisma.productVariant.findFirst({ where: { skuCode: 'RM-PP-KARUNG' } })
    const vPPSablon = await prisma.productVariant.findFirst({ where: { skuCode: 'RM-PP-SABLON' } })
    const vPPGreen = await prisma.productVariant.findFirst({ where: { skuCode: 'RM-PP-GREEN-REC' } })
    const vMB = await prisma.productVariant.findFirst({ where: { skuCode: 'RM-MB-BLACK' } })

    if (vMixed && vPPKarung && vPPSablon && vPPGreen && vMB) {
        await prisma.bom.create({
            data: {
                name: 'Formula Adonan Hitam Standard',
                productVariantId: vMixed.id,
                outputQuantity: 102, // 40+30+30+2
                isDefault: true,
                items: {
                    create: [
                        { productVariantId: vPPKarung.id, quantity: 40, scrapPercentage: 0 },
                        { productVariantId: vPPSablon.id, quantity: 30, scrapPercentage: 0 },
                        { productVariantId: vPPGreen.id, quantity: 30, scrapPercentage: 0 },
                        { productVariantId: vMB.id, quantity: 2, scrapPercentage: 0 },
                    ],
                },
            },
        })
    }

    // B. LEVEL 2: EXTRUSION -> "Extrusion Jumbo Hitam"
    // Output: 50 KG "Black Jumbo Roll"
    // Input: 50 KG "Black Mixed Resin"
    const vJumbo = await prisma.productVariant.findFirst({ where: { skuCode: 'FG-JUMBO-BLACK' } })

    if (vJumbo && vMixed) {
        await prisma.bom.create({
            data: {
                name: 'Extrusion Jumbo Hitam',
                productVariantId: vJumbo.id,
                outputQuantity: 50,
                isDefault: true,
                items: {
                    create: [
                        { productVariantId: vMixed.id, quantity: 50 },
                    ],
                },
            },
        })
    }

    // C. LEVEL 3: PACKING -> "Repacking Black 1kg"
    // Output: 1 BAL "Rafia Black Pack 1kg"
    // Input: 15 KG "Black Jumbo Roll"
    const vPack = await prisma.productVariant.findFirst({ where: { skuCode: 'FG-PACK-BLACK-1KG' } })

    if (vPack && vJumbo) {
        await prisma.bom.create({
            data: {
                name: 'Repacking Black 1kg',
                productVariantId: vPack.id,
                outputQuantity: 1, // 1 BAL
                isDefault: true,
                items: {
                    create: [
                        { productVariantId: vJumbo.id, quantity: 15 },
                    ],
                },
            },
        })
    }

    // 6. Machines Master Data
    console.log('Seeding machines...')

    await prisma.machine.createMany({
        data: [
            {
                name: 'Mixer Turbo 01',
                code: 'MIX-01',
                type: MachineType.MIXER,
                locationId: locMix.id,
                status: MachineStatus.ACTIVE,
            },
            {
                name: 'Extruder Jumbo E1',
                code: 'EXT-01',
                type: MachineType.EXTRUDER,
                locationId: locFG.id, // Output goes to FG
                status: MachineStatus.ACTIVE,
            },
            {
                name: 'Packing Station P1',
                code: 'PAK-01',
                type: MachineType.PACKER, // Assuming PACKER exists in enum
                locationId: locFG.id, // Packing at FG Warehouse stage
                status: MachineStatus.ACTIVE,
            },
        ]
    })

    // 6.5 Job Roles
    console.log('Seeding job roles...')
    const roles = ['OPERATOR', 'HELPER', 'MANAGER', 'PACKER']
    for (const name of roles) {
        await prisma.jobRole.create({ data: { name } })
    }

    // 6.6 Employees (Resources)
    console.log('Seeding employees...')
    const op1 = await prisma.employee.create({
        data: { name: 'Budi Operator', code: 'EMP-OP-001', role: 'OPERATOR' }
    })
    const op2 = await prisma.employee.create({
        data: { name: 'Joko Operator', code: 'EMP-OP-002', role: 'OPERATOR' }
    })
    const help1 = await prisma.employee.create({
        data: { name: 'Siti Helper', code: 'EMP-HLP-001', role: 'HELPER' }
    })
    const help2 = await prisma.employee.create({
        data: { name: 'Asep Helper', code: 'EMP-HLP-002', role: 'HELPER' }
    })

    // 7. Batches (Simple initial)
    console.log('Seeding batches...')
    if (vPPKarung) {
        await prisma.batch.create({
            data: {
                batchNumber: 'BATCH-PPKARUNG-001',
                productVariantId: vPPKarung.id,
                locationId: locRM.id,
                quantity: 2000,
                manufacturingDate: new Date(),
                status: BatchStatus.ACTIVE,
            }
        })
    }

    // 8. Production Orders (Optional: Create one Draft for quick testing)
    console.log('Seeding production orders...')
    const bomMixing = await prisma.bom.findFirst({ where: { name: 'Formula Adonan Hitam Standard' } })
    const mixerMachine = await prisma.machine.findFirst({ where: { code: 'MIX-01' } })

    if (bomMixing && mixerMachine) {
        await prisma.productionOrder.create({
            data: {
                orderNumber: 'PO-MIX-001',
                bomId: bomMixing.id,
                plannedQuantity: 1020, // 10 cycles (102 * 10)
                plannedStartDate: new Date(),
                status: ProductionStatus.DRAFT,
                machineId: mixerMachine.id,
                locationId: locMix.id,
                shifts: {
                    create: {
                        shiftName: 'Morning Shift',
                        startTime: new Date('2026-01-10T08:00:00'),
                        endTime: new Date('2026-01-10T16:00:00'),
                        operatorId: op1.id,
                    }
                }
            }
        })
    }

    console.log('Seeding completed with Scrap Refactor.')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
