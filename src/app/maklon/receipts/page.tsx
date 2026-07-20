import React from "react";
import { PurchaseService } from "@/services/purchasing/purchase-service";
import { GoodsReceiptTable } from "@/components/purchasing/orders/GoodsReceiptTable";
import { PackageSearch } from "lucide-react";
import { serializeData } from "@/lib/utils/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UrlTransactionDateFilter } from "@/components/common/url-transaction-date-filter";
import { parseISO, startOfMonth, endOfMonth } from "date-fns";
import { PageHeader } from "@/components/ui/page-header";
import { withTenantPage } from "@/lib/core/tenant";

const getReceipts = withTenantPage(async (opts) => {
  return PurchaseService.getGoodsReceipts(opts);
});

export default async function MaklonReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; endDate?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const defaultStart = startOfMonth(now);
  const defaultEnd = endOfMonth(now);

  const checkStart = params?.startDate
    ? parseISO(params.startDate)
    : defaultStart;
  const checkEnd = params?.endDate ? parseISO(params.endDate) : defaultEnd;

  const receipts = await getReceipts({
    startDate: checkStart,
    endDate: checkEnd,
    isMaklon: true,
  });

  const serializedReceipts = serializeData(receipts);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Penerimaan Maklon"
        description="Kelola penerimaan bahan milik customer untuk order Maklon Jasa"
        actions={
          <>
            <Link href="/warehouse/incoming/create-maklon" passHref>
              <Button className="h-9 shrink-0 gap-2">
                <PackageSearch className="h-4 w-4" />
                Penerimaan Maklon Baru
              </Button>
            </Link>
            <UrlTransactionDateFilter defaultPreset="this_month" />
          </>
        }
      />
      <GoodsReceiptTable
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        receipts={serializedReceipts as any}
        basePath="/maklon/receipts"
      />
    </div>
  );
}
