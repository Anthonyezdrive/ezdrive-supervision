import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDuration } from "@/lib/utils";
import type { Station, OCPPStatus } from "@/types/station";

type SortKey =
  | "name"
  | "ocpp_status"
  | "cpo_name"
  | "territory_name"
  | "max_power_kw"
  | "hours_in_status";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 50;

interface StationTableProps {
  stations: Station[];
  onSelect: (station: Station) => void;
}

export function StationTable({ stations, onSelect }: StationTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  const sorted = useMemo(() => {
    return [...stations].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [stations, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paginated = sorted.slice(start, start + PAGE_SIZE);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (col !== sortKey) return null;
    return sortDir === "asc" ? (
      <ChevronUp className="w-3.5 h-3.5 inline ml-1" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 inline ml-1" />
    );
  };

  const thClass =
    "px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors select-none whitespace-nowrap";

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-border">
            <tr>
              <th className={thClass} onClick={() => handleSort("name")}>
                Borne <SortIcon col="name" />
              </th>
              <th className={thClass} onClick={() => handleSort("ocpp_status")}>
                Statut <SortIcon col="ocpp_status" />
              </th>
              <th className={thClass} onClick={() => handleSort("cpo_name")}>
                CPO <SortIcon col="cpo_name" />
              </th>
              <th className={thClass} onClick={() => handleSort("territory_name")}>
                Territoire <SortIcon col="territory_name" />
              </th>
              <th className={thClass} onClick={() => handleSort("max_power_kw")}>
                Puissance <SortIcon col="max_power_kw" />
              </th>
              <th className={thClass} onClick={() => handleSort("hours_in_status")}>
                Durée statut <SortIcon col="hours_in_status" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginated.map((station) => (
              <tr
                key={station.id}
                onClick={() => onSelect(station)}
                className="hover:bg-surface-elevated/50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{station.name}</p>
                    <p className="text-xs text-foreground-muted">
                      {station.city ?? station.address ?? station.gfx_id}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={station.ocpp_status as OCPPStatus} />
                </td>
                <td className="px-4 py-3 text-sm text-foreground-muted">{station.cpo_name ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-foreground-muted">{station.territory_name ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-foreground-muted">
                  {station.max_power_kw ? `${station.max_power_kw} kW` : "—"}
                </td>
                <td className="px-4 py-3 text-sm text-foreground-muted">
                  {formatDuration(station.hours_in_status)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <span className="text-xs text-foreground-muted">
            {start + 1}–{Math.min(start + PAGE_SIZE, sorted.length)} sur {sorted.length} bornes
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Page précédente"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
              .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push("…");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "…" ? (
                  <span key={"e" + i} className="px-1.5 text-xs text-foreground-muted">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    className={`min-w-[2rem] h-8 px-2 rounded-lg text-xs font-medium transition-colors ${
                      safePage === p
                        ? "bg-primary/15 text-primary border border-primary/30"
                        : "text-foreground-muted hover:text-foreground hover:bg-surface-elevated"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Page suivante"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
