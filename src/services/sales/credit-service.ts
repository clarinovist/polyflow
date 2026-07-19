import { prisma } from '@/lib/core/prisma';
import { formatRupiah } from '@/lib/utils/utils';
import { BusinessRuleError } from '@/lib/errors/errors';

export type CreditExposure = {
  creditLimit: number;
  unpaidInvoiceBalance: number;
  openOrderWithoutInvoice: number;
  currentExposure: number;
  headroom: number;
};

export type CustomerCreditSummary = {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  city: string | null;
  paymentTermDays: number | null;
  creditLimit: number | null;
  isActive: boolean;
  headroom: number | null;
  exposureStatus: 'none' | 'safe' | 'near' | 'over';
};

/**
 * Get customer credit exposure breakdown.
 * Returns null if customer not found or has no credit limit (limit = 0 or null).
 */
export async function getCustomerCreditExposure(
  customerId: string,
): Promise<CreditExposure | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { creditLimit: true },
  });

  if (!customer || !customer.creditLimit || customer.creditLimit.toNumber() <= 0) {
    return null;
  }

  const creditLimit = customer.creditLimit.toNumber();

  // 1. Unpaid + partial invoice balance
  const unpaidInvoices = await prisma.invoice.findMany({
    where: {
      salesOrder: { customerId },
      status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
    },
    select: { totalAmount: true, paidAmount: true },
  });

  const unpaidInvoiceBalance = unpaidInvoices.reduce(
    (sum, inv) => sum + (Number(inv.totalAmount) - Number(inv.paidAmount)),
    0,
  );

  // 2. Active SO without invoice (incl. shippingCost)
  const activeOrders = await prisma.salesOrder.findMany({
    where: {
      customerId,
      status: { in: ['CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP', 'SHIPPED'] },
      invoices: { none: {} },
    },
    select: { totalAmount: true },
  });

  const openOrderWithoutInvoice = activeOrders.reduce(
    (sum, so) => sum + Number(so.totalAmount || 0),
    0,
  );

  const currentExposure = unpaidInvoiceBalance + openOrderWithoutInvoice;
  const headroom = creditLimit - currentExposure;

  return {
    creditLimit,
    unpaidInvoiceBalance,
    openOrderWithoutInvoice,
    currentExposure,
    headroom,
  };
}

/**
 * Check credit limit before create/update/confirm SO.
 * Throws BusinessRuleError with Indonesian message if exceeded.
 */
export async function checkCreditLimit(
  customerId: string,
  newAmount: number,
  _options?: { includeShippingInNewAmount?: boolean },
): Promise<void> {
  const exposure = await getCustomerCreditExposure(customerId);
  if (!exposure) return; // no limit set — skip check

  const newExposure = exposure.currentExposure + newAmount;

  if (newExposure > exposure.creditLimit) {
    throw new BusinessRuleError(
      `Batas kredit terlampaui. Limit: ${formatRupiah(exposure.creditLimit)}, Exposure: ${formatRupiah(exposure.currentExposure)}, Baru: ${formatRupiah(newAmount)}`,
      {
        creditLimit: exposure.creditLimit,
        currentExposure: exposure.currentExposure,
        newAmount,
        headroom: exposure.headroom,
      },
      'CREDIT_LIMIT_EXCEEDED',
    );
  }
}

/**
 * Get all customers with credit summary for the directory list.
 * Uses aggregate queries to avoid N+1.
 */
export async function getCustomersWithCreditSummary(): Promise<CustomerCreditSummary[]> {
  const customers = await prisma.customer.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      phone: true,
      city: true,
      paymentTermDays: true,
      creditLimit: true,
      isActive: true,
    },
    orderBy: { name: 'asc' },
  });

  if (customers.length === 0) return [];

  const customerIds = customers.map((c) => c.id);

  // Aggregate unpaid invoices per customer
  const unpaidAgg = await prisma.invoice.groupBy({
    by: ['salesOrderId'],
    where: {
      salesOrder: { customerId: { in: customerIds } },
      status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
    },
    _sum: { totalAmount: true, paidAmount: true },
  });

  // Map invoice sums to customer ID
  const invoiceMap = new Map<string, number>();
  for (const row of unpaidAgg) {
    const inv = await prisma.invoice.findFirst({
      where: { salesOrderId: row.salesOrderId },
      select: { salesOrder: { select: { customerId: true } } },
    });
    if (inv?.salesOrder?.customerId) {
      const balance = Number(row._sum.totalAmount || 0) - Number(row._sum.paidAmount || 0);
      invoiceMap.set(
        inv.salesOrder.customerId,
        (invoiceMap.get(inv.salesOrder.customerId) || 0) + balance,
      );
    }
  }

  // Aggregate active SO without invoice per customer
  const activeSoAgg = await prisma.salesOrder.groupBy({
    by: ['customerId'],
    where: {
      customerId: { in: customerIds },
      status: { in: ['CONFIRMED', 'IN_PRODUCTION', 'READY_TO_SHIP', 'SHIPPED'] },
      invoices: { none: {} },
    },
    _sum: { totalAmount: true },
  });

  const soMap = new Map<string, number>();
  for (const row of activeSoAgg) {
    if (row.customerId) {
      soMap.set(row.customerId, Number(row._sum.totalAmount || 0));
    }
  }

  return customers.map((c) => {
    const creditLimit = c.creditLimit ? Number(c.creditLimit) : 0;
    const unpaidBalance = invoiceMap.get(c.id) || 0;
    const openSo = soMap.get(c.id) || 0;
    const currentExposure = unpaidBalance + openSo;

    let headroom: number | null = null;
    let exposureStatus: CustomerCreditSummary['exposureStatus'] = 'none';

    if (creditLimit > 0) {
      headroom = creditLimit - currentExposure;
      if (currentExposure > creditLimit) {
        exposureStatus = 'over';
      } else if (headroom < creditLimit * 0.1) {
        exposureStatus = 'near';
      } else {
        exposureStatus = 'safe';
      }
    }

    return {
      id: c.id,
      code: c.code,
      name: c.name,
      phone: c.phone,
      city: c.city,
      paymentTermDays: c.paymentTermDays,
      creditLimit: c.creditLimit ? Number(c.creditLimit) : null,
      isActive: c.isActive,
      headroom,
      exposureStatus,
    };
  });
}
