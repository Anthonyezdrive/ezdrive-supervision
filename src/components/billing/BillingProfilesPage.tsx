import { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/contexts/ToastContext";
import { PageHelp } from "@/components/ui/PageHelp";
import { KPICard } from "@/components/ui/KPICard";
import {
  Building2,
  Wallet,
  Percent,
  Search,
  Plus,
  X,
  Trash2,
  Loader2,
  Save,
  Edit2,
  CreditCard,
  MapPin,
  Calculator,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// Billing Profiles, Tariff Rules & Territory VAT — Antilles-Guyane
// ============================================================

// ── Types ──────────────────────────────────────────────────────

interface BillingProfile {
  id: string;
  cpo_id: string;
  cpo_name: string;
  stripe_connect_account_id: string | null;
  billing_entity_name: string;
  billing_entity_address: string | null;
  billing_entity_siret: string | null;
  billing_entity_vat_number: string | null;
  commission_rate: number;
  commission_type: string;
  commission_fixed_amount: number | null;
  default_currency: string;
  invoice_prefix: string | null;
  invoice_footer: string | null;
  created_at: string;
  updated_at: string;
}

interface TariffRule {
  id: string;
  station_id: string | null;
  evse_id: string | null;
  cpo_id: string;
  rule_name: string;
  price_per_kwh: number;
  price_per_minute: number;
  session_fee: number;
  parking_fee_per_minute: number;
  parking_grace_period_minutes: number;
  no_show_fee: number;
  no_show_grace_period_minutes: number;
  reservation_fee_per_minute: number;
  max_session_fee: number | null;
  min_session_fee: number;
  currency: string;
  is_default: boolean;
  valid_from: string;
  valid_to: string | null;
  created_at: string;
}

interface TerritoryVat {
  id: string;
  territory: string;
  vat_rate: number;
  label: string;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
}

type Tab = "profiles" | "tariffs" | "vat";

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "profiles", label: "Profils de facturation", icon: Building2 },
  { key: "tariffs", label: "Regles tarifaires", icon: Wallet },
  { key: "vat", label: "TVA par territoire", icon: MapPin },
];

// ── Main Page ──────────────────────────────────────────────────

