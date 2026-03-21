// ============================================================
// OcpiPushModal — Push locations to OCPI partners
// Select partners + scope (all published / single location)
// ============================================================

import { useState, useEffect } from "react";
import { Globe, Send, X, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface OcpiPushModalProps {
  open: boolean;
  onClose: () => void;
  locationId?: string;
}

interface OcpiPartner {
  id: string;
  name: string | null;
  country_code: string;
  party_id: string;
  status: string;
}

interface PushResult {
  partnerId: string;
  partnerName: string;
  success: boolean;
  locationsCount?: number;
  error?: string;
}

type PushScope = "all" | "single";

export function OcpiPushModal({ open, onClose, locationId }: OcpiPushModalProps) {
  const [partners, setPartners] = useState<OcpiPartner[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(false);
  const [selectedPartners, setSelectedPartners] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<PushScope>(locationId ? "single" : "all");
  const [pushing, setPushing] = useState(false);
  const [results, setResults] = useState<PushResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch active OCPI subscriptions
  useEffect(() => {
    if (!open) return;
    setLoadingPartners(true);
    setResults(null);
    setError(null);
    setSelectedPartners(new Set());

    supabase
      .from("ocpi_credentials")
      .select("id, name, country_code, party_id, status")
      .in("status", ["CONNECTED", "PENDING"])
      .then(({ data, error: fetchError }) => {
        setLoadingPartners(false);
        if (fetchError) {
          setError(`Erreur chargement partenaires: ${fetchError.message}`);
          return;
        }
        setPartners(data ?? []);
        // Pre-select all partners
        setSelectedPartners(new Set((data ?? []).map((p) => p.id)));
      });
  }, [open]);

  // Reset scope when locationId changes
  useEffect(() => {
    setScope(locationId ? "single" : "all");
  }, [locationId]);

  function togglePartner(id: string) {
    setSelectedPartners((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedPartners.size === partners.length) {
      setSelectedPartners(new Set());
    } else {
      setSelectedPartners(new Set(partners.map((p) => p.id)));
    }
  }

  async function handlePush() {
    if (selectedPartners.size === 0) return;

    setPushing(true);
    setError(null);
    setResults(null);

    try {
      const payload: Record<string, unknown> = {
        action: "ocpi_push_locations",
        partner_ids: Array.from(selectedPartners),
      };
      if (scope === "single" && locationId) {
        payload.location_id = locationId;
      }

      const { data, error: invokeError } = await supabase.functions.invoke("api", {
        body: payload,
      });

      if (invokeError) throw invokeError;

      // Parse results — expects { results: [{ partner_id, partner_name, success, locations_count?, error? }] }
      const rawResults = data?.results ?? data?.data?.results ?? [];
      const mapped: PushResult[] = rawResults.map((r: any) => ({
        partnerId: r.partner_id,
        partnerName: r.partner_name ?? (() => { const found = partners.find((p) => p.id === r.partner_id); return found ? (found.name ?? `${found.country_code}-${found.party_id}`) : r.partner_id; })(),
        success: r.success ?? true,
        locationsCount: r.locations_count ?? r.locationsCount,
        error: r.error,
      }));

      // If API returned a flat success without per-partner breakdown
      if (mapped.length === 0 && !data?.error) {
        const totalLocations = data?.locations_count ?? data?.count ?? 0;
        const fallback: PushResult[] = Array.from(selectedPartners).map((pid) => ({
          partnerId: pid,
          partnerName: (() => { const found = partners.find((p) => p.id === pid); return found ? (found.name ?? `${found.country_code}-${found.party_id}`) : pid; })(),
          success: true,
          locationsCount: totalLocations,
        }));
        setResults(fallback);
      } else {
        setResults(mapped);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du push OCPI");
    } finally {
      setPushing(false);
    }
  }

  if (!open) return null;

  const successCount = results?.filter((r) => r.success).length ?? 0;
  const failCount = results?.filter((r) => !r.success).length ?? 0;
  const totalLocations = results?.reduce((sum, r) => sum + (r.locationsCount ?? 0), 0) ?? 0;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-surface border border-border rounded-2xl w-full max-w-lg shadow-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-border">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              <h2 className="font-heading font-bold text-base text-foreground">
                Push OCPI Locations
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-surface-elevated rounded-lg transition-colors"
            >
              <X className="w-4 h-4 text-foreground-muted" />
            </button>
          </div>

          <div className="p-5 space-y-5 overflow-y-auto max-h-[70vh]">
            {/* Scope selection */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-foreground-muted uppercase tracking-wide">
                Portee
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="push-scope"
                    checked={scope === "all"}
                    onChange={() => setScope("all")}
                    className="text-primary focus:ring-primary"
                    disabled={pushing}
                  />
                  <span className="text-sm text-foreground">
                    Toutes les locations publiees
                  </span>
                </label>
                {locationId && (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="push-scope"
                      checked={scope === "single"}
                      onChange={() => setScope("single")}
                      className="text-primary focus:ring-primary"
                      disabled={pushing}
                    />
                    <span className="text-sm text-foreground">
                      Location selectionnee uniquement
                    </span>
                    <span className="text-xs text-foreground-muted bg-surface-elevated px-2 py-0.5 rounded-full">
                      {locationId.slice(0, 8)}...
                    </span>
                  </label>
                )}
              </div>
            </div>

            {/* Partners list */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-foreground-muted uppercase tracking-wide">
                  Partenaires OCPI
                </label>
                {partners.length > 0 && (
                  <button
                    onClick={toggleAll}
                    className="text-xs text-primary hover:text-primary/80 transition-colors"
                    disabled={pushing}
                  >
                    {selectedPartners.size === partners.length ? "Deselectionner tout" : "Selectionner tout"}
                  </button>
                )}
              </div>

              {loadingPartners ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-foreground-muted" />
                </div>
              ) : partners.length === 0 ? (
                <div className="text-sm text-foreground-muted py-6 text-center">
                  Aucun partenaire OCPI actif.
                </div>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {partners.map((p) => (
                    <label
                      key={p.id}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors",
                        selectedPartners.has(p.id)
                          ? "bg-primary/10 border border-primary/20"
                          : "bg-surface-elevated/30 border border-transparent hover:bg-surface-elevated/60"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPartners.has(p.id)}
                        onChange={() => togglePartner(p.id)}
                        className="rounded border-border text-primary focus:ring-primary"
                        disabled={pushing}
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-foreground">
                          {p.name ?? `${p.country_code}-${p.party_id}`}
                        </span>
                        <span className="ml-2 text-xs text-foreground-muted">
                          {p.country_code}-{p.party_id}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
                <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Results */}
            {results && (
              <div className="space-y-3">
                {/* Summary */}
                <div className="rounded-xl bg-surface-elevated/50 border border-border p-4">
                  <p className="text-sm font-medium text-foreground mb-2">
                    {totalLocations} location(s) poussee(s) vers {successCount} partenaire(s)
                  </p>
                  {failCount > 0 && (
                    <p className="text-xs text-red-400">
                      {failCount} partenaire(s) en echec
                    </p>
                  )}
                </div>

                {/* Per-partner status */}
                <div className="space-y-1">
                  {results.map((r) => (
                    <div
                      key={r.partnerId}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                        r.success
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-red-500/10 text-red-400"
                      )}
                    >
                      {r.success ? (
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 flex-shrink-0" />
                      )}
                      <span className="font-medium">{r.partnerName}</span>
                      {r.success && r.locationsCount !== undefined && (
                        <span className="ml-auto text-xs text-foreground-muted">
                          {r.locationsCount} loc.
                        </span>
                      )}
                      {!r.success && r.error && (
                        <span className="ml-auto text-xs truncate max-w-[200px]">
                          {r.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 p-5 border-t border-border">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-border text-sm text-foreground-muted hover:text-foreground transition-colors"
            >
              {results ? "Fermer" : "Annuler"}
            </button>
            {!results && (
              <button
                onClick={handlePush}
                disabled={pushing || selectedPartners.size === 0 || loadingPartners}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pushing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Pousser
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
