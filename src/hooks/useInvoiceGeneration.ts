// ============================================================
// EZDrive — Invoice Generation Hook
// Preview & batch-generate invoices from unbilled CDRs
// ============================================================

import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────────

export interface GenerateParams {
  periodFrom: string; // ISO date  e.g. "2026-03-01"
  periodTo: string; // ISO date  e.g. "2026-03-31"
  cpoId?: string;
  groupBy: "customer" | "station" | "cpo";
}

export interface PreviewGroup {
  key: string; // group identifier (auth_id, station name, party_id)
  label: string; // human-readable label
  cdrCount: number;
  totalCost: number;
  totalEnergy: number;
}

export interface GeneratePreview {
  groupCount: number;
  totalAmount: number;
  cdrCount: number;
  groups: PreviewGroup[];
}

export interface GenerateResult {
  invoiceCount: number;
  totalCents: number;
}

// ── Helpers ──────────────────────────────────────────────────

interface RawCdr {
  id: string;
  total_cost: number;
  total_cost_incl_vat: number | null;
  total_vat: number | null;
  vat_rate: number | null;
  total_energy: number;
  currency: string;
  cdr_location: { name?: string } | null;
  cdr_token: { uid?: string } | null;
  customer_external_id: string | null;
  station_id: string | null;
  party_id: string;
  country_code: string;
  start_date_time: string;
}

function groupKey(cdr: RawCdr, groupBy: GenerateParams["groupBy"]): string {
  switch (groupBy) {
    case "customer":
      return cdr.cdr_token?.uid ?? cdr.customer_external_id ?? "unknown";
    case "station":
      return cdr.station_id ?? cdr.cdr_location?.name ?? "unknown";
    case "cpo":
      return `${cdr.country_code}-${cdr.party_id}`;
  }
}

function groupLabel(cdr: RawCdr, groupBy: GenerateParams["groupBy"]): string {
  switch (groupBy) {
    case "customer":
      return cdr.cdr_token?.uid ?? cdr.customer_external_id ?? "Client inconnu";
    case "station":
      return cdr.cdr_location?.name ?? cdr.station_id ?? "Station inconnue";
    case "cpo":
      return `${cdr.country_code}-${cdr.party_id}`;
  }
}

// ── Preview Hook ─────────────────────────────────────────────

export function useInvoicePreview(params: GenerateParams | null) {
  return useQuery<GeneratePreview | null>({
    queryKey: ["invoice-preview", params],
    enabled: !!params,
    retry: false,
    queryFn: async () => {
      if (!params) return null;

      // Fetch unbilled CDRs in the period
      let query = supabase
        .from("ocpi_cdrs")
        .select(
          "id, total_cost, total_cost_incl_vat, total_vat, vat_rate, total_energy, currency, cdr_location, cdr_token, customer_external_id, station_id, party_id, country_code, start_date_time"
        )
        .gte("start_date_time", params.periodFrom)
        .lte("start_date_time", params.periodTo + "T23:59:59")
        .is("invoice_id", null)
        .order("start_date_time", { ascending: true });

      if (params.cpoId) {
        query = query.eq("party_id", params.cpoId);
      }

      const { data, error } = await query;
      if (error) {
        console.warn("[InvoicePreview] query error:", error.message);
        return { groupCount: 0, totalAmount: 0, cdrCount: 0, groups: [] };
      }

      const cdrs = (data ?? []) as RawCdr[];
      if (cdrs.length === 0) {
        return { groupCount: 0, totalAmount: 0, cdrCount: 0, groups: [] };
      }

      // Group CDRs
      const grouped = new Map<string, { label: string; cdrs: RawCdr[] }>();
      for (const cdr of cdrs) {
        const key = groupKey(cdr, params.groupBy);
        const existing = grouped.get(key);
        if (existing) {
          existing.cdrs.push(cdr);
        } else {
          grouped.set(key, { label: groupLabel(cdr, params.groupBy), cdrs: [cdr] });
        }
      }

      const groups: PreviewGroup[] = [];
      let totalAmount = 0;

      for (const [key, { label, cdrs: groupCdrs }] of grouped) {
        const cost = groupCdrs.reduce((s, c) => s + (c.total_cost_incl_vat ?? c.total_cost), 0);
        const energy = groupCdrs.reduce((s, c) => s + c.total_energy, 0);
        totalAmount += cost;
        groups.push({
          key,
          label,
          cdrCount: groupCdrs.length,
          totalCost: cost,
          totalEnergy: energy,
        });
      }

      // Sort groups by total cost descending
      groups.sort((a, b) => b.totalCost - a.totalCost);

      return {
        groupCount: groups.length,
        totalAmount,
        cdrCount: cdrs.length,
        groups,
      };
    },
  });
}

// ── Generation Mutation ──────────────────────────────────────

