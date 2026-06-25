import { prisma } from "@/lib/core/prisma";
import { JournalStatus, Prisma } from "@prisma/client";

export async function getJournals(params?: {
  startDate?: Date;
  endDate?: Date;
  status?: JournalStatus;
  reference?: string;
  page?: number;
  limit?: number;
}) {
  const where: Prisma.JournalEntryWhereInput = {};

  if (params?.startDate && params?.endDate) {
    where.entryDate = { gte: params.startDate, lte: params.endDate };
  }
  if (params?.status) {
    where.status = params.status;
  }
  if (params?.reference) {
    where.reference = { contains: params.reference, mode: "insensitive" };
  }

  const page = params?.page || 1;
  const limit = params?.limit || 100;
  const skip = Math.max(0, (page - 1) * limit);

  const [data, total] = await Promise.all([
    prisma.journalEntry.findMany({
      where,
      include: {
        createdBy: { select: { name: true } },
        lines: true,
      },
      orderBy: { entryDate: "desc" },
      skip,
      take: limit,
    }),
    prisma.journalEntry.count({ where }),
  ]);

  return {
    data,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

export async function getJournalById(id: string) {
  return await prisma.journalEntry.findUnique({
    where: { id },
    include: {
      lines: {
        include: { account: true },
      },
      createdBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
  });
}
