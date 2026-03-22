import { Receipt } from "lucide-react";

export function XDriveBPU() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface-elevated p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Receipt className="w-7 h-7 text-primary" />
          </div>
        </div>
        <h2 className="text-xl font-heading font-bold text-foreground mb-2">
          Facturation BPU
        </h2>
        <p className="text-sm text-foreground-muted max-w-md mx-auto">
          Génération et suivi des factures EZDrive vers le partenaire selon le Bordereau de Prix
          Unitaires : supervision mensuelle, connectivité, transactions, support, plancher contractuel
          et services optionnels.
        </p>
        <div className="flex items-center justify-center gap-2 mt-4">
          <span className="inline-block px-3 py-1 rounded-full bg-surface border border-border text-xs text-foreground-muted">
            Coming soon
          </span>
          <span className="inline-block px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-xs text-amber-500">
            EZDrive only
          </span>
        </div>
      </div>
    </div>
  );
}
