'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}

/** Shared, consistent empty state used across lab tabs. */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-background/40 p-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary/70 text-muted-foreground">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}
