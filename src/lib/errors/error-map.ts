/**
 * Enumeration mapping common API error occurrences strictly to human-friendly UX strings.
 */
export enum ErrorCode {
    // Auth & Permission
    UNAUTHORIZED = 'UNAUTHORIZED',
    FORBIDDEN = 'FORBIDDEN',

    // Validation & State
    VALIDATION_ERROR = 'VALIDATION_ERROR',
    NOT_FOUND = 'NOT_FOUND',
    CONFLICT = 'CONFLICT',

    // External / Third-party
    AI_RESTRICTED_CONTENT = 'AI_RESTRICTED_CONTENT',
    EXTERNAL_API_TIMEOUT = 'EXTERNAL_API_TIMEOUT',
    RATE_LIMITED = 'RATE_LIMITED',

    // Generic
    INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
    DEPLOYMENT_VERSION_MISMATCH = 'DEPLOYMENT_VERSION_MISMATCH',
    UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

const ERROR_MESSAGES: Record<ErrorCode, string> = {
    [ErrorCode.UNAUTHORIZED]: 'Sesi Anda telah berakhir atau belum login. Silahkan login kembali.',
    [ErrorCode.FORBIDDEN]: 'Anda tidak memiliki izin operasi untuk mengakses bagian ini.',
    [ErrorCode.VALIDATION_ERROR]: 'Terdapat kesalahan pada input data Anda. Silahkan periksa ulang formulir.',
    [ErrorCode.NOT_FOUND]: 'Data atau halaman yang Anda cari tidak ditemukan atau telah dihapus.',
    [ErrorCode.CONFLICT]: 'Terjadi konflik data (seperti modifikasi simultan). Mohon memuat ukang halaman.',
    [ErrorCode.AI_RESTRICTED_CONTENT]: 'Prompt yang diberikan mengandung kata atau frasa terlarang menurut safety filter. Cobalah ubah instruksi Anda.',
    [ErrorCode.EXTERNAL_API_TIMEOUT]: 'Terjadi masalah koneksi ke penyedia layanan pihak ketiga (LLM/Email). Sedang dicoba ulang. Harap tunggu sesaat.',
    [ErrorCode.RATE_LIMITED]: 'Anda telah melawati batas request yang ditetapkan. Silahkan coba beberapa menit lagi.',
    [ErrorCode.INTERNAL_SERVER_ERROR]: 'Sistem mendeteksi kesalahan teknis. Tim developer kami telah diberitahu.',
    [ErrorCode.DEPLOYMENT_VERSION_MISMATCH]: 'Sistem telah diperbarui. Mohon muat ulang halaman untuk melanjutkan.',
    [ErrorCode.UNKNOWN_ERROR]: 'Terjadi kesalahan tidak terduga. Silahkan ulangi aksi tersebut.'
};

/**
 * Formats a generic code into a consumer-friendly UI message dialog.
 * Can be plugged directly into Layout Error Boundaries or Toast notifications.
 */
export function getUserFriendlyError(code: ErrorCode | string): string {
    const errorString = ERROR_MESSAGES[code as ErrorCode];
    if (errorString) {
        return errorString;
    }
    
    // Fallback if passing an unknown raw string
    return `Unhandled Exception: ${code}. ${ERROR_MESSAGES[ErrorCode.UNKNOWN_ERROR]}`;
}

export class AppError extends Error {
    public readonly code: ErrorCode;
    public readonly status: number;

    constructor(code: ErrorCode, message?: string, status: number = 400) {
        super(message || ERROR_MESSAGES[code]);
        this.name = 'AppError';
        this.code = code;
        this.status = status;
    }
}
