import { Download } from "lucide-react";

export function XDriveExports() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface-elevated p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Download className="w-7 h-7 text-primary" />
          </div>
        </div>
        <h2 className="text-xl font-heading font-bold text-foreground mb-2">
          Exports
        </h2>
        <p className="text-sm text-foreground-muted max-w-md mx-auto">
          Export des données sur une période personnalisée : CDR complets (CSV/Excel), rapport de
          rapprochement (PDF), inventaire des PDC et synthèse mensuelle pour reporting interne partenaire.
        </p>
        <span className="inline-block mt-4 px-3 py-1 rounded-full bg-surface border border-border text-xs text-foreground-muted">
          Coming soon
        </span>
      </div>
    </div>
  );
}
