import { useState, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import {
  Building2,
  Upload,
  Pencil,
  Check,
  X,
  User,
  Mail,
  Shield,
  Users,
  Loader2,
  ImageIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useB2BClientUsers, useUpdateB2BClientSelf, useUploadB2BLogo } from "@/hooks/useB2BCompany";
import { PageHelp } from "@/components/ui/PageHelp";
import type { B2BClient } from "@/types/b2b";

// ── Company Page ──────────────────────────────────────────

export function B2BCompanyPage() {
  const { activeClient } =
    useOutletContext<{ activeClient: B2BClient | null; customerExternalIds: string[] }>();
  const { profile, user } = useAuth();

  const { data: teamUsers, isLoading: loadingUsers } = useB2BClientUsers(activeClient?.id);
  const updateClient = useUpdateB2BClientSelf();
  const uploadLogo = useUploadB2BLogo();

  // ── Inline edit state ──
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!activeClient) {
    return (
      <div className="flex flex-col items-center justify-center h-48 bg-surface border border-border rounded-2xl">
        <Building2 className="w-8 h-8 text-foreground-muted mb-3" />
        <p className="text-foreground-muted">Aucun client sélectionné</p>
      </div>
    );
  }

  // ── Handlers ──
  function startEditName() {
    setNameValue(activeClient!.name);
    setEditingName(true);
  }

  async function saveName() {
    if (!nameValue.trim() || nameValue.trim() === activeClient!.name) {
      setEditingName(false);
      return;
    }
    await updateClient.mutateAsync({
      clientId: activeClient!.id,
      name: nameValue.trim(),
    });
    setEditingName(false);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeClient) return;
    await uploadLogo.mutateAsync({ clientId: activeClient.id, file });
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const logoInitial = activeClient.name?.charAt(0)?.toUpperCase() ?? "B";

  return (
    <div className="space-y-6">
      <PageHelp
        summary="Gérez les informations de votre entreprise, votre logo et consultez les membres de votre équipe"
        items={[
          { label: "Logo", description: "Uploadez le logo de votre entreprise. Formats acceptés : JPG, PNG, WebP, SVG (max 2 Mo)." },
          { label: "Nom", description: "Le nom affiché dans l'en-tête du portail et sur vos rapports." },
          { label: "Équipe", description: "Liste des collaborateurs ayant accès à ce portail B2B." },
        ]}
      />

      {/* ── Card 1: Company Info ── */}
      <div className="bg-surface border border-border rounded-2xl p-6 space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <Building2 className="w-5 h-5" style={{ color: "#9ACC0E" }} />
          <h3 className="text-base font-heading font-bold text-foreground">
            Informations de l'entreprise
          </h3>
        </div>

        {/* Logo + Upload */}
        <div className="flex items-center gap-6">
          <div className="relative group">
            {activeClient.logo_url ? (
              <img
                src={activeClient.logo_url}
                alt={activeClient.name}
                className="w-20 h-20 rounded-2xl object-contain bg-white border border-border p-2"
              />
            ) : (
              <div
                className="w-20 h-20 rounded-2xl border-2 border-dashed flex items-center justify-center"
                style={{ backgroundColor: "#9ACC0E10", borderColor: "#9ACC0E40" }}
              >
                <span className="text-2xl font-bold" style={{ color: "#9ACC0E" }}>
                  {logoInitial}
                </span>
              </div>
            )}
            {uploadLogo.isPending && (
              <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm text-foreground-muted">
              {activeClient.logo_url ? "Logo de l'entreprise" : "Aucun logo configuré"}
            </p>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadLogo.isPending}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-foreground-muted hover:text-foreground hover:bg-surface-elevated transition-colors disabled:opacity-50"
            >
              {activeClient.logo_url ? (
                <><Pencil className="w-3.5 h-3.5" /> Changer le logo</>
              ) : (
                <><Upload className="w-3.5 h-3.5" /> Ajouter un logo</>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/svg+xml"
              onChange={handleFileChange}
              className="hidden"
            />
            <p className="text-[11px] text-foreground-muted/60">
              JPG, PNG, WebP ou SVG — max 2 Mo
            </p>
          </div>
        </div>

        {/* Company details */}
        <div className="space-y-3 pt-2 border-t border-border">
          {/* Name (editable) */}
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-foreground-muted">Nom</span>
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
                  autoFocus
                  className="px-2 py-1 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50 w-48"
                />
                <button
                  onClick={saveName}
                  disabled={updateClient.isPending}
                  className="p-1 rounded hover:bg-emerald-500/10 text-emerald-400 transition-colors"
                >
                  {updateClient.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="p-1 rounded hover:bg-red-500/10 text-red-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{activeClient.name}</span>
                <button
                  onClick={startEditName}
                  className="p-1 rounded hover:bg-surface-elevated text-foreground-muted hover:text-foreground transition-colors"
                  title="Modifier le nom"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Slug */}
          <div className="flex items-center justify-between py-2 border-t border-border/50">
            <span className="text-sm text-foreground-muted">Identifiant</span>
            <span className="inline-flex items-center bg-foreground-muted/10 text-foreground-muted border border-border rounded-md px-2 py-0.5 text-xs font-mono">
              {activeClient.slug}
            </span>
          </div>

          {/* Redevance rate */}
          <div className="flex items-center justify-between py-2 border-t border-border/50">
            <span className="text-sm text-foreground-muted">Taux redevance</span>
            <span className="text-sm font-medium text-foreground">
              {((activeClient.redevance_rate ?? 0) * 100).toFixed(0)} %
            </span>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between py-2 border-t border-border/50">
            <span className="text-sm text-foreground-muted">Statut</span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                activeClient.is_active
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                  : "bg-red-500/10 text-red-400 border-red-500/25"
              }`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: activeClient.is_active ? "#34D399" : "#F87171" }}
              />
              {activeClient.is_active ? "Actif" : "Inactif"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Card 2: My Profile ── */}
      <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <User className="w-5 h-5" style={{ color: "#00C3FF" }} />
          <h3 className="text-base font-heading font-bold text-foreground">
            Mon profil
          </h3>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-foreground-muted flex items-center gap-2">
              <User className="w-3.5 h-3.5" /> Nom
            </span>
            <span className="text-sm font-medium text-foreground">
              {profile?.full_name ?? "—"}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-border/50">
            <span className="text-sm text-foreground-muted flex items-center gap-2">
              <Mail className="w-3.5 h-3.5" /> Email
            </span>
            <span className="text-sm font-medium text-foreground">
              {user?.email ?? profile?.email ?? "—"}
            </span>
          </div>
          <div className="flex items-center justify-between py-2 border-t border-border/50">
            <span className="text-sm text-foreground-muted flex items-center gap-2">
              <Shield className="w-3.5 h-3.5" /> Rôle
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold bg-blue-500/10 text-blue-400 border-blue-500/25">
              Client B2B
            </span>
          </div>
        </div>
      </div>

      {/* ── Card 3: Team Members ── */}
      <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5" style={{ color: "#F39C12" }} />
            <h3 className="text-base font-heading font-bold text-foreground">
              Utilisateurs avec accès
            </h3>
          </div>
          {teamUsers && (
            <span className="text-xs text-foreground-muted bg-foreground-muted/10 rounded-full px-2.5 py-1">
              {teamUsers.length} membre{teamUsers.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {loadingUsers ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-surface-elevated rounded-xl animate-pulse" />
            ))}
          </div>
        ) : teamUsers && teamUsers.length > 0 ? (
          <div className="space-y-1">
            {teamUsers.map((u) => {
              const isMe = u.user_id === profile?.id;
              const initial = u.full_name?.charAt(0)?.toUpperCase() ?? u.email.charAt(0).toUpperCase();
              return (
                <div
                  key={u.user_id}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl transition-colors ${
                    isMe ? "bg-surface-elevated border border-border" : "hover:bg-surface-elevated/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ backgroundColor: "#9ACC0E20", color: "#9ACC0E" }}
                    >
                      {initial}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {u.full_name ?? u.email}
                        {isMe && (
                          <span className="ml-2 text-[10px] font-semibold bg-primary/10 text-primary border border-primary/25 rounded px-1.5 py-0.5">
                            vous
                          </span>
                        )}
                      </p>
                      {u.full_name && (
                        <p className="text-xs text-foreground-muted">{u.email}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-24 text-foreground-muted">
            <ImageIcon className="w-6 h-6 mb-2 opacity-40" />
            <p className="text-sm">Aucun utilisateur trouvé</p>
          </div>
        )}
      </div>
    </div>
  );
}
