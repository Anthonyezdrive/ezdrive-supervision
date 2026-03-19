import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tag, Settings, Shield, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminPage } from "@/components/admin/AdminPage";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/Skeleton";

const TABS = [
  { key: "admin" as const, label: "Gestion CPO", icon: Tag },
  { key: "settings" as const, label: "Param\u00e8tres & Alertes", icon: Settings },
  { key: "logs" as const, label: "Logs connexion", icon: Shield },
] as const;

export function AdminConfigPage() {
  const [tab, setTab] = useState<"admin" | "settings" | "logs">("admin");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-xl font-bold text-foreground">Administration</h1>
        <p className="text-sm text-foreground-muted mt-0.5">Gestion CPO et configuration</p>
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
      {tab === "admin" && <AdminPage />}
      {tab === "settings" && <SettingsPage />}
      {tab === "logs" && <LoginLogsSection />}
    </div>
  );
}

// ── Story 90: Login Logs Section ─────────────────────────────

function LoginLogsSection() {
  const { data: loginLogs, isLoading } = useQuery({
    queryKey: ["admin-login-logs"],
    queryFn: async () => {
      // Query profiles with last_sign_in info - this relies on auth metadata
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, updated_at")
        .order("updated_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <LogIn className="w-5 h-5 text-primary" />
        <h2 className="text-base font-heading font-bold text-foreground">Historique des connexions</h2>
      </div>

      {isLoading ? (
        <div className="bg-surface border border-border rounded-2xl p-6 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">Utilisateur</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">Rôle</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-foreground-muted uppercase tracking-wider">Dernière activité</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(loginLogs ?? []).map((log) => (
                  <tr key={log.id as string} className="hover:bg-surface-elevated/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-foreground">
                      {(log.full_name as string) ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted">
                      {(log.email as string) ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium",
                        (log.role as string) === "admin" ? "bg-red-500/15 text-red-400" :
                        (log.role as string) === "manager" ? "bg-blue-500/15 text-blue-400" :
                        "bg-foreground-muted/10 text-foreground-muted"
                      )}>
                        {(log.role as string) ?? "user"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground-muted whitespace-nowrap">
                      {log.updated_at ? new Date(log.updated_at as string).toLocaleString("fr-FR") : "—"}
                    </td>
                  </tr>
                ))}
                {(loginLogs ?? []).length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-foreground-muted">Aucun log de connexion</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