export function useGenerateInvoices() {
  const queryClient = useQueryClient();
  const generatingRef = useRef(false);

  return useMutation<GenerateResult, Error, GenerateParams>({
    mutationFn: async (params) => {
      if (generatingRef.current) {
        throw new Error("Une génération est déjà en cours.");
      }
      generatingRef.current = true;

      try {
        return await _generateInvoices(params);
      } finally {
        generatingRef.current = false;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-preview"] });
      queryClient.invalidateQueries({ queryKey: ["cdrs"] });
      queryClient.invalidateQueries({ queryKey: ["b2b-cdrs"] });
      queryClient.invalidateQueries({ queryKey: ["ocpi-cdrs"] });
    },
  });
}

async function _generateInvoices(params: GenerateParams): Promise<GenerateResult> {
      // 1. Fetch unbilled CDRs in the period
      let query = supabase
        .from("ocpi_cdrs")
        .select(
          "id, total_cost, total_cost_incl_vat, total_vat, vat_rate, total_energy, currency, cdr_location, cdr_token, customer_external_id, station_id, party_id, country_code, start_date_time"
        )
        .gte("start_date_time", params.periodFrom)
        .lte("start_date_time", params.periodTo + "T23:59:59")
        .is("invoice_id", null)
        .order("start_date_time", { ascending: true });

      if (params.cpoId) {
        query = query.eq("party_id", params.cpoId);
      }

      const { data, error } = await query;
      if (error) throw new Error(`Erreur récupération CDRs: ${error.message}`);

      const cdrs = (data ?? []) as RawCdr[];
      if (cdrs.length === 0) throw new Error("Aucun CDR non facturé trouvé pour cette période.");

      // 2. Group CDRs
      const grouped = new Map<string, { label: string; cdrs: RawCdr[] }>();
      for (const cdr of cdrs) {
        const key = groupKey(cdr, params.groupBy);
        const existing = grouped.get(key);
        if (existing) {
          existing.cdrs.push(cdr);
        } else {
          grouped.set(key, { label: groupLabel(cdr, params.groupBy), cdrs: [cdr] });
        }
      }

      // 3. Create an invoice for each group and link CDRs
      let invoiceCount = 0;
      let totalCents = 0;
      const errors: string[] = [];

      for (const [, { label, cdrs: groupCdrs }] of grouped) {
        const subtotal = groupCdrs.reduce((s, c) => s + c.total_cost, 0);
        const vatTotal = groupCdrs.reduce((s, c) => s + (c.total_vat ?? 0), 0);
        const total = groupCdrs.reduce((s, c) => s + (c.total_cost_incl_vat ?? c.total_cost), 0);
        const vatRate = groupCdrs[0]?.vat_rate ?? 20;
        const currency = groupCdrs[0]?.currency ?? "EUR";

        // Generate invoice number: INV-YYYYMM-XXXX-XXXXXXXX (UUID-based suffix for uniqueness)
        const now = new Date();
        const prefix = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
        const suffix = String(invoiceCount + 1).padStart(4, "0");
        const uniqueId = crypto.randomUUID().slice(0, 8).toUpperCase();
        const invoiceNumber = `${prefix}-${suffix}-${uniqueId}`;

        // Determine user_id: for customer grouping use the token uid, otherwise use the label
        const userId = groupCdrs[0]?.customer_external_id ?? groupCdrs[0]?.cdr_token?.uid ?? label;

        const { data: invoice, error: insertError } = await supabase
          .from("invoices")
          .insert({
            invoice_number: invoiceNumber,
            user_id: userId,
            period_start: params.periodFrom,
            period_end: params.periodTo,
            subtotal_cents: Math.round(subtotal * 100),
            vat_cents: Math.round(vatTotal * 100),
            total_cents: Math.round(total * 100),
            currency,
            vat_rate: vatRate,
            type: "session",
            status: "draft",
          })
          .select("id")
          .single();

        if (insertError) {
          console.error("[InvoiceGen] insert error:", insertError.message);
          errors.push(`Facture "${label}": ${insertError.message}`);
          continue;
        }

        // 4. Link CDRs to this invoice
        const cdrIds = groupCdrs.map((c) => c.id);
        const { error: updateError } = await supabase
          .from("ocpi_cdrs")
          .update({ invoice_id: invoice.id })
          .in("id", cdrIds);

        if (updateError) {
          console.error("[InvoiceGen] CDR link error:", updateError.message);
          errors.push(`Liaison CDRs "${label}": ${updateError.message}`);
        }

        invoiceCount++;
        totalCents += Math.round(total * 100);
      }

      if (errors.length > 0 && invoiceCount === 0) {
        throw new Error(`Aucune facture créée. Erreurs:\n${errors.join("\n")}`);
      }
      if (errors.length > 0) {
        console.warn(`[InvoiceGen] ${invoiceCount} factures créées avec ${errors.length} erreur(s):\n${errors.join("\n")}`);
      }

      return { invoiceCount, totalCents };
}
