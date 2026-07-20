import { redirect } from "next/navigation";

export default async function LegacyMaklonReceiptsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; endDate?: string }>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params.startDate) qs.set("startDate", params.startDate);
  if (params.endDate) qs.set("endDate", params.endDate);
  const query = qs.toString();
  redirect(query ? `/maklon/receipts?${query}` : "/maklon/receipts");
}
