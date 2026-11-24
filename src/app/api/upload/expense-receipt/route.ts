import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/tools/api-auth';
import {
    getTenantPrefix,
    buildExpenseReceiptKey,
    uploadToR2,
} from '@/lib/storage/r2';
import { requireModuleFromRequest } from '@/lib/modules/guard';
import {
    receiptExtensionForMime,
    resolveReceiptMime,
} from '@/lib/sales/expense-receipt';

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
    try {
        const auth = await requireApiAuth(request, [
            'ADMIN',
            'SALES',
            'MARKETING',
        ]);
        if (auth.response) return auth.response;

        // Reimbursement is paid and journaled by Finance, so the same module
        // entitlement as the remittance proof applies.
        const moduleDeny = await requireModuleFromRequest(request, 'FINANCE');
        if (moduleDeny) return moduleDeny;

        const formData = await request.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 },
            );
        }

        const mimeType = resolveReceiptMime(file.type, file.name);
        if (!mimeType) {
            return NextResponse.json(
                {
                    error: 'Tipe file tidak didukung. Gunakan JPG, PNG, atau WebP.',
                },
                { status: 400 },
            );
        }

        if (file.size > MAX_SIZE) {
            return NextResponse.json(
                { error: 'File terlalu besar. Maksimal 10MB.' },
                { status: 400 },
            );
        }

        const tenant = await getTenantPrefix();
        const key = buildExpenseReceiptKey(
            tenant,
            auth.userId,
            receiptExtensionForMime(mimeType),
        );

        const buffer = Buffer.from(await file.arrayBuffer());
        const publicUrl = await uploadToR2(key, buffer, mimeType);

        return NextResponse.json({
            success: true,
            url: publicUrl,
            key,
            originalName: file.name,
            mimeType,
            sizeBytes: file.size,
        });
    } catch (error) {
        console.error('Expense receipt upload error:', error);
        const message =
            error instanceof Error ? error.message : 'Upload failed';
        return NextResponse.json(
            { error: `Upload gagal: ${message}` },
            { status: 500 },
        );
    }
}
