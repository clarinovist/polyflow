interface SelfieUploadResult {
    url: string | null;
    error?: string;
    nonJson?: boolean;
    retryable?: boolean;
}

export async function uploadSelfie(
    file: File,
    employeeId: string,
    kind: 'clock_in' | 'clock_out',
): Promise<SelfieUploadResult> {
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
            const isRedirectToDesktop =
                res.redirected &&
                typeof res.url === 'string' &&
                res.url.includes('/device/desktop-required');
            const detail = isRedirectToDesktop
                ? 'Mobile gate memblokir request — endpoint ini tidak diizinkan dari perangkat mobile.'
                : 'Kemungkinan WiFi kiosk terblokir captive portal/proxy. Coba refresh halaman atau ganti jaringan.';
            console.error('[uploadSelfie] non-JSON response', {
                status: res.status,
                contentType,
                redirected: res.redirected,
                bodySnippet: rawText.slice(0, 300),
            });
            return {
                url: null,
                error: `Server merespons tidak valid (bukan JSON) — ${detail}`,
                nonJson: true,
                retryable: !isRedirectToDesktop,
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
): Promise<SelfieUploadResult> {
    const first = await uploadSelfie(file, employeeId, kind);
    if (!first.nonJson || first.retryable === false) return first;
    await new Promise((r) => setTimeout(r, 1000));
    return uploadSelfie(file, employeeId, kind);
}
