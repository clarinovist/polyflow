'use server';

import { withTenant } from '@/lib/core/tenant';
import { requireFinanceAccess } from '@/lib/auth/finance-access';
import { hasWorkspaceEntitlement } from '@/lib/auth/access-policy';
import { canSeeNavHref } from '@/lib/auth/permission-match';
import { safeAction } from '@/lib/errors/errors';
import { serializeData } from '@/lib/utils/utils';
import {
    readFinanceAttention,
    readFinanceCashHealth,
    readFinanceDrivers,
    readFinancePeriodSignals,
    readFinanceProfitHealth,
    resolveFinanceDashboardPeriod,
    resolveFreshFinanceDashboardAccess,
} from '@/services/finance/finance-dashboard-service';

export const getFinanceShiftBoard = withTenant(
    async function getFinanceShiftBoard(dateRange?: {
        startDate?: Date;
        endDate?: Date;
    }) {
        return safeAction(async () => {
            const session = await requireFinanceAccess();
            if (!hasWorkspaceEntitlement('finance')) {
                return {
                    generatedAt: new Date().toISOString(),
                    state: 'HIDDEN' as const,
                    period: null,
                    permissions: null,
                    health: null,
                    attention: null,
                    periodSignals: null,
                    drivers: null,
                };
            }

            // Resolve fresh role + exact root grant before every nominal reader.
            const access = await resolveFreshFinanceDashboardAccess(
                session.user.id,
            );
            const resources = access.resources;
            const canOpen = (href: string) =>
                canSeeNavHref(href, resources, '/finance');
            const links = {
                receivedPayments: canOpen('/finance/payments/received')
                    ? '/finance/payments/received'
                    : null,
                sentPayments: canOpen('/finance/payments/sent')
                    ? '/finance/payments/sent'
                    : null,
                pettyCash: canOpen('/finance/petty-cash')
                    ? '/finance/petty-cash'
                    : null,
                journals: canOpen('/finance/journals')
                    ? '/finance/journals'
                    : null,
                salesInvoices: canOpen('/finance/invoices/sales')
                    ? '/finance/invoices/sales'
                    : null,
                purchaseInvoices: canOpen('/finance/invoices/purchase')
                    ? '/finance/invoices/purchase'
                    : null,
                reconciliation: canOpen('/finance/bank-reconciliation')
                    ? '/finance/bank-reconciliation'
                    : null,
                periods: canOpen('/finance/periods')
                    ? '/finance/periods'
                    : null,
                returns: canOpen('/finance/returns')
                    ? '/finance/returns'
                    : null,
                balanceSheet: canOpen('/finance/reports/balance-sheet')
                    ? '/finance/reports/balance-sheet'
                    : null,
                incomeStatement: canOpen('/finance/reports/income-statement')
                    ? '/finance/reports/income-statement'
                    : null,
            };
            const now = new Date();
            const period = resolveFinanceDashboardPeriod(dateRange, now);
            const [profit, cash, attention, periodSignals, drivers] =
                await Promise.allSettled([
                    readFinanceProfitHealth(period),
                    readFinanceCashHealth(period.end),
                    readFinanceAttention(now),
                    readFinancePeriodSignals(now),
                    readFinanceDrivers(period.end),
                ]);
            const profitData =
                profit.status === 'fulfilled' ? profit.value : null;
            const cashData = cash.status === 'fulfilled' ? cash.value : null;
            const driverData =
                drivers.status === 'fulfilled' ? drivers.value : null;
            const comparableDrivers =
                driverData != null &&
                driverData.revenue.length >= 4 &&
                driverData.revenue.length === driverData.netIncome.length &&
                driverData.revenue.every(
                    (point, index) =>
                        point.month === driverData.netIncome[index]?.month,
                );

            return serializeData({
                generatedAt: now.toISOString(),
                state: 'AVAILABLE' as const,
                period: {
                    start: period.start.toISOString(),
                    end: period.end.toISOString(),
                    label: period.label,
                    asOfLabel: period.asOfLabel,
                },
                permissions: { links },
                health: {
                    cash: {
                        state:
                            cash.status === 'rejected'
                                ? ('UNAVAILABLE' as const)
                                : cashData?.configured
                                  ? ('AVAILABLE' as const)
                                  : ('NOT_CONFIGURED' as const),
                        value:
                            cashData?.configured === true
                                ? cashData.value
                                : null,
                    },
                    revenue: {
                        state: profitData
                            ? ('AVAILABLE' as const)
                            : ('UNAVAILABLE' as const),
                        value: profitData?.revenue ?? null,
                    },
                    grossProfit: {
                        state: profitData
                            ? ('AVAILABLE' as const)
                            : ('UNAVAILABLE' as const),
                        value: profitData?.grossProfit ?? null,
                    },
                    netProfit: {
                        state: profitData
                            ? ('AVAILABLE' as const)
                            : ('UNAVAILABLE' as const),
                        value: profitData?.netProfit ?? null,
                    },
                },
                attention:
                    attention.status === 'fulfilled' ? attention.value : null,
                periodSignals:
                    periodSignals.status === 'fulfilled'
                        ? periodSignals.value
                        : null,
                drivers: {
                    state:
                        drivers.status === 'rejected'
                            ? ('UNAVAILABLE' as const)
                            : comparableDrivers
                              ? ('AVAILABLE' as const)
                              : ('NOT_CONFIGURED' as const),
                    revenue: comparableDrivers ? driverData.revenue : [],
                    netIncome: comparableDrivers ? driverData.netIncome : [],
                },
            });
        });
    },
);
