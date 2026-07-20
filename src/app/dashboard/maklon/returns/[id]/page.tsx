import { redirect } from "next/navigation";

export default async function LegacyMaklonReturnDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/maklon/returns/${id}`);
}
