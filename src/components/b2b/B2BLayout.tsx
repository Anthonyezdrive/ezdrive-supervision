import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, FileText, Radio, UserCheck, Building2, List, Truck, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useB2BRole } from "@/hooks/useB2BRole";
import { B2BFilterProvider, useB2BFilters } from "@/contexts/B2BFilterContext";
import { useB2BClients, useB2BCdrs, useB2BFilterOptions, useMyB2BClients } from "@/hooks/useB2BCdrs";
import { B2BFilterBar } from "./B2BFilterBar";
import { SectionErrorBoundary } from "@/components/ui/SectionErrorBoundary";
import type { B2BClient } from "@/types/b2b";

interface B2BTab {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  minRole?: "admin" | "manager" | "employee";
}

const B2B_TABS: B2BTab[] = [
  { to: "/b2b/overview", label: "b2b.overview", icon: LayoutDashboard }, // all roles
  { to: "/b2b/monthly", label: "b2b.monthly", icon: FileText, minRole: "manager" },
  { to: "/b2b/sessions", label: "b2b.sessions", icon: List, minRole: "manager" },
  { to: "/b2b/chargepoints", label: "b2b.chargepoints", icon: Radio, minRole: "manager" },
  { to: "/b2b/drivers", label: "b2b.drivers", icon: UserCheck, minRole: "manager" },
  { to: "/b2b/analytics", label: "b2b.analytics", icon: BarChart3, minRole: "manager" },
  { to: "/b2b/fleet", label: "b2b.fleet", icon: Truck, minRole: "admin" },
  { to: "/b2b/company", label: "b2b.company", icon: Building2, minRole: "admin" },
];

const ROLE_LEVEL: Record<string, number> = { employee: 1, manager: 2, admin: 3 };

function B2BLayoutInner() {
  const { t } = useTranslation();
  const { profile: _profile } = useAuth();
  const { isAdmin } = usePermissions();
  const { b2bRole, isEmployee, driverExternalId, tokenUids } = useB2BRole();
  const { selectedClientId, setSelectedClientId } = useB2BFilters();
  const location = useLocation();
  const isCompanyPage = location.pathname.includes("/b2b/company") || location.pathname.includes("/b2b/fleet");

  // Admin: fetch all clients; B2B user: fetch own
  const { data: allClients } = useB2BClients();
  const { data: myClients } = useMyB2BClients();

  const clients: B2BClient[] = isAdmin ? (allClients ?? []) : (myClients ?? []);

  // Auto-select first client if none selected
  const activeClient = clients.find((c) => c.id === selectedClientId) ?? clients[0] ?? null;

  // Get customer_external_ids for the active client
  const customerExternalIds = activeClient?.customer_external_ids ?? [];

  // Fetch CDRs (unfiltered by site/borne/token for filter options extraction)
  const { data: allCdrs } = useB2BCdrs(customerExternalIds);
  const filterOptions = useB2BFilterOptions(allCdrs ?? []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Client logo */}
          {activeClient?.logo_url ? (
            <img
              src={activeClient.logo_url}
              alt={activeClient.name}
              className="w-12 h-12 rounded-xl object-contain bg-white border border-border p-1.5 shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl border flex items-center justify-center shrink-0" style={{ backgroundColor: "#9ACC0E10", borderColor: "#9ACC0E30" }}>
              <span className="text-lg font-bold" style={{ color: "#9ACC0E" }}>
                {activeClient?.name?.charAt(0)?.toUpperCase() ?? "B"}
              </span>
            </div>
          )}
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">
              {activeClient?.name ?? t("b2b.portalB2B")}
            </h1>
            <p className="text-sm text-foreground-muted mt-0.5">
              {t("b2b.activityReport")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Admin: client selector */}
          {isAdmin && clients.length > 1 && (
            <div>
              <label className="block text-xs text-foreground-muted uppercase tracking-wider mb-1">
                {t("b2b.client")}
              </label>
              <select
                value={activeClient?.id ?? ""}
                onChange={(e) => setSelectedClientId(e.target.value || null)}
                className="px-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-foreground focus:border-border-focus focus:outline-none min-w-[200px]"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* EZDrive branding */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-px bg-border hidden sm:block" />
            <img src="/logo-ezdrive.png" alt="EZDrive" className="h-6 opacity-60 hidden sm:block" />
            <span className="text-xs font-semibold opacity-50 hidden sm:inline tracking-wide">Business</span>
          </div>
        </div>
      </div>

      {/* Filters (hidden on company page) */}
      {!isCompanyPage && (
        <B2BFilterBar
          availableSites={filterOptions.sites}
          availableBornes={filterOptions.bornes}
          availableTokens={filterOptions.tokens}
          availableYears={[2023, 2024, 2025, 2026]}
          borneLabelMap={filterOptions.borneLabelMap}
          tokenLabelMap={filterOptions.tokenLabelMap}
        />
      )}

      {/* Tab navigation — filtered by role */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {B2B_TABS.filter((tab) => {
          if (!tab.minRole) return true;
          return (ROLE_LEVEL[b2bRole] ?? 1) >= (ROLE_LEVEL[tab.minRole] ?? 1);
        }).map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-[1px]",
                isActive
                  ? "border-b-2"
                  : "text-foreground-muted border-transparent hover:text-foreground hover:border-foreground-muted/30"
              )
            }
            style={({ isActive }) => isActive ? { color: "#9ACC0E", borderBottomColor: "#9ACC0E" } : {}}
          >
            <tab.icon className="w-4 h-4" />
            {t(tab.label)}
          </NavLink>
        ))}
      </div>

      {/* Page content — pass activeClient + role via context */}
      <SectionErrorBoundary section={t("b2b.portalB2B")} fallbackUrl="/b2b/overview">
        <Outlet context={{ activeClient, customerExternalIds, b2bRole, isEmployee, driverExternalId, tokenUids }} />
      </SectionErrorBoundary>

      {/* EZDrive footer branding */}
      <div className="flex items-center justify-center gap-2 pt-6 pb-2">
        <img src="/logo-ezdrive.png" alt="EZDrive" className="h-4 opacity-30" />
        <span className="text-[11px] text-foreground-muted/40">
          {t("b2b.poweredBy")}
        </span>
      </div>
    </div>
  );
}

export function B2BLayout() {
  return (
    <B2BFilterProvider>
      <B2BLayoutInner />
    </B2BFilterProvider>
  );
}