export function BillingProfilesPage() {
  const [tab, setTab] = useState<Tab>("profiles");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-xl font-bold text-foreground">
          Profils de facturation
        </h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          Gestion des profils CPO, regles tarifaires et TVA par territoire (Antilles-Guyane)
        </p>
      </div>

      <PageHelp
        summary="Configurez les profils de facturation CPO, les regles tarifaires complexes et la TVA par territoire."
        items={[
          { label: "Profils CPO", description: "Associent un CPO a un compte Stripe Connect, une entite de facturation et un taux de commission." },
          { label: "Regles tarifaires", description: "Prix au kWh, a la minute, frais de session, parking, no-show et reservation par borne ou CPO." },
          { label: "TVA territoire", description: "Taux de TVA specifiques DOM-TOM : 8.5% Guadeloupe/Martinique/Reunion, 0% Guyane/Mayotte, 20% Metropole." },
        ]}
        tips={["Les regles tarifaires specifiques a une borne priment sur les regles par defaut du CPO."]}
      />

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors relative",
              tab === t.key ? "text-primary" : "text-foreground-muted hover:text-foreground"
            )}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            {tab === t.key && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />}
          </button>
        ))}
      </div>

      {tab === "profiles" && <ProfilesTab />}
      {tab === "tariffs" && <TariffRulesTab />}
      {tab === "vat" && <VatTab />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Tab 1: Billing Profiles
// ════════════════════════════════════════════════════════════════

function ProfilesTab() {
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const [search, setSearch] = useState("");
  const [editProfile, setEditProfile] = useState<BillingProfile | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: profiles, isLoading, isError, refetch } = useQuery({
    queryKey: ["billing-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cpo_billing_profiles")
        .select("*")
        .order("cpo_name");
      if (error) throw error;
      return data as BillingProfile[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (profile: Partial<BillingProfile>) => {
      if (profile.id) {
        const { error } = await supabase
          .from("cpo_billing_profiles")
          .update({ ...profile, updated_at: new Date().toISOString() })
          .eq("id", profile.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cpo_billing_profiles").insert(profile);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-profiles"] });
      toastSuccess(editProfile ? "Profil mis a jour" : "Profil cree");
      setShowForm(false);
      setEditProfile(null);
    },
    onError: (e: Error) => toastError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cpo_billing_profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-profiles"] });
      toastSuccess("Profil supprime");
    },
    onError: (e: Error) => toastError(e.message),
  });

  const filtered = useMemo(() => {
    if (!profiles) return [];
    const q = search.toLowerCase();
    return profiles.filter(
      (p) =>
        p.cpo_name.toLowerCase().includes(q) ||
        p.billing_entity_name.toLowerCase().includes(q) ||
        (p.stripe_connect_account_id ?? "").toLowerCase().includes(q)
    );
  }, [profiles, search]);

  // KPIs
  const totalProfiles = profiles?.length ?? 0;
  const withStripe = profiles?.filter((p) => p.stripe_connect_account_id).length ?? 0;
  const avgCommission =
    totalProfiles > 0
      ? (profiles!.reduce((s, p) => s + Number(p.commission_rate), 0) / totalProfiles).toFixed(1)
      : "0";

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPICard label="Profils CPO" value={totalProfiles} icon={Building2} color="#00C3FF" />
        <KPICard label="Comptes Stripe Connect" value={withStripe} icon={CreditCard} color="#9ACC0E" />
        <KPICard label="Commission moyenne" value={`${avgCommission}%`} icon={Percent} color="#F39C12" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un profil..."
            className="w-full pl-10 pr-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <button
          onClick={() => {
            setEditProfile(null);
            setShowForm(true);
          }}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Nouveau profil
        </button>
      </div>

      {/* Error state */}
      {isError && (
        <div className="bg-danger/10 border border-danger/30 rounded-2xl p-4 flex items-center justify-between">
          <p className="text-danger text-sm">Erreur de chargement des donnees</p>
          <button onClick={() => refetch()} className="text-sm text-danger hover:underline" type="button">
            Reessayer
          </button>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 text-foreground-muted font-medium">CPO</th>
                  <th className="px-4 py-3 text-foreground-muted font-medium">Entite</th>
                  <th className="px-4 py-3 text-foreground-muted font-medium">Stripe Connect</th>
                  <th className="px-4 py-3 text-foreground-muted font-medium">Commission</th>
                  <th className="px-4 py-3 text-foreground-muted font-medium">Prefixe</th>
                  <th className="px-4 py-3 text-foreground-muted font-medium w-20" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-surface-elevated/50 transition-colors">
                    <td className="px-4 py-3 text-foreground font-medium">{p.cpo_name}</td>
                    <td className="px-4 py-3 text-foreground">{p.billing_entity_name}</td>
                    <td className="px-4 py-3">
                      {p.stripe_connect_account_id ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-xs font-medium">
                          <CreditCard className="w-3 h-3" />
                          {p.stripe_connect_account_id}
                        </span>
                      ) : (
                        <span className="text-foreground-muted text-xs">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {p.commission_type === "percentage" ? `${p.commission_rate}%` : `${p.commission_fixed_amount} EUR`}
                    </td>
                    <td className="px-4 py-3 text-foreground-muted">{p.invoice_prefix ?? "--"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            setEditProfile(p);
                            setShowForm(true);
                          }}
                          className="p-1.5 rounded-lg hover:bg-surface-elevated transition-colors text-foreground-muted hover:text-foreground"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm("Supprimer ce profil ?")) deleteMutation.mutate(p.id);
                          }}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors text-foreground-muted hover:text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-foreground-muted">
                      Aucun profil trouve
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Slide-over form */}
      {showForm && (
        <ProfileForm
          key={editProfile?.id ?? "new"}
          profile={editProfile}
          onClose={() => {
            setShowForm(false);
            setEditProfile(null);
          }}
          onSave={(data) => saveMutation.mutate(data)}
          saving={saveMutation.isPending}
        />
      )}
    </div>
  );
}

// ── Profile Form (Slide-over) ──────────────────────────────────

