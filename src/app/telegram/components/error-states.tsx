'use client';

export function ErrorState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="text-3xl">⚠️</div>
      <h3 className="text-base font-semibold">{title}</h3>
      {message && <p className="max-w-[320px] text-sm opacity-70">{message}</p>}
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-2 rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white dark:bg-white dark:text-black"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[24vh] flex-col items-center justify-center gap-2 p-6 text-center opacity-70">
      <div className="text-2xl">📭</div>
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function ForbiddenState({ message }: { message?: string }) {
  return ErrorState({
    title: 'Akses tidak tersedia',
    message: message || 'Akses modul ini belum tersedia untuk akun Anda.',
  });
}
