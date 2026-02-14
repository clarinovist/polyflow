/**
 * PolyFlow Structured Logger
 * 
 * Centralized logging with severity levels, timestamps, 
 * and module context. Replaces scattered console.log calls.
 * 
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.info('Order created', { orderId: '123', module: 'sales' });
 *   logger.error('Payment failed', { error, module: 'finance' });
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
    module?: string;
    userId?: string;
    [key: string]: unknown;
}

interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: string;
    context?: LogContext;
    error?: {
        name: string;
        message: string;
        stack?: string;
    };
}

const LOG_LEVELS: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const MIN_LEVEL = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[MIN_LEVEL];
}

function formatEntry(entry: LogEntry): string {
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
    const module = entry.context?.module ? ` [${entry.context.module}]` : '';
    const ctx = entry.context
        ? ` ${JSON.stringify(
            Object.fromEntries(
                Object.entries(entry.context).filter(([k]) => k !== 'module')
            )
        )}`
        : '';
    const err = entry.error ? ` | ${entry.error.name}: ${entry.error.message}` : '';

    return `${prefix}${module} ${entry.message}${ctx}${err}`;
}

function createEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: unknown
): LogEntry {
    const entry: LogEntry = {
        level,
        message,
        timestamp: new Date().toISOString(),
        context,
    };

    if (error instanceof Error) {
        entry.error = {
            name: error.name,
            message: error.message,
            stack: error.stack,
        };
    }

    return entry;
}

function log(level: LogLevel, message: string, context?: LogContext, error?: unknown) {
    if (!shouldLog(level)) return;

    const entry = createEntry(level, message, context, error);
    const formatted = formatEntry(entry);

    switch (level) {
        case 'debug':
            console.debug(formatted);
            break;
        case 'info':
            console.info(formatted);
            break;
        case 'warn':
            console.warn(formatted);
            break;
        case 'error':
            console.error(formatted);
            if (entry.error?.stack) {
                console.error(entry.error.stack);
            }
            // Future: Send to Sentry here
            break;
    }
}

export const logger = {
    debug: (message: string, context?: LogContext) => log('debug', message, context),
    info: (message: string, context?: LogContext) => log('info', message, context),
    warn: (message: string, context?: LogContext) => log('warn', message, context),
    error: (message: string, context?: LogContext & { error?: unknown }) => {
        const { error: err, ...ctx } = context || {};
        log('error', message, ctx, err);
    },
};
