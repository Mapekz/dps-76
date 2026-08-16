import { AlertTriangleIcon, XIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/** Dismissible alert for decode-time persistence warnings (unknown ids, legacy migrations). */
function Banner({
  messages,
  onDismiss,
  className,
}: {
  messages: string[];
  onDismiss: () => void;
  className?: string;
}) {
  if (messages.length === 0) return null;

  return (
    <div
      role="alert"
      data-slot="banner"
      className={cn(
        'relative border border-border bg-card px-4 py-3 pr-12 text-sm text-card-foreground',
        className,
      )}
    >
      <div className="flex gap-3">
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-negative" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-3xs font-semibold tracking-widest uppercase text-negative">
            Build warnings
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute top-2 right-2"
        onClick={onDismiss}
      >
        <XIcon />
        <span className="sr-only">Dismiss</span>
      </Button>
    </div>
  );
}

export { Banner };
