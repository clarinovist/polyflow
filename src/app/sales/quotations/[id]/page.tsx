import { redirect } from "next/navigation";

/** /sales/quotations/[id] → unified SO detail */
export default async function QuotationDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/sales/orders/${id}`);
}
