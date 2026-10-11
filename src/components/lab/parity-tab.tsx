'use client';

import { AlertCircle, Info } from 'lucide-react';

import { StatusBadge } from '@/components/lab/status-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PARITY_ROWS } from '@/data/parity';
import type { ParityRow } from '@/lib/lab/types';

function Cell({ row, column }: { row: ParityRow; column: 'logicTests' | 'browserTests' | 'androidBuild' | 'deviceTests' }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <StatusBadge status={row[column]} />
      <span className="text-[11px] leading-snug text-muted-foreground">{row[`${column}Note`]}</span>
    </div>
  );
}

function MobileRow({ row }: { row: ParityRow }) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div>
        <p className="text-sm font-semibold">{row.feature}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Android implementation: {row.androidImplemented ? 'present' : 'missing'}
        </p>
      </div>
      <Cell row={row} column="logicTests" />
      <Cell row={row} column="browserTests" />
      <Cell row={row} column="androidBuild" />
      <Cell row={row} column="deviceTests" />
      {row.policy !== null && (
        <p className="flex items-start gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-200">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {row.policy}
        </p>
      )}
    </div>
  );
}

export function ParityTab() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4 text-primary" aria-hidden="true" />
            Feature Parity Matrix
          </CardTitle>
          <CardDescription>
            Every column is recorded separately. A pass on the web side is NOT a pass on Android — web evidence lives
            in the "browser" column only, Android runtime behavior requires a physical device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Desktop table */}
          <div className="hidden xl:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Feature</th>
                  <th className="py-2 pr-3 font-medium">Implemented (Android)</th>
                  <th className="py-2 pr-3 font-medium">Logic tests</th>
                  <th className="py-2 pr-3 font-medium">Browser tests</th>
                  <th className="py-2 pr-3 font-medium">Android build</th>
                  <th className="py-2 pr-3 font-medium">Device tests</th>
                  <th className="py-2 font-medium">Policy / external</th>
                </tr>
              </thead>
              <tbody>
                {PARITY_ROWS.map((row) => (
                  <tr key={row.feature} className="border-b border-border/60 align-top">
                    <td className="py-3 pr-3 font-medium">{row.feature}</td>
                    <td className="py-3 pr-3">
                      <StatusBadge status={row.androidImplemented ? 'pass' : 'fail'} />
                    </td>
                    <td className="py-3 pr-3"><Cell row={row} column="logicTests" /></td>
                    <td className="py-3 pr-3"><Cell row={row} column="browserTests" /></td>
                    <td className="py-3 pr-3"><Cell row={row} column="androidBuild" /></td>
                    <td className="py-3 pr-3"><Cell row={row} column="deviceTests" /></td>
                    <td className="py-3 text-xs text-muted-foreground">{row.policy ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile/tablet cards */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:hidden">
            {PARITY_ROWS.map((row) => (
              <MobileRow key={row.feature} row={row} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
