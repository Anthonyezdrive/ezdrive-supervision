// ============================================================
// EZDrive — Monitoring Quick Actions
// Inline action buttons for station rows (Reset, Voir)
// ============================================================

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { RotateCcw, Eye } from "lucide-react";
import { useOcppCommand } from "@/hooks/useOcppCommands";
import { useToast } from "@/contexts/ToastContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface QuickActionsProps {
  stationId: string;
  stationName: string;
}

export function QuickActions({ stationId, stationName }: QuickActionsProps) {
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const resetMutation = useOcppCommand();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleReset = () => {
    resetMutation.mutate(
      { stationId, command: "Reset", params: { type: "Soft" } },
      {
        onSuccess: () => {
          toastSuccess("Commande Reset envoyée", `La borne "${stationName}" va redémarrer.`);
          setShowResetConfirm(false);
        },
        onError: () => {
          toastError("Erreur", `Impossible d'envoyer la commande Reset à "${stationName}".`);
          setShowResetConfirm(false);
        },
      }
    );
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setShowResetConfirm(true)}
          title="Reset (redémarrer)"
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-foreground-muted hover:text-foreground bg-surface-elevated hover:bg-surface-elevated/80 border border-border rounded-lg transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          Reset
        </button>
        <button
          onClick={() => navigate(`/stations?station=${stationId}`)}
          title="Voir le détail"
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-primary hover:text-primary/80 bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded-lg transition-colors"
        >
          <Eye className="w-3 h-3" />
          Voir
        </button>
      </div>

      <ConfirmDialog
        open={showResetConfirm}
        onConfirm={handleReset}
        onCancel={() => setShowResetConfirm(false)}
        title={`Redémarrer "${stationName}" ?`}
        description="Un Reset OCPP (Soft) sera envoyé à la borne. La borne redémarrera et les sessions en cours seront interrompues."
        confirmLabel="Redémarrer"
        cancelLabel="Annuler"
        variant="warning"
        loading={resetMutation.isPending}
        loadingLabel="Envoi..."
      />
    </>
  );
}
