import { withTenantPage } from '@/lib/core/tenant';
import { serializeData } from '@/lib/utils/utils';
import { notFound } from 'next/navigation';
import { loadKioskFocus } from '@/services/production/kiosk-focus-service';
import KioskJobFocus, { type Order, type Shift } from './KioskJobFocus';

const getFocus = withTenantPage(async function getFocus(orderId: string) {
    return loadKioskFocus(orderId);
});

export default async function KioskFocusPage({
    params,
}: {
    params: Promise<{ orderId: string }>;
}) {
    const { orderId } = await params;
    const data = await getFocus(orderId);

    if (!data) notFound();

    const { order, shifts, materials, outputLogs } = data;

    return (
        <div className="mx-auto h-full max-w-7xl p-4 md:p-6">
            <KioskJobFocus
                order={
                    serializeData({ ...order, outputLogs }) as unknown as Order
                }
                shifts={serializeData(shifts) as unknown as Shift[]}
                materials={serializeData(materials)}
            />
        </div>
    );
}
