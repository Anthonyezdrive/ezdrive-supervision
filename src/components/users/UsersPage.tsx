import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Shield,
  Wrench,
  Eye,
  Clock,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/utils";
import { KPICard } from "@/components/ui/KPICard";
import { KPISkeleton, TableSkeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";

// ── Types ──────────────────────────────────────────────────

interface EzdriveUser {
  id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "operator" | "viewer";
  territory_id: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
}

// ── Role config ────────────────────────────────────────────

const ROLE_CONFIG: Record<
  EzdriveUser["role"],
  { label: string; color: string; bgClass: string; textClass: string; borderClass: string }
> = {
  admin: {
    label: "Admin",
    color: "#A78BFA",
    bgClass: "bg-[#A78BFA]/15",
    textClass: "text-[#A78BFA]",
    borderClass: "border-[#A78BFA]/30",
  },
  operator: {
    label: "Opérateur",
    color: "#3498DB",
    bgClass: "bg-[#3498DB]/15",
    textClass: "text-[#3498DB]",
    borderClass: "border-[#3498DB]/30",
  },
  viewer: {
    label: "Lecteur",
    color: "#95A5A6",
    bgClass: "bg-[#95A5A6]/15",
    textClass: "text-[#95A5A6]",
    borderClass: "border-[#95A5A6]/30",
  },
};

// ── Query ──────────────────────────────────────────────────

function useEzdriveUsers() {
  return useQuery<EzdriveUser[]>({
    queryKey: ["ezdrive-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ezdrive_profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EzdriveUser[];
    },
  });
}

// ── Helpers ────────────────────────────────────────────────

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function RoleBadge({ role }: { role: EzdriveUser["role"] }) {
  const config = ROLE_CONFIG[role];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold",
        config.bgClass,
        config.textClass,
        config.borderClass
      )}
    >
      {role === "admin" && <Shield className="w-3 h-3" />}
      {role === "operator" && <Wrench className="w-3 h-3" />}
      {role === "viewer" && <Eye className="w-3 h-3" />}
      {config.label}
    </span>
  );
}

// ── Page component ─────────────────────────────────────────

export function UsersPage() {
  const { data: users, isLoading, isError, refetch } = useEzdriveUsers();

  // KPI computations
  const kpis = useMemo(() => {
    if (!users) return null;
    const admins = users.filter((u) => u.role === "admin").length;
    const operators = users.filter((u) => u.role === "operator").length;

    // Most recent login among all users
    const lastLogin = users
      .filter((u) => u.last_login_at)
      .sort(
        (a, b) =>
          new Date(b.last_login_at!).getTime() -
          new Date(a.last_login_at!).getTime()
      )[0]?.last_login_at;

    return {
      total: users.length,
      admins,
      operators,
      lastLogin,
    };
  }, [users]);

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-xl font-bold">Utilisateurs</h1>
          <p className="text-sm text-foreground-muted mt-1">
            Gestion des utilisateurs du back-office
          </p>
        </div>
        <KPISkeleton />
        <TableSkeleton rows={6} />
      </div>
    );
  }

  // ── Error state ──
  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-xl font-bold">Utilisateurs</h1>
          <p className="text-sm text-foreground-muted mt-1">
            Gestion des utilisateurs du back-office
          </p>
        </div>
        <ErrorState
          message="Impossible de charger les utilisateurs"
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div>
        <h1 className="font-heading text-xl font-bold">Utilisateurs</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Gestion des utilisateurs du back-office
        </p>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          label="Total utilisateurs"
          value={kpis?.total ?? 0}
          icon={Users}
          color="#8892B0"
          borderColor="border-border"
        />
        <KPICard
          label="Admins"
          value={kpis?.admins ?? 0}
          icon={Shield}
          color="#A78BFA"
          borderColor="border-[#A78BFA]/30"
        />
        <KPICard
          label="Opérateurs"
          value={kpis?.operators ?? 0}
          icon={Wrench}
          color="#3498DB"
          borderColor="border-[#3498DB]/30"
        />
        <div className="bg-surface border border-border rounded-2xl p-5 flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: "#F39C1215" }}
          >
            <Clock className="w-6 h-6 text-warning" />
          </div>
          <div>
            <p className="text-sm font-heading font-bold text-foreground">
              {kpis?.lastLogin
                ? formatRelativeTime(kpis.lastLogin)
                : "--"}
            </p>
            <p className="text-xs text-foreground-muted mt-0.5">
              Dernière connexion
            </p>
          </div>
        </div>
      </div>

      {/* ── Users Table ── */}
      {!users || users.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 bg-surface border border-border rounded-2xl">
          <div className="w-12 h-12 rounded-xl bg-[#8892B0]/15 flex items-center justify-center mb-3">
            <Users className="w-6 h-6 text-foreground-muted" />
          </div>
          <p className="text-foreground font-medium">
            Aucun utilisateur trouvé
          </p>
          <p className="text-sm text-foreground-muted mt-1">
            Les utilisateurs apparaitront ici une fois créés.
          </p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-foreground-muted border-b border-border">
                  <th className="text-left font-medium px-4 py-3">
                    Utilisateur
                  </th>
                  <th className="text-left font-medium px-4 py-3">
                    Rôle
                  </th>
                  <th className="text-left font-medium px-4 py-3">
                    Territoire
                  </th>
                  <th className="text-center font-medium px-4 py-3">Actif</th>
                  <th className="text-left font-medium px-4 py-3">
                    Dernière connexion
                  </th>
                  <th className="text-left font-medium px-4 py-3">
                    Inscrit le
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => {
                  const roleConfig = ROLE_CONFIG[user.role];
                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-surface-elevated/50 transition-colors"
                    >
                      {/* User avatar + name + email */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                            style={{
                              backgroundColor: `${roleConfig.color}20`,
                              color: roleConfig.color,
                            }}
                          >
                            {getInitials(user.full_name, user.email)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">
                              {user.full_name ?? user.email.split("@")[0]}
                            </p>
                            <p className="text-xs text-foreground-muted truncate">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Role badge */}
                      <td className="px-4 py-3">
                        <RoleBadge role={user.role} />
                      </td>

                      {/* Territory */}
                      <td className="px-4 py-3 text-foreground-muted text-xs">
                        {user.territory_id ?? "--"}
                      </td>

                      {/* Active status */}
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className={cn(
                              "w-2 h-2 rounded-full",
                              user.is_active
                                ? "bg-status-available"
                                : "bg-status-faulted"
                            )}
                          />
                          <span
                            className={cn(
                              "text-xs",
                              user.is_active
                                ? "text-status-available"
                                : "text-status-faulted"
                            )}
                          >
                            {user.is_active ? "Actif" : "Inactif"}
                          </span>
                        </span>
                      </td>

                      {/* Last login */}
                      <td className="px-4 py-3 text-foreground-muted text-xs">
                        {user.last_login_at
                          ? formatRelativeTime(user.last_login_at)
                          : "Jamais"}
                      </td>

                      {/* Created at */}
                      <td className="px-4 py-3 text-foreground-muted text-xs">
                        {formatDate(user.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
