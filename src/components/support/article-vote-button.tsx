'use client';

import { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { cn } from '@/lib/utils/utils';

interface ArticleVoteButtonProps {
  articleId: string;
  helpfulCount: number;
  notHelpfulCount: number;
}

export function ArticleVoteButton({ articleId, helpfulCount, notHelpfulCount }: ArticleVoteButtonProps) {
  const [voted, setVoted] = useState<'UP' | 'DOWN' | null>(null);
  const [counts, setCounts] = useState({ up: helpfulCount, down: notHelpfulCount });
  const [submitting, setSubmitting] = useState(false);

  const handleVote = async (vote: 'UP' | 'DOWN') => {
    if (voted || submitting) return;
    setSubmitting(true);

    try {
      const res = await fetch('/api/support/articles/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId, vote }),
      });

      if (res.ok) {
        setVoted(vote);
        setCounts((prev) => ({
          up: vote === 'UP' ? prev.up + 1 : prev.up,
          down: vote === 'DOWN' ? prev.down + 1 : prev.down,
        }));
      }
    } catch {
      // silent fail
    } finally {
      setSubmitting(false);
    }
  };

  if (voted) {
    return (
      <div className="text-center py-3">
        <p className="text-sm text-muted-foreground">
          {voted === 'UP' ? '👍 Terima kasih atas feedbacknya!' : '👎 Terima kasih, kami akan perbaiki artikel ini.'}
        </p>
      </div>
    );
  }

  return (
    <div className="text-center py-3 space-y-2">
      <p className="text-sm text-muted-foreground">Artikel ini membantu?</p>
      <div className="flex justify-center gap-3">
        <button
          onClick={() => handleVote('UP')}
          disabled={submitting}
          className={cn(
            "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium transition-colors",
            "border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950/30",
            submitting && "opacity-50 cursor-not-allowed"
          )}
        >
          <ThumbsUp className="h-4 w-4" />
          Ya, membantu
          {counts.up > 0 && <span className="text-xs opacity-70">({counts.up})</span>}
        </button>
        <button
          onClick={() => handleVote('DOWN')}
          disabled={submitting}
          className={cn(
            "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium transition-colors",
            "border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30",
            submitting && "opacity-50 cursor-not-allowed"
          )}
        >
          <ThumbsDown className="h-4 w-4" />
          Tidak
          {counts.down > 0 && <span className="text-xs opacity-70">({counts.down})</span>}
        </button>
      </div>
    </div>
  );
}