function ProfileForm({
  profile,
  onClose,
  onSave,
  saving,
}: {
  profile: BillingProfile | null;
  onClose: () => void;
  onSave: (data: Partial<BillingProfile>) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    cpo_id: profile?.cpo_id ?? "",
    cpo_name: profile?.cpo_name ?? "",
    stripe_connect_account_id: profile?.stripe_connect_account_id ?? "",
    billing_entity_name: profile?.billing_entity_name ?? "",
    billing_entity_address: profile?.billing_entity_address ?? "",
    billing_entity_siret: profile?.billing_entity_siret ?? "",
    billing_entity_vat_number: profile?.billing_entity_vat_number ?? "",
    commission_rate: profile?.commission_rate ?? 5,
    commission_type: profile?.commission_type ?? "percentage",
    commission_fixed_amount: profile?.commission_fixed_amount ?? 0,
    default_currency: profile?.default_currency ?? "EUR",
    invoice_prefix: profile?.invoice_prefix ?? "",
    invoice_footer: profile?.invoice_footer ?? "",
  });

  const set = (key: string, value: string | number) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...(profile ? { id: profile.id } : {}),
      ...form,
      stripe_connect_account_id: form.stripe_connect_account_id || null,
      billing_entity_address: form.billing_entity_address || null,
      billing_entity_siret: form.billing_entity_siret || null,
      billing_entity_vat_number: form.billing_entity_vat_number || null,
      commission_fixed_amount: form.commission_fixed_amount || null,
      invoice_prefix: form.invoice_prefix || null,
      invoice_footer: form.invoice_footer || null,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-background border-l border-border overflow-y-auto">
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-foreground">
            {profile ? "Modifier le profil" : "Nouveau profil"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-elevated transition-colors text-foreground-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {[
            { key: "cpo_id", label: "CPO ID", placeholder: "vcity-ag" },
            { key: "cpo_name", label: "Nom CPO", placeholder: "V-CiTY AG" },
            { key: "stripe_connect_account_id", label: "Stripe Connect ID", placeholder: "acct_xxx" },
            { key: "billing_entity_name", label: "Entite de facturation", placeholder: "V-CITY AG" },
            { key: "billing_entity_address", label: "Adresse", placeholder: "" },
            { key: "billing_entity_siret", label: "SIRET", placeholder: "" },
            { key: "billing_entity_vat_number", label: "Numero TVA", placeholder: "" },
            { key: "invoice_prefix", label: "Prefixe facture", placeholder: "VCITY" },
          ].map((f) => (
            <div key={f.key}>
              <label className="block text-sm font-medium text-foreground mb-1">{f.label}</label>
              <input
                value={(form as Record<string, unknown>)[f.key] as string}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          ))}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Type commission</label>
              <select
                value={form.commission_type}
                onChange={(e) => set("commission_type", e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="percentage">Pourcentage</option>
                <option value="fixed">Fixe</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                {form.commission_type === "percentage" ? "Taux (%)" : "Montant fixe (EUR)"}
              </label>
              <input
                type="number"
                step="0.01"
                value={form.commission_type === "percentage" ? form.commission_rate : form.commission_fixed_amount}
                onChange={(e) =>
                  set(
                    form.commission_type === "percentage" ? "commission_rate" : "commission_fixed_amount",
                    Number.isNaN(parseFloat(e.target.value)) ? 0 : parseFloat(e.target.value)
                  )
                }
                className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Note de pied de facture</label>
            <textarea
              value={form.invoice_footer}
              onChange={(e) => set("invoice_footer", e.target.value)}
              rows={2}
              className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving || !form.cpo_id || !form.billing_entity_name}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {profile ? "Mettre a jour" : "Creer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Tab 2: Tariff Rules
// ════════════════════════════════════════════════════════════════

function TariffRulesTab() {
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const [search, setSearch] = useState("");
  const [editRule, setEditRule] = useState<TariffRule | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [simulateRule, setSimulateRule] = useState<TariffRule | null>(null);

  // Fetch billing profiles for commission lookup in simulation
  const { data: billingProfiles } = useQuery({
    queryKey: ["billing-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cpo_billing_profiles")
        .select("*")
        .order("cpo_name");
      if (error) throw error;
      return data as BillingProfile[];
    },
  });

  // Fetch VAT rates for simulation
  const { data: vatRates } = useQuery({
    queryKey: ["territory-vat-rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("territory_vat_rates")
        .select("*")
        .order("territory");
      if (error) throw error;
      return data as TerritoryVat[];
    },
  });

  const { data: rules, isLoading } = useQuery({
    queryKey: ["tariff-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("station_tariff_rules")
        .select("*")
        .order("cpo_id, rule_name");
      if (error) throw error;
      return data as TariffRule[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (rule: Partial<TariffRule>) => {
      if (rule.id) {
        const { error } = await supabase.from("station_tariff_rules").update(rule).eq("id", rule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("station_tariff_rules").insert(rule);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tariff-rules"] });
      toastSuccess(editRule ? "Regle mise a jour" : "Regle creee");
      setShowForm(false);
      setEditRule(null);
    },
    onError: (e: Error) => toastError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("station_tariff_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tariff-rules"] });
      toastSuccess("Regle supprimee");
    },
    onError: (e: Error) => toastError(e.message),
  });

  const filtered = useMemo(() => {
    if (!rules) return [];
    const q = search.toLowerCase();
    return rules.filter(
      (r) =>
        r.rule_name.toLowerCase().includes(q) ||
        r.cpo_id.toLowerCase().includes(q) ||
        (r.station_id ?? "").toLowerCase().includes(q)
    );
  }, [rules, search]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une regle..."
            className="w-full pl-10 pr-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <button
          onClick={() => {
            setEditRule(null);
            setShowForm(true);
          }}
          className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" /> Nouvelle regle
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 text-foreground-muted font-medium">Regle</th>
                  <th className="px-4 py-3 text-foreground-muted font-medium">CPO</th>
                  <th className="px-4 py-3 text-foreground-muted font-medium">Station</th>
                  <th className="px-4 py-3 text-foreground-muted font-medium text-right">kWh</th>
                  <th className="px-4 py-3 text-foreground-muted font-medium text-right">Minute</th>
                  <th className="px-4 py-3 text-foreground-muted font-medium text-right">Session</th>
                  <th className="px-4 py-3 text-foreground-muted font-medium text-right">Parking</th>
                  <th className="px-4 py-3 text-foreground-muted font-medium text-right">No-show</th>
                  <th className="px-4 py-3 text-foreground-muted font-medium w-20" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-surface-elevated/50 transition-colors">
                    <td className="px-4 py-3 text-foreground font-medium">
                      {r.rule_name}
                      {r.is_default && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-xs">defaut</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-foreground">{r.cpo_id}</td>
                    <td className="px-4 py-3 text-foreground-muted">{r.station_id ?? "Toutes"}</td>
                    <td className="px-4 py-3 text-right text-foreground">{Number(r.price_per_kwh).toFixed(4)}</td>
                    <td className="px-4 py-3 text-right text-foreground">{Number(r.price_per_minute).toFixed(4)}</td>
                    <td className="px-4 py-3 text-right text-foreground">{Number(r.session_fee).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-foreground">{Number(r.parking_fee_per_minute).toFixed(4)}</td>
                    <td className="px-4 py-3 text-right text-foreground">{Number(r.no_show_fee).toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => setSimulateRule(r)}
                          className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors text-foreground-muted hover:text-primary"
                          title="Simuler"
                        >
                          <Calculator className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setEditRule(r);
                            setShowForm(true);
                          }}
                          className="p-1.5 rounded-lg hover:bg-surface-elevated transition-colors text-foreground-muted hover:text-foreground"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm("Supprimer cette regle ?")) deleteMutation.mutate(r.id);
                          }}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors text-foreground-muted hover:text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-foreground-muted">
                      Aucune regle tarifaire
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Slide-over form */}
      {showForm && (
        <TariffRuleForm
          rule={editRule}
          onClose={() => {
            setShowForm(false);
            setEditRule(null);
          }}
          onSave={(data) => saveMutation.mutate(data)}
          saving={saveMutation.isPending}
        />
      )}

      {/* Simulation modal */}
      {simulateRule && (
        <TariffSimulationModal
          rule={simulateRule}
          billingProfiles={billingProfiles ?? []}
          vatRates={vatRates ?? []}
          onClose={() => setSimulateRule(null)}
        />
      )}
    </div>
  );
}

