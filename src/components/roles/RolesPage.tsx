// ============================================================
// EZDrive — Roles & Permissions (RBAC) Page
// Manage admin roles, permissions and user groups
// ============================================================

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  Plus,
  Users,
  Trash2,
  Check,
  X,
  Pencil,
  ChevronDown,
  Settings,
  FileText,
  Globe,
  Radio,
  Lock,
  Copy,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/contexts/ToastContext";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SlideOver } from "@/components/ui/SlideOver";
import { KPICard } from "@/components/ui/KPICard";
import { PageHelp } from "@/components/ui/PageHelp";
import { useTranslation } from "react-i18next";

// ── Types ─────────────────────────────────────────────────────

interface Role {
  id: string;
  name: string;
  description: string;
  color: string;
  permissions: string[];
  user_count: number;
  is_system: boolean;
  created_at: string;
}

interface UserGroup {
  id: string;
  name: string;
  description: string;
  role_id: string;
  role_name: string;
  member_count: number;
  created_at: string;
}

// ── Permission definitions ────────────────────────────────────

const PERMISSION_GROUPS = [
  {
    id: "stations",
    label: "Bornes & CPO",
    icon: Radio,
    permissions: [
      { key: "stations.view", label: "Voir les bornes" },
      { key: "stations.edit", label: "Modifier les bornes" },
      { key: "stations.commands", label: "Envoyer des commandes OCPP" },
      { key: "stations.maintenance", label: "Gérer la maintenance" },
    ],
  },
  {
    id: "customers",
    label: "Clients eMSP",
    icon: Users,
    permissions: [
      { key: "customers.view", label: "Voir les clients" },
      { key: "customers.edit", label: "Modifier les clients" },
      { key: "customers.delete", label: "Supprimer les clients" },
      { key: "customers.coupons", label: "Gérer les coupons" },
    ],
  },
  {
    id: "billing",
    label: "Facturation",
    icon: FileText,
    permissions: [
      { key: "billing.view", label: "Voir les factures" },
      { key: "billing.generate", label: "Générer des factures" },
      { key: "billing.export", label: "Exporter les données" },
      { key: "billing.tariffs", label: "Modifier les tarifs" },
    ],
  },
  {
    id: "integrations",
    label: "Intégrations",
    icon: Globe,
    permissions: [
      { key: "ocpi.view", label: "Voir les connexions OCPI" },
      { key: "ocpi.manage", label: "Gérer le roaming" },
      { key: "sync.trigger", label: "Déclencher la synchronisation" },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    icon: Settings,
    permissions: [
      { key: "admin.users", label: "Gérer les utilisateurs" },
      { key: "admin.roles", label: "Gérer les rôles" },
      { key: "admin.settings", label: "Modifier les paramètres" },
      { key: "admin.logs", label: "Voir les logs système" },
    ],
  },
];

// ── Empty form defaults ──────────────────────────────────────

const EMPTY_ROLE_FORM = {
  name: "",
  description: "",
  color: "#8892B0",
  permissions: [] as string[],
};

const EMPTY_GROUP_FORM = {
  name: "",
  description: "",
  role_id: "",
};

// ── Role card component ───────────────────────────────────────

function RoleCard({
  role,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onClone,
  isCloning,
}: {
  role: Role;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClone: () => void;
  isCloning: boolean;
}) {
  const { t } = useTranslation();
  const totalPerms = PERMISSION_GROUPS.flatMap((g) => g.permissions).length;
  const grantedPerms = role.permissions.length;
  const pct = Math.round((grantedPerms / totalPerms) * 100);

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden transition-all hover:border-opacity-80">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-5 text-left"
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${role.color}15` }}
        >
          <Shield className="w-5 h-5" style={{ color: role.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{role.name}</h3>
            {role.is_system && (
              <span className="px-1.5 py-0.5 bg-foreground-muted/10 text-foreground-muted text-[10px] font-semibold rounded">
                {t("admin.roles.systemRole")}
              </span>
            )}
          </div>
          <p className="text-xs text-foreground-muted mt-0.5 line-clamp-1">
            {role.description}
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-foreground">{role.user_count}</p>
            <p className="text-[10px] text-foreground-muted">{t("nav.users", "utilisateurs")}</p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-foreground">{grantedPerms}/{totalPerms}</p>
            <p className="text-[10px] text-foreground-muted">{t("admin.roles.permissions")}</p>
          </div>
          <ChevronDown
            className={cn(
              "w-4 h-4 text-foreground-muted transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Expanded permissions */}
      {isExpanded && (
        <div className="border-t border-border px-5 py-4 space-y-4">
          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-surface-elevated rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: role.color }}
              />
            </div>
            <span className="text-xs text-foreground-muted font-semibold">{pct}%</span>
          </div>

          {/* Permission groups */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PERMISSION_GROUPS.map((group) => (
              <div key={group.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <group.icon className="w-3.5 h-3.5 text-foreground-muted" />
                  <span className="text-xs font-semibold text-foreground-muted uppercase tracking-wider">
                    {group.label}
                  </span>
                </div>
                <div className="space-y-1">
                  {group.permissions.map((perm) => {
                    const granted = role.permissions.includes(perm.key);
                    return (
                      <div
                        key={perm.key}
                        className="flex items-center gap-2 text-xs"
                      >
                        {granted ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <X className="w-3.5 h-3.5 text-foreground-muted/30 shrink-0" />
                        )}
                        <span
                          className={cn(
                            granted ? "text-foreground" : "text-foreground-muted/40"
                          )}
                        >
                          {perm.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground-muted hover:text-foreground bg-surface-elevated border border-border rounded-lg transition-colors"
            >
              <Pencil className="w-3 h-3" />
              {t("common.edit")}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onClone(); }}
              disabled={isCloning}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground-muted hover:text-foreground bg-surface-elevated border border-border rounded-lg transition-colors disabled:opacity-50"
              title="Dupliquer ce rôle"
            >
              <Copy className="w-3 h-3" />
              {t("rolesPage.duplicate", "Dupliquer")}
            </button>
            {role.is_system ? (
              <button
                disabled
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground-muted/30 bg-surface-elevated border border-border rounded-lg cursor-not-allowed"
                title="Les rôles système ne peuvent pas être supprimés"
              >
                <Trash2 className="w-3 h-3" />
                {t("common.delete")}
              </button>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/5 border border-red-500/20 rounded-lg transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                {t("common.delete")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export function RolesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const [activeTab, setActiveTab] = useState<"roles" | "groups">("roles");
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  // ── Role modal state ──
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState(EMPTY_ROLE_FORM);

  // ── Group modal state ──
  const [modalGroupOpen, setModalGroupOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<UserGroup | null>(null);
  const [groupForm, setGroupForm] = useState(EMPTY_GROUP_FORM);

  // ── Confirm delete state ──
  const [confirmDeleteRole, setConfirmDeleteRole] = useState<Role | null>(null);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<UserGroup | null>(null);

  // ── Data fetching ──
  const { data: roles, isLoading: rolesLoading } = useQuery<Role[]>({
    queryKey: ["roles"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("admin_roles")
          .select("*")
          .order("created_at", { ascending: true });
        if (error) {
          console.warn("[RolesPage] admin_roles error:", error.message);
          return [];
        }
        return (data as Role[]) ?? [];
      } catch {
        return [];
      }
    },
  });

  const { data: groups, isLoading: groupsLoading } = useQuery<UserGroup[]>({
    queryKey: ["user-groups"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("user_groups")
          .select("*")
          .order("created_at", { ascending: true });
        if (error) {
          console.warn("[RolesPage] user_groups error:", error.message);
          return [];
        }
        return (data as UserGroup[]) ?? [];
      } catch {
        return [];
      }
    },
  });

  // ── Role mutations ──
  const createRoleMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_ROLE_FORM) => {
      const { data: result, error } = await supabase
        .from("admin_roles")
        .insert({
          name: data.name.trim(),
          description: data.description.trim(),
          color: data.color,
          permissions: data.permissions,
          is_system: false,
          user_count: 0,
        })
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      closeRoleModal();
      toastSuccess(t("rolesPage.roleCreated", "Rôle créé"), t("rolesPage.roleCreatedDesc", "Le rôle a été ajouté avec succès"));
    },
    onError: (error: Error) => {
      toastError(t("common.error", "Erreur"), error.message || t("common.error"));
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & typeof EMPTY_ROLE_FORM) => {
      const { data: result, error } = await supabase
        .from("admin_roles")
        .update({
          name: data.name.trim(),
          description: data.description.trim(),
          color: data.color,
          permissions: data.permissions,
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      closeRoleModal();
      toastSuccess(t("rolesPage.roleUpdated", "Rôle modifié"), t("rolesPage.roleUpdatedDesc", "Les modifications ont été enregistrées"));
    },
    onError: (error: Error) => {
      toastError(t("common.error", "Erreur"), error.message || t("common.error"));
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("admin_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      setConfirmDeleteRole(null);
      toastSuccess(t("rolesPage.roleDeleted", "Rôle supprimé"));
    },
    onError: (error: Error) => {
      setConfirmDeleteRole(null);
      toastError(t("common.error", "Erreur"), error.message || t("common.error"));
    },
  });

  // ── Clone role mutation ──
  const cloneRoleMutation = useMutation({
    mutationFn: async (role: Role) => {
      const { data: result, error } = await supabase
        .from("admin_roles")
        .insert({
          name: `Copie de ${role.name}`,
          description: role.description,
          color: role.color,
          permissions: role.permissions,
          is_system: false,
          user_count: 0,
        })
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      toastSuccess(t("rolesPage.roleDuplicated", "Rôle dupliqué"), t("rolesPage.roleDuplicatedDesc", "Le rôle a été dupliqué avec succès"));
    },
    onError: (error: Error) => {
      toastError(t("common.error", "Erreur"), error.message || t("common.error"));
    },
  });

  // ── Group mutations ──
  const createGroupMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_GROUP_FORM) => {
      const { data: result, error } = await supabase
        .from("user_groups")
        .insert({
          name: data.name.trim(),
          description: data.description.trim(),
          role_id: data.role_id,
          member_count: 0,
        })
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-groups"] });
      closeGroupModal();
      toastSuccess(t("rolesPage.groupCreated", "Groupe créé"), t("rolesPage.groupCreatedDesc", "Le groupe a été ajouté avec succès"));
    },
    onError: (error: Error) => {
      toastError(t("common.error", "Erreur"), error.message || t("common.error"));
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & typeof EMPTY_GROUP_FORM) => {
      const { data: result, error } = await supabase
        .from("user_groups")
        .update({
          name: data.name.trim(),
          description: data.description.trim(),
          role_id: data.role_id,
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-groups"] });
      closeGroupModal();
      toastSuccess(t("rolesPage.groupUpdated", "Groupe modifié"));
    },
    onError: (error: Error) => {
      toastError(t("common.error", "Erreur"), error.message || t("common.error"));
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-groups"] });
      setConfirmDeleteGroup(null);
      toastSuccess(t("rolesPage.groupDeleted", "Groupe supprimé"));
    },
    onError: (error: Error) => {
      setConfirmDeleteGroup(null);
      toastError(t("common.error", "Erreur"), error.message || t("common.error"));
    },
  });

  // ── Role modal helpers ──
  function openCreateRole() {
    setEditingRole(null);
    setRoleForm(EMPTY_ROLE_FORM);
    setModalOpen(true);
  }

  function openEditRole(role: Role) {
    setEditingRole(role);
    setRoleForm({
      name: role.name,
      description: role.description,
      color: role.color,
      permissions: [...role.permissions],
    });
    setModalOpen(true);
  }

  function closeRoleModal() {
    setModalOpen(false);
    setEditingRole(null);
    setRoleForm(EMPTY_ROLE_FORM);
  }

  function handleRoleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingRole) {
      updateRoleMutation.mutate({ id: editingRole.id, ...roleForm });
    } else {
      createRoleMutation.mutate(roleForm);
    }
  }

  function togglePermission(key: string) {
    setRoleForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((p) => p !== key)
        : [...f.permissions, key],
    }));
  }

  function toggleGroupPermissions(groupId: string) {
    const group = PERMISSION_GROUPS.find((g) => g.id === groupId);
    if (!group) return;
    const groupKeys = group.permissions.map((p) => p.key);
    const allSelected = groupKeys.every((k) => roleForm.permissions.includes(k));
    setRoleForm((f) => ({
      ...f,
      permissions: allSelected
        ? f.permissions.filter((p) => !groupKeys.includes(p))
        : [...new Set([...f.permissions, ...groupKeys])],
    }));
  }

  // ── Group modal helpers ──
  function openCreateGroup() {
    setEditingGroup(null);
    setGroupForm(EMPTY_GROUP_FORM);
    setModalGroupOpen(true);
  }

  function openEditGroup(group: UserGroup) {
    setEditingGroup(group);
    setGroupForm({
      name: group.name,
      description: group.description,
      role_id: group.role_id,
    });
    setModalGroupOpen(true);
  }

  function closeGroupModal() {
    setModalGroupOpen(false);
    setEditingGroup(null);
    setGroupForm(EMPTY_GROUP_FORM);
  }

  function handleGroupSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingGroup) {
      updateGroupMutation.mutate({ id: editingGroup.id, ...groupForm });
    } else {
      createGroupMutation.mutate(groupForm);
    }
  }

  const isLoading = rolesLoading || groupsLoading;
  const rolesList = roles ?? [];
  const groupsList = groups ?? [];

  // ── KPIs ──
  const stats = useMemo(() => {
    const rl = roles ?? [];
    const gl = groups ?? [];
    return {
      totalRoles: rl.length,
      totalGroups: gl.length,
      totalUsers: rl.reduce((s, r) => s + r.user_count, 0),
      totalPermissions: PERMISSION_GROUPS.flatMap((g) => g.permissions).length,
    };
  }, [roles, groups]);

  // Helper to resolve role name for a group
  function getRoleName(roleId: string): string {
    const role = rolesList.find((r) => r.id === roleId);
    return role?.name ?? "\u2014";
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-foreground">
            {t("admin.roles.title")}
          </h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            {t("rolesPage.rbacSubtitle", "Gestion des accès et contrôle RBAC")}
          </p>
        </div>
        {activeTab === "roles" ? (
          <button
            onClick={openCreateRole}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t("rolesPage.newRole", "Nouveau rôle")}
          </button>
        ) : (
          <button
            onClick={openCreateGroup}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t("rolesPage.newGroup", "Nouveau groupe")}
          </button>
        )}
      </div>

      <PageHelp
        summary="Configuration des rôles et permissions pour les utilisateurs du back-office"
        items={[
          { label: "Rôle", description: "Ensemble de permissions définissant ce qu'un utilisateur peut voir et faire dans l'application." },
          { label: "Permissions", description: "Actions autorisées : lecture, création, modification, suppression, export, etc." },
          { label: "Assignation", description: "Chaque utilisateur a un seul rôle qui détermine ses droits d'accès." },
          { label: "Hiérarchie", description: "Admin > Opérateur > Lecteur. Chaque niveau inclut les permissions du niveau inférieur." },
        ]}
      />

      {/* KPIs */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-2xl p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="w-12 h-12 rounded-xl" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-6 w-12" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label={t("rolesPage.definedRoles", "Rôles définis")} value={stats.totalRoles} icon={Shield} color="#EF4444" />
          <KPICard label={t("rolesPage.groups", "Groupes")} value={stats.totalGroups} icon={Users} color="#60A5FA" />
          <KPICard label={t("nav.users")} value={stats.totalUsers} icon={Users} color="#34D399" />
          <KPICard label={t("admin.roles.permissions")} value={stats.totalPermissions} icon={Lock} color="#FBBF24" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab("roles")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors",
            activeTab === "roles"
              ? "bg-primary/15 text-primary"
              : "text-foreground-muted hover:text-foreground hover:bg-surface-elevated"
          )}
        >
          <Shield className="w-3.5 h-3.5" />
          {t("nav.roles")} ({rolesList.length})
        </button>
        <button
          onClick={() => setActiveTab("groups")}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors",
            activeTab === "groups"
              ? "bg-primary/15 text-primary"
              : "text-foreground-muted hover:text-foreground hover:bg-surface-elevated"
          )}
        >
          <Users className="w-3.5 h-3.5" />
          {t("rolesPage.groups", "Groupes")} ({groupsList.length})
        </button>
      </div>

      {/* Content */}
      {activeTab === "roles" ? (
        <div className="space-y-3">
          {rolesList.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center h-56 bg-surface border border-border rounded-2xl">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Shield className="w-7 h-7 text-primary" />
              </div>
              <p className="text-foreground font-medium text-lg">{t("rolesPage.noRole", "Aucun rôle")}</p>
              <p className="text-sm text-foreground-muted mt-1">
                {t("rolesPage.createFirstRole", "Créez votre premier rôle pour gérer les permissions d'accès.")}
              </p>
              <button
                onClick={openCreateRole}
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t("rolesPage.newRole", "Nouveau rôle")}
              </button>
            </div>
          ) : (
            rolesList.map((role) => (
              <RoleCard
                key={role.id}
                role={role}
                isExpanded={expandedRole === role.id}
                onToggle={() =>
                  setExpandedRole((prev) => (prev === role.id ? null : role.id))
                }
                onEdit={() => openEditRole(role)}
                onDelete={() => setConfirmDeleteRole(role)}
                onClone={() => cloneRoleMutation.mutate(role)}
                isCloning={cloneRoleMutation.isPending}
              />
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {groupsList.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center h-56 bg-surface border border-border rounded-2xl">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Users className="w-7 h-7 text-primary" />
              </div>
              <p className="text-foreground font-medium text-lg">{t("rolesPage.noGroup", "Aucun groupe")}</p>
              <p className="text-sm text-foreground-muted mt-1">
                {t("rolesPage.createFirstGroup", "Créez des groupes pour organiser vos utilisateurs par équipe ou région.")}
              </p>
              <button
                onClick={openCreateGroup}
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {t("rolesPage.newGroup", "Nouveau groupe")}
              </button>
            </div>
          ) : (
            groupsList.map((group) => (
              <div
                key={group.id}
                className="bg-surface border border-border rounded-2xl p-5 flex items-center gap-4 hover:border-opacity-80 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">{group.name}</h3>
                  <p className="text-xs text-foreground-muted">{group.description}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface-elevated border border-border text-xs font-semibold text-foreground-muted">
                  <Shield className="w-3 h-3" />
                  {group.role_name || getRoleName(group.role_id)}
                </span>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">{group.member_count}</p>
                  <p className="text-[10px] text-foreground-muted">{t("b2b.members", "membres")}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEditGroup(group)}
                    className="p-1.5 text-foreground-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                    title="Modifier"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteGroup(group)}
                    className="p-1.5 text-foreground-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Role Create / Edit SlideOver ── */}
      <SlideOver
        open={modalOpen}
        onClose={closeRoleModal}
        title={editingRole ? t("rolesPage.editRole", "Modifier le rôle") : t("rolesPage.newRole", "Nouveau rôle")}
      >
        <form onSubmit={handleRoleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Nom *</label>
            <input
              required
              value={roleForm.name}
              onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Superviseur"
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Description</label>
            <textarea
              value={roleForm.description}
              onChange={(e) => setRoleForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="Description du rôle et de ses responsabilités..."
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 resize-none"
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Couleur</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={roleForm.color}
                onChange={(e) => setRoleForm((f) => ({ ...f, color: e.target.value }))}
                className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent"
              />
              <input
                value={roleForm.color}
                onChange={(e) => setRoleForm((f) => ({ ...f, color: e.target.value }))}
                placeholder="#8892B0"
                className="flex-1 px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground font-mono placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          {/* Permissions */}
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-foreground-muted mb-3 uppercase tracking-wider">{t("admin.roles.permissions")}</p>
            <div className="space-y-4">
              {PERMISSION_GROUPS.map((group) => {
                const groupKeys = group.permissions.map((p) => p.key);
                const allSelected = groupKeys.every((k) => roleForm.permissions.includes(k));
                const someSelected = groupKeys.some((k) => roleForm.permissions.includes(k));
                return (
                  <div key={group.id} className="bg-surface-elevated border border-border rounded-xl p-4 space-y-2.5">
                    <button
                      type="button"
                      onClick={() => toggleGroupPermissions(group.id)}
                      className="flex items-center gap-2 w-full text-left"
                    >
                      <div
                        className={cn(
                          "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                          allSelected
                            ? "bg-primary border-primary"
                            : someSelected
                              ? "bg-primary/30 border-primary/50"
                              : "border-border bg-surface"
                        )}
                      >
                        {(allSelected || someSelected) && (
                          <Check className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <group.icon className="w-4 h-4 text-foreground-muted" />
                      <span className="text-xs font-semibold text-foreground">{group.label}</span>
                      <span className="text-[10px] text-foreground-muted ml-auto">
                        {groupKeys.filter((k) => roleForm.permissions.includes(k)).length}/{groupKeys.length}
                      </span>
                    </button>
                    <div className="ml-6 space-y-1.5">
                      {group.permissions.map((perm) => {
                        const checked = roleForm.permissions.includes(perm.key);
                        return (
                          <label
                            key={perm.key}
                            className="flex items-center gap-2 cursor-pointer group/perm"
                          >
                            <div
                              className={cn(
                                "w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors",
                                checked
                                  ? "bg-primary border-primary"
                                  : "border-border bg-surface group-hover/perm:border-foreground-muted"
                              )}
                            >
                              {checked && <Check className="w-2.5 h-2.5 text-white" />}
                            </div>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePermission(perm.key)}
                              className="sr-only"
                            />
                            <span className="text-xs text-foreground-muted group-hover/perm:text-foreground transition-colors">
                              {perm.label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Errors */}
          {(createRoleMutation.error || updateRoleMutation.error) && (
            <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-sm text-red-400">
              {((createRoleMutation.error || updateRoleMutation.error) as Error)?.message}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeRoleModal}
              className="px-4 py-2 text-sm text-foreground-muted hover:text-foreground border border-border rounded-xl transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={createRoleMutation.isPending || updateRoleMutation.isPending}
              className="px-5 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {createRoleMutation.isPending || updateRoleMutation.isPending
                ? "..."
                : editingRole
                  ? "Enregistrer"
                  : "Créer"}
            </button>
          </div>
        </form>
      </SlideOver>

      {/* ── Group Create / Edit SlideOver ── */}
      <SlideOver
        open={modalGroupOpen}
        onClose={closeGroupModal}
        title={editingGroup ? t("rolesPage.editGroup", "Modifier le groupe") : t("rolesPage.newGroup", "Nouveau groupe")}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleGroupSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Nom *</label>
            <input
              required
              value={groupForm.name}
              onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Équipe Antilles"
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Description</label>
            <textarea
              value={groupForm.description}
              onChange={(e) => setGroupForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
              placeholder="Description du groupe..."
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 resize-none"
            />
          </div>

          {/* Role dropdown */}
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Rôle associé *</label>
            <select
              required
              value={groupForm.role_id}
              onChange={(e) => setGroupForm((f) => ({ ...f, role_id: e.target.value }))}
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
            >
              <option value="">{t("rolesPage.selectRole", "Sélectionner un rôle...")}</option>
              {rolesList.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>

          {/* Errors */}
          {(createGroupMutation.error || updateGroupMutation.error) && (
            <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-sm text-red-400">
              {((createGroupMutation.error || updateGroupMutation.error) as Error)?.message}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeGroupModal}
              className="px-4 py-2 text-sm text-foreground-muted hover:text-foreground border border-border rounded-xl transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={createGroupMutation.isPending || updateGroupMutation.isPending}
              className="px-5 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {createGroupMutation.isPending || updateGroupMutation.isPending
                ? "..."
                : editingGroup
                  ? "Enregistrer"
                  : "Créer"}
            </button>
          </div>
        </form>
      </SlideOver>

      {/* ── Confirm Delete Role Dialog ── */}
      <ConfirmDialog
        open={!!confirmDeleteRole}
        onConfirm={() => {
          if (confirmDeleteRole) {
            deleteRoleMutation.mutate(confirmDeleteRole.id);
          }
        }}
        onCancel={() => setConfirmDeleteRole(null)}
        title={t("rolesPage.deleteRoleTitle", "Supprimer ce rôle ?")}
        description={confirmDeleteRole ? `Le rôle "${confirmDeleteRole.name}" sera définitivement supprimé. Cette action est irréversible.` : ""}
        confirmLabel={t("common.delete")}
        variant="danger"
        loading={deleteRoleMutation.isPending}
      />

      {/* ── Confirm Delete Group Dialog ── */}
      <ConfirmDialog
        open={!!confirmDeleteGroup}
        onConfirm={() => {
          if (confirmDeleteGroup) {
            deleteGroupMutation.mutate(confirmDeleteGroup.id);
          }
        }}
        onCancel={() => setConfirmDeleteGroup(null)}
        title={t("rolesPage.deleteGroupTitle", "Supprimer ce groupe ?")}
        description={confirmDeleteGroup ? `Le groupe "${confirmDeleteGroup.name}" sera définitivement supprimé. Cette action est irréversible.` : ""}
        confirmLabel={t("common.delete")}
        variant="danger"
        loading={deleteGroupMutation.isPending}
      />
    </div>
  );
}
