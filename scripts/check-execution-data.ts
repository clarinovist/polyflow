
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Checking ProductionExecution data...');

    const executions = await prisma.productionExecution.findMany({
        take: 10,
        orderBy: { startTime: 'desc' },
        include: { machine: true }
    });

    console.log(`Found ${executions.length} recent executions.`);

    for (const ex of executions) {
        const start = new Date(ex.startTime).getTime();
        const end = ex.endTime ? new Date(ex.endTime).getTime() : null;
        let durationHours = 0;

        if (end) {
            durationHours = (end - start) / (1000 * 60 * 60);
        }

        console.log(`ID: ${ex.id.substring(0, 8)}... | Machine: ${ex.machine?.name || 'N/A'} | Qty: ${ex.quantityProduced} | Start: ${ex.startTime.toISOString()} | End: ${ex.endTime?.toISOString() || 'NULL'} | Duration (hrs): ${durationHours.toFixed(4)}`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
