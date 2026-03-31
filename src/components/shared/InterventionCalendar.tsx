import { useState, useMemo } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
  parseISO,
} from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CalendarIntervention {
  id: string;
  title: string;
  status: "planned" | "in_progress" | "completed" | "cancelled";
  priority: "low" | "medium" | "high" | "critical";
  scheduled_at: string | null;
  station_name: string | null;
}

interface InterventionCalendarProps {
  interventions: CalendarIntervention[];
  onInterventionClick?: (intervention: CalendarIntervention) => void;
  isLoading?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<CalendarIntervention["status"], string> = {
  planned: "bg-blue-500/20 text-blue-400 hover:bg-blue-500/30",
  in_progress: "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30",
  completed: "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30",
  cancelled: "bg-gray-500/20 text-gray-400 hover:bg-gray-500/30",
};

const DAY_HEADERS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

const MAX_VISIBLE_PILLS = 3;

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-7">
      {Array.from({ length: 35 }).map((_, i) => (
        <div
          key={i}
          className="min-h-[80px] border-r border-b border-border p-1 animate-pulse"
        >
          <div className="h-3 w-4 bg-foreground-muted/10 rounded mb-1.5" />
          <div className="h-2.5 w-full bg-foreground-muted/10 rounded mb-1" />
          <div className="h-2.5 w-3/4 bg-foreground-muted/10 rounded" />
        </div>
      ))}
    </div>
  );
}

function InterventionPill({
  intervention,
  onClick,
}: {
  intervention: CalendarIntervention;
  onClick?: (intervention: CalendarIntervention) => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(intervention);
      }}
      title={`${intervention.title}${intervention.station_name ? ` — ${intervention.station_name}` : ""}`}
      className={`block w-full text-left text-[10px] leading-tight px-1.5 py-0.5 rounded truncate cursor-pointer transition-colors ${STATUS_COLORS[intervention.status]}`}
    >
      {intervention.title}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function InterventionCalendar({
  interventions,
  onInterventionClick,
  isLoading = false,
}: InterventionCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));

  // Build day grid (Monday-start weeks)
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [currentMonth]);

  // Group interventions by date string for O(1) lookup
  const interventionsByDate = useMemo(() => {
    const map = new Map<string, CalendarIntervention[]>();
    for (const intervention of interventions) {
      if (!intervention.scheduled_at) continue;
      const dateKey = format(parseISO(intervention.scheduled_at), "yyyy-MM-dd");
      const existing = map.get(dateKey);
      if (existing) {
        existing.push(intervention);
      } else {
        map.set(dateKey, [intervention]);
      }
    }
    return map;
  }, [interventions]);

  const handlePrev = () => setCurrentMonth((m) => subMonths(m, 1));
  const handleNext = () => setCurrentMonth((m) => addMonths(m, 1));

  const monthLabel = format(currentMonth, "MMMM yyyy", { locale: fr });
  // Capitalize first letter
  const monthLabelFormatted = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      {/* ---- Header ---- */}
      <div className="px-5 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2 text-foreground">
          <Calendar className="w-4 h-4 text-foreground-muted" />
          <span className="text-sm font-semibold">{monthLabelFormatted}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handlePrev}
            className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
            aria-label="Mois précédent"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
            aria-label="Mois suivant"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ---- Day headers ---- */}
      <div className="grid grid-cols-7 border-b border-border">
        {DAY_HEADERS.map((d) => (
          <div
            key={d}
            className="text-xs font-medium text-foreground-muted uppercase text-center py-2"
          >
            {d}
          </div>
        ))}
      </div>

      {/* ---- Calendar grid ---- */}
      {isLoading ? (
        <SkeletonGrid />
      ) : (
        <div className="grid grid-cols-7">
          {calendarDays.map((day) => {
            const inMonth = isSameMonth(day, currentMonth);
            const today = isToday(day);
            const dateKey = format(day, "yyyy-MM-dd");
            const dayInterventions = interventionsByDate.get(dateKey) ?? [];
            const overflow = dayInterventions.length - MAX_VISIBLE_PILLS;

            return (
              <div
                key={dateKey}
                className={`min-h-[80px] border-r border-b border-border p-1 transition-colors ${
                  today ? "ring-1 ring-inset ring-primary/50 bg-primary/5" : ""
                } ${!inMonth ? "opacity-30" : ""}`}
              >
                {/* Day number */}
                <span
                  className={`block text-[11px] font-medium mb-0.5 ${
                    today
                      ? "text-primary"
                      : inMonth
                        ? "text-foreground-muted"
                        : "text-foreground-muted/50"
                  }`}
                >
                  {format(day, "d")}
                </span>

                {/* Intervention pills */}
                <div className="flex flex-col gap-0.5">
                  {dayInterventions.slice(0, MAX_VISIBLE_PILLS).map((intervention) => (
                    <InterventionPill
                      key={intervention.id}
                      intervention={intervention}
                      onClick={onInterventionClick}
                    />
                  ))}
                  {overflow > 0 && (
                    <span className="text-[10px] text-foreground-muted px-1.5">
                      +{overflow} autre{overflow > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export type { CalendarIntervention, InterventionCalendarProps };
