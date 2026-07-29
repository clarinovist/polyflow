/**
 * Idempotent baseline process + machine capability seed
 * Run: npx tsx scripts/seed-production-processes.ts --preview
 *      npx tsx scripts/seed-production-processes.ts --apply
 *
 * Safe: only creates missing processes, maps existing MachineType to process codes.
 * No deletion, no route auto-publish.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BASE_PROCESSES: Array<{
  code: string;
  name: string;
  description?: string;
  requiresMachine: boolean;
  requiresQualityGate?: boolean;
}> = [
  { code: 'MIXING', name: 'Mixing', description: 'Pencampuran bahan baku', requiresMachine: true },
  { code: 'EXTRUSION', name: 'Extrusion', description: 'Proses extrusion film/roll', requiresMachine: true },
  { code: 'INJECTION', name: 'Injection Molding', description: 'Injection molding', requiresMachine: true },
  { code: 'WINDING', name: 'Winding / Finishing', description: 'Winding rafia / finishing roll', requiresMachine: true },
  { code: 'TRIMMING', name: 'Trimming / QC', description: 'Trimming hasil injection/QC', requiresMachine: false },
  { code: 'INNER_PACKING', name: 'Packing Primer', description: 'Packing inner / primer', requiresMachine: true },
  { code: 'STERILIZATION', name: 'Sterilization', description: 'Sterilisasi produk', requiresMachine: false },
  { code: 'CARTON_PACKING', name: 'Packing Karton', description: 'Packing karton akhir', requiresMachine: true },
  { code: 'PACKING', name: 'Packing', description: 'Generic packing (fallback)', requiresMachine: true },
  { code: 'REWORK', name: 'Rework', description: 'Proses rework manual', requiresMachine: false },
  { code: 'STANDARD', name: 'Standard', description: 'Standard fallback', requiresMachine: false },
];

const MACHINE_TYPE_TO_PROCESS: Record<string, string[]> = {
  MIXER: ['MIXING', 'STANDARD'],
  EXTRUDER: ['EXTRUSION', 'INJECTION', 'STANDARD'],
  REWINDER: ['WINDING', 'EXTRUSION'],
  PACKER: ['PACKING', 'INNER_PACKING', 'CARTON_PACKING'],
  GRANULATOR: ['TRIMMING', 'REWORK', 'PACKING'],
};

async function main() {
  const args = process.argv.slice(2);
  const preview = args.includes('--preview') || !args.includes('--apply');

  console.log(`Mode: ${preview ? 'PREVIEW (no write)' : 'APPLY'}`);

  // Processes
  const existing = await prisma.productionProcess.findMany({ select: { code: true } });
  const existingCodes = new Set(existing.map((e) => e.code));
  const toCreate = BASE_PROCESSES.filter((p) => !existingCodes.has(p.code));

  console.log(`\nExisting processes: ${existing.length} (${existing.map((e) => e.code).join(', ')})`);
  console.log(`To create: ${toCreate.length}`);

  if (!preview && toCreate.length > 0) {
    for (const p of toCreate) {
      await prisma.productionProcess.create({ data: p });
      console.log(`  Created ${p.code}`);
    }
  } else {
    for (const p of toCreate) console.log(`  Would create ${p.code}`);
  }

  // Capability mapping
  const allProcesses = await prisma.productionProcess.findMany({ select: { id: true, code: true } });
  const procMap = new Map(allProcesses.map((p) => [p.code, p.id]));

  const machines = await prisma.machine.findMany({ select: { id: true, code: true, type: true, status: true } });
  console.log(`\nMachines: ${machines.length}`);

  let capsToCreate = 0;
  const capsPreview: string[] = [];

  for (const m of machines) {
    const targetCodes = MACHINE_TYPE_TO_PROCESS[m.type] ?? [];
    for (const code of targetCodes) {
      const procId = procMap.get(code);
      if (!procId) continue;
      const existsCap = await prisma.machineProcessCapability.findUnique({
        where: { machineId_processId: { machineId: m.id, processId: procId } },
      });
      if (!existsCap) {
        capsToCreate++;
        capsPreview.push(`${m.code} (${m.type}) → ${code}`);
        if (!preview) {
          await prisma.machineProcessCapability.create({
            data: { machineId: m.id, processId: procId, isPrimary: false },
          });
        }
      }
    }
  }

  console.log(`\nCapability to create: ${capsToCreate}`);
  if (preview) {
    console.log(capsPreview.slice(0, 50).join('\n'));
    if (capsPreview.length > 50) console.log(`... and ${capsPreview.length - 50} more`);
  }

  console.log('\nDone');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
