import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { CpoProvider } from "@/contexts/CpoContext";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";

// ── Lazy helper for named exports ────────────────────────
const lazyNamed = <T extends Record<string, unknown>>(
  factory: () => Promise<T>,
  name: keyof T
) => lazy(() => factory().then((m) => ({ default: m[name] as React.ComponentType })));

// ── Auth & Public (lightweight, loaded eagerly for fast first paint) ──
import { LoginPage } from "@/components/auth/LoginPage";
import { B2BLoginPage } from "@/components/auth/B2BLoginPage";

// ── Home ─────────────────────────────────────────────────
const DashboardPage = lazyNamed(() => import("@/components/dashboard/DashboardPage"), "DashboardPage");
const MapPage = lazyNamed(() => import("@/components/map/MapPage"), "MapPage");
const AnalyticsPage = lazyNamed(() => import("@/components/analytics/AnalyticsPage"), "AnalyticsPage");
// ── CPO > Assets ─────────────────────────────────────────
const StationsPage = lazyNamed(() => import("@/components/stations/StationsPage"), "StationsPage");
const LocationsPage = lazyNamed(() => import("@/components/locations/LocationsPage"), "LocationsPage");
const MonitoringPage = lazyNamed(() => import("@/components/monitoring/MonitoringPage"), "MonitoringPage");
const SmartChargingPage = lazyNamed(() => import("@/components/smart-charging/SmartChargingPage"), "SmartChargingPage");
const EnergyMixPage = lazyNamed(() => import("@/components/energy-mix/EnergyMixPage"), "EnergyMixPage");
// ── CPO > Network ────────────────────────────────────────
const CpoOverviewPage = lazyNamed(() => import("@/components/cpo-overview/CpoOverviewPage"), "CpoOverviewPage");
const CpoNetworksPage = lazyNamed(() => import("@/components/cpo-networks/CpoNetworksPage"), "CpoNetworksPage");
// ── CPO > Billing (fusionné) ─────────────────────────────
const BillingPage = lazyNamed(() => import("@/components/billing/BillingPage"), "BillingPage");
const BillingProfilesPage = lazyNamed(() => import("@/components/billing/BillingProfilesPage"), "BillingProfilesPage");
const TariffsPage = lazyNamed(() => import("@/components/tariffs/TariffsPage"), "TariffsPage");
const RoamingContractsPage = lazyNamed(() => import("@/components/roaming-contracts/RoamingContractsPage"), "RoamingContractsPage");
// ── CPO > Roaming ────────────────────────────────────────
const OcpiPage = lazyNamed(() => import("@/components/ocpi/OcpiPage"), "OcpiPage");
// ── eMSP > Network ───────────────────────────────────────
const EmspNetworksPage = lazyNamed(() => import("@/components/emsp-networks/EmspNetworksPage"), "EmspNetworksPage");
// ── eMSP > Customers ─────────────────────────────────────
const CustomersPage = lazyNamed(() => import("@/components/customers/CustomersPage"), "CustomersPage");
const DriversPage = lazyNamed(() => import("@/components/drivers/DriversPage"), "DriversPage");
// ── eMSP > Moyens de paiement (fusionné) ─────────────────
const PaymentMethodsPage = lazyNamed(() => import("@/components/payment-methods/PaymentMethodsPage"), "PaymentMethodsPage");
// ── Automation ───────────────────────────────────────────
const ExceptionsPage = lazyNamed(() => import("@/components/exceptions/ExceptionsPage"), "ExceptionsPage");
// ── Admin ────────────────────────────────────────────────
const B2BAdminPage = lazyNamed(() => import("@/components/admin/B2BAdminPage"), "B2BAdminPage");
const UsersPage = lazyNamed(() => import("@/components/users/UsersPage"), "UsersPage");
const RolesPage = lazyNamed(() => import("@/components/roles/RolesPage"), "RolesPage");
const AdminConfigPage = lazyNamed(() => import("@/components/admin-config/AdminConfigPage"), "AdminConfigPage");
const ValidateTokenPage = lazyNamed(() => import("@/components/validate-token/ValidateTokenPage"), "ValidateTokenPage");
const SupportPage = lazyNamed(() => import("@/components/support/SupportPage"), "SupportPage");
const InterventionsPage = lazyNamed(() => import("@/components/technician/InterventionsPage"), "InterventionsPage");
// ── Portail B2B ──────────────────────────────────────────
const B2BLayout = lazyNamed(() => import("@/components/b2b/B2BLayout"), "B2BLayout");
const B2BOverviewPage = lazyNamed(() => import("@/components/b2b/B2BOverviewPage"), "B2BOverviewPage");
const B2BMonthlyPage = lazyNamed(() => import("@/components/b2b/B2BMonthlyPage"), "B2BMonthlyPage");
const B2BChargepointsPage = lazyNamed(() => import("@/components/b2b/B2BChargepointsPage"), "B2BChargepointsPage");
const B2BDriversPage = lazyNamed(() => import("@/components/b2b/B2BDriversPage"), "B2BDriversPage");
const B2BCompanyPage = lazyNamed(() => import("@/components/b2b/B2BCompanyPage"), "B2BCompanyPage");
const B2BSessionsPage = lazyNamed(() => import("@/components/b2b/B2BSessionsPage"), "B2BSessionsPage");
const B2BFleetPage = lazyNamed(() => import("@/components/b2b/B2BFleetPage"), "B2BFleetPage");
// ── Auth & Public (lazy) ─────────────────────────────────
const ResetPasswordPage = lazyNamed(() => import("@/components/auth/ResetPasswordPage"), "ResetPasswordPage");
const StripeOnboardingCompletePage = lazyNamed(() => import("@/components/stripe/StripeOnboardingCompletePage"), "StripeOnboardingCompletePage");
const StripeOnboardingRefreshPage = lazyNamed(() => import("@/components/stripe/StripeOnboardingRefreshPage"), "StripeOnboardingRefreshPage");
const B2BLandingPage = lazyNamed(() => import("@/components/commercial/B2BLandingPage"), "B2BLandingPage");
const DirectPayPage = lazy(() => import("@/components/direct-pay/DirectPayPage"));
// ── Nouvelles pages (améliorations GFX/ROAD) ──────────
const AccessGroupsPage = lazy(() => import("@/components/access-groups/AccessGroupsPage"));
const AdvancedAnalyticsPage = lazy(() => import("@/components/analytics/AdvancedAnalyticsPage"));

