
import { PrismaClient, WorkShiftStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting WorkShift CRUD verification...');

    // 1. Create
    console.log('Creating WorkShift...');
    const shift = await prisma.workShift.create({
        data: {
            name: 'Test Verify Shift',
            startTime: '09:00',
            endTime: '17:00',
            status: WorkShiftStatus.ACTIVE,
        },
    });
    console.log('Created:', shift);

    // 2. Read
    console.log('Reading WorkShift...');
    const readShift = await prisma.workShift.findUnique({
        where: { id: shift.id },
    });
    console.log('Read:', readShift);

    if (!readShift) throw new Error('Shift not found after creation');
    if (readShift.name !== 'Test Verify Shift') throw new Error('Name mismatch');

    // 3. Update
    console.log('Updating WorkShift...');
    const updatedShift = await prisma.workShift.update({
        where: { id: shift.id },
        data: {
            name: 'Test Verify Shift Updated',
        },
    });
    console.log('Updated:', updatedShift);

    if (updatedShift.name !== 'Test Verify Shift Updated') throw new Error('Update failed');

    // 4. Delete
    console.log('Deleting WorkShift...');
    await prisma.workShift.delete({
        where: { id: shift.id },
    });
    console.log('Deleted');

    const deletedShift = await prisma.workShift.findUnique({
        where: { id: shift.id },
    });
    if (deletedShift) throw new Error('Shift still exists after deletion');

    console.log('Verification successful!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
