import { LogOut, RefreshCw, Menu, Search, Command, Globe } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { formatRelativeTime } from "@/lib/utils";
import { useStations } from "@/hooks/useStations";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useTranslation } from "react-i18next";

interface TopBarProps {
  onMenuClick?: () => void;
  onSearchClick?: () => void;
}

export function TopBar({ onMenuClick, onSearchClick }: TopBarProps) {
  const { profile, signOut } = useAuth();
  const { data: stations, dataUpdatedAt } = useStations();
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === "fr" ? "en" : "fr");
  };

  const lastSync = stations?.[0]?.last_synced_at;

  async function handleSync() {
    setSyncing(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gfx-sync`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      // Invalidate queries to refresh data immediately
      await queryClient.invalidateQueries();
      const msg = result?.total_synced
        ? `✓ ${result.total_synced} ${t("topbar.syncSuccess")}${result.status_changes ? ` · ${result.status_changes} ${t("topbar.syncChanges")}` : ""}`
        : `✓ ${t("topbar.sync")}`;
      toast(msg, "success");
    } catch (e) {
      console.error("Sync error:", e);
      toast(t("topbar.syncError"), "error");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <header className="h-14 bg-surface border-b border-border flex items-center justify-between px-4 md:px-5 shrink-0">
      {/* Left: hamburger (mobile) + sync indicator */}
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuClick}
          className="md:hidden p-1.5 text-foreground-muted hover:text-foreground transition-colors rounded-lg hover:bg-surface-elevated"
          aria-label="Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Sync indicator dot + timestamp */}
        <div className="flex items-center gap-2 text-sm text-foreground-muted">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse-dot shrink-0" />
          <span className="hidden sm:inline">
            {lastSync
              ? `Sync ${formatRelativeTime(lastSync)}`
              : t("topbar.syncWaiting")}
          </span>
          {dataUpdatedAt > 0 && (
            <span className="text-xs opacity-60 hidden lg:inline">
              (poll {formatRelativeTime(new Date(dataUpdatedAt).toISOString())})
            </span>
          )}
        </div>
      </div>

      {/* Right: search + sync button + user + logout */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Search trigger */}
        <button
          onClick={onSearchClick}
          className="flex items-center gap-2 px-3 py-1.5 bg-surface-elevated border border-border rounded-lg text-xs text-foreground-muted hover:text-foreground hover:border-border-focus transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t("topbar.search")}</span>
          <kbd className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-surface border border-border rounded text-[10px] font-mono ml-1">
            <Command className="w-2.5 h-2.5" />K
          </kbd>
        </button>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground-muted hover:text-foreground bg-surface-elevated border border-border rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`}
          />
          <span className="hidden sm:inline">{t("topbar.sync")}</span>
        </button>

        <button
          onClick={toggleLang}
          className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-foreground-muted hover:text-foreground bg-surface-elevated border border-border rounded-lg transition-colors"
          title={t("settings.language")}
        >
          <Globe className="w-3.5 h-3.5" />
          <span className="uppercase">{i18n.language}</span>
        </button>

        <div className="h-6 w-px bg-border hidden sm:block" />

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary shrink-0">
            {(profile?.full_name ?? profile?.email ?? "?")
              .charAt(0)
              .toUpperCase()}
          </div>
          <span className="text-sm text-foreground hidden lg:block">
            {profile?.full_name ?? profile?.email}
          </span>
        </div>

        <button
          onClick={signOut}
          className="p-1.5 text-foreground-muted hover:text-danger transition-colors"
          title={t("topbar.logout")}
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
