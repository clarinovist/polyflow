const EXPECTED_CALLBACK_CAUSES = new Set([
    'UserNotFound',
    'UserInactive',
    'LoginRateLimited',
]);

interface AuthLikeError extends Error {
    type?: string;
    cause?: unknown;
}

interface ErrorCauseWithErr {
    err?: unknown;
}

export function getAuthErrorType(error: Error): string {
    const typedError = error as AuthLikeError;
    return typeof typedError.type === 'string' && typedError.type.length > 0
        ? typedError.type
        : error.name;
}

export function getAuthErrorCauseMessage(error: Error): string | null {
    const cause = (error as AuthLikeError).cause;
    if (!cause || typeof cause !== 'object') {
        return null;
    }

    const nestedError = (cause as ErrorCauseWithErr).err;
    if (nestedError instanceof Error) {
        return nestedError.message;
    }

    return null;
}

export function shouldSuppressExpectedAuthError(error: Error): boolean {
    const type = getAuthErrorType(error);
    if (type === 'CredentialsSignin') {
        return true;
    }

    if (type !== 'CallbackRouteError') {
        return false;
    }

    const causeMessage = getAuthErrorCauseMessage(error);
    return causeMessage !== null && EXPECTED_CALLBACK_CAUSES.has(causeMessage);
}
