// ============================================================
// EZDrive — Driver Token Link Component
// Links/unlinks OCPI tokens to a driver in the detail SlideOver
// ============================================================

import { useState } from "react";
import {
  CreditCard,
  Search,
  Link2,
  Unlink,
  Loader2,
  Plus,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  useDriverTokens,
  useLinkToken,
  useUnlinkToken,
  useSearchAvailableTokens,
} from "@/hooks/useDriverTokens";

interface DriverTokenLinkProps {
  driverExternalId: string;
}

export function DriverTokenLink({ driverExternalId }: DriverTokenLinkProps) {
  const { data: tokens, isLoading } = useDriverTokens(driverExternalId);
  const linkMutation = useLinkToken();
  const unlinkMutation = useUnlinkToken();

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [unlinkTarget, setUnlinkTarget] = useState<{ id: string; uid: string } | null>(null);

  const { data: searchResults, isLoading: isSearching } = useSearchAvailableTokens(
    searchQuery,
    showSearch
  );

  const handleLink = (tokenUid: string) => {
    linkMutation.mutate(
      { tokenUid, driverExternalId },
      {
        onSuccess: () => {
          setSearchQuery("");
          setShowSearch(false);
        },
      }
    );
  };

  const handleUnlink = () => {
    if (!unlinkTarget) return;
    unlinkMutation.mutate(
      { tokenId: unlinkTarget.id, driverExternalId },
      { onSuccess: () => setUnlinkTarget(null) }
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-foreground-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-foreground-muted" />
          <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider">
            Tokens associés
          </p>
        </div>
        <button
          onClick={() => setShowSearch(!showSearch)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
            showSearch
              ? "bg-primary/15 text-primary border border-primary/30"
              : "bg-surface-elevated border border-border text-foreground-muted hover:text-foreground hover:bg-surface"
          )}
        >
          <Plus className="w-3.5 h-3.5" />
          Associer un token
        </button>
      </div>

      {/* Search panel */}
      {showSearch && (
        <div className="p-4 bg-surface-elevated border border-border rounded-xl space-y-3">
          <label className="text-xs text-foreground-muted">
            Rechercher un token disponible par UID
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
            <input
              type="text"
              placeholder="Saisir un UID de token..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-surface border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-border-focus transition-colors"
              autoFocus
            />
          </div>

          {isSearching && searchQuery.length >= 2 && (
            <div className="flex items-center gap-2 text-xs text-foreground-muted py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Recherche...
            </div>
          )}

          {searchResults && searchResults.length > 0 && (
            <div className="max-h-48 overflow-y-auto border border-border rounded-lg divide-y divide-border">
              {searchResults.map((token) => (
                <div
                  key={token.id}
                  className="flex items-center justify-between px-3 py-2.5 hover:bg-surface transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-mono text-foreground truncate">
                      {token.token_uid}
                    </p>
                    <p className="text-xs text-foreground-muted">
                      {token.type ?? "RFID"} &middot;{" "}
                      {token.valid ? "Valide" : "Invalide"}
                    </p>
                  </div>
                  <button
                    onClick={() => handleLink(token.token_uid)}
                    disabled={linkMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors shrink-0 ml-3"
                  >
                    {linkMutation.isPending ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Link2 className="w-3 h-3" />
                    )}
                    Associer
                  </button>
                </div>
              ))}
            </div>
          )}

          {searchResults && searchResults.length === 0 && searchQuery.length >= 2 && (
            <p className="text-xs text-foreground-muted text-center py-3">
              Aucun token disponible correspondant
            </p>
          )}

          {searchQuery.length > 0 && searchQuery.length < 2 && (
            <p className="text-xs text-foreground-muted text-center py-2">
              Saisissez au moins 2 caractères
            </p>
          )}
        </div>
      )}

      {/* Token list */}
      {tokens && tokens.length > 0 ? (
        <div className="border border-border rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_80px_70px_90px] gap-2 px-4 py-2.5 bg-surface-elevated border-b border-border">
            <span className="text-xs font-semibold text-foreground-muted uppercase tracking-wider">
              UID
            </span>
            <span className="text-xs font-semibold text-foreground-muted uppercase tracking-wider">
              Type
            </span>
            <span className="text-xs font-semibold text-foreground-muted uppercase tracking-wider">
              Statut
            </span>
            <span className="text-xs font-semibold text-foreground-muted uppercase tracking-wider text-right">
              Action
            </span>
          </div>

          {/* Token rows */}
          <div className="divide-y divide-border">
            {tokens.map((token) => (
              <div
                key={token.id}
                className="grid grid-cols-[1fr_80px_70px_90px] gap-2 px-4 py-3 items-center hover:bg-surface-elevated/50 transition-colors"
              >
                <p className="text-sm font-mono text-foreground truncate" title={token.token_uid}>
                  {token.token_uid}
                </p>
                <span className="text-xs text-foreground-muted">
                  {token.type ?? "RFID"}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-xs font-semibold",
                    token.valid
                      ? "text-emerald-400"
                      : "text-red-400"
                  )}
                >
                  {token.valid ? (
                    <ShieldCheck className="w-3 h-3" />
                  ) : (
                    <ShieldX className="w-3 h-3" />
                  )}
                  {token.valid ? "Valide" : "Invalide"}
                </span>
                <div className="flex justify-end">
                  <button
                    onClick={() => setUnlinkTarget({ id: token.id, uid: token.token_uid })}
                    className="flex items-center gap-1 px-2.5 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-colors"
                  >
                    <Unlink className="w-3 h-3" />
                    Dissocier
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 bg-surface-elevated border border-border rounded-xl">
          <CreditCard className="w-8 h-8 text-foreground-muted mb-3" />
          <p className="text-sm font-medium text-foreground">Aucun token associé à ce conducteur</p>
          <p className="text-xs text-foreground-muted mt-1">
            Cliquez sur « Associer un token » pour lier un badge RFID
          </p>
        </div>
      )}

      {/* Unlink confirmation dialog */}
      <ConfirmDialog
        open={!!unlinkTarget}
        onConfirm={handleUnlink}
        onCancel={() => setUnlinkTarget(null)}
        title="Dissocier le token"
        description={`Voulez-vous dissocier le token "${unlinkTarget?.uid ?? ""}" de ce conducteur ? Le token restera dans le système mais ne sera plus rattaché.`}
        confirmLabel="Dissocier"
        variant="danger"
        loading={unlinkMutation.isPending}
        loadingLabel="Dissociation..."
      />
    </div>
  );
}