// ── Tariff Simulation Modal ─────────────────────────────────────

interface SimulationResult {
  energyCost: number;
  timeCost: number;
  sessionFee: number;
  subtotalHT: number;
  vatRate: number;
  vatAmount: number;
  totalTTC: number;
  commissionCPO: number;
}

function TariffSimulationModal({
  rule,
  billingProfiles,
  vatRates,
  onClose,
}: {
  rule: TariffRule;
  billingProfiles: BillingProfile[];
  vatRates: TerritoryVat[];
  onClose: () => void;
}) {
  const [duration, setDuration] = useState(60);
  const [energy, setEnergy] = useState(20);
  const [connectorType, setConnectorType] = useState<"AC" | "DC">("AC");
  const [startTime, setStartTime] = useState("12:00");
  const [territory, setTerritory] = useState(
    vatRates.length > 0 ? vatRates[0].territory : "Guadeloupe"
  );
  const [result, setResult] = useState<SimulationResult | null>(null);

  // Find matching billing profile for commission
  const matchingProfile = billingProfiles.find((p) => p.cpo_id === rule.cpo_id);

  const handleCalculate = () => {
    // Energy cost
    const energyCost = Number(rule.price_per_kwh) * energy;

    // Time cost
    const timeCost = Number(rule.price_per_minute) * duration;

    // Session flat fee
    const sessionFee = Number(rule.session_fee);

    // Subtotal HT
    let subtotalHT = energyCost + timeCost + sessionFee;

    // Apply min/max session fee
    if (rule.min_session_fee && subtotalHT < Number(rule.min_session_fee)) {
      subtotalHT = Number(rule.min_session_fee);
    }
    if (rule.max_session_fee && subtotalHT > Number(rule.max_session_fee)) {
      subtotalHT = Number(rule.max_session_fee);
    }

    // VAT
    const vatEntry = vatRates.find((v) => v.territory === territory);
    const vatRate = vatEntry ? Number(vatEntry.vat_rate) : 0;
    const vatAmount = subtotalHT * (vatRate / 100);
    const totalTTC = subtotalHT + vatAmount;

    // Commission CPO
    let commissionCPO = 0;
    if (matchingProfile) {
      if (matchingProfile.commission_type === "percentage") {
        commissionCPO = subtotalHT * (Number(matchingProfile.commission_rate) / 100);
      } else {
        commissionCPO = Number(matchingProfile.commission_fixed_amount ?? 0);
      }
    }

    setResult({
      energyCost,
      timeCost,
      sessionFee,
      subtotalHT,
      vatRate,
      vatAmount,
      totalTTC,
      commissionCPO,
    });
  };

  const inputClass =
    "w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-surface border border-border rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Simuler un tarif</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-surface-elevated transition-colors text-foreground-muted"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Rule name badge */}
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
              {rule.rule_name}
            </span>
            <span className="text-xs text-foreground-muted">CPO: {rule.cpo_id}</span>
          </div>

          {/* Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground-muted mb-1">
                Duree de session (min)
              </label>
              <input
                type="number"
                min={0}
                value={duration}
                onChange={(e) => setDuration(Math.max(0, parseInt(e.target.value) || 0))}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-muted mb-1">
                Energie consommee (kWh)
              </label>
              <input
                type="number"
                min={0}
                step="0.1"
                value={energy}
                onChange={(e) => setEnergy(Math.max(0, parseFloat(e.target.value) || 0))}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-muted mb-1">
                Type de connecteur
              </label>
              <select
                value={connectorType}
                onChange={(e) => setConnectorType(e.target.value as "AC" | "DC")}
                className={inputClass}
              >
                <option value="AC">AC</option>
                <option value="DC">DC</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-muted mb-1">
                Heure de debut
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Territory selector for VAT */}
          <div>
            <label className="block text-xs font-medium text-foreground-muted mb-1">
              Territoire (TVA)
            </label>
            <select
              value={territory}
              onChange={(e) => setTerritory(e.target.value)}
              className={inputClass}
            >
              {vatRates.map((v) => (
                <option key={v.id} value={v.territory}>
                  {v.territory} — {Number(v.vat_rate).toFixed(2)}%
                </option>
              ))}
              {vatRates.length === 0 && <option value="">Aucun territoire</option>}
            </select>
          </div>

          {/* Calculate button */}
          <button
            onClick={handleCalculate}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Calculator className="w-4 h-4" />
            Calculer
          </button>

          {/* Results */}
          {result && (
            <div className="bg-background border border-border rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-semibold text-foreground mb-3">Resultat de la simulation</h3>

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-foreground-muted">Cout energie</span>
                  <span className="text-foreground">{result.energyCost.toFixed(2)} EUR</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground-muted">Cout temps</span>
                  <span className="text-foreground">{result.timeCost.toFixed(2)} EUR</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground-muted">Frais de session (flat)</span>
                  <span className="text-foreground">{result.sessionFee.toFixed(2)} EUR</span>
                </div>

                <div className="border-t border-border my-2" />

                <div className="flex justify-between">
                  <span className="text-foreground-muted">Sous-total HT</span>
                  <span className="text-foreground font-medium">{result.subtotalHT.toFixed(2)} EUR</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-foreground-muted">TVA ({result.vatRate.toFixed(2)}%)</span>
                  <span className="text-foreground">{result.vatAmount.toFixed(2)} EUR</span>
                </div>

                <div className="border-t border-border my-2" />

                <div className="flex justify-between">
                  <span className="text-foreground font-semibold">Total TTC</span>
                  <span className="text-primary font-bold text-base">{result.totalTTC.toFixed(2)} EUR</span>
                </div>

                <div className="border-t border-border my-2" />

                <div className="flex justify-between">
                  <span className="text-foreground-muted">
                    Commission CPO
                    {matchingProfile
                      ? matchingProfile.commission_type === "percentage"
                        ? ` (${matchingProfile.commission_rate}%)`
                        : ` (fixe)`
                      : " (aucun profil)"}
                  </span>
                  <span className="text-amber-400 font-medium">{result.commissionCPO.toFixed(2)} EUR</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tariff Rule Form ───────────────────────────────────────────

function TariffRuleForm({
  rule,
  onClose,
  onSave,
  saving,
}: {
  rule: TariffRule | null;
  onClose: () => void;
  onSave: (data: Partial<TariffRule>) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    cpo_id: rule?.cpo_id ?? "",
    rule_name: rule?.rule_name ?? "",
    station_id: rule?.station_id ?? "",
    evse_id: rule?.evse_id ?? "",
    price_per_kwh: rule?.price_per_kwh ?? 0,
    price_per_minute: rule?.price_per_minute ?? 0,
    session_fee: rule?.session_fee ?? 0,
    parking_fee_per_minute: rule?.parking_fee_per_minute ?? 0,
    parking_grace_period_minutes: rule?.parking_grace_period_minutes ?? 15,
    no_show_fee: rule?.no_show_fee ?? 0,
    no_show_grace_period_minutes: rule?.no_show_grace_period_minutes ?? 15,
    reservation_fee_per_minute: rule?.reservation_fee_per_minute ?? 0,
    max_session_fee: rule?.max_session_fee ?? "",
    min_session_fee: rule?.min_session_fee ?? 0,
    currency: rule?.currency ?? "EUR",
    is_default: rule?.is_default ?? false,
  });

  const set = (key: string, value: string | number | boolean) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...(rule ? { id: rule.id } : {}),
      ...form,
      station_id: form.station_id || null,
      evse_id: form.evse_id || null,
      max_session_fee: form.max_session_fee === "" ? null : Number(form.max_session_fee),
    });
  };

  const numFields: { key: string; label: string; step: string }[] = [
    { key: "price_per_kwh", label: "Prix / kWh (EUR)", step: "0.0001" },
    { key: "price_per_minute", label: "Prix / minute (EUR)", step: "0.0001" },
    { key: "session_fee", label: "Frais de session (EUR)", step: "0.01" },
    { key: "parking_fee_per_minute", label: "Parking / minute (EUR)", step: "0.0001" },
    { key: "parking_grace_period_minutes", label: "Grace parking (min)", step: "1" },
    { key: "no_show_fee", label: "No-show fee (EUR)", step: "0.01" },
    { key: "no_show_grace_period_minutes", label: "Grace no-show (min)", step: "1" },
    { key: "reservation_fee_per_minute", label: "Reservation / minute (EUR)", step: "0.0001" },
    { key: "min_session_fee", label: "Min session fee (EUR)", step: "0.01" },
    { key: "max_session_fee", label: "Max session fee (EUR)", step: "0.01" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-background border-l border-border overflow-y-auto">
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-foreground">
            {rule ? "Modifier la regle" : "Nouvelle regle tarifaire"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-elevated transition-colors text-foreground-muted">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">CPO ID</label>
              <input
                value={form.cpo_id}
                onChange={(e) => set("cpo_id", e.target.value)}
                placeholder="vcity-ag"
                className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Nom regle</label>
              <input
                value={form.rule_name}
                onChange={(e) => set("rule_name", e.target.value)}
                placeholder="Standard AC"
                className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Station ID (optionnel)</label>
              <input
                value={form.station_id}
                onChange={(e) => set("station_id", e.target.value)}
                placeholder="Toutes si vide"
                className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">EVSE ID (optionnel)</label>
              <input
                value={form.evse_id}
                onChange={(e) => set("evse_id", e.target.value)}
                className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">Composantes tarifaires</h3>
            <div className="grid grid-cols-2 gap-3">
              {numFields.map((f) => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-foreground-muted mb-1">{f.label}</label>
                  <input
                    type="number"
                    step={f.step}
                    value={(form as Record<string, unknown>)[f.key] as number | string}
                    onChange={(e) => set(f.key, e.target.value === "" ? "" : (Number.isNaN(parseFloat(e.target.value)) ? 0 : parseFloat(e.target.value)))}
                    className="w-full px-3 py-2 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => set("is_default", e.target.checked)}
              className="rounded border-border"
              id="is_default"
            />
            <label htmlFor="is_default" className="text-sm text-foreground">
              Regle par defaut pour ce CPO
            </label>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving || !form.cpo_id || !form.rule_name}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {rule ? "Mettre a jour" : "Creer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Tab 3: Territory VAT Rates (inline editable)
// ════════════════════════════════════════════════════════════════

function VatTab() {
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const [editId, setEditId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState<string>("");

  const { data: rates, isLoading } = useQuery({
    queryKey: ["territory-vat-rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("territory_vat_rates")
        .select("*")
        .order("territory");
      if (error) throw error;
      return data as TerritoryVat[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, vat_rate }: { id: string; vat_rate: number }) => {
      const { error } = await supabase
        .from("territory_vat_rates")
        .update({ vat_rate })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["territory-vat-rates"] });
      toastSuccess("Taux TVA mis a jour");
      setEditId(null);
    },
    onError: (e: Error) => toastError(e.message),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground-muted">
        Taux de TVA par territoire DOM-TOM. Cliquez sur un taux pour le modifier.
      </p>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-foreground-muted font-medium">Territoire</th>
                <th className="px-4 py-3 text-foreground-muted font-medium">Taux TVA (%)</th>
                <th className="px-4 py-3 text-foreground-muted font-medium">Label</th>
                <th className="px-4 py-3 text-foreground-muted font-medium">Effectif depuis</th>
                <th className="px-4 py-3 text-foreground-muted font-medium w-20" />
              </tr>
            </thead>
            <tbody>
              {(rates ?? []).map((r) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-surface-elevated/50 transition-colors">
                  <td className="px-4 py-3 text-foreground font-medium">{r.territory}</td>
                  <td className="px-4 py-3">
                    {editId === r.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={editRate}
                          onChange={(e) => setEditRate(e.target.value)}
                          className="w-20 px-2 py-1 bg-surface border border-primary/40 rounded-lg text-sm text-foreground focus:outline-none"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              updateMutation.mutate({ id: r.id, vat_rate: parseFloat(editRate) });
                            }
                            if (e.key === "Escape") setEditId(null);
                          }}
                        />
                        <span className="text-foreground-muted">%</span>
                      </div>
                    ) : (
                      <span
                        className={cn(
                          "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
                          Number(r.vat_rate) === 0
                            ? "bg-green-500/10 text-green-400"
                            : Number(r.vat_rate) < 10
                              ? "bg-amber-500/10 text-amber-400"
                              : "bg-red-500/10 text-red-400"
                        )}
                      >
                        {Number(r.vat_rate).toFixed(2)}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground-muted">{r.label}</td>
                  <td className="px-4 py-3 text-foreground-muted">{r.effective_from}</td>
                  <td className="px-4 py-3">
                    {editId === r.id ? (
                      <div className="flex gap-1">
                        <button
                          onClick={() => updateMutation.mutate({ id: r.id, vat_rate: parseFloat(editRate) })}
                          disabled={updateMutation.isPending}
                          className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        >
                          {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          className="p-1.5 rounded-lg hover:bg-surface-elevated transition-colors text-foreground-muted"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditId(r.id);
                          setEditRate(String(r.vat_rate));
                        }}
                        className="p-1.5 rounded-lg hover:bg-surface-elevated transition-colors text-foreground-muted hover:text-foreground"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
