import { useState } from "react";
import { Handshake, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import { SyncButton } from "@/components/shared/SyncButton";
import { AgreementsPage } from "@/components/agreements/AgreementsPage";
import { ReimbursementPage } from "@/components/reimbursement/ReimbursementPage";
import { useTranslation } from "react-i18next";

export function RoamingContractsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"agreements" | "reimbursement">("agreements");

  const TABS = [
    { key: "agreements" as const, label: t("roaming.agreements", "Accords"), icon: Handshake },
    { key: "reimbursement" as const, label: t("roaming.reimbursement", "Remboursement"), icon: Receipt },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-foreground">{t("roaming.title", "Contrats Roaming")}</h1>
          <p className="text-sm text-foreground-muted mt-0.5">{t("roaming.description", "Accords de roaming et remboursements")}</p>
        </div>
        <SyncButton functionName="reimbursement-engine" label={t("roaming.calcReimbursements", "Calcul remboursements")} invalidateKeys={["reimbursements", "roaming"]} variant="small" confirmMessage={t("roaming.confirmCalcReimbursements", "Lancer le calcul des remboursements ?")} />
      </div>
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
      {tab === "agreements" && <AgreementsPage />}
      {tab === "reimbursement" && <ReimbursementPage />}
    </div>
  );
}
