/**
 * Offline command registry — defines which command types can be queued
 * and their validation/sync handlers.
 *
 * Only registered commands may enter the offline queue.
 * Ship/finalize/post/payment/approval are explicitly excluded.
 *
 * @see docs/plan/2026-07-28-mobile-scope-strategy.md §6.6
 */

export interface CommandDefinition<TPayload = unknown> {
    /** Unique command type identifier */
    type: string;
    /** Human-readable label */
    label: string;
    /** Validate payload before queueing. Returns true if valid. */
    validate: (payload: TPayload) => boolean;
    /** Execute the command on the server. Throws on failure. */
    execute: (payload: TPayload) => Promise<unknown>;
    /** Whether this command requires the device to be online */
    requiresOnline: boolean;
}

const commandRegistry = new Map<string, CommandDefinition>();

/**
 * Register a command type for offline queueing.
 */
export function registerCommand<T>(definition: CommandDefinition<T>): void {
    commandRegistry.set(definition.type, definition as CommandDefinition);
}

/**
 * Get a registered command definition by type.
 */
export function getCommandDef(
    type: string,
): CommandDefinition | undefined {
    return commandRegistry.get(type);
}

/**
 * Check if a command type is registered (can be queued).
 */
export function isCommandRegistered(type: string): boolean {
    return commandRegistry.has(type);
}

/**
 * Get all registered command types.
 */
export function getRegisteredCommandTypes(): string[] {
    return Array.from(commandRegistry.keys());
}

// ---------------------------------------------------------------------------
// Built-in commands
// ---------------------------------------------------------------------------

/**
 * Register the Sales Visit command — the first offline-capable command.
 * Uses clientVisitId for idempotency (unique constraint in DB).
 */
export function registerVisitCommand(): void {
    registerCommand({
        type: 'sales.visit',
        label: 'Kunjungan Sales',
        validate: (payload: {
            clientVisitId?: string;
            customerId?: string;
        }) => {
            return !!(payload.clientVisitId && payload.customerId);
        },
        execute: async (payload: unknown) => {
            // Dynamic import to avoid bundling server actions in client
            const { startFieldVisitAction } = await import(
                '@/actions/sales/field-visit'
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return startFieldVisitAction(payload as any);
        },
        requiresOnline: true,
    });
}

/**
 * Initialize all built-in commands.
 * Call once on app startup (client-side).
 */
export function initializeOfflineCommands(): void {
    if (isCommandRegistered('sales.visit')) return; // already initialized
    registerVisitCommand();
}
