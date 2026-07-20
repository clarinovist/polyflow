import { redirect } from "next/navigation";

export default async function LegacyMaklonReceiptDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/maklon/receipts/${id}`);
}
