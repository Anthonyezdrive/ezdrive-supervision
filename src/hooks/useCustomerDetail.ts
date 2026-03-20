// ============================================================
// EZDrive — useCustomerDetail hook
// Fetches all data for the Customer 360 view
// ============================================================

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ── Types ────────────────────────────────────────────────────

export interface CustomerProfile {
  id: string;
  driver_external_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  customer_name: string | null;
  cpo_name: string | null;
  total_sessions: number;
  total_energy_kwh: number;
  first_session_at: string | null;
  last_session_at: string | null;
  status: string | null;
  retail_package: string | null;
  created_at: string;
  source: string | null;
}

export interface CustomerSession {
  id: string;
  transaction_id: number;
  chargepoint_id: string;
  id_tag: string | null;
  status: string;
  started_at: string;
  stopped_at: string | null;
  energy_kwh: number | null;
  meter_start: number;
  meter_stop: number | null;
  stop_reason: string | null;
  ocpp_chargepoints: {
    identity: string;
    stations: { name: string; city: string | null; address: string | null } | null;
  } | null;
}

export interface CustomerInvoice {
  id: string;
  invoice_number: string;
  user_id: string;
  period_start: string;
  period_end: string;
  subtotal_cents: number;
  vat_cents: number;
  total_cents: number;
  currency: string;
  vat_rate: number;
  type: string;
  status: "draft" | "issued" | "paid" | "cancelled";
  issued_at: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface CustomerToken {
  id: string;
  uid: string;
  type: string;
  contract_id: string;
  visual_number: string | null;
  issuer: string | null;
  valid: boolean;
  whitelist: string | null;
  last_updated: string | null;
  created_at: string;
}

export interface CustomerSubscription {
  id: string;
  user_id: string;
  offer_name: string | null;
  status: string;
  started_at: string | null;
  ends_at: string | null;
  created_at: string;
}

export interface CustomerTicket {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  created_by_email: string | null;
  created_at: string;
}

// ── Hook ─────────────────────────────────────────────────────

export function useCustomerDetail(customerId: string | null) {
  return useQuery({
    queryKey: ["customer-detail", customerId],
    enabled: !!customerId,
    retry: 1,
    queryFn: async () => {
      if (!customerId) throw new Error("No customer ID");

      // 1. Profile
      const { data: profileData, error: profileError } = await supabase
        .from("all_consumers")
        .select(
          "id, driver_external_id, first_name, last_name, email, phone, customer_name, cpo_name, total_sessions, total_energy_kwh, first_session_at, last_session_at, status, retail_package, created_at, source"
        )
        .eq("driver_external_id", customerId)
        .limit(1)
        .single();

      if (profileError) throw profileError;

      const profile: CustomerProfile = {
        ...profileData,
        full_name:
          [profileData.first_name, profileData.last_name]
            .filter(Boolean)
            .join(" ") || null,
      } as CustomerProfile;

      // 2. Get tokens linked to this driver (needed for session lookup)
      const { data: tokensData } = await supabase
        .from("ocpi_tokens")
        .select(
          "id, uid, type, contract_id, visual_number, issuer, valid, whitelist, last_updated, created_at"
        )
        .eq("contract_id", customerId);

      const tokens = (tokensData ?? []) as CustomerToken[];
      const tokenUids = tokens.map((t) => t.uid);

      // 3. Sessions — match by id_tag from tokens or by consumer driver_external_id
      let sessions: CustomerSession[] = [];
      if (tokenUids.length > 0) {
        const { data: sessionsData } = await supabase
          .from("ocpp_transactions")
          .select(
            "id, transaction_id, chargepoint_id, id_tag, status, started_at, stopped_at, energy_kwh, meter_start, meter_stop, stop_reason, ocpp_chargepoints(identity, stations(name, city, address))"
          )
          .in("id_tag", tokenUids)
          .order("started_at", { ascending: false })
          .limit(50);
        sessions = (sessionsData ?? []) as CustomerSession[];
      }

      // If no sessions from tokens, try by consumer_id
      if (sessions.length === 0) {
        const { data: sessionsData } = await supabase
          .from("ocpp_transactions")
          .select(
            "id, transaction_id, chargepoint_id, id_tag, status, started_at, stopped_at, energy_kwh, meter_start, meter_stop, stop_reason, ocpp_chargepoints(identity, stations(name, city, address))"
          )
          .eq("consumer_id", profile.id)
          .order("started_at", { ascending: false })
          .limit(50);
        sessions = (sessionsData ?? []) as CustomerSession[];
      }

      // 4. Invoices
      const { data: invoicesData } = await supabase
        .from("invoices")
        .select(
          "id, invoice_number, user_id, period_start, period_end, subtotal_cents, vat_cents, total_cents, currency, vat_rate, type, status, issued_at, paid_at, created_at"
        )
        .eq("user_id", customerId)
        .order("created_at", { ascending: false });

      const invoices = (invoicesData ?? []) as CustomerInvoice[];

      // 5. Subscriptions
      const { data: subscriptionsData } = await supabase
        .from("user_subscriptions")
        .select(
          "id, user_id, offer_name, status, started_at, ends_at, created_at"
        )
        .eq("user_id", customerId);

      const subscriptions =
        (subscriptionsData ?? []) as CustomerSubscription[];

      // 6. Tickets
      let tickets: CustomerTicket[] = [];
      if (profile.email) {
        const { data: ticketsData } = await supabase
          .from("maintenance_tickets")
          .select(
            "id, title, status, priority, created_by_email, created_at"
          )
          .eq("created_by_email", profile.email)
          .order("created_at", { ascending: false });
        tickets = (ticketsData ?? []) as CustomerTicket[];
      }

      return {
        profile,
        sessions,
        invoices,
        tokens,
        subscriptions,
        tickets,
      };
    },
  });
}
