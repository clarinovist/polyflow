import { withTenant } from '@/lib/core/tenant';
import { prisma } from '@/lib/core/prisma';
import {
    requireDeliveryAccess,
    requireSalesAccess,
    requireSalesApprover,
} from '@/lib/auth/sales-access';
import {
    safeAction,
    BusinessRuleError,
    NotFoundError,
} from '@/lib/errors/errors';
import { computeDeliveryTotals } from '@/lib/sales/delivery-pricing';
import {
    canTransitionSchedule,
    canActivateSchedule,
    canCloseSchedule,
    canTransitionTrip,
    canDepartTrip,
    validateDepartureInWeek,
    canRemoveTrip,
    isSOSchedulable,
    isDOAlreadyAssigned,
    validateStopHasSource,
    validateTransportMode,
    validateStopSource,
    canGenerateSJ,
    canRescheduleTrip,
    canCancelTrip,
    canReopenTrip,
    checkSameDayTrips,
} from '@/lib/sales/delivery-schedule-rules';
import {
    ScheduleStatus,
    TripStatus,
    RateType,
    Prisma,
    TransportMode,
    ActivityType,
} from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { assignSalesOrderToTripSchema } from '@/lib/schemas/sales';

export {
    withTenant,
    prisma,
    requireDeliveryAccess,
    requireSalesAccess,
    requireSalesApprover,
    safeAction,
    BusinessRuleError,
    NotFoundError,
    computeDeliveryTotals,
    canTransitionSchedule,
    canActivateSchedule,
    canCloseSchedule,
    canTransitionTrip,
    canDepartTrip,
    validateDepartureInWeek,
    canRemoveTrip,
    isSOSchedulable,
    isDOAlreadyAssigned,
    validateStopHasSource,
    validateTransportMode,
    validateStopSource,
    canGenerateSJ,
    canRescheduleTrip,
    canCancelTrip,
    canReopenTrip,
    checkSameDayTrips,
    ScheduleStatus,
    TripStatus,
    RateType,
    Prisma,
    TransportMode,
    ActivityType,
    revalidatePath,
    assignSalesOrderToTripSchema,
};
