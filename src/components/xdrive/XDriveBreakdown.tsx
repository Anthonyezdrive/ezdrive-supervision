import { useState, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Legend,
  CartesianGrid,
} from "recharts";
import { CreditCard, Wifi, TrendingUp } from "lucide-react";
import {
  useXDriveB2BClient,
  useXDriveCDRs,
  computeXDriveKPIs,
  groupCDRsByMonth,
  derivePaymentMethod,
  type XDriveFilters,
} from "@/hooks/useXDriveCDRs";
import type { XDrivePartner, XDriveTheme } from "@/types/xdrive";
import type { B2BCdr } from "@/types/b2b";

// ── Outlet context ────────────────────────────────────────

interface XDriveOutletContext {
  partner: XDrivePartner | null;
  isEZDriveAdmin: boolean;
  theme: XDriveTheme;
}

// ── Constants ─────────────────────────────────────────────

const TOOLTIP_STYLE = {
  backgroundColor: "#111638",
  border: "1px solid #2A2F5A",
  borderRadius: "12px",
  color: "#F7F9FC",
  fontSize: "12px",
};

const PAYMENT_COLORS: Record<string, string> = {
  CB:   "#3498DB",
  RFID: "#9ACC0E",
  App:  "#F39C12",
  QR:   "#9B59B6",
};

const EMSP_COLORS = [
  "#9ACC0E", "#3498DB", "#F39C12", "#E74C3C", "#9B59B6",
  "#1ABC9C", "#E67E22", "#2ECC71", "#34495E",
];

const PAYMENT_TYPES = ["CB", "RFID", "App", "QR"] as const;
type PaymentType = typeof PAYMENT_TYPES[number];

// ── Period presets ────────────────────────────────────────

type PeriodPreset = "day" | "week" | "month" | "quarter" | "year";

const PRESET_LABELS: { key: PeriodPreset; label: string }[] = [
  { key: "day",     label: "Jour" },
  { key: "week",    label: "Semaine" },
  { key: "month",   label: "Mois" },
  { key: "quarter", label: "Trimestre" },
  { key: "year",    label: "Année" },
];

function computeDateRange(preset: PeriodPreset): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = fmt(now);

  if (preset === "day") return { from: today, to: today };
  if (preset === "week") {
    const day  = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const mon  = new Date(now);
    mon.setDate(diff);
    return { from: fmt(mon), to: today };
  }
  if (preset === "month") {
    return { from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, to: today };
  }
  if (preset === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    return { from: `${now.getFullYear()}-${pad(q * 3 + 1)}-01`, to: today };
  }
  return { from: `${now.getFullYear()}-01-01`, to: today };
}

// ── Formatting helpers ────────────────────────────────────

