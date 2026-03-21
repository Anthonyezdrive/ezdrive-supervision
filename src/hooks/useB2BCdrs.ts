import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useB2BFilters } from "@/contexts/B2BFilterContext";
import { useAuth } from "@/contexts/AuthContext";
import type { B2BCdr, B2BClient } from "@/types/b2b";
import { getLocationName, getChargePointId, formatChargePointLabel, buildTokenDriverMap } from "@/lib/b2b-formulas";

/**
 * Fetch CDRs for the current B2B client, filtered by year + global filters.
 * RLS handles multi-tenant isolation for b2b_client users.
 * Admin users must provide a selectedClientId.
 */
export function useB2BCdrs(clientExternalIds: string[]) {
  const { year, sites, bornes, tokens } = useB2BFilters();

  return useQuery({
    queryKey: ["b2b-cdrs", clientExternalIds, year, sites, bornes, tokens],
    queryFn: async () => {
      if (clientExternalIds.length === 0) return [];

      const startDate = `${year}-01-01T00:00:00Z`;
      const endDate = `${year + 1}-01-01T00:00:00Z`;

      const selectCols =
        "id, gfx_cdr_id, source, start_date_time, end_date_time, total_energy, total_time, total_parking_time, total_cost, total_retail_cost, total_retail_cost_incl_vat, customer_external_id, driver_external_id, retail_package_id, charger_type, cdr_token, cdr_location, emsp_country_code, emsp_party_id, station_id";

      // Paginate to overcome Supabase 1000-row default limit
      const PAGE = 1000;
      let allRows: B2BCdr[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from("ocpi_cdrs")
          .select(selectCols)
          .in("customer_external_id", clientExternalIds)
          .gte("start_date_time", startDate)
          .lt("start_date_time", endDate)
          .order("start_date_time", { ascending: true })
          .range(from, from + PAGE - 1);

        // Server-side JSONB filters — reduce data transferred
        if (sites.length > 0) {
          query = query.in("cdr_location->>name", sites);
        }
        if (tokens.length > 0) {
          query = query.in("cdr_token->>uid", tokens);
        }

        const { data, error } = await query;
        if (error) throw error;
        const rows = (data ?? []) as B2BCdr[];
        allRows = allRows.concat(rows);
        from += PAGE;
        hasMore = rows.length === PAGE;
      }

      let result = allRows;

      // Client-side filter for nested JSONB arrays (can't easily filter server-side)
      if (bornes.length > 0) {
        result = result.filter((c) => bornes.includes(getChargePointId(c)));
      }

      return result;
    },
    staleTime: 60_000,
    enabled: clientExternalIds.length > 0,
  });
}

/**
 * Fetch CDRs for the previous year (N-1) — used for year-over-year comparison.
 * Does NOT apply site/borne/token filters (raw yearly data for overlay).
 */
export function useB2BCdrsPrevYear(clientExternalIds: string[], enabled: boolean) {
  const { year } = useB2BFilters();
  const prevYear = year - 1;

  return useQuery({
    queryKey: ["b2b-cdrs-prev", clientExternalIds, prevYear],
    queryFn: async () => {
      if (clientExternalIds.length === 0) return [];

      const startDate = `${prevYear}-01-01T00:00:00Z`;
      const endDate = `${prevYear + 1}-01-01T00:00:00Z`;

      const selectCols =
        "id, start_date_time, total_energy, total_time, total_cost, total_retail_cost, total_retail_cost_incl_vat, customer_external_id, driver_external_id, cdr_token, cdr_location";

      const PAGE = 1000;
      let allRows: B2BCdr[] = [];
      let from = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("ocpi_cdrs")
          .select(selectCols)
          .in("customer_external_id", clientExternalIds)
          .gte("start_date_time", startDate)
          .lt("start_date_time", endDate)
          .order("start_date_time", { ascending: true })
          .range(from, from + PAGE - 1);

        if (error) throw error;
        const rows = (data ?? []) as B2BCdr[];
        allRows = allRows.concat(rows);
        from += PAGE;
        hasMore = rows.length === PAGE;
      }

      return allRows;
    },
    staleTime: 300_000,
    enabled: enabled && clientExternalIds.length > 0,
  });
}

/**
 * Fetch all B2B clients (admin only)
 */
export function useB2BClients() {
  return useQuery({
    queryKey: ["b2b-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("b2b_clients")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as B2BClient[];
    },
    staleTime: 300_000,
  });
}

/**
 * Fetch the B2B client(s) accessible to the current user
 */
export function useMyB2BClients() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["my-b2b-clients", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("b2b_client_access")
        .select("b2b_client_id, b2b_clients(*)")
        .eq("user_id", user.id);
      if (error) throw error;
      return (data ?? []).map((d: any) => d.b2b_clients as B2BClient).filter(Boolean);
    },
    enabled: !!user,
    staleTime: 300_000,
  });
}

/**
 * Extract unique filter options from CDR data
 * Returns raw values (for filtering) + label maps (for display)
 */
export function useB2BFilterOptions(cdrs: B2BCdr[]) {
  return useMemo(() => {
    const sites = [...new Set(cdrs.map(getLocationName))].filter((s) => s !== "Inconnu").sort();
    const bornes = [...new Set(cdrs.map(getChargePointId))].filter((b) => b !== "Inconnu").sort();

    // Build human-readable labels for bornes: EVSE ID → "Site - Borne N"
    const borneLabelMap = new Map<string, string>();
    for (const cdr of cdrs) {
      const cpId = getChargePointId(cdr);
      if (cpId !== "Inconnu" && !borneLabelMap.has(cpId)) {
        const locName = getLocationName(cdr);
        borneLabelMap.set(cpId, formatChargePointLabel(cpId, locName));
      }
    }

    // Build token → driver name map
    const tokenDriverMap = buildTokenDriverMap(cdrs);

    const tokenSet = new Set<string>();
    for (const c of cdrs) {
      const t = c.cdr_token?.uid ?? c.auth_id;
      if (t) tokenSet.add(t);
    }
    const tokensList = [...tokenSet].sort();

    // Build label map for tokens: token UID → "Driver Name (token)"
    const tokenLabelMap = new Map<string, string>();
    for (const t of tokensList) {
      const driver = tokenDriverMap.get(t);
      if (driver) {
        tokenLabelMap.set(t, `${driver}`);
      }
    }

    // Available years
    const yearSet = new Set<number>();
    for (const c of cdrs) {
      yearSet.add(new Date(c.start_date_time).getFullYear());
    }

    return {
      sites,
      bornes,
      borneLabelMap,
      tokens: tokensList,
      tokenLabelMap,
      years: [...yearSet].sort(),
    };
  }, [cdrs]);
}
