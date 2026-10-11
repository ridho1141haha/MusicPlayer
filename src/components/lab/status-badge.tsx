'use client';

import { CheckCircle2, CircleSlash, Clock, ShieldAlert, Smartphone, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { FeatureStatus } from '@/lib/lab/types';

const STATUS_STYLES: Record<FeatureStatus, { label: string; icon: LucideIcon; className: string }> = {
  pass: {
    label: 'pass',
    icon: CheckCircle2,
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  },
  fail: {
    label: 'fail',
    icon: XCircle,
    className: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  },
  blocked: {
    label: 'blocked',
    icon: ShieldAlert,
    className: 'border-rose-500/40 bg-rose-500/10 text-rose-300',
  },
  'needs-device': {
    label: 'needs device',
    icon: Smartphone,
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  },
  untested: {
    label: 'untested',
    icon: Clock,
    className: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300',
  },
  'not-applicable': {
    label: 'n/a',
    icon: CircleSlash,
    className: 'border-zinc-600/40 bg-zinc-800/40 text-zinc-400',
  },
};

export function StatusBadge({ status, className = '' }: { status: FeatureStatus; className?: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.untested;
  const Icon = style.icon;
  return (
    <Badge variant="outline" className={`gap-1 whitespace-nowrap ${style.className} ${className}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {style.label}
    </Badge>
  );
}
