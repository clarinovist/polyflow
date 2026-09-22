'use server';

import { revalidatePath } from 'next/cache';
import { withTenant } from '@/lib/core/tenant';
import { requirePlanningRole } from '@/lib/tools/auth-checks';
import { safeAction, BusinessRuleError } from '@/lib/errors/errors';
import { orderCustomersSchema, updateOrderCustomers } from '@/services/production/order-customer-service';

export const saveOrderCustomers = withTenant(async function saveOrderCustomers(input: {
    orderId: string;
    customerIds: string[];
}) {
    return safeAction(async () => {
        const session = await requirePlanningRole();
        const parsed = orderCustomersSchema.safeParse(input);
        if (!parsed.success) throw new BusinessRuleError('Pilihan customer tidak valid (maksimal 100).');
        await updateOrderCustomers(parsed.data, session.user.id);
        revalidatePath(`/production/orders/${parsed.data.orderId}`);
        revalidatePath('/production/daily');
        return null;
    });
});
