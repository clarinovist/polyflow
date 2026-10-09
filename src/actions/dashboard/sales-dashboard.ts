'use server';

import { withTenant } from '@/lib/core/tenant';
import { serializeData } from '@/lib/utils/utils';
import { safeAction } from '@/lib/errors/errors';
import { requireSalesAccess } from '@/lib/auth/sales-access';
import { hasWorkspaceEntitlement } from '@/lib/auth/access-policy';
import { canSeeNavHref } from '@/lib/auth/permission-match';
import { DateRange } from '@/types/analytics';
import {
    readSalesAttention,
    readSalesPipelineDashboard,
    readSalesRevenueAndOrders,
    readSalesVisitActual,
    resolveFreshSalesDashboardAccess,
    resolveSalesDashboardPeriod,
    resolveSalesDashboardScope,
} from '@/services/sales/sales-dashboard-service';

export const getSalesDashboardStats = withTenant(
    async function getSalesDashboardStats(dateRange?: DateRange) {
        return safeAction(async () => {
            const session = await requireSalesAccess();
            if (!hasWorkspaceEntitlement('sales')) {
                return {
                    generatedAt: new Date().toISOString(),
                    state: 'HIDDEN' as const,
                    scope: null,
                    period: null,
                    permissions: null,
                    health: null,
                    attention: null,
                    drivers: null,
                };
            }

            const now = new Date();
            const generatedAt = now.toISOString();
            const period = resolveSalesDashboardPeriod(dateRange, now);
            const access = await resolveFreshSalesDashboardAccess(
                session.user.id,
            );
            const scope = await resolveSalesDashboardScope(access.user);
            const operationalScope =
                scope.kind === 'TEAM'
                    ? {
                          kind: 'COMPANY' as const,
                          label: 'Seluruh operasi Sales',
                          actorUserId: scope.actorUserId,
                          fieldScope: {
                              actorUserId: scope.actorUserId,
                              isGlobalViewer: true,
                          },
                      }
                    : scope;
            const { canViewNominal, resources } = access;
            const canOpen = (href: string) =>
                canSeeNavHref(
                    href,
                    resources === 'ALL' ? 'ALL' : resources,
                    href.startsWith('/field/') ? '/field/sales' : '/sales',
                );

            const links = {
                orders: canOpen('/sales/orders') ? '/sales/orders' : null,
                performance: canOpen('/sales/reports/sales-performance')
                    ? '/sales/reports/sales-performance'
                    : null,
                visits: canOpen('/sales/visits') ? '/sales/visits' : null,
                pipeline: canOpen('/sales/pipeline') ? '/sales/pipeline' : null,
                invoices: canOpen('/sales/invoices') ? '/sales/invoices' : null,
                deliveries: canOpen('/sales/deliveries')
                    ? '/sales/deliveries'
                    : null,
                deliverySchedules: canOpen('/sales/delivery-schedules')
                    ? '/sales/delivery-schedules'
                    : null,
                customers: canOpen('/sales/customers')
                    ? '/sales/customers'
                    : null,
                fieldSales: canOpen('/field/sales') ? '/field/sales' : null,
            };
            const includeRevenue = canViewNominal && links.performance != null;
            const [revenue, visits, pipeline, attention] =
                await Promise.allSettled([
                    links.orders || includeRevenue
                        ? readSalesRevenueAndOrders(
                              scope,
                              period,
                              includeRevenue,
                          )
                        : Promise.resolve(null),
                    links.visits
                        ? readSalesVisitActual(scope, period)
                        : Promise.resolve(null),
                    links.pipeline
                        ? readSalesPipelineDashboard(
                              operationalScope,
                              period,
                              canViewNominal,
                          )
                        : Promise.resolve(null),
                    readSalesAttention(operationalScope, now, canViewNominal, {
                        orders: links.orders != null,
                        deliveries: links.deliveries != null,
                        deliverySchedules: links.deliverySchedules != null,
                        invoices: links.invoices != null,
                        customers: links.customers != null,
                    }),
                ]);

            const revenueData =
                revenue.status === 'fulfilled' ? revenue.value : null;
            const visitActual =
                visits.status === 'fulfilled' ? visits.value : null;
            const pipelineData =
                pipeline.status === 'fulfilled' ? pipeline.value : null;
            const attentionData =
                attention.status === 'fulfilled' ? attention.value : null;

            return serializeData({
                generatedAt,
                state: 'AVAILABLE' as const,
                scope: {
                    kind: scope.kind,
                    label: scope.label,
                    operationalLabel: operationalScope.label,
                },
                period: {
                    start: period.start.toISOString(),
                    end: period.end.toISOString(),
                    label: period.label,
                },
                permissions: { canViewNominal, links },
                health: {
                    revenue: {
                        state: !includeRevenue
                            ? ('HIDDEN' as const)
                            : revenueData && revenueData.revenueActual != null
                              ? ('AVAILABLE' as const)
                              : ('UNAVAILABLE' as const),
                        value: revenueData?.revenueActual ?? null,
                        targetState: 'NOT_CONFIGURED' as const,
                    },
                    orders: {
                        state: !links.orders
                            ? ('HIDDEN' as const)
                            : revenueData
                              ? ('AVAILABLE' as const)
                              : ('UNAVAILABLE' as const),
                        value: links.orders
                            ? (revenueData?.orderActual ?? null)
                            : null,
                    },
                    visits: {
                        state: !links.visits
                            ? ('HIDDEN' as const)
                            : visitActual == null
                              ? ('UNAVAILABLE' as const)
                              : ('AVAILABLE' as const),
                        value: links.visits ? visitActual : null,
                    },
                    pipeline: {
                        state: !links.pipeline
                            ? ('HIDDEN' as const)
                            : pipelineData
                              ? ('AVAILABLE' as const)
                              : ('UNAVAILABLE' as const),
                        count: links.pipeline
                            ? (pipelineData?.activeCount ?? null)
                            : null,
                        value: links.pipeline
                            ? (pipelineData?.activeValue ?? null)
                            : null,
                    },
                },
                attention: attentionData,
                drivers: {
                    revenueTrend: {
                        state: !includeRevenue
                            ? ('HIDDEN' as const)
                            : revenue.status === 'rejected'
                              ? ('UNAVAILABLE' as const)
                              : revenueData &&
                                  revenueData.revenueTrend.length >= 4
                                ? ('AVAILABLE' as const)
                                : ('NOT_CONFIGURED' as const),
                        points:
                            includeRevenue &&
                            revenueData &&
                            revenueData.revenueTrend.length >= 4
                                ? revenueData.revenueTrend
                                : [],
                    },
                    topLostReason: {
                        state: !links.pipeline
                            ? ('HIDDEN' as const)
                            : pipeline.status === 'rejected'
                              ? ('UNAVAILABLE' as const)
                              : pipelineData?.topLostReason
                                ? ('AVAILABLE' as const)
                                : ('NOT_CONFIGURED' as const),
                        value: links.pipeline
                            ? (pipelineData?.topLostReason ?? null)
                            : null,
                    },
                },
            });
        });
    },
);
