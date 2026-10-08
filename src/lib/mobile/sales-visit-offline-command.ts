'use client';
import { syncVisitLogsAction } from '@/actions/sales/visits';
import {
    getCommandDef,
    registerCommand,
} from '@/lib/mobile/offline-command-registry';
import type { QueuedVisitLog } from '@/lib/mobile/visit-offline-queue';

export const SALES_VISIT_SYNC_COMMAND = 'sales.visit.sync';
export function isQueuedVisitLog(value: unknown): value is QueuedVisitLog {
    if (!value || typeof value !== 'object') return false;
    const row = value as Partial<QueuedVisitLog>;
    return (
        typeof row.id === 'string' &&
        typeof row.customerId === 'string' &&
        typeof row.checkInTime === 'string' &&
        typeof row.checkOutTime === 'string' &&
        typeof row.durationSeconds === 'number' &&
        typeof row.latitude === 'number' &&
        typeof row.longitude === 'number'
    );
}
function toPayload(log: QueuedVisitLog) {
    return {
        clientId: log.clientVisitId || log.id,
        customerId: log.customerId,
        checkInTime: log.checkInTime,
        checkOutTime: log.checkOutTime,
        durationSeconds: log.durationSeconds,
        latitude: log.latitude,
        longitude: log.longitude,
        distance: log.distance,
        notes: log.notes,
        photoUrl: log.photoUrl || null,
        isExtraCall: log.isOutsideRoute || false,
        extraReason: log.extraReason || undefined,
        routePlanItemId: log.routePlanItemId || undefined,
    };
}
export function registerSalesVisitOfflineCommand() {
    registerCommand<QueuedVisitLog>({
        type: SALES_VISIT_SYNC_COMMAND,
        label: 'Sinkronisasi kunjungan Sales',
        validate: isQueuedVisitLog,
        requiresOnline: false,
        execute: async (payload) => syncVisitLogsAction([toPayload(payload)]),
    });
}
export async function executeQueuedVisit(log: QueuedVisitLog) {
    const command = getCommandDef(SALES_VISIT_SYNC_COMMAND);
    if (!command || !command.validate(log))
        throw new Error('Perintah sinkronisasi kunjungan tidak valid.');
    return command.execute(log) as ReturnType<typeof syncVisitLogsAction>;
}
registerSalesVisitOfflineCommand();
