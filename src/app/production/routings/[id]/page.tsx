import { getRoute } from '@/actions/production/production-routings';
import { RouteBuilderClient } from '@/components/production/routing/RouteBuilderClient';
import { notFound } from 'next/navigation';

export default async function RouteDetailPage({ params }: { params: { id: string } }) {
  const result = await getRoute(params.id);
  if (!result.success || !result.data) notFound();
  return (
    <div className="p-4 md:p-6">
      <RouteBuilderClient initialRoute={result.data as never} />
    </div>
  );
}
