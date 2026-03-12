// ============================================================
// EZDrive — Global Search (Omnisearch Cmd+K)
// Search across stations, customers, sessions, locations
// ============================================================

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  X,
  Radio,
  Users,
  MapPin,
  Activity,
  Zap,
  Command,
  ArrowRight,
  FileText,
  KeyRound,
  Globe,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  type: "station" | "customer" | "location" | "session" | "invoice" | "rfid";
  title: string;
  subtitle: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const RESULT_TYPE_CONFIG = {
  station: { icon: Radio, color: "#00D4AA", label: "Borne" },
  customer: { icon: Users, color: "#4ECDC4", label: "Client" },
  location: { icon: MapPin, color: "#A78BFA", label: "Localisation" },
  session: { icon: Activity, color: "#FBBF24", label: "Session" },
  invoice: { icon: FileText, color: "#60A5FA", label: "Facture" },
  rfid: { icon: KeyRound, color: "#F472B6", label: "Token RFID" },
};

// ── Quick navigation items ───────────────────────────────────

const QUICK_NAV = [
  { label: "Vue d'ensemble", url: "/dashboard", icon: Zap },
  { label: "Carte des bornes", url: "/map", icon: MapPin },
  { label: "Analytics SLA", url: "/analytics", icon: Activity },
  { label: "Bornes", url: "/stations", icon: Radio },
  { label: "Gestion Clients", url: "/customers", icon: Users },
  { label: "Sessions CDR", url: "/sessions", icon: Activity },
  { label: "Factures", url: "/invoices", icon: FileText },
  { label: "Tarifs", url: "/tariffs", icon: Zap },
  { label: "OCPI Gireve", url: "/ocpi", icon: Globe },
  { label: "Coupons", url: "/coupons", icon: Zap },
  { label: "Roles", url: "/roles", icon: Users },
  { label: "Energy Mix", url: "/energy-mix", icon: Zap },
];

