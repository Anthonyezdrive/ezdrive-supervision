// ============================================================
// EZDrive — Invoice Generation Wizard (3-step modal)
// Task 3.1: Batch invoice generation from unbilled CDRs
// ============================================================

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  FileText,
  Calendar,
  Loader2,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  X,
  Zap,
  Users,
  Building2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCPOs } from "@/hooks/useCPOs";
import {
  useInvoicePreview,
  useGenerateInvoices,
  type GenerateParams,
} from "@/hooks/useInvoiceGeneration";

// ── Types ────────────────────────────────────────────────────

interface InvoiceGenerationWizardProps {
  open: boolean;
  onClose: () => void;
}

type GroupBy = GenerateParams["groupBy"];

interface StepDef {
  key: string;
  label: string;
}

const STEPS: StepDef[] = [
  { key: "period", label: "Periode" },
  { key: "options", label: "Options" },
  { key: "preview", label: "Apercu" },
];

// ── Month helpers ────────────────────────────────────────────

function getLast12Months(): { value: string; label: string; from: string; to: string }[] {
  const months: { value: string; label: string; from: string; to: string }[] = [];
  const now = new Date();
  for (let i = 1; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const label = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    months.push({ value: `${year}-${String(month + 1).padStart(2, "0")}`, label, from, to });
  }
  return months;
}

const GROUP_OPTIONS: { value: GroupBy; label: string; description: string; icon: typeof Users }[] = [
  { value: "customer", label: "Par client", description: "Une facture par client (token RFID / ID)", icon: Users },
  { value: "station", label: "Par station", description: "Une facture par station de charge", icon: Zap },
  { value: "cpo", label: "Par CPO", description: "Une facture par operateur CPO", icon: Building2 },
];

// ── Component ────────────────────────────────────────────────

