import { notFound } from "next/navigation";
import { getMaklonReturnByIdAction } from "@/actions/maklon/maklon-return";
import { MaklonReturnDetailClient } from "@/components/production/maklon/MaklonReturnDetailClient";

export default async function MaklonReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await getMaklonReturnByIdAction(id);

  if (!res.success || !res.data) {
    notFound();
  }

  return (
    <div className="p-0 sm:p-6 max-w-7xl mx-auto">
      <MaklonReturnDetailClient ret={res.data} />
    </div>
  );
}
