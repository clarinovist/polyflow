'use server';

import { revalidatePath } from 'next/cache';
export async function refreshKioskData(): Promise<void> {
    revalidatePath('/kiosk');
}
