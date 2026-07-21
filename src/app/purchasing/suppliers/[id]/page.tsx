import { getSupplierById } from '@/actions/purchasing/supplier';
import { getSupplierProducts } from '@/actions/purchasing/supplier-product';
import { notFound } from 'next/navigation';
import { Supplier360Tabs } from '@/components/purchasing/suppliers/Supplier360Tabs';

export default async function SupplierDetailPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await props.params;
  const { tab } = await props.searchParams;

  const supplierRes = await getSupplierById(id);
  const supplier = supplierRes?.success && supplierRes.data ? supplierRes.data : null;
  if (!supplier) notFound();

  const supplierProductsRes = await getSupplierProducts(id);
  const supplierProducts = supplierProductsRes?.success && supplierProductsRes.data ? (supplierProductsRes.data as unknown as { id: string; isPreferred: boolean; unitPrice: number | null; leadTimeDays: number | null; minOrderQty: number | null; productVariant: { name: string; skuCode: string; product: { name: string } } }[]) : [];

  return <Supplier360Tabs supplier={supplier as never} supplierProducts={supplierProducts} initialTab={tab || 'overview'} />;
}
