/**
 * Idempotent baseline process + machine capability seed
 * Run: npx tsx scripts/seed-production-processes.ts --preview
 *      npx tsx scripts/seed-production-processes.ts --apply --confirm
 *
 * Safe: only creates missing processes, maps existing MachineType to process codes.
 * No deletion, no route auto-publish.
 *
 * The target database is printed (host + database name) without credentials.
 * --apply requires --confirm to proceed; otherwise exits with code 1.
 */

import { PrismaClient } from '@prisma/client';
import { PROCESS_MACHINE_FALLBACK } from '@/lib/production/machine-compatibility';

const prisma = new PrismaClient();

const MACHINE_TYPE_TO_PROCESS: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {};
  for (const [processCode, machineTypes] of Object.entries(PROCESS_MACHINE_FALLBACK)) {
    for (const mt of machineTypes) {
      (m[mt] ??= []).push(processCode);
    }
  }
  return m;
})();

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

/**
 * Parse DATABASE_URL to extract host and database name.
 * Never returns user or password.
 */
function parseDatabaseTarget(): { host: string; database: string } {
  const url = process.env.DATABASE_URL ?? '';
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname, database: parsed.pathname.replace(/^\//, '') };
  } catch {
    return { host: '(unknown)', database: '(unknown)' };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const confirm = args.includes('--confirm');
  const preview = !apply;

  if (apply && !confirm) {
    console.error('ERROR: --apply requires --confirm. Run with --apply --confirm to write to the database.');
    console.error('Example: npx tsx scripts/seed-production-processes.ts --apply --confirm');
    process.exit(1);
  }

  const target = parseDatabaseTarget();
  console.log(`Target: ${target.host} / ${target.database}`);
  console.log(`Mode: ${preview ? 'PREVIEW (no write)' : 'APPLY (writing changes)'}`);

  if (preview) {
    console.log('\nDerived mapping (PROCESS_MACHINE_FALLBACK → MachineType → Process):');
    for (const [mt, codes] of Object.entries(MACHINE_TYPE_TO_PROCESS)) {
      console.log(`  ${mt}: [${codes.join(', ')}]`);
    }
  }

  // Processes
  const existing = await prisma.productionProcess.findMany({ select: { code: true } });
  const existingCodes = new Set(existing.map((e) => e.code));
  const toCreate = BASE_PROCESSES.filter((p) => !existingCodes.has(p.code));

  console.log(`\nExisting processes: ${existing.length} (${existing.map((e) => e.code).join(', ')})`);
  console.log(`To create: ${toCreate.length}`);

  let processesCreated = 0;
  if (!preview && toCreate.length > 0) {
    for (const p of toCreate) {
      await prisma.productionProcess.create({ data: p });
      console.log(`  Created ${p.code}`);
      processesCreated++;
    }
  } else {
    for (const p of toCreate) console.log(`  Would create ${p.code}`);
  }

  // Capability mapping
  const allProcesses = await prisma.productionProcess.findMany({ select: { id: true, code: true } });
  const procMap = new Map(allProcesses.map((p) => [p.code, p.id]));
  const toCreateCodes = new Set(toCreate.map((p) => p.code));

  const machines = await prisma.machine.findMany({ select: { id: true, code: true, type: true, status: true } });
  console.log(`\nMachines: ${machines.length}`);

  let capsToCreate = 0;
  let capsCreated = 0;
  const capsPreview: string[] = [];

  for (const m of machines) {
    const targetCodes = MACHINE_TYPE_TO_PROCESS[m.type] ?? [];
    for (const code of targetCodes) {
      const procId = procMap.get(code);
      if (!procId) {
        // Preview skipped process creation, so procMap misses toCreate codes.
        // Those processes surely have no capability yet — count without DB query.
        if (preview && toCreateCodes.has(code)) {
          capsToCreate++;
          capsPreview.push(`${m.code} (${m.type}) → ${code}`);
        }
        continue;
      }
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
          capsCreated++;
        }
      }
    }
  }

  console.log(`\nCapability to create: ${capsToCreate}`);
  if (preview) {
    console.log(capsPreview.slice(0, 50).join('\n'));
    if (capsPreview.length > 50) console.log(`... and ${capsPreview.length - 50} more`);
  }

  // Summary
  console.log(`\n── Summary ──`);
  console.log(`Database: ${target.host} / ${target.database}`);
  console.log(`Mode: ${preview ? 'PREVIEW' : 'APPLY'}`);
  console.log(`Processes created: ${processesCreated}`);
  console.log(`Capabilities created: ${capsCreated}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
