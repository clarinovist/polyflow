import { getMyFieldCustomers } from '@/actions/sales/field-actions';
import { CustomerListClient } from './CustomerListClient';

export default async function SalesMobileCustomersPage(props: {
    searchParams: Promise<{ startVisit?: string }>;
}) {
    const params = await props.searchParams;
    const customersRes = await getMyFieldCustomers();
    const customers =
        customersRes.success && customersRes.data ? customersRes.data : [];

    const serialized = customers.map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        phone: c.phone,
        photoUrl: c.photoUrl,
        latitude: c.latitude ? Number(c.latitude) : null,
        longitude: c.longitude ? Number(c.longitude) : null,
        city: c.city,
        isActive: c.isActive,
    }));

    return (
        <CustomerListClient
            customers={serialized}
            showStartVisit={params.startVisit === 'true'}
        />
    );
}
