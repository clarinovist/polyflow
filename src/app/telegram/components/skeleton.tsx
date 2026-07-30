'use client';

export function SkeletonCard() {
  return (
    <div className="tg-card animate-pulse p-4">
      <div className="mb-3 h-4 w-24 rounded bg-black/10 dark:bg-white/10" />
      <div className="h-6 w-20 rounded bg-black/10 dark:bg-white/10" />
      <div className="mt-2 h-3 w-32 rounded bg-black/5 dark:bg-white/5" />
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
