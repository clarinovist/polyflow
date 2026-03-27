import { getCustomerById } from '@/actions/sales/customer';
import { getSalesOrdersByCustomerId } from '@/actions/sales/sales';
import { notFound } from 'next/navigation';
import { CustomerDetailClient } from '@/components/customers/CustomerDetailClient';

export default async function CustomerDetailPage(props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;

    const [customerRes, salesOrdersRes] = await Promise.all([
        getCustomerById(id),
        getSalesOrdersByCustomerId(id)
    ]);
    const customer = customerRes?.success && customerRes.data ? customerRes.data : null;
    const salesOrders = salesOrdersRes?.success && salesOrdersRes.data ? salesOrdersRes.data : [];

    if (!customer) {
        notFound();
    }

    return (
        <CustomerDetailClient
            customer={{
                ...customer,
                creditLimit: customer.creditLimit ? Number(customer.creditLimit) : null,
                discountPercent: customer.discountPercent ? Number(customer.discountPercent) : null
            }}
            salesOrders={salesOrders.map(order => ({
                ...order,
                totalAmount: order.totalAmount ? Number(order.totalAmount) : null,
                customer: order.customer ? {
                    ...order.customer,
                    creditLimit: order.customer.creditLimit ? Number(order.customer.creditLimit) : null,
                    discountPercent: order.customer.discountPercent ? Number(order.customer.discountPercent) : null
                } : null
            }))}
        />
    );
}
