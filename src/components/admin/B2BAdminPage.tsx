import { useState } from "react";
import {
  Building2, Users, Plus, Trash2, Pencil, Search,
  CheckCircle, XCircle, Eye, EyeOff, Copy, Loader2, Euro,
} from "lucide-react";
import { PageHelp } from "@/components/ui/PageHelp";
import { KPICard } from "@/components/ui/KPICard";
import { SlideOver } from "@/components/ui/SlideOver";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/contexts/ToastContext";
import { useCpo } from "@/contexts/CpoContext";
import {
  useB2BClientsAdmin,
  useB2BUsersAdmin,
  useCreateB2BUser,
  useDeleteB2BUser,
  useUpdateB2BClient,
  useCreateB2BClient,
  useDeleteB2BClient,
} from "@/hooks/useB2BAdmin";
import type { B2BClient } from "@/types/b2b";
import type { B2BUserRow } from "@/hooks/useB2BAdmin";
import { useAllReimbursementConfigs, useUpdateReimbursementConfig } from "@/hooks/useReimbursements";
import type { ReimbursementConfig } from "@/hooks/useReimbursements";
import { useTranslation } from "react-i18next";

const thClass =
  "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-foreground-muted";
const tdClass = "px-4 py-3.5 text-sm text-foreground whitespace-nowrap";

function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const specials = "!@#$%";
  let pwd = "";
  for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  pwd += specials[Math.floor(Math.random() * specials.length)];
  return pwd;
}

