import { getPurchaseRequests } from "@/actions/purchasing/purchasing";
import { getSuppliers } from "@/actions/purchasing/supplier";
import { RequestList } from "./RequestList";
import { Metadata } from "next";
import { purchasingLabels } from "@/lib/labels";
import { PurchaseRequestStatus } from "@prisma/client";

export const metadata: Metadata = {
  title: "Permintaan Pembelian",
  description: "Kelola permintaan pembelian internal.",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const VALID_PR_STATUS = new Set(Object.values(PurchaseRequestStatus));

export default async function PurchaseRequestsPage(props: {
  searchParams: SearchParams;
}) {
  const searchParams = await props.searchParams;
  const statusParam =
    typeof searchParams.status === "string" ? searchParams.status : undefined;
  const statusFilter =
    statusParam && VALID_PR_STATUS.has(statusParam as PurchaseRequestStatus)
      ? (statusParam as PurchaseRequestStatus)
      : undefined;

  const [requestsRes, suppliersRes] = await Promise.all([
    getPurchaseRequests(statusFilter ? { status: statusFilter } : undefined),
    getSuppliers(),
  ]);

  const requests =
    requestsRes.success && requestsRes.data ? requestsRes.data : [];
  const suppliers =
    suppliersRes.success && suppliersRes.data ? suppliersRes.data : [];

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            {purchasingLabels.purchaseRequest}
          </h2>
          {statusFilter && (
            <p className="text-sm text-muted-foreground mt-1">
              Filter status: {statusFilter}
            </p>
          )}
        </div>
      </div>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <RequestList requests={requests as any} suppliers={suppliers} />
    </div>
  );
}
