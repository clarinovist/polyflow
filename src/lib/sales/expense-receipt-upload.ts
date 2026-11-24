import { compressImageForUpload } from '@/lib/media/compress-image';

export const EXPENSE_RECEIPT_UPLOAD_ENDPOINT = '/api/upload/expense-receipt';

export class ReceiptUploadError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ReceiptUploadError';
    }
}

interface UploadResponseBody {
    success?: boolean;
    url?: string;
    error?: string;
}

async function readBody(response: Response): Promise<UploadResponseBody> {
    try {
        return (await response.json()) as UploadResponseBody;
    } catch {
        throw new ReceiptUploadError(`Upload gagal (HTTP ${response.status}).`);
    }
}

async function postReceipt(file: File): Promise<Response> {
    const formData = new FormData();
    formData.append('file', file);
    try {
        return await fetch(EXPENSE_RECEIPT_UPLOAD_ENDPOINT, {
            method: 'POST',
            body: formData,
        });
    } catch {
        throw new ReceiptUploadError('Gagal mengunggah nota. Cek koneksi.');
    }
}

/**
 * Compresses a receipt photo and uploads it. Resolves the `url` that must be
 * sent as `receiptUrl`; any failure throws a ReceiptUploadError whose message
 * is safe to show to the user.
 */
export async function uploadExpenseReceipt(file: File): Promise<string> {
    const uploadFile = await compressImageForUpload(file);
    const response = await postReceipt(uploadFile);
    if (response.status === 401) {
        throw new ReceiptUploadError('Sesi berakhir, silakan login kembali.');
    }
    const body = await readBody(response);
    if (!response.ok || !body.url) {
        throw new ReceiptUploadError(body.error || 'Upload nota gagal.');
    }
    return body.url;
}
