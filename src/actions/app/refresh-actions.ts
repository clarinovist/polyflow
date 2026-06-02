'use server';

import { revalidatePath } from 'next/cache';

export async function refreshWarehouseData(): Promise<void> {
    revalidatePath('/warehouse');
}

export async function refreshKioskData(): Promise<void> {
    revalidatePath('/kiosk');
}