function fmtN(n: number, decimals = 1): string {
  return n.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtEUR(n: number): string {
  return `${fmtN(n, 2)} €`;
}

function pct(part: number, total: number): string {
  if (total === 0) return "0,0 %";
  return `${fmtN((part / total) * 100, 1)} %`;
}

// ── Extended breakdown computations ──────────────────────

interface PaymentBreakdownRow {
  type:       PaymentType;
  sessions:   number;
  energy:     number; // kWh
  caHT:       number;
  caTTC:      number;
  sessionPct: number;
  energyPct:  number;
  caPct:      number;
}

interface EmspBreakdownRow {
  operator:   string;
  sessions:   number;
  energy:     number;
  caHT:       number;
  caTTC:      number;
  sessionPct: number;
  energyPct:  number;
  caPct:      number;
  isDirect:   boolean;
}

function computePaymentBreakdown(
  cdrs: B2BCdr[],
  ownEmspPartyId: string
): PaymentBreakdownRow[] {
  const sessions: Record<PaymentType, number> = { CB: 0, RFID: 0, App: 0, QR: 0 };
  const energy:   Record<PaymentType, number> = { CB: 0, RFID: 0, App: 0, QR: 0 };
  const caHT:     Record<PaymentType, number> = { CB: 0, RFID: 0, App: 0, QR: 0 };
  const caTTC:    Record<PaymentType, number> = { CB: 0, RFID: 0, App: 0, QR: 0 };

  for (const cdr of cdrs) {
    const m = derivePaymentMethod(cdr, ownEmspPartyId);
    sessions[m] += 1;
    energy[m]   += cdr.total_energy ?? 0;
    caHT[m]     += cdr.total_cost ?? 0;
    caTTC[m]    += cdr.total_retail_cost_incl_vat ?? cdr.total_cost ?? 0;
  }

  const totalSessions = cdrs.length;
  const totalEnergy   = Object.values(energy).reduce((s, v) => s + v, 0);
  const totalCaHT     = Object.values(caHT).reduce((s, v) => s + v, 0);

  return PAYMENT_TYPES.map((type) => ({
    type,
    sessions:   sessions[type],
    energy:     energy[type],
    caHT:       caHT[type],
    caTTC:      caTTC[type],
    sessionPct: totalSessions > 0 ? (sessions[type] / totalSessions) * 100 : 0,
    energyPct:  totalEnergy   > 0 ? (energy[type]   / totalEnergy)   * 100 : 0,
    caPct:      totalCaHT     > 0 ? (caHT[type]     / totalCaHT)     * 100 : 0,
  }));
}

interface EmspRaw {
  sessions: number;
  energy:   number;
  caHT:     number;
  caTTC:    number;
  isDirect: boolean;
}

function computeEmspBreakdown(
  cdrs: B2BCdr[],
  ownEmspPartyId: string
): EmspBreakdownRow[] {
  const map = new Map<string, EmspRaw>();

  for (const cdr of cdrs) {
    const partyId   = cdr.emsp_party_id;
    const isDirect  = !partyId || partyId === ownEmspPartyId;
    const name      = isDirect
      ? "Direct"
      : (() => {
          const EMSP_NAMES: Record<string, string> = {
            GFX: "Freshmile", CHM: "ChargeMap", SHL: "Shell Recharge",
            VRT: "Virta", TOT: "Freshmile (Total)", EON: "E.ON Drive",
            IOP: "Intercharge", EDF: "EDF Pulse", ENE: "Enbw", MOB: "Mobivia",
          };
          return EMSP_NAMES[partyId!.toUpperCase()] ?? partyId ?? "Inconnu";
        })();

    if (!map.has(name)) {
      map.set(name, { sessions: 0, energy: 0, caHT: 0, caTTC: 0, isDirect });
    }
    const row = map.get(name)!;
    row.sessions += 1;
    row.energy   += cdr.total_energy ?? 0;
    row.caHT     += cdr.total_cost ?? 0;
    row.caTTC    += cdr.total_retail_cost_incl_vat ?? cdr.total_cost ?? 0;
  }

  const totalSessions = cdrs.length;
  const totalEnergy   = cdrs.reduce((s, c) => s + (c.total_energy ?? 0), 0);
  const totalCaHT     = cdrs.reduce((s, c) => s + (c.total_cost ?? 0), 0);

  return Array.from(map.entries())
    .map(([operator, raw]) => ({
      operator,
      sessions:   raw.sessions,
      energy:     raw.energy,
      caHT:       raw.caHT,
      caTTC:      raw.caTTC,
      isDirect:   raw.isDirect,
      sessionPct: totalSessions > 0 ? (raw.sessions / totalSessions) * 100 : 0,
      energyPct:  totalEnergy   > 0 ? (raw.energy   / totalEnergy)   * 100 : 0,
      caPct:      totalCaHT     > 0 ? (raw.caHT     / totalCaHT)     * 100 : 0,
    }))
    .sort((a, b) => b.caHT - a.caHT);
}

// Monthly payment stacked data
const MONTH_SHORT = ["jan", "fév", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"];

function computeMonthlyPaymentBreakdown(
  cdrs: B2BCdr[],
  ownEmspPartyId: string
) {
  const rows: Record<number, Record<PaymentType, number> & { monthLabel: string }> = {};

  for (let m = 0; m < 12; m++) {
    rows[m] = { CB: 0, RFID: 0, App: 0, QR: 0, monthLabel: MONTH_SHORT[m] };
  }

  for (const cdr of cdrs) {
    const m      = new Date(cdr.start_date_time).getMonth();
    const method = derivePaymentMethod(cdr, ownEmspPartyId);
    rows[m][method] += 1;
  }

  return Object.values(rows);
}

// ── Skeleton ──────────────────────────────────────────────

function BreakdownSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="bg-surface border border-border rounded-2xl p-4 h-16" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-surface border border-border rounded-2xl p-5 h-28" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-border rounded-2xl p-6 h-72" />
        <div className="bg-surface border border-border rounded-2xl p-6 h-72" />
      </div>
      <div className="bg-surface border border-border rounded-2xl p-6 h-72" />
      <div className="bg-surface border border-border rounded-2xl p-6 h-72" />
    </div>
  );
}

