import { Lock, type LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ProfileSection({
  title,
  description,
  action,
  className,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("border-white/10 bg-white/[0.03]", className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {title}
            </h3>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground/80">
                {description}
              </p>
            )}
          </div>
          {action}
        </div>
        <div className="mt-4">{children}</div>
      </CardContent>
    </Card>
  );
}

export function TagChips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-foreground/90"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

export function PrivateValue({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-sm font-medium text-muted-foreground">
      <Lock className="h-3.5 w-3.5" />
      {label ?? "Private"}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/20 to-sky-400/20 text-indigo-300 ring-1 ring-inset ring-white/10">
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-4 text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function PlaceholderCard({
  title,
  meta,
  footer,
}: {
  title: string;
  meta?: string;
  footer?: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden border-white/10 bg-white/[0.03] transition-colors hover:border-white/20">
      <div className="aspect-square w-full bg-gradient-to-br from-violet-500/15 via-indigo-500/10 to-sky-400/15" />
      <CardContent className="p-4">
        <p className="truncate text-sm font-medium">{title}</p>
        {meta && <p className="mt-0.5 truncate text-xs text-muted-foreground">{meta}</p>}
        {footer && <div className="mt-3">{footer}</div>}
      </CardContent>
    </Card>
  );
}
