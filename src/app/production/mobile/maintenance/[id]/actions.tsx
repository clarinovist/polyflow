'use client';

import { MaintenanceActions as SharedMaintenanceActions } from '@/components/production/maintenance-actions';
import {
    approveMobileMaintenanceRequest,
    rejectMobileMaintenanceRequest,
} from '@/actions/production/mobile-maintenance';

type Props = React.ComponentProps<typeof SharedMaintenanceActions>;

/**
 * Mobile keeps shared presentation, but risky decisions are routed through
 * capability-gated actions instead of the desktop action exports.
 */
export function MaintenanceActions(props: Props) {
    return (
        <SharedMaintenanceActions
            {...props}
            approveAction={approveMobileMaintenanceRequest}
            rejectAction={rejectMobileMaintenanceRequest}
        />
    );
}