// ── Custom pie tooltip ────────────────────────────────────

function PaymentTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2">
      <p className="font-medium">{entry.name}</p>
      <p className="text-xs opacity-80">{fmtEUR(entry.value)}</p>
    </div>
  );
}

// ── Section header ────────────────────────────────────────

function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-5">
      <Icon className="w-4 h-4 text-foreground-muted" />
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
    </div>
  );
}

// ── Main component ────────────────────────────────────────

export function XDriveBreakdown() {
  const { partner, theme } = useOutletContext<XDriveOutletContext>();

  // Period state
  const [preset, setPreset]     = useState<PeriodPreset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");
  const [useCustom,  setUseCustom]  = useState(false);

  const primaryColor = theme?.primaryColor ?? "#9ACC0E";
  const ownEmspPartyId = "GFX";

  // B2B client
  const { data: b2bClient, isLoading: clientLoading } = useXDriveB2BClient(partner?.b2b_client_id);
  const customerExternalIds = useMemo(
    () => b2bClient?.customer_external_ids ?? [],
    [b2bClient]
  );

  // Date range
  const dateRange = useMemo(() => {
    if (useCustom && customFrom && customTo) {
      return { from: `${customFrom}T00:00:00Z`, to: `${customTo}T23:59:59Z` };
    }
    const r = computeDateRange(preset);
    return { from: `${r.from}T00:00:00Z`, to: `${r.to}T23:59:59Z` };
  }, [preset, useCustom, customFrom, customTo]);

  const filters: XDriveFilters = useMemo(
    () => ({
      dateFrom:     dateRange.from,
      dateTo:       dateRange.to,
      paymentTypes: ["CB", "RFID", "App", "QR"],
      operatorType: "all",
    }),
    [dateRange]
  );

  const { data: cdrs = [], isLoading: cdrsLoading } = useXDriveCDRs(customerExternalIds, filters);
  const isLoading = clientLoading || cdrsLoading;

  // Breakdown data
  const paymentRows = useMemo(
    () => computePaymentBreakdown(cdrs, ownEmspPartyId),
    [cdrs]
  );
  const emspRows = useMemo(
    () => computeEmspBreakdown(cdrs, ownEmspPartyId),
    [cdrs]
  );
  const monthlyPayment = useMemo(
    () => computeMonthlyPaymentBreakdown(cdrs, ownEmspPartyId),
    [cdrs]
  );
  const kpis = useMemo(() => computeXDriveKPIs(cdrs, ownEmspPartyId), [cdrs]);
  const monthlyData = useMemo(() => groupCDRsByMonth(cdrs), [cdrs]);

  // Pie chart data (CA HT per payment type, filtered non-zero)
  const paymentPieData = useMemo(
    () =>
      paymentRows
        .filter((r) => r.caHT > 0)
        .map((r) => ({ name: r.type, value: Math.round(r.caHT * 100) / 100 })),
    [paymentRows]
  );

  // eMSP bar chart data
  const emspBarData = useMemo(
    () =>
      emspRows
        .filter((r) => r.caHT > 0)
        .map((r) => ({ name: r.operator, ca: Math.round(r.caHT * 100) / 100, isDirect: r.isDirect })),
    [emspRows]
  );

  // Direct vs Roaming split
  const directRow  = emspRows.find((r) => r.isDirect);
  const roamingCA  = emspRows.filter((r) => !r.isDirect).reduce((s, r) => s + r.caHT, 0);
  const roamingSessions = emspRows.filter((r) => !r.isDirect).reduce((s, r) => s + r.sessions, 0);

  if (!partner) {
    return (
      <div className="rounded-2xl border border-border bg-surface-elevated p-8 text-center">
        <p className="text-sm text-foreground-muted">Aucun partenaire sélectionné.</p>
      </div>
    );
  }

  if (isLoading) return <BreakdownSkeleton />;

  const totalSessions = kpis.sessionCount;
  const totalEnergy   = kpis.totalEnergy;
  const totalCaHT     = kpis.caHT;
  const totalCaTTC    = kpis.caTTC;

  return (
    <div className="space-y-6">

      {/* ── Period filter bar ──────────────────────────────── */}
      <div className="bg-surface border border-border rounded-2xl p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Presets */}
          <div className="flex items-center gap-1.5">
            {PRESET_LABELS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => { setPreset(key); setUseCustom(false); }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  !useCustom && preset === key
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-foreground-muted hover:text-foreground hover:bg-surface-elevated"
                }`}
                style={
                  !useCustom && preset === key
                    ? { borderColor: `${primaryColor}66`, backgroundColor: `${primaryColor}18`, color: primaryColor }
                    : {}
                }
              >
                {label}
              </button>
            ))}
          </div>

          <div className="h-6 w-px bg-border" />

          {/* Custom range */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => { setCustomFrom(e.target.value); setUseCustom(true); }}
              className="px-2 py-1.5 text-xs bg-surface-elevated border border-border rounded-lg text-foreground focus:outline-none focus:border-border-focus"
            />
            <span className="text-xs text-foreground-muted">→</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => { setCustomTo(e.target.value); setUseCustom(true); }}
              className="px-2 py-1.5 text-xs bg-surface-elevated border border-border rounded-lg text-foreground focus:outline-none focus:border-border-focus"
            />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          Section 1 — Ventilation par moyen de paiement
      ══════════════════════════════════════════════════════ */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <SectionTitle icon={CreditCard} title="Ventilation par moyen de paiement" />

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {paymentRows.map((row) => (
            <div
              key={row.type}
              className="rounded-xl border p-4"
              style={{
                borderColor: `${PAYMENT_COLORS[row.type]}40`,
                backgroundColor: `${PAYMENT_COLORS[row.type]}0E`,
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span
                  className="text-xs font-bold tracking-wide uppercase"
                  style={{ color: PAYMENT_COLORS[row.type] }}
                >
                  {row.type}
                </span>
                <span
                  className="text-xs font-semibold px-1.5 py-0.5 rounded-md"
                  style={{
                    backgroundColor: `${PAYMENT_COLORS[row.type]}25`,
                    color: PAYMENT_COLORS[row.type],
                  }}
                >
                  {fmtN(row.caPct, 1)} %
                </span>
              </div>
              <p className="text-xl font-heading font-bold text-foreground">
                {row.sessions.toLocaleString("fr-FR")}
                <span className="text-xs font-normal text-foreground-muted ml-1">sess.</span>
              </p>
              <p className="text-sm text-foreground-muted mt-0.5">
                {fmtN(row.energy, 1)} kWh
              </p>
              <p className="text-sm font-medium text-foreground mt-0.5">
                {fmtEUR(row.caTTC)}
                <span className="text-xs text-foreground-muted ml-1">TTC</span>
              </p>
            </div>
          ))}
        </div>

        {/* Chart + Table */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie chart */}
          <div>
            {paymentPieData.length === 0 ? (
              <div className="flex items-center justify-center h-[240px]">
                <p className="text-sm text-foreground-muted">Aucune donnée</p>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="55%" height={240}>
                  <PieChart>
                    <Pie
                      data={paymentPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      dataKey="value"
                      paddingAngle={2}
                    >
                      {paymentPieData.map((entry) => (
                        <Cell key={entry.name} fill={PAYMENT_COLORS[entry.name] ?? "#8884d8"} />
                      ))}
                    </Pie>
                    <Tooltip content={<PaymentTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Legend */}
                <div className="flex flex-col gap-2.5">
                  {paymentPieData.map((entry) => {
                    const row = paymentRows.find((r) => r.type === entry.name);
                    return (
                      <div key={entry.name} className="flex items-start gap-2">
                        <span
                          className="inline-block w-3 h-3 rounded-full mt-0.5 shrink-0"
                          style={{ backgroundColor: PAYMENT_COLORS[entry.name] ?? "#8884d8" }}
                        />
                        <div>
                          <p className="text-xs font-semibold text-foreground">{entry.name}</p>
                          <p className="text-xs text-foreground-muted">
                            {fmtEUR(entry.value)} HT · {row ? fmtN(row.caPct, 1) : "0,0"} %
                          </p>
                          <p className="text-xs text-foreground-muted">
                            {(row?.sessions ?? 0).toLocaleString("fr-FR")} sess. · {fmtN(row?.energy ?? 0, 1)} kWh
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-foreground-muted">
                  <th className="text-left py-2 pr-3 font-medium">Type</th>
                  <th className="text-right py-2 px-2 font-medium">Sessions</th>
                  <th className="text-right py-2 px-2 font-medium">%</th>
                  <th className="text-right py-2 px-2 font-medium">kWh</th>
                  <th className="text-right py-2 px-2 font-medium">%</th>
                  <th className="text-right py-2 px-2 font-medium">CA HT</th>
                  <th className="text-right py-2 px-2 font-medium">CA TTC</th>
                  <th className="text-right py-2 pl-2 font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {paymentRows.map((row) => (
                  <tr key={row.type} className="border-b border-border/50 hover:bg-surface-elevated/50 transition-colors">
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: PAYMENT_COLORS[row.type] }}
                        />
                        <span className="font-semibold text-foreground">{row.type}</span>
                      </span>
                    </td>
                    <td className="text-right py-2.5 px-2 text-foreground">
                      {row.sessions.toLocaleString("fr-FR")}
                    </td>
                    <td className="text-right py-2.5 px-2 text-foreground-muted">
                      {fmtN(row.sessionPct, 1)} %
                    </td>
                    <td className="text-right py-2.5 px-2 text-foreground">
                      {fmtN(row.energy, 1)}
                    </td>
                    <td className="text-right py-2.5 px-2 text-foreground-muted">
                      {fmtN(row.energyPct, 1)} %
                    </td>
                    <td className="text-right py-2.5 px-2 text-foreground">
                      {fmtEUR(row.caHT)}
                    </td>
                    <td className="text-right py-2.5 px-2 text-foreground">
                      {fmtEUR(row.caTTC)}
                    </td>
                    <td className="text-right py-2.5 pl-2 text-foreground-muted">
                      {fmtN(row.caPct, 1)} %
                    </td>
                  </tr>
                ))}
                {/* Total row */}
                <tr className="border-t border-border font-semibold">
                  <td className="py-2.5 pr-3 text-foreground">Total</td>
                  <td className="text-right py-2.5 px-2 text-foreground">
                    {totalSessions.toLocaleString("fr-FR")}
                  </td>
                  <td className="text-right py-2.5 px-2 text-foreground-muted">100,0 %</td>
                  <td className="text-right py-2.5 px-2 text-foreground">
                    {fmtN(totalEnergy, 1)}
                  </td>
                  <td className="text-right py-2.5 px-2 text-foreground-muted">100,0 %</td>
                  <td className="text-right py-2.5 px-2 text-foreground">
                    {fmtEUR(totalCaHT)}
                  </td>
                  <td className="text-right py-2.5 px-2 text-foreground">
                    {fmtEUR(totalCaTTC)}
                  </td>
                  <td className="text-right py-2.5 pl-2 text-foreground-muted">100,0 %</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          Section 2 — Ventilation par opérateur eMSP
      ══════════════════════════════════════════════════════ */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <SectionTitle icon={Wifi} title="Ventilation par opérateur eMSP" />

        {/* Direct vs Roaming highlight */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-xl border border-border bg-surface-elevated/50 p-4">
            <p className="text-xs text-foreground-muted mb-1">Direct (EZDrive)</p>
            <p className="text-2xl font-heading font-bold text-foreground">
              {(directRow?.sessions ?? 0).toLocaleString("fr-FR")}
              <span className="text-sm font-normal text-foreground-muted ml-1">sess.</span>
            </p>
            <p className="text-sm text-foreground-muted mt-0.5">
              {fmtEUR(directRow?.caHT ?? 0)} HT
            </p>
            <p className="text-xs text-foreground-muted mt-0.5">
              {pct(directRow?.caHT ?? 0, totalCaHT)} du CA
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-elevated/50 p-4">
            <p className="text-xs text-foreground-muted mb-1">Roaming (eMSP tiers)</p>
            <p className="text-2xl font-heading font-bold text-foreground">
              {roamingSessions.toLocaleString("fr-FR")}
              <span className="text-sm font-normal text-foreground-muted ml-1">sess.</span>
            </p>
            <p className="text-sm text-foreground-muted mt-0.5">
              {fmtEUR(roamingCA)} HT
            </p>
            <p className="text-xs text-foreground-muted mt-0.5">
              {pct(roamingCA, totalCaHT)} du CA
            </p>
          </div>
        </div>

        {/* Chart + Table */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Horizontal bar chart */}
          <div>
            {emspBarData.length === 0 ? (
              <div className="flex items-center justify-center h-[240px]">
                <p className="text-sm text-foreground-muted">Aucune donnée</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(180, emspBarData.length * 44)}>
                <BarChart
                  data={emspBarData}
                  layout="vertical"
                  margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fill: "#B0B8D4", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${v.toFixed(0)} €`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: "#B0B8D4", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    width={110}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number) => [fmtEUR(v), "CA HT"]}
                  />
                  <Bar dataKey="ca" radius={[0, 6, 6, 0]} maxBarSize={28}>
                    {emspBarData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.isDirect ? primaryColor : EMSP_COLORS[(i) % EMSP_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-foreground-muted">
                  <th className="text-left py-2 pr-3 font-medium">Opérateur</th>
                  <th className="text-right py-2 px-2 font-medium">Sessions</th>
                  <th className="text-right py-2 px-2 font-medium">%</th>
                  <th className="text-right py-2 px-2 font-medium">kWh</th>
                  <th className="text-right py-2 px-2 font-medium">CA HT</th>
                  <th className="text-right py-2 px-2 font-medium">CA TTC</th>
                  <th className="text-right py-2 pl-2 font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {emspRows.map((row, i) => (
                  <tr
                    key={row.operator}
                    className="border-b border-border/50 hover:bg-surface-elevated/50 transition-colors"
                  >
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block w-2 h-2 rounded-full shrink-0"
                          style={{
                            backgroundColor: row.isDirect
                              ? primaryColor
                              : EMSP_COLORS[i % EMSP_COLORS.length],
                          }}
                        />
                        <span className={`font-medium ${row.isDirect ? "text-foreground" : "text-foreground-muted"}`}>
                          {row.operator}
                        </span>
                        {row.isDirect && (
                          <span
                            className="text-[10px] px-1 py-0.5 rounded font-semibold"
                            style={{ backgroundColor: `${primaryColor}25`, color: primaryColor }}
                          >
                            Direct
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="text-right py-2.5 px-2 text-foreground">
                      {row.sessions.toLocaleString("fr-FR")}
                    </td>
                    <td className="text-right py-2.5 px-2 text-foreground-muted">
                      {fmtN(row.sessionPct, 1)} %
                    </td>
                    <td className="text-right py-2.5 px-2 text-foreground">
                      {fmtN(row.energy, 1)}
                    </td>
                    <td className="text-right py-2.5 px-2 text-foreground">
                      {fmtEUR(row.caHT)}
                    </td>
                    <td className="text-right py-2.5 px-2 text-foreground">
                      {fmtEUR(row.caTTC)}
                    </td>
                    <td className="text-right py-2.5 pl-2 text-foreground-muted">
                      {fmtN(row.caPct, 1)} %
                    </td>
                  </tr>
                ))}
                {/* Total */}
                <tr className="border-t border-border font-semibold">
                  <td className="py-2.5 pr-3 text-foreground">Total</td>
                  <td className="text-right py-2.5 px-2 text-foreground">
                    {totalSessions.toLocaleString("fr-FR")}
                  </td>
                  <td className="text-right py-2.5 px-2 text-foreground-muted">100,0 %</td>
                  <td className="text-right py-2.5 px-2 text-foreground">
                    {fmtN(totalEnergy, 1)}
                  </td>
                  <td className="text-right py-2.5 px-2 text-foreground">
                    {fmtEUR(totalCaHT)}
                  </td>
                  <td className="text-right py-2.5 px-2 text-foreground">
                    {fmtEUR(totalCaTTC)}
                  </td>
                  <td className="text-right py-2.5 pl-2 text-foreground-muted">100,0 %</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          Section 3 — Évolution mensuelle
      ══════════════════════════════════════════════════════ */}
      <div className="bg-surface border border-border rounded-2xl p-6">
        <SectionTitle icon={TrendingUp} title="Évolution mensuelle — répartition par paiement" />

        {monthlyPayment.every((r) => r.CB === 0 && r.RFID === 0 && r.App === 0 && r.QR === 0) ? (
          <div className="flex items-center justify-center h-[240px]">
            <p className="text-sm text-foreground-muted">Aucune donnée pour la période sélectionnée</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={monthlyPayment}
                margin={{ top: 10, right: 10, bottom: 5, left: -10 }}
              >
                <XAxis
                  dataKey="monthLabel"
                  tick={{ fill: "#B0B8D4", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#B0B8D4", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value: number, name: string) => [
                    `${value.toLocaleString("fr-FR")} sessions`,
                    name,
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: "12px", color: "#B0B8D4", paddingTop: "12px" }}
                />
                <Bar dataKey="CB"   stackId="a" fill={PAYMENT_COLORS.CB}   name="CB"   maxBarSize={40} />
                <Bar dataKey="RFID" stackId="a" fill={PAYMENT_COLORS.RFID} name="RFID" maxBarSize={40} />
                <Bar dataKey="App"  stackId="a" fill={PAYMENT_COLORS.App}  name="App"  maxBarSize={40} />
                <Bar dataKey="QR"   stackId="a" fill={PAYMENT_COLORS.QR}   name="QR"   maxBarSize={40} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* Direct vs Roaming trend */}
            <div className="mt-6 pt-6 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground mb-4">
                Évolution mensuelle — Direct vs Roaming (sessions)
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={(() => {
                    const map = new Map<number, { direct: number; roaming: number }>();
                    for (let m = 0; m < 12; m++) map.set(m, { direct: 0, roaming: 0 });
                    for (const cdr of cdrs) {
                      const m = new Date(cdr.start_date_time).getMonth();
                      const isDirect = !cdr.emsp_party_id || cdr.emsp_party_id === ownEmspPartyId;
                      const entry = map.get(m)!;
                      if (isDirect) entry.direct += 1;
                      else entry.roaming += 1;
                    }
                    return monthlyData.map((row, i) => ({
                      monthLabel: row.monthLabel,
                      Direct:  map.get(i)?.direct  ?? 0,
                      Roaming: map.get(i)?.roaming ?? 0,
                    }));
                  })()}
                  margin={{ top: 10, right: 10, bottom: 5, left: -10 }}
                >
                  <XAxis
                    dataKey="monthLabel"
                    tick={{ fill: "#B0B8D4", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#B0B8D4", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value: number, name: string) => [
                      `${value.toLocaleString("fr-FR")} sessions`,
                      name,
                    ]}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "12px", color: "#B0B8D4", paddingTop: "12px" }}
                  />
                  <Bar dataKey="Direct"  fill={primaryColor}  maxBarSize={36} radius={[4, 4, 0, 0]} name="Direct" />
                  <Bar dataKey="Roaming" fill="#3498DB"        maxBarSize={36} radius={[4, 4, 0, 0]} name="Roaming" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