// ── Main component ───────────────────────────────────────────

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GlobalSearch({ isOpen, onClose }: GlobalSearchProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // ── Fetch searchable data ──
  const { data: stations } = useQuery({
    queryKey: ["search-stations"],
    queryFn: async () => {
      try {
        const { data } = await supabase
          .from("stations")
          .select("id, name, city, address, status")
          .limit(500);
        return data ?? [];
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
  });

  const { data: customers } = useQuery({
    queryKey: ["search-customers"],
    queryFn: async () => {
      try {
        const { data } = await supabase
          .from("consumer_profiles")
          .select("id, full_name, email, phone")
          .limit(500);
        return data ?? [];
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
  });

  // ── Search logic ──
  const results = useMemo((): SearchResult[] => {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();
    const matches: SearchResult[] = [];

    // Search stations
    for (const s of stations ?? []) {
      if (
        s.name?.toLowerCase().includes(q) ||
        s.city?.toLowerCase().includes(q) ||
        s.address?.toLowerCase().includes(q)
      ) {
        matches.push({
          id: `station-${s.id}`,
          type: "station",
          title: s.name ?? "Borne sans nom",
          subtitle: [s.city, s.address].filter(Boolean).join(" — "),
          url: "/stations",
          icon: RESULT_TYPE_CONFIG.station.icon,
          color: RESULT_TYPE_CONFIG.station.color,
        });
      }
      if (matches.length >= 20) break;
    }

    // Search customers
    for (const c of customers ?? []) {
      if (
        c.full_name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q)
      ) {
        matches.push({
          id: `customer-${c.id}`,
          type: "customer",
          title: c.full_name ?? "Client anonyme",
          subtitle: c.email ?? c.phone ?? "",
          url: "/customers",
          icon: RESULT_TYPE_CONFIG.customer.icon,
          color: RESULT_TYPE_CONFIG.customer.color,
        });
      }
      if (matches.length >= 30) break;
    }

    return matches.slice(0, 15);
  }, [query, stations, customers]);

  // Quick nav filtered
  const filteredNav = useMemo(() => {
    if (!query.trim()) return QUICK_NAV;
    const q = query.toLowerCase().trim();
    return QUICK_NAV.filter((item) => item.label.toLowerCase().includes(q));
  }, [query]);

  // Combined list for keyboard navigation
  const allItems = useMemo(() => {
    if (query.trim()) {
      return [
        ...results.map((r) => ({ type: "result" as const, item: r })),
        ...filteredNav.map((n) => ({ type: "nav" as const, item: n })),
      ];
    }
    return filteredNav.map((n) => ({ type: "nav" as const, item: n }));
  }, [results, filteredNav, query]);

  // ── Keyboard navigation ──
  const handleNavigate = useCallback(
    (url: string) => {
      navigate(url);
      onClose();
    },
    [navigate, onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && allItems[selectedIndex]) {
        e.preventDefault();
        const selected = allItems[selectedIndex];
        handleNavigate(
          selected.type === "result"
            ? (selected.item as SearchResult).url
            : (selected.item as (typeof QUICK_NAV)[0]).url
        );
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, allItems, selectedIndex, handleNavigate, onClose]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
        onClick={onClose}
      />

      {/* Search modal */}
      <div className="fixed inset-x-0 top-[15%] mx-auto max-w-2xl z-[101] px-4">
        <div className="bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
            <Search className="w-5 h-5 text-foreground-muted shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Rechercher bornes, clients, pages..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-foreground text-sm placeholder:text-foreground-muted/50 focus:outline-none"
            />
            <div className="flex items-center gap-1.5">
              <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-surface-elevated border border-border rounded text-[10px] text-foreground-muted font-mono">
                ESC
              </kbd>
              <button
                onClick={onClose}
                className="p-1 text-foreground-muted hover:text-foreground transition-colors sm:hidden"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Results */}
          <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
            {/* Search results */}
            {query.trim() && results.length > 0 && (
              <div className="px-2 py-2">
                <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted/70">
                  Résultats
                </p>
                {results.map((result, idx) => {
                  const config = RESULT_TYPE_CONFIG[result.type];
                  return (
                    <button
                      key={result.id}
                      onClick={() => handleNavigate(result.url)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors",
                        idx === selectedIndex
                          ? "bg-primary/10"
                          : "hover:bg-surface-elevated"
                      )}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: `${config.color}15`, color: config.color }}
                      >
                        <result.icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {result.title}
                        </p>
                        <p className="text-xs text-foreground-muted truncate">
                          {result.subtitle}
                        </p>
                      </div>
                      <span
                        className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-md"
                        style={{
                          backgroundColor: `${config.color}15`,
                          color: config.color,
                        }}
                      >
                        {config.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Quick navigation */}
            <div className="px-2 py-2">
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted/70">
                {query.trim() ? "Navigation" : "Navigation rapide"}
              </p>
              {filteredNav.map((item, idx) => {
                const absoluteIdx = query.trim()
                  ? results.length + idx
                  : idx;
                return (
                  <button
                    key={item.url}
                    onClick={() => handleNavigate(item.url)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors",
                      absoluteIdx === selectedIndex
                        ? "bg-primary/10"
                        : "hover:bg-surface-elevated"
                    )}
                  >
                    <item.icon className="w-4 h-4 text-foreground-muted shrink-0" />
                    <span className="text-sm text-foreground flex-1">
                      {item.label}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-foreground-muted/50" />
                  </button>
                );
              })}
            </div>

            {/* No results */}
            {query.trim() && results.length === 0 && filteredNav.length === 0 && (
              <div className="px-5 py-8 text-center">
                <Search className="w-8 h-8 text-foreground-muted/30 mx-auto mb-3" />
                <p className="text-sm text-foreground-muted">
                  Aucun résultat pour « {query} »
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 px-5 py-2.5 border-t border-border text-[10px] text-foreground-muted/50">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-surface-elevated border border-border rounded font-mono">
                ↑↓
              </kbd>
              naviguer
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-surface-elevated border border-border rounded font-mono">
                ↵
              </kbd>
              ouvrir
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-surface-elevated border border-border rounded font-mono">
                esc
              </kbd>
              fermer
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Search trigger button (for TopBar) ──────────────────────

export function SearchTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 bg-surface-elevated border border-border rounded-xl text-xs text-foreground-muted hover:text-foreground hover:border-border-focus transition-colors"
    >
      <Search className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">Rechercher...</span>
      <kbd className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-surface border border-border rounded text-[10px] font-mono ml-2">
        <Command className="w-2.5 h-2.5" />K
      </kbd>
    </button>
  );
}
