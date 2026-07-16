import { MachineType, Prisma, type PrismaClient } from '@prisma/client';

export type PieceSnapshot = {
  pieceRateSnapshot: Prisma.Decimal | null;
  pieceEarnings: Prisma.Decimal | null;
  pieceMachineType: MachineType | null;
};

export function calcPieceEarnings(quantityKg: number, ratePerKg: number): number {
  if (quantityKg <= 0 || ratePerKg <= 0) return 0;
  return Math.round(quantityKg * ratePerKg * 100) / 100;
}

export async function resolveActivePieceRate(
  db: PrismaClient | Prisma.TransactionClient,
  machineType: MachineType,
): Promise<number | null> {
  const row = await db.processPieceRate.findUnique({
    where: { machineType },
    select: { ratePerKg: true, status: true },
  });
  if (!row || row.status !== 'ACTIVE') return null;
  const rate = Number(row.ratePerKg);
  return rate > 0 ? rate : null;
}

/**
 * Soft snapshot for PIECE operator.
 * Missing rate / machine / operator → null fields (do not block production).
 */
export async function buildPieceSnapshotForOperator(
  db: PrismaClient | Prisma.TransactionClient,
  input: {
    operatorId?: string | null;
    machineId?: string | null;
    quantityProduced: number;
  },
): Promise<PieceSnapshot> {
  const empty: PieceSnapshot = {
    pieceRateSnapshot: null,
    pieceEarnings: null,
    pieceMachineType: null,
  };

  if (!input.operatorId || !input.machineId || input.quantityProduced <= 0) {
    return empty;
  }

  const operator = await db.employee.findUnique({
    where: { id: input.operatorId },
    select: { payType: true },
  });
  if (!operator || operator.payType !== 'PIECE') return empty;

  const machine = await db.machine.findUnique({
    where: { id: input.machineId },
    select: { type: true },
  });
  if (!machine) return empty;

  const rate = await resolveActivePieceRate(db, machine.type);
  if (rate == null) {
    return {
      pieceRateSnapshot: null,
      pieceEarnings: null,
      pieceMachineType: machine.type,
    };
  }

  return {
    pieceRateSnapshot: new Prisma.Decimal(rate),
    pieceEarnings: new Prisma.Decimal(calcPieceEarnings(input.quantityProduced, rate)),
    pieceMachineType: machine.type,
  };
}

export const VOID_PIECE_SNAPSHOT: PieceSnapshot = {
  pieceRateSnapshot: null,
  pieceEarnings: null,
  pieceMachineType: null,
};
