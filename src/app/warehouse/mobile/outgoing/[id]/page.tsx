import { getDeliveryOrderById } from "@/actions/inventory/deliveries";
import { serializeData } from "@/lib/utils/utils";
import { notFound } from "next/navigation";
import { WarehouseOutgoingDetailClient } from "./WarehouseOutgoingDetailClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function WarehouseMobileOutgoingDetailPage({ params }: PageProps) {
  const { id } = await params;
  const result = await getDeliveryOrderById(id);

  if (!result?.success || !result.data) {
    notFound();
  }

  const order = serializeData(result.data) as {
    id: string;
    orderNumber: string;
    status: string;
    deliveryDate: string;
    notes?: string;
    sourceLocation?: { name: string };
    salesOrder?: {
      orderNumber: string;
      customer?: { name: string };
    };
    items: {
      id: string;
      quantity: number;
      verifiedQuantity?: number | null;
      productVariant?: {
        name: string;
        skuCode: string;
        primaryUnit: string;
      };
    }[];
  };

  return <WarehouseOutgoingDetailClient order={order} />;
}
