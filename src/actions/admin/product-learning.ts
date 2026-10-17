'use server';

import { revalidatePath } from 'next/cache';
import { requireLearningOwner } from '@/lib/learning/authorization';
import { learningReviewSchema, type LearningReview } from '@/lib/learning/contracts';
import { getProductLearningOverview, reviewProductLearning } from '@/services/admin/product-learning.service';

export async function fetchProductLearning() {
    await requireLearningOwner();
    return getProductLearningOverview();
}
export async function reviewLearning(input: LearningReview): Promise<{ success: boolean; error?: string }> {
    const actorId = await requireLearningOwner();
    const parsed = learningReviewSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: 'Isi referensi commit SHA lengkap dan path regression test yang valid.' };
    try {
        await reviewProductLearning(parsed.data, actorId);
        revalidatePath('/admin/learning');
        return { success: true };
    } catch {
        return { success: false, error: 'Perubahan tidak tersimpan. Periksa kebijakan, status, dan muat ulang sebelum mencoba lagi.' };
    }
}
