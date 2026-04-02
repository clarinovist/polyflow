type Channel = 'telegram' | 'web';

type Counter = {
  allowed: number;
  blocked: number;
  failed: number;
  total: number;
};

type Snapshot = {
  since: string;
  total: Counter;
  byChannel: Record<Channel, Counter>;
};

const since = new Date();

const makeCounter = (): Counter => ({
  allowed: 0,
  blocked: 0,
  failed: 0,
  total: 0,
});

const state: Snapshot = {
  since: since.toISOString(),
  total: makeCounter(),
  byChannel: {
    telegram: makeCounter(),
    web: makeCounter(),
  },
};

function bump(counter: Counter, allowed: boolean, success: boolean): void {
  counter.total += 1;

  if (!success) {
    counter.failed += 1;
    return;
  }

  if (allowed) counter.allowed += 1;
  else counter.blocked += 1;
}

export function recordVirtualCsMetric(channel: Channel, allowed: boolean, success: boolean): void {
  bump(state.total, allowed, success);
  bump(state.byChannel[channel], allowed, success);
}

export function getVirtualCsMetrics(): Snapshot {
  return {
    since: state.since,
    total: { ...state.total },
    byChannel: {
      telegram: { ...state.byChannel.telegram },
      web: { ...state.byChannel.web },
    },
  };
}
