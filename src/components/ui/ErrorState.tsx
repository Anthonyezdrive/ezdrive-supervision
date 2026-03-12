import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  message = "Une erreur est survenue",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-56 bg-surface border border-border rounded-2xl gap-3">
      <div className="w-14 h-14 rounded-xl bg-red-500/10 flex items-center justify-center">
        <AlertTriangle className="w-7 h-7 text-red-400" />
      </div>
      <p className="text-sm font-medium text-foreground">{message}</p>
      <p className="text-xs text-foreground-muted text-center max-w-sm">
        Vérifiez votre connexion et réessayez.
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-foreground-muted hover:text-foreground bg-surface-elevated border border-border rounded-xl transition-colors hover:border-border-focus"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Réessayer
        </button>
      )}
    </div>
  );
}
