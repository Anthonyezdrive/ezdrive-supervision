import { useState } from "react";
import { KeyRound, CreditCard, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import { SyncButton } from "@/components/shared/SyncButton";
import { RfidPage } from "@/components/rfid/RfidPage";
import { SubscriptionsPage } from "@/components/subscriptions/SubscriptionsPage";
import { CouponsPage } from "@/components/coupons/CouponsPage";
import { useTranslation } from "react-i18next";

const TAB_KEYS = ["rfid", "subscriptions", "coupons"] as const;
const TAB_ICONS = { rfid: KeyRound, subscriptions: CreditCard, coupons: Ticket };

export function PaymentMethodsPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"rfid" | "subscriptions" | "coupons">("rfid");

  const TABS = [
    { key: "rfid" as const, label: t("paymentMethods.rfidTokens", "Tokens RFID"), icon: KeyRound },
    { key: "subscriptions" as const, label: t("paymentMethods.subscriptions", "Abonnements"), icon: CreditCard },
    { key: "coupons" as const, label: t("paymentMethods.coupons", "Coupons"), icon: Ticket },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-xl font-bold text-foreground">{t("nav.paymentMethods", "Moyens de paiement")}</h1>
        <p className="text-sm text-foreground-muted mt-0.5">{t("paymentMethods.subtitle", "Tokens RFID, abonnements et coupons")}</p>
      </div>

      {/* Sync & test buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <SyncButton functionName="road-token-sync" label={t("paymentMethods.syncTokens", "Sync tokens Road.io")} invalidateKeys={["tokens", "rfid"]} variant="small" formatSuccess={(d) => `${d.total_ingested ?? 0} tokens sync`} />
        <SyncButton functionName="create-setup-intent" label={t("paymentMethods.testSetupIntent", "Test Setup Intent")} variant="small" confirmMessage={t("paymentMethods.confirmSetupIntent", "Créer un SetupIntent Stripe de test ?")} />
        <SyncButton functionName="sepa-setup" label={t("paymentMethods.testSepaSetup", "Test SEPA Setup")} variant="small" confirmMessage={t("paymentMethods.confirmSepaSetup", "Tester le setup SEPA ?")} />
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
      {tab === "rfid" && <RfidPage />}
      {tab === "subscriptions" && <SubscriptionsPage />}
      {tab === "coupons" && <CouponsPage />}
    </div>
  );
}
