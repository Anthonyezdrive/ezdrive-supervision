import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp, Check, Building2, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCpo } from "@/contexts/CpoContext";

// ── Types ────────────────────────────────────────────────

interface CpoSelectorProps {
  collapsed?: boolean;
}

// ── Component ────────────────────────────────────────────

export function CpoSelector({ collapsed = false }: CpoSelectorProps) {
  const {
    selectedCpoId,
    selectedCpo,
    level1Cpos,
    loading,
    selectCpo,
  } = useCpo();

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  // Close dropdown when sidebar collapses
  useEffect(() => {
    if (collapsed) setOpen(false);
  }, [collapsed]);

  // ── Loading skeleton ──────────────────────────────────
  if (loading) {
    return (
      <div
        className={cn(
          "mx-2 my-2",
          collapsed ? "px-1" : "px-2"
        )}
      >
        <div
          className={cn(
            "rounded-lg bg-surface-elevated animate-pulse",
            collapsed ? "h-10 w-10 mx-auto" : "h-10 w-full"
          )}
        />
      </div>
    );
  }

  // ── Helpers ───────────────────────────────────────────

  const isRootSelected = selectedCpoId === null;

  function handleSelect(id: string | null) {
    selectCpo(id);
    setOpen(false);
  }

  // ── Collapsed: just the colored dot ───────────────────
  if (collapsed) {
    return (
      <div className="flex justify-center py-2">
        <button
          onClick={() => setOpen(!open)}
          title={selectedCpo?.name ?? "Tous les CPO"}
          className={cn(
            "flex items-center justify-center w-10 h-10 rounded-lg transition-colors",
            "hover:bg-surface-elevated",
            open && "bg-surface-elevated"
          )}
        >
          {selectedCpo ? (
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{
                backgroundColor: selectedCpo.color ?? "#6b7280",
              }}
            />
          ) : (
            <Globe className="w-4 h-4 text-foreground-muted" />
          )}
        </button>
      </div>
    );
  }

  // ── Expanded: full selector ───────────────────────────

  return (
    <div ref={containerRef} className="relative mx-2 my-2">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
          "hover:bg-surface-elevated",
          open && "bg-surface-elevated"
        )}
      >
        {/* Colored dot or globe icon */}
        {selectedCpo ? (
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{
              backgroundColor: selectedCpo.color ?? "#6b7280",
            }}
          />
        ) : (
          <Globe className="w-4 h-4 text-foreground-muted shrink-0" />
        )}

        {/* Label */}
        <span className="truncate text-foreground">
          {selectedCpo?.name ?? "Tous les CPO"}
        </span>

        {/* Chevron */}
        <span className="ml-auto shrink-0 text-foreground-muted">
          {open ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className={cn(
            "absolute left-0 right-0 top-full z-50 mt-1",
            "rounded-lg border border-border bg-surface-elevated shadow-lg",
            "py-1 max-h-72 overflow-y-auto custom-scrollbar"
          )}
        >
          {/* "Tous les CPO" option */}
          <button
            onClick={() => handleSelect(null)}
            className={cn(
              "flex items-center gap-2.5 w-full px-3 py-2 text-[13px] font-medium transition-colors",
              "hover:bg-surface",
              isRootSelected
                ? "text-primary"
                : "text-foreground-muted hover:text-foreground"
            )}
          >
            <Globe className="w-4 h-4 shrink-0" />
            <span className="truncate">Tous les CPO</span>
            {isRootSelected && (
              <Check className="w-3.5 h-3.5 ml-auto shrink-0 text-primary" />
            )}
          </button>

          {/* Divider */}
          {level1Cpos.length > 0 && (
            <div className="mx-3 my-1 h-px bg-border" />
          )}

          {/* Level 1 CPOs */}
          {level1Cpos.map((cpo) => {
            const isActive = selectedCpoId === cpo.id;

            return (
              <button
                key={cpo.id}
                onClick={() => handleSelect(cpo.id)}
                className={cn(
                  "flex items-center gap-2.5 w-full px-3 py-2 text-[13px] font-medium transition-colors",
                  "hover:bg-surface",
                  isActive
                    ? "text-primary"
                    : "text-foreground-muted hover:text-foreground"
                )}
              >
                {/* Colored dot */}
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: cpo.color ?? "#6b7280",
                  }}
                />

                {/* Name */}
                <span className="truncate">{cpo.name}</span>

                {/* White label badge */}
                {cpo.is_white_label && (
                  <span className="shrink-0 rounded bg-foreground-muted/10 px-1.5 py-0.5 text-[10px] font-medium text-foreground-muted">
                    Marque blanche
                  </span>
                )}

                {/* Checkmark */}
                {isActive && (
                  <Check className="w-3.5 h-3.5 ml-auto shrink-0 text-primary" />
                )}
              </button>
            );
          })}

          {/* Empty state */}
          {level1Cpos.length === 0 && (
            <div className="px-3 py-4 text-center text-[12px] text-foreground-muted/60">
              <Building2 className="w-5 h-5 mx-auto mb-1.5 opacity-40" />
              Aucun CPO disponible
            </div>
          )}
        </div>
      )}
    </div>
  );
}
