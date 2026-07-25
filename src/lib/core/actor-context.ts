import { AsyncLocalStorage } from 'async_hooks';

const globalForActorContext = globalThis as unknown as {
    __polyflowActorContext?: AsyncLocalStorage<{ userId: string }>;
};

export const actorContext: AsyncLocalStorage<{ userId: string }> =
    globalForActorContext.__polyflowActorContext ??
    (globalForActorContext.__polyflowActorContext = new AsyncLocalStorage<{ userId: string }>());

/** Get the current actor userId from async context (undefined outside actor scope). */
export function getActorUserId(): string | undefined {
    return actorContext.getStore()?.userId;
}

/** Run a function within an actor context. */
export function runWithActor<T>(userId: string, fn: () => T): T {
    return actorContext.run({ userId }, fn);
}
