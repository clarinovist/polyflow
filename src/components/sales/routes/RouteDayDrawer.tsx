'use client';

import dynamic from 'next/dynamic';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { MapPin } from 'lucide-react';
import { RouteStatsBar } from './RouteStatsBar';
import { RouteStopList } from './RouteStopList';
import { RouteCandidatePicker } from './RouteCandidatePicker';
import { RouteDayDrawerActions } from './RouteDayDrawerActions';
import { useRouteDayPlan, type DrawerCustomer } from './use-route-day-plan';
import { useRouteDayTools } from './use-route-day-tools';
import type { VisitAgeInfo } from './WeeklyRouteBoard';

const DynamicRouteMapPreview = dynamic(
    () => import('./RouteMapPreview').then((m) => m.RouteMapPreview),
    {
        ssr: false,
        loading: () => (
            <div className="flex items-center justify-center bg-muted/30 rounded-lg border h-[280px]">
                <MapPin className="h-6 w-6 text-muted-foreground animate-pulse" />
            </div>
        ),
    },
);

type RouteDayDrawerProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    date: string | null; // ISO yyyy-MM-dd
    userId: string | null;
    repName: string;
    allCustomers: DrawerCustomer[];
    /** customerId → true kalau customer ini juga dirutekan ke rep lain pada tanggal ini. */
    conflictCustomerIds: Set<string>;
    /** R6: umur kunjungan per customer, dialirkan dari WeeklyRouteBoard. */
    lastVisitByCustomer: Map<string, VisitAgeInfo>;
    onSaved: () => void;
};

/**
 * Editor satu sel (tanggal × rep) papan mingguan. Logic data ada di
 * use-route-day-plan.ts (CRUD inti) dan use-route-day-tools.ts (utilitas
 * overflow menu); komponen ini murni komposisi + layout.
 */
export function RouteDayDrawer({
    open,
    onOpenChange,
    date,
    userId,
    repName,
    allCustomers,
    conflictCustomerIds,
    lastVisitByCustomer,
    onSaved,
}: RouteDayDrawerProps) {
    const plan = useRouteDayPlan({
        open,
        date,
        userId,
        allCustomers,
        conflictCustomerIds,
        lastVisitByCustomer,
        onSaved,
        onOpenChange,
    });

    const tools = useRouteDayTools({
        date,
        userId,
        planId: plan.planId,
        items: plan.items,
        applyOrderedIds: plan.applyOrderedIds,
        setIsSaving: plan.setIsSaving,
    });

    const formattedDate = date
        ? new Date(date).toLocaleDateString('id-ID', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
          })
        : '';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 flex-wrap">
                        Rute {repName} · {formattedDate}
                        {plan.planStatus && (
                            <Badge
                                variant={
                                    plan.planStatus === 'PUBLISHED'
                                        ? 'default'
                                        : 'secondary'
                                }
                                className="text-[10px]"
                            >
                                {plan.planStatus}
                            </Badge>
                        )}
                    </DialogTitle>
                </DialogHeader>

                {plan.loading ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                        Memuat rute...
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="space-y-3">
                            <RouteStatsBar
                                customers={plan.mapCustomers}
                                totalCount={plan.items.length}
                                compliance={plan.compliance ?? undefined}
                            />
                            <DynamicRouteMapPreview
                                customers={plan.mapCustomers}
                                height={260}
                            />
                        </div>

                        <div className="space-y-3">
                            <RouteStopList
                                items={plan.items}
                                onReorder={plan.reorderItems}
                                onRemove={plan.removeItem}
                                disabled={plan.isSaving}
                            />

                            <RouteCandidatePicker
                                search={plan.search}
                                onSearchChange={plan.setSearch}
                                showAllCustomers={plan.showAllCustomers}
                                onShowAllCustomersChange={
                                    plan.setShowAllCustomers
                                }
                                candidates={plan.candidates}
                                onAdd={plan.addCandidate}
                                showTemplatePicker={tools.showTemplatePicker}
                                templateDates={tools.templateDates}
                                onCloseTemplatePicker={() =>
                                    tools.setShowTemplatePicker(false)
                                }
                                onCopyFromTemplate={
                                    tools.handleCopyFromTemplate
                                }
                            />
                        </div>
                    </div>
                )}

                <RouteDayDrawerActions
                    isSaving={plan.isSaving}
                    loading={plan.loading}
                    planId={plan.planId}
                    repName={repName}
                    formattedDate={formattedDate}
                    isDirty={plan.isDirty}
                    itemsCount={plan.items.length}
                    onCopyLastWeek={tools.handleCopyLastWeek}
                    onLoadTemplates={tools.handleLoadTemplates}
                    onImportExcel={tools.handleImportExcel}
                    onOptimize={tools.handleOptimize}
                    onDelete={plan.handleDelete}
                    onSaveDraft={plan.handleSaveDraft}
                    onPublish={plan.handlePublish}
                />
            </DialogContent>
        </Dialog>
    );
}