// ── Loading fallback ─────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="text-xs text-foreground-muted animate-pulse">Chargement…</p>
      </div>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: true,
      staleTime: 2 * 60 * 1000,     // 2 min — évite refetch inutile à chaque navigation
      gcTime: 10 * 60 * 1000,       // 10 min — garde le cache en mémoire plus longtemps
      refetchOnMount: "always",      // refetch si stale au mount (comportement normal)
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
        <CpoProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/portail" element={<B2BLoginPage />} />
            <Route path="/offre-b2b" element={<B2BLandingPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/stripe/onboarding/complete" element={<StripeOnboardingCompletePage />} />
            <Route path="/stripe/onboarding/refresh" element={<StripeOnboardingRefreshPage />} />
            <Route path="/charge/:identity/:evseUid?" element={<DirectPayPage />} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />

                {/* ── Home ── */}
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/map" element={<MapPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/advanced-analytics" element={<AdvancedAnalyticsPage />} />

                {/* ── CPO > Overview ── */}
                <Route path="/cpo-overview" element={<CpoOverviewPage />} />

                {/* ── CPO > Network ── */}
                <Route path="/cpo-networks" element={<CpoNetworksPage />} />
                <Route path="/cpo-contracts" element={<Navigate to="/cpo-networks" replace />} />

                {/* ── CPO > Assets ── */}
                <Route path="/stations" element={<StationsPage />} />
                <Route path="/locations" element={<LocationsPage />} />
                <Route path="/monitoring" element={<MonitoringPage />} />
                <Route path="/smart-charging" element={<SmartChargingPage />} />
                <Route path="/energy-mix" element={<EnergyMixPage />} />

                {/* ── CPO > Billing ── */}
                <Route path="/billing" element={<BillingPage />} />
                <Route path="/billing-profiles" element={<BillingProfilesPage />} />
                <Route path="/tariffs" element={<TariffsPage />} />
                <Route path="/roaming-contracts" element={<RoamingContractsPage />} />

                {/* ── CPO > Roaming ── */}
                <Route path="/ocpi" element={<OcpiPage />} />

                {/* ── eMSP > Network (fusionné) ── */}
                <Route path="/emsp-networks" element={<EmspNetworksPage />} />
                <Route path="/emsp-contracts" element={<Navigate to="/emsp-networks" replace />} />
                <Route path="/emsps" element={<Navigate to="/emsp-networks" replace />} />

                {/* ── eMSP > Customers ── */}
                <Route path="/customers" element={<CustomersPage />} />
                <Route path="/drivers" element={<DriversPage />} />

                {/* ── eMSP > Moyens de paiement ── */}
                <Route path="/payment-methods" element={<PaymentMethodsPage />} />

                {/* ── eMSP > Groupes d'accès ── */}
                <Route path="/access-groups" element={<AccessGroupsPage />} />

                {/* ── Automation ── */}
                <Route path="/exceptions" element={<ExceptionsPage />} />

                {/* ── Admin ── */}
                <Route path="/users" element={<UsersPage />} />
                <Route path="/roles" element={<RolesPage />} />
                <Route path="/admin-config" element={<AdminConfigPage />} />
                <Route path="/admin/b2b" element={<B2BAdminPage />} />

                {/* ── Configuration ── */}
                <Route path="/validate-token" element={<ValidateTokenPage />} />
                <Route path="/support" element={<SupportPage />} />
                <Route path="/interventions" element={<InterventionsPage />} />

                {/* ── Legacy redirects (anciennes routes → nouvelles) ── */}
                <Route path="/sessions" element={<Navigate to="/billing" replace />} />
                <Route path="/invoices" element={<Navigate to="/billing" replace />} />
                <Route path="/maintenance" element={<Navigate to="/monitoring" replace />} />
                <Route path="/rfid" element={<Navigate to="/payment-methods" replace />} />
                <Route path="/subscriptions" element={<Navigate to="/payment-methods" replace />} />
                <Route path="/coupons" element={<Navigate to="/payment-methods" replace />} />
                <Route path="/agreements" element={<Navigate to="/roaming-contracts" replace />} />
                <Route path="/reimbursement" element={<Navigate to="/roaming-contracts" replace />} />
                <Route path="/admin" element={<Navigate to="/admin-config" replace />} />
                <Route path="/settings" element={<Navigate to="/admin-config" replace />} />

                {/* ── Portail B2B ── */}
                <Route path="/b2b" element={<B2BLayout />}>
                  <Route index element={<B2BOverviewPage />} />
                  <Route path="overview" element={<B2BOverviewPage />} />
                  <Route path="monthly" element={<B2BMonthlyPage />} />
                  <Route path="sessions" element={<B2BSessionsPage />} />
                  <Route path="chargepoints" element={<B2BChargepointsPage />} />
                  <Route path="drivers" element={<B2BDriversPage />} />
                  <Route path="fleet" element={<B2BFleetPage />} />
                  <Route path="company" element={<B2BCompanyPage />} />
                </Route>
              </Route>
            </Route>

            {/* Catch-all: redirect unknown routes to dashboard */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
        </CpoProvider>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
