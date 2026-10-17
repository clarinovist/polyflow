import { fetchProductLearning } from '@/actions/admin/product-learning';
import { LearningCenter } from './learning-center';

export const metadata = { title: 'Learning Center | PolyFlow' };
export default async function ProductLearningPage() {
    return <LearningCenter data={await fetchProductLearning()} />;
}
