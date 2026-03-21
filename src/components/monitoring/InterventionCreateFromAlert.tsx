// ══════════════════════════════════════════════════════════════
// EZDrive — Create Intervention from Alert (modal)
// ══════════════════════════════════════════════════════════════

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Loader2, Wrench } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useToast } from "@/contexts/ToastContext";

export interface AlertForIntervention {
  id: string;
  alert_type: string;
  title?: string;
  station_id?: string;
  station_name?: string;
  description?: string;
  triggered_at?: string;
}

interface InterventionCreateFromAlertProps {
  alert: AlertForIntervention;
  onClose: () => void;
  onCreated: () => void;
}

const CATEGORIES = [
  { value: "corrective", label: "Corrective" },
  { value: "preventive", label: "Préventive" },
  { value: "inspection", label: "Inspection" },
] as const;

const PRIORITIES = [
  { value: "low", label: "Basse", color: "text-blue-400" },
  { value: "medium", label: "Moyenne", color: "text-yellow-400" },
  { value: "high", label: "Haute", color: "text-orange-400" },
  { value: "critical", label: "Critique", color: "text-red-400" },
] as const;

export default function InterventionCreateFromAlert({
  alert,
  onClose,
  onCreated,
}: InterventionCreateFromAlertProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Pre-filled from alert
  const [title, setTitle] = useState(
    alert.title
      ? `Intervention: ${alert.title}`
      : `Intervention: ${alert.alert_type}`
  );
  const [description, setDescription] = useState(
    alert.description ??
      `Intervention créée suite à l'alerte "${alert.alert_type}" déclenchée${
        alert.triggered_at
          ? ` le ${new Date(alert.triggered_at).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}`
          : ""
      }${alert.station_name ? ` sur la borne ${alert.station_name}` : ""}.`
  );
  const [category, setCategory] = useState<string>("corrective");
  const [priority, setPriority] = useState<string>("high");
  const [technician, setTechnician] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        category,
        priority,
        technician: technician.trim() || null,
        station_id: alert.station_id || null,
        station_name: alert.station_name || null,
        alert_id: alert.id,
        alert_type: alert.alert_type,
        status: "pending",
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("interventions").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interventions-list"] });
      queryClient.invalidateQueries({ queryKey: ["intervention-detail"] });
      toast(`Intervention "${title}" créée avec succès`, "success");
      onCreated();
    },
    onError: (err: unknown) => {
      console.error("Error creating intervention:", err);
      toast("Impossible de créer l'intervention. Veuillez réessayer.", "error");
    },
  });

  const canSubmit =
    title.trim().length > 0 && category && priority && !createMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface border border-border rounded-2xl p-6 shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Wrench className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-heading text-lg font-bold text-foreground">
                Créer une intervention
              </h2>
              <p className="text-xs text-foreground-muted mt-0.5">
                Depuis l'alerte: {alert.alert_type}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Station (read-only if from alert) */}
          {alert.station_name && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Borne
              </label>
              <input
                type="text"
                value={alert.station_name}
                readOnly
                className="w-full px-4 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground-muted cursor-not-allowed"
              />
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Titre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titre de l'intervention"
              className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 resize-none"
            />
          </div>

          {/* Category + Priority (2 columns) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Catégorie <span className="text-red-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Priorité <span className="text-red-500">*</span>
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Technician */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Technicien assigné
            </label>
            <input
              type="text"
              value={technician}
              onChange={(e) => setTechnician(e.target.value)}
              placeholder="Nom du technicien (optionnel)"
              className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2.5 border border-border rounded-xl text-sm font-medium text-foreground hover:bg-surface-elevated transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit}
            className={cn(
              "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors",
              canSubmit
                ? "bg-primary text-white hover:bg-primary/90"
                : "bg-primary/40 text-white/60 cursor-not-allowed"
            )}
          >
            {createMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wrench className="w-4 h-4" />
            )}
            Créer l'intervention
          </button>
        </div>
      </div>
    </div>
  );
}
