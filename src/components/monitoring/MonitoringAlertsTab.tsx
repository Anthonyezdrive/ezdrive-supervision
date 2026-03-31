// ══════════════════════════════════════════════════════════════
// EZDrive — Monitoring Alerts Tab (extracted from MonitoringPage)
// Contains: AddAlertWizard + AlertsTab
// ══════════════════════════════════════════════════════════════

import { useState, type KeyboardEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Plus,
  ArrowLeft,
  ArrowRight,
  Trash2,
  X,
  ToggleLeft,
  ToggleRight,
  Pencil,
  ChevronRight,
  Info,
  Loader2,
  Clock,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn, formatRelativeTime } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAlertRules, useAlertHistory, ALERT_TYPES, type AlertRule } from "./monitoring-shared";

// ══════════════════════════════════════════════════════════════
// ADD ALERT WIZARD (GFX-style 3-step: Setup → Configuration → Sharing)
// ══════════════════════════════════════════════════════════════

type WizardStep = "setup" | "configuration" | "sharing";
const WIZARD_STEPS: { key: WizardStep; label: string }[] = [
  { key: "setup", label: "Paramétrage" },
  { key: "configuration", label: "Configuration" },
  { key: "sharing", label: "Partage" },
];

function AddAlertWizard({
  onBack,
  onSaved,
  editingRule,
}: {
  onBack: () => void;
  onSaved: () => void;
  editingRule?: AlertRule | null;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<WizardStep>("setup");
  const [saving, setSaving] = useState(false);

  // Setup fields
  const [alertType, setAlertType] = useState(editingRule?.alert_type ?? "");
  const [title, setTitle] = useState(editingRule?.title ?? "");
  const [notifInterval, setNotifInterval] = useState(
    String(editingRule?.notification_interval_hours ?? 1)
  );

  // Configuration fields
  const [threshold, setThreshold] = useState(
    String(editingRule?.threshold_hours ?? 1000)
  );
  const [globalConfig, setGlobalConfig] = useState(editingRule?.global_config ?? false);
  const [stationType, setStationType] = useState(editingRule?.charge_station_type ?? "any");
  const [deployState, setDeployState] = useState(editingRule?.deploy_state ?? "any");
  const [firmwareVersion, setFirmwareVersion] = useState(editingRule?.firmware_version ?? "");
  const [cpVendor, setCpVendor] = useState(editingRule?.chargepoint_vendor ?? "");
  const [cpModel, setCpModel] = useState(editingRule?.chargepoint_model ?? "");
  const [cpLocationId, setCpLocationId] = useState(editingRule?.chargepoint_location_id ?? "");

  // Auto-create intervention toggle
  const [autoCreateIntervention, setAutoCreateIntervention] = useState(
    (editingRule as any)?.auto_create_intervention ?? false
  );

  // Sharing fields
  const [emailRecipients, setEmailRecipients] = useState<string[]>(
    editingRule?.email_recipients ?? []
  );
  const [emailInput, setEmailInput] = useState("");

  const currentStepIndex = WIZARD_STEPS.findIndex((s) => s.key === step);

  const canContinue = () => {
    if (step === "setup") return alertType !== "" && title.trim() !== "";
    if (step === "configuration") return threshold.trim() !== "";
    if (step === "sharing") return emailRecipients.length > 0;
    return true;
  };

  const handleContinue = () => {
    if (step === "setup") setStep("configuration");
    else if (step === "configuration") setStep("sharing");
    else handleSave();
  };

  const handleBack = () => {
    if (step === "configuration") setStep("setup");
    else if (step === "sharing") setStep("configuration");
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        alert_type: alertType,
        title: title.trim(),
        threshold_hours: parseFloat(threshold) || 4,
        notification_interval_hours: parseFloat(notifInterval) || 1,
        email_recipients: emailRecipients,
        is_active: editingRule?.is_active ?? true,
        charge_station_type: stationType,
        deploy_state: deployState,
        firmware_version: firmwareVersion || null,
        chargepoint_vendor: cpVendor || null,
        chargepoint_model: cpModel || null,
        chargepoint_location_id: cpLocationId || null,
        global_config: globalConfig,
        auto_create_intervention: autoCreateIntervention,
      };

      if (editingRule) {
        const { error } = await supabase
          .from("alert_config")
          .update(payload)
          .eq("id", editingRule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("alert_config").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
      onSaved();
    },
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveMutation.mutateAsync();
    } catch (err) {
      console.error("Error saving alert:", err);
    } finally {
      setSaving(false);
    }
  };

  const addEmail = (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (trimmed && trimmed.includes("@") && !emailRecipients.includes(trimmed)) {
      setEmailRecipients([...emailRecipients, trimmed]);
    }
    setEmailInput("");
  };

  const handleEmailKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addEmail(emailInput);
    }
  };

  const removeEmail = (email: string) => {
    setEmailRecipients(emailRecipients.filter((e) => e !== email));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-xl border border-border text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="font-heading text-xl font-bold">
            {editingRule ? "Modifier l'alerte" : "Ajouter une alerte"}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {currentStepIndex > 0 && (
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-border rounded-xl text-sm font-medium text-foreground hover:bg-surface-elevated transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour
            </button>
          )}
          <button
            onClick={step === "sharing" ? handleSave : handleContinue}
            disabled={!canContinue() || saving}
            className={cn(
              "flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors",
              canContinue() && !saving
                ? "bg-primary text-white hover:bg-primary/90"
                : "bg-primary/40 text-white/60 cursor-not-allowed"
            )}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : step === "sharing" ? (
              "Enregistrer"
            ) : (
              <>
                Continuer
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Step tabs */}
      <div className="flex items-center gap-0 border-b border-border">
        {WIZARD_STEPS.map((ws, idx) => {
          const isCurrent = ws.key === step;
          const isPast = idx < currentStepIndex;
          return (
            <button
              key={ws.key}
              onClick={() => {
                if (isPast) setStep(ws.key);
              }}
              className={cn(
                "flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors relative",
                isCurrent
                  ? "text-primary"
                  : isPast
                  ? "text-foreground hover:text-primary cursor-pointer"
                  : "text-foreground-muted cursor-default"
              )}
            >
              {ws.label}
              {idx < WIZARD_STEPS.length - 1 && (
                <ChevronRight className="w-3.5 h-3.5 text-foreground-muted ml-2" />
              )}
              {isCurrent && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Step content */}
      <div className="max-w-2xl">
        {step === "setup" && (
          <div className="space-y-6">
            {/* Alert Type */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Type d'alerte <span className="text-red-500">*</span>
              </label>
              <select
                value={alertType}
                onChange={(e) => setAlertType(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50"
              >
                <option value="">Sélectionner</option>
                {ALERT_TYPES.map((at) => (
                  <option key={at.value} value={at.value}>
                    {at.label}
                  </option>
                ))}
              </select>
              {alertType && (
                <p className="mt-1.5 text-xs text-foreground-muted">
                  {ALERT_TYPES.find((a) => a.value === alertType)?.description}
                </p>
              )}
            </div>

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Titre <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nom de l'alerte"
                className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
              />
            </div>

            {/* Notification interval */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Intervalle de notification
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={notifInterval}
                  onChange={(e) => setNotifInterval(e.target.value)}
                  min="1"
                  className="w-24 px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50"
                />
                <span className="px-3 py-2 bg-primary/10 text-primary text-sm font-medium rounded-lg">
                  heures
                </span>
              </div>
              <p className="mt-1.5 text-xs text-foreground-muted">
                Les alertes déclenchées recevront une notification à cet intervalle
              </p>
            </div>
          </div>
        )}

        {step === "configuration" && (
          <div className="space-y-8">
            {/* Configuration section */}
            <div>
              <h2 className="text-lg font-bold text-foreground border-b border-border pb-2 mb-4">
                Configuration
              </h2>

              {/* Threshold */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Seuil
                </label>
                <input
                  type="number"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  className="w-32 px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50"
                />
              </div>

              {/* Global configuration toggle */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setGlobalConfig(!globalConfig)}
                  className="text-foreground-muted hover:text-foreground transition-colors"
                >
                  {globalConfig ? (
                    <ToggleRight className="w-10 h-6 text-primary" />
                  ) : (
                    <ToggleLeft className="w-10 h-6" />
                  )}
                </button>
                <span className="text-sm text-foreground">Configuration globale</span>
                <Info className="w-4 h-4 text-foreground-muted" />
              </div>

              {/* Auto-create intervention toggle */}
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={() => setAutoCreateIntervention(!autoCreateIntervention)}
                  className="text-foreground-muted hover:text-foreground transition-colors"
                >
                  {autoCreateIntervention ? (
                    <ToggleRight className="w-10 h-6 text-primary" />
                  ) : (
                    <ToggleLeft className="w-10 h-6" />
                  )}
                </button>
                <span className="text-sm text-foreground">
                  Créer automatiquement une intervention
                </span>
                <Info className="w-4 h-4 text-foreground-muted" />
              </div>
              <p className="mt-1.5 ml-[52px] text-xs text-foreground-muted">
                Lorsqu'une alerte est déclenchée, une intervention corrective sera automatiquement créée
              </p>
            </div>

            {/* Filters section */}
            <div>
              <h2 className="text-lg font-bold text-foreground border-b border-border pb-2 mb-4">
                Filtres
              </h2>

              {/* Charge Station Type */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Type de borne
                </label>
                <div className="flex items-center gap-4">
                  {["any", "business", "home", "public"].map((val) => (
                    <label key={val} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="stationType"
                        value={val}
                        checked={stationType === val}
                        onChange={(e) => setStationType(e.target.value)}
                        className="w-4 h-4 text-primary border-border focus:ring-primary"
                      />
                      <span className="text-sm text-foreground capitalize">
                        {val === "any" ? "Tous" : val === "business" ? "Entreprise" : val === "home" ? "Domicile" : "Public"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Deploy state */}
              <div className="mb-5">
                <label className="block text-sm font-medium text-foreground mb-2">
                  État de déploiement
                </label>
                <div className="flex items-center gap-4">
                  {["any", "production", "stock", "deprecated"].map((val) => (
                    <label key={val} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="deployState"
                        value={val}
                        checked={deployState === val}
                        onChange={(e) => setDeployState(e.target.value)}
                        className="w-4 h-4 text-primary border-border focus:ring-primary"
                      />
                      <span className="text-sm text-foreground capitalize">
                        {val === "any" ? "Tous" : val === "production" ? "Production" : val === "stock" ? "Stock" : "Obsolète"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Firmware Version + Chargepoint vendor (2 columns) */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Version firmware
                  </label>
                  <input
                    type="text"
                    value={firmwareVersion}
                    onChange={(e) => setFirmwareVersion(e.target.value)}
                    className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Fabricant
                  </label>
                  <input
                    type="text"
                    value={cpVendor}
                    onChange={(e) => setCpVendor(e.target.value)}
                    className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>

              {/* Chargepoint model + Chargepoint location ID (2 columns) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    Modèle
                  </label>
                  <input
                    type="text"
                    value={cpModel}
                    onChange={(e) => setCpModel(e.target.value)}
                    className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">
                    ID de localisation
                  </label>
                  <input
                    type="text"
                    value={cpLocationId}
                    onChange={(e) => setCpLocationId(e.target.value)}
                    className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {step === "sharing" && (
          <div className="space-y-6">
            {/* Email recipients */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Destinataires e-mail <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5 bg-surface border border-border rounded-xl min-h-[44px] focus-within:border-primary/50">
                {emailRecipients.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-surface-elevated rounded-lg text-sm text-foreground"
                  >
                    {email}
                    <button
                      onClick={() => removeEmail(email)}
                      className="text-foreground-muted hover:text-foreground transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={handleEmailKeyDown}
                  onBlur={() => {
                    if (emailInput.trim()) addEmail(emailInput);
                  }}
                  placeholder={emailRecipients.length === 0 ? "email@example.com" : ""}
                  className="flex-1 min-w-[200px] px-1 py-0.5 bg-transparent text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none"
                />
              </div>
              <p className="mt-1.5 text-xs text-foreground-muted">
                Saisissez une adresse e-mail, puis appuyez sur virgule ou Entrée pour valider
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ALERT LIST VIEW
// ══════════════════════════════════════════════════════════════

export default function AlertsTab() {
  const queryClient = useQueryClient();
  const { data: alertRules, isLoading } = useAlertRules();
  const { data: alertHistory } = useAlertHistory();
  const [showWizard, setShowWizard] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [confirmDeleteAlert, setConfirmDeleteAlert] = useState<string | null>(null);

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("alert_config")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("alert_config").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alert-rules"] });
    },
  });

  if (showWizard || editingRule) {
    return (
      <AddAlertWizard
        onBack={() => {
          setShowWizard(false);
          setEditingRule(null);
        }}
        onSaved={() => {
          setShowWizard(false);
          setEditingRule(null);
        }}
        editingRule={editingRule}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-base font-semibold text-foreground">
            Alertes configurées
          </h2>
          <p className="text-xs text-foreground-muted mt-0.5">
            Gérez vos règles d'alertes et notifications
          </p>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Ajouter une alerte
        </button>
      </div>

      {/* Alert rules table */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-xs font-semibold text-foreground-muted uppercase">
                  Statut
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-foreground-muted uppercase">
                  Titre
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-foreground-muted uppercase">
                  Type
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-foreground-muted uppercase">
                  Seuil
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-foreground-muted uppercase">
                  Intervalle
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-foreground-muted uppercase">
                  Destinataires
                </th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-foreground-muted uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-foreground-muted" />
                  </td>
                </tr>
              ) : !alertRules || alertRules.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Bell className="w-8 h-8 text-foreground-muted/40" />
                      <p className="text-sm text-foreground-muted">
                        Aucune alerte configurée
                      </p>
                      <button
                        onClick={() => setShowWizard(true)}
                        className="mt-2 text-sm text-primary hover:text-primary/80 font-medium"
                      >
                        Créer votre première alerte
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                alertRules.map((rule) => (
                  <tr
                    key={rule.id}
                    className="border-b border-border/50 hover:bg-surface-elevated/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={() =>
                          toggleMutation.mutate({ id: rule.id, is_active: !rule.is_active })
                        }
                        className="transition-colors"
                      >
                        {rule.is_active ? (
                          <ToggleRight className="w-8 h-5 text-primary" />
                        ) : (
                          <ToggleLeft className="w-8 h-5 text-foreground-muted" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      {rule.title}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded-lg">
                        {ALERT_TYPES.find((a) => a.value === rule.alert_type)?.label ?? rule.alert_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground-muted">
                      {rule.threshold_hours}h
                    </td>
                    <td className="px-4 py-3 text-foreground-muted">
                      {rule.notification_interval_hours}h
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {rule.email_recipients.slice(0, 2).map((email) => (
                          <span
                            key={email}
                            className="px-2 py-0.5 bg-surface-elevated rounded text-xs text-foreground-muted truncate max-w-[140px]"
                          >
                            {email}
                          </span>
                        ))}
                        {rule.email_recipients.length > 2 && (
                          <span className="px-1.5 py-0.5 text-xs text-foreground-muted">
                            +{rule.email_recipients.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setEditingRule(rule)}
                          className="p-1.5 text-foreground-muted hover:text-foreground rounded-lg hover:bg-surface-elevated transition-colors"
                          title="Modifier"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteAlert(rule.id)}
                          className="p-1.5 text-foreground-muted hover:text-red-500 rounded-lg hover:bg-surface-elevated transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alert history */}
      {alertHistory && alertHistory.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Clock className="w-4 h-4 text-foreground-muted" />
            <h2 className="font-heading text-sm font-semibold">
              Historique des alertes envoyées
            </h2>
            <span className="ml-auto text-xs text-foreground-muted">
              {alertHistory.length} dernières
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-foreground-muted border-b border-border">
                  <th className="text-left font-medium px-4 py-2.5">Borne</th>
                  <th className="text-left font-medium px-4 py-2.5">Type</th>
                  <th className="text-left font-medium px-4 py-2.5">Heures en panne</th>
                  <th className="text-left font-medium px-4 py-2.5">Envoyé le</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {alertHistory.map((entry: any) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-surface-elevated/50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {entry.stations?.name ?? entry.station_id?.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-red-500/10 text-red-500 text-xs font-medium rounded-lg">
                        {entry.alert_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground-muted">
                      {entry.hours_in_fault != null
                        ? `${Number(entry.hours_in_fault).toFixed(1)}h`
                        : "--"}
                    </td>
                    <td className="px-4 py-3 text-foreground-muted text-xs">
                      {formatRelativeTime(entry.sent_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Confirm delete dialog */}
      <ConfirmDialog
        open={confirmDeleteAlert !== null}
        title="Supprimer cette alerte ?"
        description="Cette action est irréversible. L'alerte et sa configuration seront définitivement supprimées."
        confirmLabel="Supprimer"
        cancelLabel="Annuler"
        variant="danger"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (confirmDeleteAlert) {
            deleteMutation.mutate(confirmDeleteAlert, {
              onSuccess: () => setConfirmDeleteAlert(null),
            });
          }
        }}
        onCancel={() => setConfirmDeleteAlert(null)}
      />
    </div>
  );
}
