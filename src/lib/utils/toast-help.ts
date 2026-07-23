import { toast } from 'sonner';
import { getHelpLinkForMessage, getHelpLinkForError } from '@/lib/errors/error-help-links';

/**
 * Enhanced toast.error that adds a help article CTA link when available.
 * Drop-in replacement for toast.error() — same API, extra help link.
 */
export function toastWithErrorHelp(message: string, options?: { code?: string; description?: string }) {
  const helpLink = options?.code
    ? getHelpLinkForError(options.code)
    : getHelpLinkForMessage(message);

  if (helpLink) {
    toast.error(message, {
      description: options?.description,
      action: {
        label: '📖 Panduan',
        onClick: () => {
          window.open(helpLink.href, '_blank');
        },
      },
    });
  } else {
    toast.error(message, options);
  }
}
