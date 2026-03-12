import { Search } from "lucide-react";
import type { OCPPStatus, CPOOperator, Territory } from "@/types/station";
import type { StationFilters } from "@/types/filters";
import { ALL_OCPP_STATUSES, OCPP_STATUS_CONFIG } from "@/lib/constants";

interface FilterBarProps {
  filters: StationFilters;
  onFiltersChange: (filters: StationFilters) => void;
  cpos: CPOOperator[];
  territories: Territory[];
  showStatusFilter?: boolean;
}

export function FilterBar({
  filters,
  onFiltersChange,
  cpos,
  territories,
  showStatusFilter = true,
}: FilterBarProps) {
  const selectClass =
    "px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-border-focus transition-colors appearance-none cursor-pointer";

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
        <input
          type="text"
          placeholder="Rechercher une borne..."
          value={filters.search}
          onChange={(e) =>
            onFiltersChange({ ...filters, search: e.target.value })
          }
          className="w-full pl-9 pr-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-border-focus transition-colors"
        />
      </div>

      {/* CPO filter */}
      <select
        value={filters.cpo ?? ""}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            cpo: e.target.value || null,
          })
        }
        className={selectClass}
      >
        <option value="">Tous les CPO</option>
        {cpos.map((c) => (
          <option key={c.id} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>

      {/* Territory filter */}
      <select
        value={filters.territory ?? ""}
        onChange={(e) =>
          onFiltersChange({
            ...filters,
            territory: e.target.value || null,
          })
        }
        className={selectClass}
      >
        <option value="">Tous les territoires</option>
        {territories.map((t) => (
          <option key={t.id} value={t.code}>
            {t.name}
          </option>
        ))}
      </select>

      {/* Status filter */}
      {showStatusFilter && (
        <select
          value={filters.status ?? ""}
          onChange={(e) =>
            onFiltersChange({
              ...filters,
              status: (e.target.value || null) as OCPPStatus | null,
            })
          }
          className={selectClass}
        >
          <option value="">Tous les statuts</option>
          {ALL_OCPP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {OCPP_STATUS_CONFIG[s].label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
