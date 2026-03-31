import { useState, useMemo } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Radio,
  Map,
  Settings,
  BarChart2,
  Globe,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Users,
  CreditCard,
  FileText,
  Wallet,
  MonitorCheck,
  MapPin,
  BatteryCharging,
  Leaf,
  Shield,
  ShieldAlert,
  PieChart,
  Network,
  Handshake,
  UserCheck,
  ScanLine,
  Building2,
  LifeBuoy,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { CpoSelector } from "./CpoSelector";
import { useTranslation } from "react-i18next";

// ── Section + Item types ──────────────────────────────────

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** If set, the user must have at least one of these permissions to see this item */
  requiredPermissions?: string[];
}

interface NavSubSection {
  label: string;
  items: NavItem[];
}

interface NavSection {
  id: string;
  label: string;
  items?: NavItem[];
  subsections?: NavSubSection[];
  /** If set, the user must have at least one of these permissions to see this section */
  requiredPermissions?: string[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    id: "home",
    label: "nav.home",
    items: [
      { to: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard, requiredPermissions: ["stations.view", "billing.view"] },
      { to: "/map", label: "nav.map", icon: Map, requiredPermissions: ["stations.view"] },
      { to: "/analytics", label: "nav.analytics", icon: BarChart2, requiredPermissions: ["stations.view"] },
      { to: "/advanced-analytics", label: "analytics.advanced", icon: PieChart, requiredPermissions: ["stations.view", "billing.view"] },
    ],
  },
  {
    id: "cpo",
    label: "nav.cpo",
    requiredPermissions: ["stations.view"],
    subsections: [
      {
        label: "b2b.overview",
        items: [
          { to: "/cpo-overview", label: "nav.cpoOverview", icon: PieChart, requiredPermissions: ["stations.view"] },
        ],
      },
      {
        label: "nav.cpoNetworks",
        items: [
          { to: "/cpo-networks", label: "nav.cpoNetworks", icon: Network, requiredPermissions: ["stations.view"] },
        ],
      },
      {
        label: "nav.assets",
        items: [
          { to: "/stations", label: "nav.stations", icon: Radio, requiredPermissions: ["stations.view"] },
          { to: "/locations", label: "nav.locations", icon: MapPin, requiredPermissions: ["stations.view"] },
          { to: "/monitoring", label: "nav.monitoring", icon: MonitorCheck, requiredPermissions: ["stations.view"] },
          { to: "/smart-charging", label: "nav.smartCharging", icon: BatteryCharging, requiredPermissions: ["stations.edit"] },
          { to: "/energy-mix", label: "nav.energyMix", icon: Leaf, requiredPermissions: ["stations.view"] },
        ],
      },
      {
        label: "nav.billing",
        items: [
          { to: "/billing", label: "billing.invoices", icon: FileText, requiredPermissions: ["billing.view"] },
          { to: "/billing-profiles", label: "nav.billingProfiles", icon: Building2, requiredPermissions: ["billing.view"] },
          { to: "/tariffs", label: "nav.tariffs", icon: Wallet, requiredPermissions: ["billing.tariffs"] },
          { to: "/roaming-contracts", label: "nav.roamingContracts", icon: Handshake, requiredPermissions: ["ocpi.view"] },
        ],
      },
      {
        label: "roaming.title",
        items: [
          { to: "/ocpi", label: "ocpi.title", icon: Globe, requiredPermissions: ["ocpi.view"] },
        ],
      },
    ],
  },
  {
    id: "emsp",
    label: "nav.emsp",
    requiredPermissions: ["customers.view"],
    subsections: [
      {
        label: "nav.emspNetworks",
        items: [
          { to: "/emsp-networks", label: "nav.emspNetworks", icon: Network, requiredPermissions: ["customers.view"] },
        ],
      },
      {
        label: "nav.customers",
        items: [
          { to: "/customers", label: "nav.clients", icon: Users, requiredPermissions: ["customers.view"] },
          { to: "/drivers", label: "nav.drivers", icon: UserCheck, requiredPermissions: ["customers.view"] },
        ],
      },
      {
        label: "nav.paymentMethods",
        items: [
          { to: "/payment-methods", label: "nav.paymentMethods", icon: CreditCard, requiredPermissions: ["customers.view"] },
        ],
      },
      {
        label: "nav.accessGroups",
        items: [
          { to: "/access-groups", label: "nav.accessGroups", icon: Shield, requiredPermissions: ["customers.view"] },
        ],
      },
    ],
  },
  {
    id: "automation",
    label: "Automation",
    requiredPermissions: ["stations.maintenance", "admin.logs"],
    items: [
      { to: "/exceptions", label: "nav.exceptions", icon: ShieldAlert, requiredPermissions: ["stations.maintenance"] },
    ],
  },
  {
    id: "admin",
    label: "nav.admin",
    requiredPermissions: ["admin.users", "admin.roles", "admin.settings"],
    items: [
      { to: "/users", label: "nav.users", icon: Users, requiredPermissions: ["admin.users"] },
      { to: "/roles", label: "nav.rolesPermissions", icon: Shield, requiredPermissions: ["admin.roles"] },
      { to: "/admin-config", label: "nav.adminConfig", icon: Settings, requiredPermissions: ["admin.settings"] },
      { to: "/admin/b2b", label: "nav.b2b", icon: Handshake, requiredPermissions: ["admin.users"] },
    ],
  },
  {
    id: "configuration",
    label: "admin.config.title",
    requiredPermissions: ["stations.commands"],
    items: [
      { to: "/validate-token", label: "nav.validateToken", icon: ScanLine, requiredPermissions: ["stations.commands"] },
      { to: "/support", label: "nav.support", icon: LifeBuoy, requiredPermissions: ["stations.view"] },
      { to: "/interventions", label: "nav.interventions", icon: Wrench, requiredPermissions: ["stations.edit"] },
    ],
  },
  {
    id: "b2b-portal",
    label: "nav.b2b",
    items: [
      { to: "/b2b/overview", label: "nav.b2bOverview", icon: LayoutDashboard },
      { to: "/b2b/monthly", label: "nav.b2bMonthly", icon: FileText },
      { to: "/b2b/sessions", label: "nav.b2bSessions", icon: CreditCard },
      { to: "/b2b/chargepoints", label: "nav.b2bChargepoints", icon: Radio },
      { to: "/b2b/drivers", label: "nav.b2bDrivers", icon: UserCheck },
      { to: "/b2b/fleet", label: "nav.b2bFleet", icon: Users },
      { to: "/b2b/analytics", label: "nav.b2bAnalytics", icon: BarChart2 },
      { to: "/b2b/company", label: "b2b.company", icon: Building2 },
    ],
  },
  {
    id: "xdrive-portal",
    label: "nav.xdrive",
    requiredPermissions: ["admin.users", "admin.settings"],
    items: [
      { to: "/xdrive/dashboard", label: "nav.xdriveDashboard", icon: LayoutDashboard, requiredPermissions: ["admin.users", "admin.settings"] },
      { to: "/xdrive/cdrs", label: "nav.xdriveCdrs", icon: FileText, requiredPermissions: ["admin.users", "admin.settings"] },
      { to: "/xdrive/breakdown", label: "nav.xdriveBreakdown", icon: PieChart, requiredPermissions: ["admin.users", "admin.settings"] },
      { to: "/xdrive/reconciliation", label: "nav.xdriveReconciliation", icon: Handshake, requiredPermissions: ["admin.users", "admin.settings"] },
      { to: "/xdrive/bpu", label: "nav.xdriveBpu", icon: Wallet, requiredPermissions: ["admin.users", "admin.settings"] },
      { to: "/xdrive/billing", label: "nav.xdriveBilling", icon: Building2, requiredPermissions: ["admin.users", "admin.settings"] },
      { to: "/xdrive/exports", label: "nav.xdriveExports", icon: FileText, requiredPermissions: ["admin.users", "admin.settings"] },
    ],
  },
];

