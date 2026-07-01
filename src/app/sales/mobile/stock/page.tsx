import { getProductVariants } from "@/actions/inventory/inventory";
import { getLocations } from "@/actions/inventory/inventory";
import { StockCheckClient } from "./StockCheckClient";

export default async function SalesMobileStockPage() {
  const [productsRes, locationsRes] = await Promise.all([
    getProductVariants(),
    getLocations(),
  ]);

  const products =
    productsRes.success && productsRes.data ? productsRes.data : [];
  const locations =
    locationsRes.success && locationsRes.data ? locationsRes.data : [];

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
      primaryUnit: p.primaryUnit,
      sellPrice: p.sellPrice ? Number(p.sellPrice) : null,
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
    <StockCheckClient
      products={serializedProducts}
      locations={stockLocations}
    />
  );
}
