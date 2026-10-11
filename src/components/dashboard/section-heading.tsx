import type { LucideIcon } from 'lucide-react';

interface SectionHeadingProps {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
}

export function SectionHeading({ icon: Icon, eyebrow, title, description }: SectionHeadingProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10"
          aria-hidden="true"
        >
          <Icon className="h-5 w-5 text-[#7fd8ce]" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {eyebrow}
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            {title}
          </h2>
        </div>
      </div>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}
