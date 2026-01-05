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
        { name: 'Mixing Area', slug: 'mixing_area', description: 'Production Floor 1: Mixing' },
        { name: 'Extrusion Area', slug: 'extrusion_area', description: 'Production Floor 2: Extrusion' },
        { name: 'Finished Goods Warehouse', slug: 'fg_warehouse', description: 'Storage for ready-to-sell items' },
        { name: 'Scrap Warehouse', slug: 'scrap_warehouse', description: 'Storage for production waste' },
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

    // 3. Products & Stocks (Full Production Cycle)

    // --- RAW MATERIALS (RM) ---
    // A. Pure PP Granules
    const rmPP = await prisma.product.create({
        data: {
            name: 'Pure PP Granules',
            productType: ProductType.RAW_MATERIAL,
            variants: {
                create: {
                    name: 'Pure PP Granules Standard',
                    skuCode: 'RMPPG001',
                    price: 15000,
                    primaryUnit: Unit.KG,
                    salesUnit: Unit.KG,
                    conversionFactor: 1.0,
                    attributes: { color: 'Clear', material: 'PP' },
                    reorderPoint: 500,
                    reorderQuantity: 1000,
                    leadTimeDays: 7,
                },
            },
        },
    })

    // B. Red Colorant
    const rmColor = await prisma.product.create({
        data: {
            name: 'Red Colorant',
            productType: ProductType.RAW_MATERIAL,
            variants: {
                create: {
                    name: 'Red Colorant Masterbatch',
                    skuCode: 'RMCLR001',
                    price: 50000,
                    primaryUnit: Unit.KG,
                    salesUnit: Unit.KG,
                    conversionFactor: 1.0,
                    attributes: { color: 'Red' },
                },
            },
        },
    })

    // --- INTERMEDIATE (Result of Mixing) ---
    // C. Red Mixed Granules
    const interMix = await prisma.product.create({
        data: {
            name: 'Red Mixed Granules',
            productType: ProductType.INTERMEDIATE,
            variants: {
                create: {
                    name: 'Red Mixed Granules Batch A',
                    skuCode: 'INMIX001',
                    price: 18000, // Derived cost
                    primaryUnit: Unit.KG,
                    salesUnit: Unit.KG,
                    conversionFactor: 1.0,
                    attributes: { color: 'Red' },
                },
            },
        },
    })

    // --- WIP (Result of Extrusion) ---
    // D. Red Raffia Jumbo Roll
    const wipRoll = await prisma.product.create({
        data: {
            name: 'Red Raffia Jumbo Roll',
            productType: ProductType.WIP,
            variants: {
                create: {
                    name: 'Red Raffia Jumbo Roll',
                    skuCode: 'WPRAF001',
                    price: 20000,
                    primaryUnit: Unit.KG,
                    salesUnit: Unit.ROLL, // Internal tracking maybe in Rolls? Or KG. Keeping KG as primary.
                    conversionFactor: 1.0,
                    attributes: { color: 'Red', thickness: 'Standard' },
                },
            },
        },
    })

    // --- FINISHED GOODS (Result of Converting) ---
    // E. Red Raffia (Bal)
    const fgRaffia = await prisma.product.create({
        data: {
            name: 'Red Raffia',
            productType: ProductType.FINISHED_GOOD,
            variants: {
                create: {
                    name: 'Red Raffia - Bal of 10',
                    skuCode: 'FGRAF001',
                    price: 90000, // Base Price
                    sellPrice: 100000, // Sales Price
                    primaryUnit: Unit.KG,
                    salesUnit: Unit.BAL,
                    conversionFactor: 5.0, // 1 Bal = 5 KG
                    attributes: { color: 'Red' },
                },
            },
        },
    })

    // --- SCRAP (Waste) ---
    // F. Red Waste
    const scrapRed = await prisma.product.create({
        data: {
            name: 'Red Waste',
            productType: ProductType.SCRAP,
            variants: {
                create: {
                    name: 'Red Waste',
                    skuCode: 'SCWST001',
                    price: 3000,
                    sellPrice: 5000,
                    primaryUnit: Unit.KG,
                    salesUnit: Unit.KG,
                    conversionFactor: 1.0,
                    attributes: { color: 'Red' },
                },
            },
        },
    })

    // 4. Initial Stock & Movements (Simulating the Cycle State)

    const locRM = (await prisma.location.findUnique({ where: { slug: 'rm_warehouse' } }))!
    const locMix = (await prisma.location.findUnique({ where: { slug: 'mixing_area' } }))!
    const locExt = (await prisma.location.findUnique({ where: { slug: 'extrusion_area' } }))!
    const locFG = (await prisma.location.findUnique({ where: { slug: 'fg_warehouse' } }))!
    const locScrap = (await prisma.location.findUnique({ where: { slug: 'scrap_warehouse' } }))!

    // Helper to seed inventory + movement
    const seedStock = async (product: any, location: any, qty: number, variantIndex = 0) => {
        // Note: product variable here is the Product model, we need the stored variant
        // We already created them with `variants: { create: ... }` so we fetch them back or rely on sku codes.
        // Simpler: Fetch variant by ProductID
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
                reference: 'Initial Production State',
            }
        })
    }

    // A. RM Stocks
    await seedStock(rmPP, locRM, 1000)      // 1000 KG Pure PP
    await seedStock(rmColor, locRM, 50)     // 50 KG Colorant

    // B. Intermediate Stocks (Mixing Area)
    await seedStock(interMix, locMix, 200)  // 200 KG Mixed

    // C. WIP Stocks (Extrusion Area)
    await seedStock(wipRoll, locExt, 500)   // 500 KG Jumbo Rolls

    // D. FG Stocks (FG Warehouse)
    await seedStock(fgRaffia, locFG, 100)   // 100 KG (approx 20 Bal)

    // E. Scrap Stocks (Scrap Warehouse)
    await seedStock(scrapRed, locScrap, 30) // 30 KG Scrap

    // 5. Bill of Materials (Recipes)

    // A. Usage: Mixing
    // Output: 100 KG "Red Mixed Granules" (Intermediate)
    // Input: 98 KG "Pure PP" + 2 KG "Red Colorant"
    const interVariant = await prisma.productVariant.findFirst({ where: { skuCode: 'INMIX001' } })
    const rmPpVariant = await prisma.productVariant.findFirst({ where: { skuCode: 'RMPPG001' } })
    const rmColorVariant = await prisma.productVariant.findFirst({ where: { skuCode: 'RMCLR001' } })

    if (interVariant && rmPpVariant && rmColorVariant) {
        await prisma.bom.create({
            data: {
                name: 'Standard Mixing Recipe - Red',
                productVariantId: interVariant.id,
                outputQuantity: 100, // Basis 100 KG
                isDefault: true,
                items: {
                    create: [
                        { productVariantId: rmPpVariant.id, quantity: 98, scrapPercentage: 1.0 },
                        { productVariantId: rmColorVariant.id, quantity: 2 },
                    ],
                },
            },
        })
    }

    // B. Usage: Extrusion
    // Output: 100 KG "Red Raffia Jumbo Roll" (WIP)
    // Input: 100 KG "Red Mixed Granules" (Intermediate)
    const wipVariant = await prisma.productVariant.findFirst({ where: { skuCode: 'WPRAF001' } })

    if (wipVariant && interVariant) {
        await prisma.bom.create({
            data: {
                name: 'Standard Extrusion Recipe',
                productVariantId: wipVariant.id,
                outputQuantity: 100,
                isDefault: true,
                items: {
                    create: [
                        { productVariantId: interVariant.id, quantity: 100, scrapPercentage: 2.0 },
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
                name: 'Extruder Jumbo 01',
                code: 'EXT-01',
                type: MachineType.EXTRUDER,
                locationId: locExt.id,
                status: MachineStatus.ACTIVE,
            },
            {
                name: 'Rewinder Kecil A',
                code: 'REW-01',
                type: MachineType.REWINDER,
                locationId: locFG.id, // Converting at FG Warehouse stage
                status: MachineStatus.ACTIVE,
            },
            {
                name: 'Press Bal Manual',
                code: 'PAK-01',
                type: MachineType.PACKER,
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

    // 7. Batches & Reservations (Inventory Intelligence)
    console.log('Seeding batches and reservations...')

    // Seed a Batch for Pure PP
    if (rmPpVariant) {
        await prisma.batch.create({
            data: {
                batchNumber: 'BATCH-PP-001',
                productVariantId: rmPpVariant.id,
                locationId: locRM.id,
                quantity: 500,
                manufacturingDate: new Date('2025-12-01'),
                expiryDate: new Date('2026-12-01'),
                status: BatchStatus.ACTIVE,
            }
        })
    }

    // Seed a Stock Reservation
    if (fgRaffia && locFG) {
        const fgVariant = await prisma.productVariant.findFirst({ where: { productId: fgRaffia.id } })
        if (fgVariant) {
            await prisma.stockReservation.create({
                data: {
                    productVariantId: fgVariant.id,
                    locationId: locFG.id,
                    quantity: 10,
                    reservedFor: ReservationType.SALES_ORDER,
                    referenceId: 'SO-DEMO-001',
                    status: ReservationStatus.ACTIVE,
                }
            })
        }
    }

    // 8. Production Orders (Phase 3)
    console.log('Seeding production orders...')

    // Create a DRAFT Production Order for "Standard Mixing Recipe - Red"
    const bomMixing = await prisma.bom.findFirst({ where: { name: 'Standard Mixing Recipe - Red' } })
    const mixerMachine = await prisma.machine.findFirst({ where: { code: 'MIX-01' } })

    if (bomMixing && mixerMachine) {
        await prisma.productionOrder.create({
            data: {
                orderNumber: 'PO-2026-001',
                bomId: bomMixing.id,
                plannedQuantity: 1000, // Plan to produce 1000 KG
                plannedStartDate: new Date('2026-01-10'),
                status: ProductionStatus.DRAFT,
                machineId: mixerMachine.id,
                locationId: locMix.id, // Output location
                shifts: {
                    create: {
                        shiftName: 'Morning Shift',
                        startTime: new Date('2026-01-10T08:00:00'),
                        endTime: new Date('2026-01-10T16:00:00'),
                        operatorId: op1.id,
                        helpers: {
                            connect: [{ id: help1.id }]
                        }
                    }
                }
            }
        })
    }

    console.log('Seeding completed with Full Production Cycle, BOMs, Machines, Batches, Reservations, and Production Orders.')
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
