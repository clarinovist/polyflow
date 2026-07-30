export async function uploadSelfie(
    file: File,
    employeeId: string,
    kind: 'clock_in' | 'clock_out',
): Promise<{ url: string | null; error?: string; nonJson?: boolean }> {
    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('employeeId', employeeId);
        formData.append('kind', kind);
        const res = await fetch('/api/upload/attendance-photo', {
            method: 'POST',
            body: formData,
        });
        const rawText = await res.text();
        const contentType = res.headers.get('content-type');
        let dataObj: {
            success?: boolean;
            publicUrl?: string;
            url?: string;
            error?: string;
        };
        try {
            const parsed = JSON.parse(rawText) as unknown;
            if (
                typeof parsed !== 'object' ||
                parsed === null ||
                Array.isArray(parsed)
            ) {
                throw new Error('not plain object');
            }
            dataObj = parsed as typeof dataObj;
        } catch {
            console.error('[uploadSelfie] non-JSON response', {
                status: res.status,
                contentType,
                bodySnippet: rawText.slice(0, 300),
            });
            return {
                url: null,
                error: 'Server merespons tidak valid (bukan JSON) — kemungkinan WiFi kiosk terblokir captive portal/proxy. Coba refresh halaman atau ganti jaringan.',
                nonJson: true,
            };
        }
        if (!res.ok) {
            return {
                url: null,
                error: dataObj.error || `Upload selfie gagal (HTTP ${res.status})`,
            };
        }
        const url = dataObj.publicUrl ?? dataObj.url ?? null;
        if (!url) {
            return { url: null, error: 'Upload selfie tidak mengembalikan URL' };
        }
        return { url };
    } catch (error) {
        console.error('Failed to upload selfie:', error);
        const msg =
            error instanceof Error && error.message
                ? error.message
                : 'Koneksi terputus';
        return { url: null, error: `Gagal upload selfie: ${msg}` };
    }
}

export async function uploadSelfieWithRetry(
    file: File,
    employeeId: string,
    kind: 'clock_in' | 'clock_out',
): Promise<{ url: string | null; error?: string; nonJson?: boolean }> {
    const first = await uploadSelfie(file, employeeId, kind);
    if (!first.nonJson) return first;
    await new Promise((r) => setTimeout(r, 1000));
    return uploadSelfie(file, employeeId, kind);
}