export function B2BAdminPage() {
  const { t } = useTranslation();
  const { selectedCpoId: _selectedCpoId } = useCpo();
  const { success: toastSuccess, error: toastError } = useToast();
  const { data: clients, isLoading: loadingClients } = useB2BClientsAdmin();
  const { data: users, isLoading: loadingUsers } = useB2BUsersAdmin();

  const createUser = useCreateB2BUser();
  const deleteUser = useDeleteB2BUser();
  const updateClient = useUpdateB2BClient();
  const createClient = useCreateB2BClient();
  const deleteClient = useDeleteB2BClient();

  // ── State ──
  const [tab, setTab] = useState<"clients" | "users" | "reimbursements">("clients");
  const [search, setSearch] = useState("");

  // User creation slide-over
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [userForm, setUserForm] = useState({ email: "", password: generatePassword(), fullName: "", clientId: "" });
  const [showPassword, setShowPassword] = useState(false);

  // Client edit slide-over
  const [showEditClient, setShowEditClient] = useState(false);
  const [editingClient, setEditingClient] = useState<(B2BClient & { userCount: number }) | null>(null);
  const [clientForm, setClientForm] = useState({
    name: "", slug: "", customer_external_ids: "", redevance_rate: "0.33", is_active: true,
  });

  // Client creation
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [newClientForm, setNewClientForm] = useState({
    name: "", slug: "", customer_external_ids: "", redevance_rate: "0.33",
  });

  // Delete confirmations
  const [deleteTarget, setDeleteTarget] = useState<{ type: "user" | "client"; id: string; label: string } | null>(null);

  // Reimbursement config
  const { data: reimbursementConfigs, isLoading: loadingConfigs } = useAllReimbursementConfigs();
  const updateReimbursementConfig = useUpdateReimbursementConfig();
  const [showEditConfig, setShowEditConfig] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ReimbursementConfig | null>(null);
  const [configForm, setConfigForm] = useState({
    rate_per_kwh: "0.25",
    max_monthly_amount: "",
    enabled: true,
    payment_method: "bank_transfer",
    billing_day: "1",
  });

  // ── Derived ──
  const activeClients = (clients ?? []).filter((c) => c.is_active).length;
  const totalUsers = (users ?? []).length;

  const filteredClients = (clients ?? []).filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.slug.toLowerCase().includes(search.toLowerCase())
  );

  const filteredUsers = (users ?? []).filter((u) =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.client_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  // ── Handlers ──
  function handleCreateUser() {
    if (!userForm.email || !userForm.password || !userForm.clientId) {
      toastError(t("b2bAdmin.requiredFields", "Champs requis"), t("b2bAdmin.emailPwdClientRequired", "Email, mot de passe et client sont obligatoires"));
      return;
    }
    createUser.mutate(
      { email: userForm.email, password: userForm.password, clientId: userForm.clientId, fullName: userForm.fullName || undefined },
      {
        onSuccess: () => {
          toastSuccess(t("b2bAdmin.b2bAccountCreated", "Compte B2B créé"), `${userForm.email} ${t("b2bAdmin.canNowLogin", "peut maintenant se connecter")}`);
          setShowCreateUser(false);
          setUserForm({ email: "", password: generatePassword(), fullName: "", clientId: "" });
        },
        onError: (err) => toastError(t("common.error", "Erreur"), err.message),
      }
    );
  }

  function openEditClient(client: B2BClient & { userCount: number }) {
    setEditingClient(client);
    setClientForm({
      name: client.name,
      slug: client.slug,
      customer_external_ids: client.customer_external_ids.join(", "),
      redevance_rate: String(client.redevance_rate),
      is_active: client.is_active,
    });
    setShowEditClient(true);
  }

  function handleSaveClient() {
    if (!editingClient) return;
    const ids = clientForm.customer_external_ids.split(",").map((s) => s.trim()).filter(Boolean);
    updateClient.mutate(
      {
        id: editingClient.id,
        name: clientForm.name,
        slug: clientForm.slug,
        customer_external_ids: ids,
        redevance_rate: parseFloat(clientForm.redevance_rate) || 0.33,
        is_active: clientForm.is_active,
      },
      {
        onSuccess: () => {
          toastSuccess(t("b2bAdmin.clientUpdated", "Client mis à jour"));
          setShowEditClient(false);
          setEditingClient(null);
        },
        onError: (err) => toastError(t("common.error", "Erreur"), err.message),
      }
    );
  }

  function handleCreateClient() {
    const ids = newClientForm.customer_external_ids.split(",").map((s) => s.trim()).filter(Boolean);
    if (!newClientForm.name || !newClientForm.slug || ids.length === 0) {
      toastError(t("b2bAdmin.requiredFields", "Champs requis"), t("b2bAdmin.nameSlugIdRequired", "Nom, slug et au moins un customer_external_id"));
      return;
    }
    createClient.mutate(
      {
        name: newClientForm.name,
        slug: newClientForm.slug,
        customer_external_ids: ids,
        redevance_rate: parseFloat(newClientForm.redevance_rate) || 0.33,
      },
      {
        onSuccess: () => {
          toastSuccess(t("b2bAdmin.clientCreated", "Client créé"));
          setShowCreateClient(false);
          setNewClientForm({ name: "", slug: "", customer_external_ids: "", redevance_rate: "0.33" });
        },
        onError: (err) => toastError(t("common.error", "Erreur"), err.message),
      }
    );
  }

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.type === "user") {
      deleteUser.mutate(deleteTarget.id, {
        onSuccess: () => { toastSuccess("Utilisateur supprim\u00e9"); setDeleteTarget(null); },
        onError: (err) => { toastError(t("common.error", "Erreur"), err.message); setDeleteTarget(null); },
      });
    } else {
      deleteClient.mutate(deleteTarget.id, {
        onSuccess: () => { toastSuccess("Client supprim\u00e9"); setDeleteTarget(null); },
        onError: (err) => { toastError(t("common.error", "Erreur"), err.message); setDeleteTarget(null); },
      });
    }
  }

  if (loadingClients || loadingUsers) {
    return (
      <div className="space-y-5">
        <div className="h-8 bg-surface rounded animate-pulse w-48" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 bg-surface rounded-2xl animate-pulse" />)}
        </div>
        <div className="h-96 bg-surface rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-heading font-bold text-foreground">{t("b2bAdmin.title", "Gestion B2B")}</h1>
        <p className="text-sm text-foreground-muted mt-0.5">
          Clients, comptes utilisateurs et acc\u00e8s au portail B2B
        </p>
      </div>

      <PageHelp
        summary="Gestion de vos clients B2B — configuration des accès au portail client"
        items={[
          { label: "Client B2B", description: "Une entreprise qui utilise vos bornes et dispose d'un portail de suivi dédié." },
          { label: "customer_external_id", description: "Identifiant du client dans les CDRs GreenFlux — lie les sessions au bon client B2B." },
          { label: "Taux de redevance", description: "Pourcentage appliqué sur le chiffre d'affaires des sessions pour calculer la redevance due." },
          { label: "Accès portail", description: "Créez un compte utilisateur avec le rôle 'b2b_client' et liez-le à un client B2B." },
        ]}
        tips={[
          "Pour donner accès au portail : 1) Créez le client B2B ici, 2) Créez un compte utilisateur, 3) Associez-le via la table b2b_client_access.",
          "L'URL du portail client est : https://pro.ezdrive.fr/portail"
        ]}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <KPICard
          label={t("b2bAdmin.activeClients", "Clients actifs")}
          value={String(activeClients)}
          icon={Building2}
          color="#00D4AA"
        />
        <KPICard
          label={t("b2bAdmin.totalClients", "Total clients")}
          value={String((clients ?? []).length)}
          icon={Building2}
          color="#3498DB"
        />
        <KPICard
          label={t("b2bAdmin.b2bUsers", "Utilisateurs B2B")}
          value={String(totalUsers)}
          icon={Users}
          color="#F39C12"
        />
      </div>

      {/* Tabs + Search + Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-1 bg-surface-elevated rounded-xl p-1">
          <button
            onClick={() => setTab("clients")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === "clients" ? "bg-primary text-white" : "text-foreground-muted hover:text-foreground"
            }`}
          >
            {t("nav.clients")} ({(clients ?? []).length})
          </button>
          <button
            onClick={() => setTab("users")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === "users" ? "bg-primary text-white" : "text-foreground-muted hover:text-foreground"
            }`}
          >
            {t("nav.users")} ({totalUsers})
          </button>
          <button
            onClick={() => setTab("reimbursements")}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === "reimbursements" ? "bg-primary text-white" : "text-foreground-muted hover:text-foreground"
            }`}
          >
            {t("billing.reimbursements")} ({(reimbursementConfigs ?? []).length})
          </button>
        </div>

        <div className="flex-1" />

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-muted" />
          <input
            type="text"
            placeholder={t("common.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted focus:border-border-focus focus:outline-none w-full sm:w-64"
          />
        </div>

        {tab === "clients" && (
          <button
            onClick={() => setShowCreateClient(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t("b2bAdmin.addClient", "Ajouter client")}
          </button>
        )}
        {tab === "users" && (
          <button
            onClick={() => {
              setUserForm({ email: "", password: generatePassword(), fullName: "", clientId: clients?.[0]?.id ?? "" });
              setShowCreateUser(true);
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Cr\u00e9er un compte
          </button>
        )}
      </div>

      {/* ── Clients Table ── */}
      {tab === "clients" && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className={thClass}>Nom</th>
                  <th className={thClass}>Slug</th>
                  <th className={thClass}>Customer IDs</th>
                  <th className={`${thClass} text-right`}>Redevance</th>
                  <th className={`${thClass} text-center`}>Actif</th>
                  <th className={`${thClass} text-center`}>Users</th>
                  <th className={`${thClass} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((c) => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-surface-elevated/50 transition-colors">
                    <td className={`${tdClass} font-medium`}>{c.name}</td>
                    <td className={`${tdClass} font-mono text-xs text-foreground-muted`}>{c.slug}</td>
                    <td className={tdClass}>
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {c.customer_external_ids.map((id: string) => (
                          <span key={id} className="px-2 py-0.5 bg-surface-elevated rounded-md text-xs text-foreground-muted">
                            {id}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className={`${tdClass} text-right font-mono`}>{(c.redevance_rate * 100).toFixed(0)}%</td>
                    <td className={`${tdClass} text-center`}>
                      {c.is_active ? (
                        <CheckCircle className="w-4 h-4 text-green-400 inline" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400 inline" />
                      )}
                    </td>
                    <td className={`${tdClass} text-center`}>
                      <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
                        {c.userCount}
                      </span>
                    </td>
                    <td className={`${tdClass} text-right`}>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditClient(c)}
                          className="p-1.5 text-foreground-muted hover:text-foreground hover:bg-surface-elevated rounded-lg transition-colors"
                          title="Modifier"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ type: "client", id: c.id, label: c.name })}
                          className="p-1.5 text-foreground-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Supprimer"
                          disabled={c.userCount > 0}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredClients.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-foreground-muted text-sm">
                      Aucun client trouv\u00e9
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Users Table ── */}
      {tab === "users" && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className={thClass}>Email</th>
                  <th className={thClass}>Nom</th>
                  <th className={thClass}>{t("b2bAdmin.clientLabel", "Client")}</th>
                  <th className={thClass}>Cr\u00e9\u00e9 le</th>
                  <th className={`${thClass} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u: B2BUserRow) => (
                  <tr key={u.user_id} className="border-b border-border/50 hover:bg-surface-elevated/50 transition-colors">
                    <td className={`${tdClass} font-medium`}>{u.email}</td>
                    <td className={tdClass}>{u.full_name !== u.email ? u.full_name : "—"}</td>
                    <td className={tdClass}>
                      {u.client_name ? (
                        <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
                          {u.client_name}
                        </span>
                      ) : (
                        <span className="text-foreground-muted text-xs">Non associ\u00e9</span>
                      )}
                    </td>
                    <td className={`${tdClass} text-foreground-muted`}>
                      {new Date(u.created_at).toLocaleDateString("fr-FR")}
                    </td>
                    <td className={`${tdClass} text-right`}>
                      <button
                        onClick={() => setDeleteTarget({ type: "user", id: u.user_id, label: u.email })}
                        className="p-1.5 text-foreground-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-foreground-muted text-sm">
                      {t("b2bAdmin.noB2BUser", "Aucun utilisateur B2B")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Reimbursements Config Table ── */}
      {tab === "reimbursements" && (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-3">
            <Euro className="w-5 h-5" style={{ color: "#2ECC71" }} />
            <h3 className="text-sm font-heading font-bold text-foreground">{t("b2bAdmin.reimbursementConfig", "Configuration des remboursements par client")}</h3>
          </div>
          {loadingConfigs ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-surface-elevated rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className={thClass}>Client</th>
                    <th className={`${thClass} text-right`}>{t("b2bAdmin.ratePerKwh", "Taux / kWh")}</th>
                    <th className={`${thClass} text-right`}>{t("b2bAdmin.monthlyCeiling", "Plafond mensuel")}</th>
                    <th className={`${thClass} text-center`}>{t("b2bAdmin.autoApproval", "Approbation auto")}</th>
                    <th className={`${thClass} text-center`}>Statut</th>
                    <th className={`${thClass} text-center`}>{t("b2bAdmin.billingDay", "Jour facturation")}</th>
                    <th className={`${thClass} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(reimbursementConfigs ?? []).map((cfg) => {
                    const clientName = (clients ?? []).find((c) => c.id === cfg.b2b_client_id)?.name ?? cfg.b2b_client_id;
                    return (
                      <tr key={cfg.id} className="border-b border-border/50 hover:bg-surface-elevated/50 transition-colors">
                        <td className={`${tdClass} font-medium`}>
                          <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-medium">
                            {clientName}
                          </span>
                        </td>
                        <td className={`${tdClass} text-right font-mono`}>{cfg.rate_per_kwh.toFixed(2)} EUR</td>
                        <td className={`${tdClass} text-right font-mono`}>
                          {cfg.max_monthly_amount != null ? `${cfg.max_monthly_amount.toFixed(0)} EUR` : "—"}
                        </td>
                        <td className={`${tdClass} text-center`}>
                          {cfg.payment_method === "auto" ? (
                            <CheckCircle className="w-4 h-4 text-green-400 inline" />
                          ) : (
                            <XCircle className="w-4 h-4 text-foreground-muted inline" />
                          )}
                        </td>
                        <td className={`${tdClass} text-center`}>
                          {cfg.enabled ? (
                            <span className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border-emerald-500/25">
                              {t("common.active")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-xs font-semibold bg-red-500/10 text-red-400 border-red-500/25">
                              {t("common.inactive")}
                            </span>
                          )}
                        </td>
                        <td className={`${tdClass} text-center font-mono`}>{cfg.billing_day}</td>
                        <td className={`${tdClass} text-right`}>
                          <button
                            onClick={() => {
                              setEditingConfig(cfg);
                              setConfigForm({
                                rate_per_kwh: String(cfg.rate_per_kwh),
                                max_monthly_amount: cfg.max_monthly_amount != null ? String(cfg.max_monthly_amount) : "",
                                enabled: cfg.enabled,
                                payment_method: cfg.payment_method,
                                billing_day: String(cfg.billing_day),
                              });
                              setShowEditConfig(true);
                            }}
                            className="p-1.5 text-foreground-muted hover:text-foreground hover:bg-surface-elevated rounded-lg transition-colors"
                            title="Modifier"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {(reimbursementConfigs ?? []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-foreground-muted text-sm">
                        {t("b2bAdmin.noReimbursementConfig", "Aucune configuration de remboursement")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Create User SlideOver ── */}
      <SlideOver
        open={showCreateUser}
        onClose={() => setShowCreateUser(false)}
        title="Cr\u00e9er un compte B2B"
        subtitle="Le compte sera imm\u00e9diatement utilisable"
      >
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Client B2B *</label>
            <select
              value={userForm.clientId}
              onChange={(e) => setUserForm((f) => ({ ...f, clientId: e.target.value }))}
              className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground focus:border-border-focus focus:outline-none"
            >
              <option value="">S\u00e9lectionner un client</option>
              {(clients ?? []).filter((c) => c.is_active).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Email *</label>
            <input
              type="email"
              value={userForm.email}
              onChange={(e) => setUserForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="utilisateur@client.fr"
              className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted focus:border-border-focus focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Nom complet</label>
            <input
              type="text"
              value={userForm.fullName}
              onChange={(e) => setUserForm((f) => ({ ...f, fullName: e.target.value }))}
              placeholder="Jean Dupont"
              className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted focus:border-border-focus focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Mot de passe *</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showPassword ? "text" : "password"}
                  value={userForm.password}
                  onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full px-3 py-2.5 pr-20 bg-surface-elevated border border-border rounded-xl text-sm text-foreground font-mono focus:border-border-focus focus:outline-none"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1.5 text-foreground-muted hover:text-foreground rounded-lg transition-colors"
                    title={showPassword ? "Masquer" : "Afficher"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(userForm.password); toastSuccess("Copi\u00e9 !"); }}
                    className="p-1.5 text-foreground-muted hover:text-foreground rounded-lg transition-colors"
                    title="Copier"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUserForm((f) => ({ ...f, password: generatePassword() }))}
                className="px-3 py-2.5 text-xs bg-surface-elevated border border-border rounded-xl text-foreground-muted hover:text-foreground transition-colors whitespace-nowrap"
              >
                G\u00e9n\u00e9rer
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-border flex justify-end gap-3">
            <button
              onClick={() => setShowCreateUser(false)}
              className="px-4 py-2.5 text-sm text-foreground-muted hover:text-foreground border border-border rounded-xl transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleCreateUser}
              disabled={createUser.isPending}
              className="px-5 py-2.5 text-sm font-semibold bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {createUser.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Cr\u00e9er le compte
            </button>
          </div>
        </div>
      </SlideOver>

      {/* ── Edit Client SlideOver ── */}
      <SlideOver
        open={showEditClient}
        onClose={() => { setShowEditClient(false); setEditingClient(null); }}
        title={`Modifier — ${editingClient?.name ?? ""}`}
      >
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Nom *</label>
            <input
              type="text"
              value={clientForm.name}
              onChange={(e) => setClientForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground focus:border-border-focus focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Slug *</label>
            <input
              type="text"
              value={clientForm.slug}
              onChange={(e) => setClientForm((f) => ({ ...f, slug: e.target.value }))}
              className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground font-mono focus:border-border-focus focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Customer External IDs <span className="text-foreground-muted font-normal">(s\u00e9par\u00e9s par virgule)</span>
            </label>
            <input
              type="text"
              value={clientForm.customer_external_ids}
              onChange={(e) => setClientForm((f) => ({ ...f, customer_external_ids: e.target.value }))}
              className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground focus:border-border-focus focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Taux de redevance</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={clientForm.redevance_rate}
                onChange={(e) => setClientForm((f) => ({ ...f, redevance_rate: e.target.value }))}
                className="w-32 px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground font-mono focus:border-border-focus focus:outline-none"
              />
              <span className="text-sm text-foreground-muted">
                = {((parseFloat(clientForm.redevance_rate) || 0) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-foreground">Actif</label>
            <button
              type="button"
              onClick={() => setClientForm((f) => ({ ...f, is_active: !f.is_active }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                clientForm.is_active ? "bg-primary" : "bg-surface-elevated border border-border"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  clientForm.is_active ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="pt-4 border-t border-border flex justify-end gap-3">
            <button
              onClick={() => { setShowEditClient(false); setEditingClient(null); }}
              className="px-4 py-2.5 text-sm text-foreground-muted hover:text-foreground border border-border rounded-xl transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleSaveClient}
              disabled={updateClient.isPending}
              className="px-5 py-2.5 text-sm font-semibold bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {updateClient.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("common.save")}
            </button>
          </div>
        </div>
      </SlideOver>

      {/* ── Create Client SlideOver ── */}
      <SlideOver
        open={showCreateClient}
        onClose={() => setShowCreateClient(false)}
        title={t("b2bAdmin.addB2BClient", "Ajouter un client B2B")}
      >
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Nom *</label>
            <input
              type="text"
              value={newClientForm.name}
              onChange={(e) => setNewClientForm((f) => ({ ...f, name: e.target.value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-") }))}
              placeholder="ORANGE"
              className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted focus:border-border-focus focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Slug</label>
            <input
              type="text"
              value={newClientForm.slug}
              onChange={(e) => setNewClientForm((f) => ({ ...f, slug: e.target.value }))}
              className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground font-mono focus:border-border-focus focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Customer External IDs * <span className="text-foreground-muted font-normal">(s\u00e9par\u00e9s par virgule)</span>
            </label>
            <input
              type="text"
              value={newClientForm.customer_external_ids}
              onChange={(e) => setNewClientForm((f) => ({ ...f, customer_external_ids: e.target.value }))}
              placeholder="Employ\u00e9s Orange, ORANGE"
              className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground placeholder:text-foreground-muted focus:border-border-focus focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Taux de redevance</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={newClientForm.redevance_rate}
                onChange={(e) => setNewClientForm((f) => ({ ...f, redevance_rate: e.target.value }))}
                className="w-32 px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground font-mono focus:border-border-focus focus:outline-none"
              />
              <span className="text-sm text-foreground-muted">
                = {((parseFloat(newClientForm.redevance_rate) || 0) * 100).toFixed(0)}%
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-border flex justify-end gap-3">
            <button
              onClick={() => setShowCreateClient(false)}
              className="px-4 py-2.5 text-sm text-foreground-muted hover:text-foreground border border-border rounded-xl transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={handleCreateClient}
              disabled={createClient.isPending}
              className="px-5 py-2.5 text-sm font-semibold bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {createClient.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Cr\u00e9er le client
            </button>
          </div>
        </div>
      </SlideOver>

      {/* ── Edit Reimbursement Config SlideOver ── */}
      <SlideOver
        open={showEditConfig}
        onClose={() => { setShowEditConfig(false); setEditingConfig(null); }}
        title={`Remboursement — ${editingConfig ? ((clients ?? []).find((c) => c.id === editingConfig.b2b_client_id)?.name ?? "") : ""}`}
      >
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Taux par kWh (EUR)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={configForm.rate_per_kwh}
              onChange={(e) => setConfigForm((f) => ({ ...f, rate_per_kwh: e.target.value }))}
              className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground font-mono focus:border-border-focus focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Plafond mensuel (EUR) <span className="text-foreground-muted font-normal">— vide = illimité</span>
            </label>
            <input
              type="number"
              step="1"
              min="0"
              value={configForm.max_monthly_amount}
              onChange={(e) => setConfigForm((f) => ({ ...f, max_monthly_amount: e.target.value }))}
              placeholder="Illimité"
              className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground font-mono placeholder:text-foreground-muted focus:border-border-focus focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Méthode de paiement</label>
            <select
              value={configForm.payment_method}
              onChange={(e) => setConfigForm((f) => ({ ...f, payment_method: e.target.value }))}
              className="w-full px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground focus:border-border-focus focus:outline-none"
            >
              <option value="bank_transfer">Virement bancaire</option>
              <option value="auto">Automatique</option>
              <option value="manual">Manuel</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Jour de facturation</label>
            <input
              type="number"
              min="1"
              max="28"
              value={configForm.billing_day}
              onChange={(e) => setConfigForm((f) => ({ ...f, billing_day: e.target.value }))}
              className="w-32 px-3 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm text-foreground font-mono focus:border-border-focus focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-foreground">Actif</label>
            <button
              type="button"
              onClick={() => setConfigForm((f) => ({ ...f, enabled: !f.enabled }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                configForm.enabled ? "bg-primary" : "bg-surface-elevated border border-border"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  configForm.enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="pt-4 border-t border-border flex justify-end gap-3">
            <button
              onClick={() => { setShowEditConfig(false); setEditingConfig(null); }}
              className="px-4 py-2.5 text-sm text-foreground-muted hover:text-foreground border border-border rounded-xl transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              onClick={() => {
                if (!editingConfig) return;
                updateReimbursementConfig.mutate(
                  {
                    b2b_client_id: editingConfig.b2b_client_id,
                    rate_per_kwh: parseFloat(configForm.rate_per_kwh) || 0,
                    max_monthly_amount: configForm.max_monthly_amount ? parseFloat(configForm.max_monthly_amount) : null,
                    enabled: configForm.enabled,
                    payment_method: configForm.payment_method,
                    billing_day: parseInt(configForm.billing_day) || 1,
                  },
                  {
                    onSuccess: () => {
                      toastSuccess("Configuration mise à jour");
                      setShowEditConfig(false);
                      setEditingConfig(null);
                    },
                    onError: (err) => toastError(t("common.error", "Erreur"), err.message),
                  }
                );
              }}
              disabled={updateReimbursementConfig.isPending}
              className="px-5 py-2.5 text-sm font-semibold bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {updateReimbursementConfig.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {t("common.save")}
            </button>
          </div>
        </div>
      </SlideOver>

      {/* ── Delete Confirmation ── */}
      <ConfirmDialog
        open={!!deleteTarget}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
        title={deleteTarget?.type === "user" ? "Supprimer l'utilisateur ?" : "Supprimer le client ?"}
        description={`${deleteTarget?.label ?? ""} sera d\u00e9finitivement supprim\u00e9.`}
        confirmLabel="Supprimer"
        variant="danger"
        loading={deleteUser.isPending || deleteClient.isPending}
      />
    </div>
  );
}