// ── Helper: get all items from a section (flat) ───────────

function getAllSectionItems(section: NavSection): NavItem[] {
  if (section.items) return section.items;
  if (section.subsections) {
    return section.subsections.flatMap((sub) => sub.items);
  }
  return [];
}

// ── Sidebar Component ─────────────────────────────────────

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ isOpen = false, onClose, collapsed = false, onToggleCollapse }: SidebarProps) {
  const { profile } = useAuth();
  const { hasAnyPermission, isB2B } = usePermissions();
  const { t } = useTranslation();

  // Permission-based filtering helper
  function filterItemsByPermission(items: NavItem[]): NavItem[] {
    return items.filter((item) => {
      if (!item.requiredPermissions || item.requiredPermissions.length === 0) return true;
      return hasAnyPermission(...item.requiredPermissions);
    });
  }

  // Role + permission-based section filtering
  const visibleSections = useMemo(() => {
    if (isB2B) {
      return NAV_SECTIONS.filter((s) => s.id === "b2b-portal");
    }

    return NAV_SECTIONS
      .filter((section) => {
        // Hide b2b-portal for non-b2b users
        if (section.id === "b2b-portal") return false;
        // Check section-level permissions
        if (section.requiredPermissions && section.requiredPermissions.length > 0) {
          return hasAnyPermission(...section.requiredPermissions);
        }
        return true;
      })
      .map((section) => {
        // Filter items within sections
        if (section.items) {
          const filtered = filterItemsByPermission(section.items);
          return filtered.length > 0 ? { ...section, items: filtered } : null;
        }
        if (section.subsections) {
          const filteredSubs = section.subsections
            .map((sub) => ({
              ...sub,
              items: filterItemsByPermission(sub.items),
            }))
            .filter((sub) => sub.items.length > 0);
          return filteredSubs.length > 0 ? { ...section, subsections: filteredSubs } : null;
        }
        return section;
      })
      .filter(Boolean) as NavSection[];
  }, [isB2B, profile?.admin_role?.permissions]);

  // Section-level expand/collapse — Home and CPO expanded by default
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    NAV_SECTIONS.forEach((s) => {
      initial[s.id] = s.id === "home" || s.id === "cpo";
    });
    return initial;
  });

  // Subsection-level expand/collapse — all expanded by default
  const [subExpanded, setSubExpanded] = useState<Record<string, boolean>>({});

  function toggleSection(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function isSubExpanded(sectionId: string, subLabel: string): boolean {
    const key = `${sectionId}::${subLabel}`;
    // Default to expanded if not explicitly set
    return subExpanded[key] !== false;
  }

  function toggleSubSection(sectionId: string, subLabel: string) {
    const key = `${sectionId}::${subLabel}`;
    setSubExpanded((prev) => ({ ...prev, [key]: prev[key] === false }));
  }

  // ── Render a single NavItem ─────────────────────────────

  function renderNavItem(item: NavItem, indented: boolean = false) {
    const label = t(item.label, item.label);
    return (
      <NavLink
        key={item.to}
        to={item.to}
        onClick={() => onClose?.()}
        title={collapsed ? label : undefined}
        className={({ isActive }) =>
          cn(
            "flex items-center rounded-lg font-medium transition-all",
            collapsed
              ? "justify-center p-2.5"
              : cn("gap-2.5 py-2 text-[13px]", indented ? "pl-7 pr-3" : "px-3"),
            isActive
              ? "bg-primary/10 text-primary"
              : "text-foreground-muted hover:text-foreground hover:bg-surface-elevated"
          )
        }
      >
        <item.icon className="w-4 h-4 shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
      </NavLink>
    );
  }

  // ── Render section content (items or subsections) ───────

  function renderSectionContent(section: NavSection) {
    // Flat items (no subsections)
    if (section.items) {
      return (
        <div
          className={cn(
            "space-y-0.5",
            collapsed ? "px-1.5 pb-0.5" : "px-2 pb-1"
          )}
        >
          {section.items.map((item) => renderNavItem(item))}
        </div>
      );
    }

    // Subsections
    if (section.subsections) {
      // In collapsed mode, show all items flat (no subsection headers)
      if (collapsed) {
        return (
          <div className="space-y-0.5 px-1.5 pb-0.5">
            {getAllSectionItems(section).map((item) => renderNavItem(item))}
          </div>
        );
      }

      return (
        <div className="px-2 pb-1">
          {section.subsections.map((sub) => {
            const isOpen = isSubExpanded(section.id, sub.label);
            return (
              <div key={sub.label} className="mb-0.5">
                {/* Subsection header */}
                <button
                  onClick={() => toggleSubSection(section.id, sub.label)}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-foreground-muted/60 hover:text-foreground-muted transition-colors"
                >
                  <ChevronDown
                    className={cn(
                      "w-2.5 h-2.5 transition-transform duration-200",
                      isOpen ? "rotate-0" : "-rotate-90"
                    )}
                  />
                  <span>{t(sub.label, sub.label)}</span>
                </button>

                {/* Subsection items */}
                <div
                  className={cn(
                    "overflow-hidden transition-all duration-200",
                    isOpen
                      ? "max-h-[500px] opacity-100"
                      : "max-h-0 opacity-0"
                  )}
                >
                  <div className="space-y-0.5">
                    {sub.items.map((item) => renderNavItem(item, true))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    return null;
  }

  return (
    <aside
      className={cn(
        "h-screen bg-surface border-r border-border flex flex-col shrink-0 transition-all duration-300",
        collapsed ? "w-[68px]" : "w-[250px]",
        "fixed inset-y-0 left-0 z-50",
        isOpen ? "translate-x-0" : "-translate-x-full",
        "md:relative md:translate-x-0 md:z-auto"
      )}
    >
      {/* Logo */}
      <div className={cn(
        "flex items-center border-b border-border",
        collapsed ? "justify-center px-2 py-4" : "justify-between px-5 py-4"
      )}>
        <div className="flex items-center gap-2.5">
          <img
            src="/favicon.png"
            alt="EZDrive"
            className="w-8 h-8 rounded-lg shrink-0"
          />
          {!collapsed && (
            <div>
              <span className="font-heading font-bold text-foreground text-sm tracking-tight">
                EZDrive
              </span>
              <span className="block text-[10px] text-foreground-muted leading-tight">
                Supervision
              </span>
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="md:hidden p-1.5 text-foreground-muted hover:text-foreground transition-colors rounded-lg hover:bg-surface-elevated"
          aria-label={t("common.close")}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* CPO Selector */}
      {!isB2B && (
        <CpoSelector collapsed={collapsed} />
      )}

      {/* Navigation sections */}
      <nav className="flex-1 overflow-y-auto py-2 custom-scrollbar">
        {visibleSections.map((section) => (
          <div key={section.id} className="mb-0.5">
            {/* Section header */}
            {collapsed ? (
              <div className="px-2 pt-3 pb-1">
                <div className="h-px bg-border" />
              </div>
            ) : (
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-foreground-muted/70 hover:text-foreground-muted transition-colors"
              >
                <span>{t(section.label, section.label)}</span>
                <ChevronDown
                  className={cn(
                    "w-3 h-3 transition-transform duration-200",
                    expanded[section.id] ? "rotate-0" : "-rotate-90"
                  )}
                />
              </button>
            )}

            {/* Section content */}
            <div
              className={cn(
                "overflow-hidden transition-all duration-200",
                collapsed || expanded[section.id]
                  ? "max-h-[1000px] opacity-100"
                  : "max-h-0 opacity-0"
              )}
            >
              {renderSectionContent(section)}
            </div>
          </div>
        ))}
      </nav>

      {/* Collapse toggle (desktop only) */}
      <div className="hidden md:block px-2 py-2 border-t border-border">
        <button
          onClick={onToggleCollapse}
          className={cn(
            "flex items-center gap-2 w-full rounded-lg py-2 text-xs font-medium text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-colors",
            collapsed ? "justify-center px-2" : "px-3"
          )}
          title={collapsed ? t("common.details") : t("common.close")}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4 shrink-0" />
              <span>{t("common.close")}</span>
            </>
          )}
        </button>
      </div>

      {/* Footer */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-border">
          <p className="text-[10px] text-foreground-muted/50">
            EZDrive Supervision v2.0
          </p>
        </div>
      )}
    </aside>
  );
}
