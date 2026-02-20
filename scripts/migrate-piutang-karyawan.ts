
import { PrismaClient, AccountType, AccountCategory } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("🚀 Starting Piutang Karyawan COA Migration...");

    const assetParent = await prisma.account.findUnique({ where: { code: '11000' } });
    if (!assetParent) {
        throw new Error("Parent account 11000 (Current Assets) not found");
    }

    // 1. Create 11500 - Piutang Lain-lain
    console.log("Creating 11500 - Piutang Lain-lain...");
    const otherReceivablesParent = await prisma.account.upsert({
        where: { code: '11500' },
        update: {
            name: 'Piutang Lain-lain',
            parentId: assetParent.id,
            type: AccountType.ASSET,
            category: AccountCategory.CURRENT_ASSET
        },
        create: {
            code: '11500',
            name: 'Piutang Lain-lain',
            parentId: assetParent.id,
            type: AccountType.ASSET,
            category: AccountCategory.CURRENT_ASSET
        }
    });

    // 2. Create 11510 - Piutang Karyawan
    console.log("Creating 11510 - Piutang Karyawan...");
    const employeeReceivablesParent = await prisma.account.upsert({
        where: { code: '11510' },
        update: {
            name: 'Piutang Karyawan',
            parentId: otherReceivablesParent.id,
            type: AccountType.ASSET,
            category: AccountCategory.CURRENT_ASSET
        },
        create: {
            code: '11510',
            name: 'Piutang Karyawan',
            parentId: otherReceivablesParent.id,
            type: AccountType.ASSET,
            category: AccountCategory.CURRENT_ASSET
        }
    });

    // 3. Migrate Piutang Viar (11211 -> 11511)
    console.log("Migrating Piutang Viar (11211 -> 11511)...");
    const viar = await prisma.account.findUnique({ where: { code: '11211' } });
    if (viar) {
        await prisma.account.update({
            where: { id: viar.id },
            data: {
                code: '11511',
                parentId: employeeReceivablesParent.id
            }
        });
        console.log("✅ Piutang Viar migrated successfully.");
    } else {
        console.log("⚠️ Account 11211 not found, skipping.");
    }

    // 4. Migrate Piutang Fadila (11212 -> 11512)
    console.log("Migrating Piutang Fadilla (11212 -> 11512)...");
    const fadilla = await prisma.account.findUnique({ where: { code: '11212' } });
    if (fadilla) {
        await prisma.account.update({
            where: { id: fadilla.id },
            data: {
                code: '11512',
                name: 'Piutang Fadilla', // Fixed spelling as requested
                parentId: employeeReceivablesParent.id
            }
        });
        console.log("✅ Piutang Fadilla migrated successfully.");
    } else {
        console.log("⚠️ Account 11212 not found, skipping.");
    }

    console.log("✨ Migration completed successfully!");
}

main()
    .catch((e) => {
        console.error("❌ Migration failed:");
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
