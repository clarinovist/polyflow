import { getPurchaseRequests } from "@/actions/purchasing/purchasing";
import { getSuppliers } from "@/actions/purchasing/supplier";
import { RequestList } from "./RequestList";
import { Metadata } from "next";
import { purchasingLabels } from "@/lib/labels";

export const metadata: Metadata = {
  title: "Permintaan Pembelian",
  description: "Kelola permintaan pembelian internal.",
};

export default async function PurchaseRequestsPage() {
  const [requestsRes, suppliersRes] = await Promise.all([
    getPurchaseRequests(),
    getSuppliers(),
  ]);

  const requests =
    requestsRes.success && requestsRes.data ? requestsRes.data : [];
  const suppliers =
    suppliersRes.success && suppliersRes.data ? suppliersRes.data : [];

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">
          {purchasingLabels.purchaseRequest}
        </h2>
      </div>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <RequestList requests={requests as any} suppliers={suppliers} />
    </div>
  );
}
