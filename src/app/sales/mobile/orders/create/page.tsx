import { getCustomers } from "@/actions/sales/customer";
import { getLocations } from "@/actions/inventory/inventory";
import { getProductVariants } from "@/actions/inventory/inventory";
import { QuickOrderWizard } from "./QuickOrderWizard";

export default async function SalesMobileOrderCreatePage(props: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const params = await props.searchParams;
  const [customersRes, locationsRes, productsRes] = await Promise.all([
    getCustomers(),
    getLocations(),
    getProductVariants(),
  ]);

  const customers =
    customersRes.success && customersRes.data ? customersRes.data : [];
  const locations =
    locationsRes.success && locationsRes.data ? locationsRes.data : [];
  const products =
    productsRes.success && productsRes.data ? productsRes.data : [];

  const serializedCustomers = customers.map((c) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    creditLimit: c.creditLimit ? Number(c.creditLimit) : null,
    paymentTermDays: c.paymentTermDays,
  }));

  const serializedProducts = products
    .filter(
      (p) =>
        p.product.productType === "FINISHED_GOOD" ||
        p.product.productType === "PACKAGING",
    )
    .map((p) => ({
      id: p.id,
      name: p.name,
      productName: p.product.name,
      skuCode: p.skuCode,
      sellPrice: p.sellPrice ? Number(p.sellPrice) : null,
      displayUnit:
        p.salesUnit && p.salesUnit !== p.primaryUnit
          ? p.salesUnit
          : p.primaryUnit,
      inventories:
        p.inventories?.map((inv) => ({
          locationId: inv.locationId,
          quantity: Number(inv.quantity),
        })) || [],
    }));

  const stockLocations = locations
    .filter(
      (l) =>
        l.locationType !== "CUSTOMER_OWNED" &&
        (l.slug?.includes("finished") ||
          l.slug?.includes("packing") ||
          l.name.toLowerCase().includes("finished") ||
          l.name.toLowerCase().includes("packing")),
    )
    .map((l) => ({ id: l.id, name: l.name }));

  return (
    <QuickOrderWizard
      customers={serializedCustomers}
      products={serializedProducts}
      locations={stockLocations}
      preselectedCustomerId={params.customer}
    />
  );
}