export function InvoiceGenerationWizard({ open, onClose }: InvoiceGenerationWizardProps) {
  // Step state
  const [step, setStep] = useState(0);

  // Step 1 — Period
  const months = useMemo(() => getLast12Months(), []);
  const [selectedMonth, setSelectedMonth] = useState(months[0]?.value ?? "");
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Step 2 — Options
  const [groupBy, setGroupBy] = useState<GroupBy>("customer");
  const [cpoId, setCpoId] = useState<string>("");
  const { data: cpos } = useCPOs({ includeRoot: true });

  // Derived period
  const period = useMemo(() => {
    if (useCustomRange && customFrom && customTo) {
      return { from: customFrom, to: customTo };
    }
    const m = months.find((m) => m.value === selectedMonth);
    return m ? { from: m.from, to: m.to } : null;
  }, [useCustomRange, customFrom, customTo, selectedMonth, months]);

  // Step 3 — Preview
  const previewParams = useMemo<GenerateParams | null>(() => {
    if (step < 2 || !period) return null;
    return {
      periodFrom: period.from,
      periodTo: period.to,
      groupBy,
      cpoId: cpoId || undefined,
    };
  }, [step, period, groupBy, cpoId]);

  const { data: preview, isLoading: previewLoading, isError: previewError } = useInvoicePreview(previewParams);

  // Generation mutation
  const generateMutation = useGenerateInvoices();
  const [generated, setGenerated] = useState(false);

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setStep(0);
      setSelectedMonth(months[0]?.value ?? "");
      setUseCustomRange(false);
      setCustomFrom("");
      setCustomTo("");
      setGroupBy("customer");
      setCpoId("");
      setGenerated(false);
      generateMutation.reset();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handlers
  const canNext = useMemo(() => {
    if (step === 0) return !!period;
    if (step === 1) return true;
    return false;
  }, [step, period]);

  const handleNext = useCallback(() => {
    if (step < 2) setStep((s) => s + 1);
  }, [step]);

  const handleBack = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  const handleGenerate = useCallback(async () => {
    if (!period) return;
    try {
      await generateMutation.mutateAsync({
        periodFrom: period.from,
        periodTo: period.to,
        groupBy,
        cpoId: cpoId || undefined,
      });
      setGenerated(true);
    } catch {
      // error is in generateMutation.error
    }
  }, [period, groupBy, cpoId, generateMutation]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!open) return null;

  // Format helpers
  const fmt = (n: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

  const fmtEnergy = (kwh: number) =>
    new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(kwh) + " kWh";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="bg-surface border border-border rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* ── Header ──────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Generation de factures</h2>
              <p className="text-xs text-foreground-muted">Facturation groupee des CDRs non factures</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Step Indicator ──────────────────────────── */}
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2 flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors",
                      i < step
                        ? "bg-primary text-white"
                        : i === step
                          ? "bg-primary/20 text-primary ring-2 ring-primary/40"
                          : "bg-surface-elevated text-foreground-muted"
                    )}
                  >
                    {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
                  </div>
                  <span
                    className={cn(
                      "text-sm font-medium",
                      i === step ? "text-foreground" : "text-foreground-muted"
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="flex-1 h-px bg-border mx-3" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Body ────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Step 0: Period */}
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Selectionnez la periode</h3>
                <p className="text-xs text-foreground-muted">
                  Choisissez un mois ou definissez une plage personnalisee
                </p>
              </div>

              {/* Toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setUseCustomRange(false)}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-lg border transition-colors",
                    !useCustomRange
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "border-border text-foreground-muted hover:text-foreground"
                  )}
                >
                  <Calendar className="w-3.5 h-3.5 inline mr-1.5" />
                  Mois
                </button>
                <button
                  onClick={() => setUseCustomRange(true)}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-lg border transition-colors",
                    useCustomRange
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "border-border text-foreground-muted hover:text-foreground"
                  )}
                >
                  Plage personnalisee
                </button>
              </div>

              {!useCustomRange ? (
                <div className="grid grid-cols-3 gap-2">
                  {months.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setSelectedMonth(m.value)}
                      className={cn(
                        "px-3 py-2.5 text-sm rounded-xl border transition-colors text-left capitalize",
                        selectedMonth === m.value
                          ? "bg-primary/10 border-primary/30 text-primary font-medium"
                          : "border-border text-foreground-muted hover:border-foreground/20 hover:text-foreground"
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs text-foreground-muted mb-1.5">Date debut</label>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-foreground-muted mb-1.5">Date fin</label>
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                </div>
              )}

              {period && (
                <div className="text-xs text-foreground-muted bg-surface-elevated rounded-xl px-4 py-2.5 border border-border">
                  Periode selectionnee : <span className="text-foreground font-medium">{period.from}</span>{" "}
                  au <span className="text-foreground font-medium">{period.to}</span>
                </div>
              )}
            </div>
          )}

          {/* Step 1: Options */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-1">Options de regroupement</h3>
                <p className="text-xs text-foreground-muted">
                  Definissez comment les CDRs seront regroupes en factures
                </p>
              </div>

              {/* Group by */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground-muted uppercase tracking-wider">
                  Regrouper par
                </label>
                <div className="space-y-2">
                  {GROUP_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setGroupBy(opt.value)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left",
                        groupBy === opt.value
                          ? "bg-primary/10 border-primary/30"
                          : "border-border hover:border-foreground/20"
                      )}
                    >
                      <div
                        className={cn(
                          "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                          groupBy === opt.value ? "bg-primary/20" : "bg-surface-elevated"
                        )}
                      >
                        <opt.icon
                          className={cn(
                            "w-4.5 h-4.5",
                            groupBy === opt.value ? "text-primary" : "text-foreground-muted"
                          )}
                        />
                      </div>
                      <div>
                        <div
                          className={cn(
                            "text-sm font-medium",
                            groupBy === opt.value ? "text-primary" : "text-foreground"
                          )}
                        >
                          {opt.label}
                        </div>
                        <div className="text-xs text-foreground-muted">{opt.description}</div>
                      </div>
                      {/* Radio indicator */}
                      <div className="ml-auto">
                        <div
                          className={cn(
                            "w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center",
                            groupBy === opt.value ? "border-primary" : "border-border"
                          )}
                        >
                          {groupBy === opt.value && (
                            <div className="w-2 h-2 rounded-full bg-primary" />
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* CPO filter */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-foreground-muted uppercase tracking-wider">
                  Filtrer par CPO (optionnel)
                </label>
                <select
                  value={cpoId}
                  onChange={(e) => setCpoId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Tous les CPOs</option>
                  {(cpos ?? []).map((cpo) => (
                    <option key={cpo.id} value={cpo.code ?? cpo.id}>
                      {cpo.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Step 2: Preview & Confirm */}
          {step === 2 && (
            <div className="space-y-5">
              {/* Success state */}
              {generated && generateMutation.data ? (
                <div className="text-center py-8 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto">
                    <CheckCircle className="w-8 h-8 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      Factures generees avec succes
                    </h3>
                    <p className="text-sm text-foreground-muted mt-1">
                      <span className="text-foreground font-medium">
                        {generateMutation.data.invoiceCount} facture{generateMutation.data.invoiceCount > 1 ? "s" : ""}
                      </span>{" "}
                      creee{generateMutation.data.invoiceCount > 1 ? "s" : ""} pour un total de{" "}
                      <span className="text-foreground font-medium">
                        {fmt(generateMutation.data.totalCents / 100)}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={handleClose}
                    className="mt-2 px-5 py-2 bg-primary text-white text-sm font-medium rounded-xl hover:bg-primary/90 transition-colors"
                  >
                    Fermer
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground mb-1">Apercu de la generation</h3>
                    <p className="text-xs text-foreground-muted">
                      Verifiez les factures qui seront creees avant de confirmer
                    </p>
                  </div>

                  {/* Loading */}
                  {previewLoading && (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                      <Loader2 className="w-8 h-8 text-primary animate-spin" />
                      <p className="text-sm text-foreground-muted">Analyse des CDRs en cours...</p>
                    </div>
                  )}

                  {/* Error */}
                  {previewError && (
                    <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                      <AlertCircle className="w-5 h-5 text-danger shrink-0" />
                      <p className="text-sm text-danger">
                        Erreur lors de l'analyse. Verifiez que la table ocpi_cdrs contient des donnees.
                      </p>
                    </div>
                  )}

                  {/* Generation error */}
                  {generateMutation.isError && (
                    <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                      <AlertCircle className="w-5 h-5 text-danger shrink-0" />
                      <p className="text-sm text-danger">
                        {generateMutation.error?.message ?? "Erreur lors de la generation."}
                      </p>
                    </div>
                  )}

                  {/* Preview data */}
                  {preview && !previewLoading && (
                    <>
                      {preview.cdrCount === 0 ? (
                        <div className="text-center py-8 space-y-2">
                          <FileText className="w-10 h-10 text-foreground-muted mx-auto" />
                          <p className="text-sm text-foreground-muted">
                            Aucun CDR non facture trouve pour cette periode.
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* Summary cards */}
                          <div className="grid grid-cols-3 gap-3">
                            <div className="bg-surface-elevated border border-border rounded-xl px-4 py-3 text-center">
                              <div className="text-lg font-bold text-foreground">
                                {preview.groupCount}
                              </div>
                              <div className="text-xs text-foreground-muted">
                                Facture{preview.groupCount > 1 ? "s" : ""}
                              </div>
                            </div>
                            <div className="bg-surface-elevated border border-border rounded-xl px-4 py-3 text-center">
                              <div className="text-lg font-bold text-foreground">
                                {preview.cdrCount}
                              </div>
                              <div className="text-xs text-foreground-muted">CDRs</div>
                            </div>
                            <div className="bg-surface-elevated border border-border rounded-xl px-4 py-3 text-center">
                              <div className="text-lg font-bold text-primary">
                                {fmt(preview.totalAmount)}
                              </div>
                              <div className="text-xs text-foreground-muted">Total</div>
                            </div>
                          </div>

                          {/* Breakdown table */}
                          <div className="border border-border rounded-xl overflow-hidden">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-surface-elevated text-foreground-muted text-xs">
                                  <th className="text-left px-4 py-2.5 font-medium">Groupe</th>
                                  <th className="text-right px-4 py-2.5 font-medium">CDRs</th>
                                  <th className="text-right px-4 py-2.5 font-medium">Energie</th>
                                  <th className="text-right px-4 py-2.5 font-medium">Montant</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {preview.groups.slice(0, 50).map((g) => (
                                  <tr key={g.key} className="hover:bg-surface-elevated/50 transition-colors">
                                    <td className="px-4 py-2.5 text-foreground font-medium truncate max-w-[200px]">
                                      {g.label}
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-foreground-muted tabular-nums">
                                      {g.cdrCount}
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-foreground-muted tabular-nums">
                                      {fmtEnergy(g.totalEnergy)}
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-foreground font-medium tabular-nums">
                                      {fmt(g.totalCost)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {preview.groups.length > 50 && (
                              <div className="px-4 py-2 bg-surface-elevated text-xs text-foreground-muted text-center">
                                ... et {preview.groups.length - 50} autre{preview.groups.length - 50 > 1 ? "s" : ""} groupe{preview.groups.length - 50 > 1 ? "s" : ""}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border">
          <div>
            {step > 0 && !generated && (
              <button
                onClick={handleBack}
                disabled={generateMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-2 text-sm text-foreground-muted hover:text-foreground transition-colors disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
                Retour
              </button>
            )}
          </div>
          <div>
            {step < 2 && (
              <button
                onClick={handleNext}
                disabled={!canNext}
                className={cn(
                  "flex items-center gap-1.5 px-5 py-2 text-sm font-medium rounded-xl transition-colors",
                  canNext
                    ? "bg-primary text-white hover:bg-primary/90"
                    : "bg-surface-elevated text-foreground-muted cursor-not-allowed"
                )}
              >
                Suivant
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
            {step === 2 && !generated && preview && preview.cdrCount > 0 && (
              <button
                onClick={handleGenerate}
                disabled={generateMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 text-sm font-medium rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generation en cours...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4" />
                    Generer {preview.groupCount} facture{preview.groupCount > 1 ? "s" : ""}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
