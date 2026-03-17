import { useState } from "react";
import { HelpCircle, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

interface HelpItem {
  icon?: React.ReactNode;
  label: string;
  description: string;
}

interface PageHelpProps {
  /** Short description shown in the collapsed bar */
  summary: string;
  /** Detailed help items shown when expanded */
  items: HelpItem[];
  /** Optional extra tips shown at the bottom */
  tips?: string[];
}

export function PageHelp({ summary, items, tips }: PageHelpProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden transition-all">
      {/* Collapsed bar */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-elevated/50 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <HelpCircle className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            Guide d'utilisation
          </p>
          <p className="text-xs text-foreground-muted truncate">{summary}</p>
        </div>
        <div className="shrink-0 text-foreground-muted">
          {open ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {items.map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 p-2.5 rounded-xl bg-surface-elevated/50"
              >
                {item.icon && (
                  <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    {item.icon}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">
                    {item.label}
                  </p>
                  <p className="text-xs text-foreground-muted leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {tips && tips.length > 0 && (
            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-warning/5 border border-warning/15">
              <Lightbulb className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
              <div className="space-y-1">
                {tips.map((tip, i) => (
                  <p key={i} className="text-xs text-foreground-muted leading-relaxed">
                    {tip}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── InfoTooltip — inline hover tooltip ─────────────────────

interface InfoTooltipProps {
  text: string;
  className?: string;
}

export function InfoTooltip({ text, className }: InfoTooltipProps) {
  return (
    <span className={cn("relative group inline-flex items-center", className)}>
      <HelpCircle className="w-3.5 h-3.5 text-foreground-muted/50 hover:text-foreground-muted transition-colors cursor-help" />
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-xl bg-[#1A1F45] border border-border text-xs text-foreground leading-relaxed whitespace-normal w-56 text-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
        {text}
      </span>
    </span>
  );
}
