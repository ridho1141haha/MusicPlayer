'use client';

import { Badge } from '@/components/ui/badge';
import type { Criterion, CriterionStatus } from '@/lib/ridho';

function StatusBadge({ status }: { status: CriterionStatus }) {
  const verified = status === 'verified';
  return (
    <Badge
      variant="outline"
      className={
        verified
          ? 'border-[#2fa69c]/40 bg-[#2fa69c]/10 text-[#7fd8ce]'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
      }
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${verified ? 'bg-[#7fd8ce]' : 'bg-amber-400'}`}
        aria-hidden="true"
      />
      {verified ? 'verified' : 'requires-device'}
    </Badge>
  );
}

interface CriteriaTableProps {
  criteria: Criterion[];
}

export function CriteriaTable({ criteria }: CriteriaTableProps) {
  const verifiedCount = criteria.filter((c) => c.status === 'verified').length;

  return (
    <div>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-[#7fd8ce]">{verifiedCount} of {criteria.length}</span>{' '}
        criteria are verified by automated builds and unit tests. The remaining ones need physical
        Android hardware — the manual device checklist lives in CHANGELOG.md (§ Verification
        status).
      </p>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <ul className="divide-y divide-border">
          {criteria.map((criterion) => (
            <li
              key={criterion.id}
              className="flex flex-col gap-2 p-4 transition-colors hover:bg-accent/30 sm:flex-row sm:items-center sm:gap-4 sm:p-5"
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-primary/25 bg-primary/10 font-mono text-sm font-semibold text-[#7fd8ce]"
                aria-hidden="true"
              >
                {criterion.id}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{criterion.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {criterion.detail}
                </p>
              </div>
              <div className="shrink-0 self-start sm:self-center">
                <StatusBadge status={criterion.status} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
