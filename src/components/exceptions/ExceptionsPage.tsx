// ============================================================
// EZDrive — Exception Groups & Authorization Rules Page
// Manage whitelist/blacklist rules for drivers & tokens
// ============================================================

import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldAlert,
  Plus,
  Users,
  KeyRound,
  Radio,
  Trash2,
  ChevronDown,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Filter,
  Clock,
  Pencil,
  Upload,
  FileSpreadsheet,
  Loader2,
  X,
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

interface ExceptionRule {
  id: string;
  group_id: string | null;
  name: string;
  type: "whitelist" | "blacklist" | "override";
  scope: "driver" | "token" | "station";
  description: string;
  conditions: string[];
  items_count: number;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

interface ExceptionGroup {
  id: string;
  name: string;
  description: string;
  organization: "emsp" | "cpo";
  category: "drivers" | "tokens" | "stations";
  rules_count: number;
  items_count: number;
  is_active: boolean;
  created_at: string;
}

// ── Empty form defaults ──────────────────────────────────────

const EMPTY_GROUP_FORM = {
  name: "",
  description: "",
  organization: "emsp" as "emsp" | "cpo",
  category: "drivers" as "drivers" | "tokens" | "stations",
  is_active: true,
};

const EMPTY_RULE_FORM = {
  name: "",
  description: "",
  type: "whitelist" as "whitelist" | "blacklist" | "override",
  scope: "driver" as "driver" | "token" | "station",
  priority: 0,
  group_id: "",
  is_active: true,
  conditions: [] as string[],
};

// ── Rule type badge ───────────────────────────────────────────

function RuleTypeBadge({ type }: { type: ExceptionRule["type"] }) {
  const config = {
    whitelist: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/25", icon: CheckCircle2, label: "Whitelist" },
    blacklist: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/25", icon: XCircle, label: "Blacklist" },
    override: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/25", icon: AlertTriangle, label: "Override" },
  };
  const c = config[type];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold", c.bg, c.text, c.border)}>
      <c.icon className="w-3 h-3" />
      {c.label}
    </span>
  );
}

// ── Scope badge ───────────────────────────────────────────────

function ScopeBadge({ scope }: { scope: ExceptionRule["scope"] }) {
  const config = {
    driver: { icon: Users, color: "#4ECDC4", label: "Conducteurs" },
    token: { icon: KeyRound, color: "#A78BFA", label: "Tokens" },
    station: { icon: Radio, color: "#FBBF24", label: "Bornes" },
  };
  const c = config[scope];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ backgroundColor: `${c.color}15`, color: c.color }}>
      <c.icon className="w-3 h-3" />
      {c.label}
    </span>
  );
}

// ── Category badge for groups ─────────────────────────────────

function CategoryBadge({ category }: { category: ExceptionGroup["category"] }) {
  const config = {
    drivers: { icon: Users, color: "#4ECDC4" },
    tokens: { icon: KeyRound, color: "#A78BFA" },
    stations: { icon: Radio, color: "#FBBF24" },
  };
  const c = config[category];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold capitalize" style={{ backgroundColor: `${c.color}15`, color: c.color }}>
      <c.icon className="w-3 h-3" />
      {category}
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────

export function ExceptionsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { success: toastSuccess, error: toastError } = useToast();
  const [activeTab, setActiveTab] = useState<"groups" | "rules">("groups");
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  // ── Modal states ──
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ExceptionGroup | null>(null);
  const [groupForm, setGroupForm] = useState(EMPTY_GROUP_FORM);

  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ExceptionRule | null>(null);
  const [ruleForm, setRuleForm] = useState(EMPTY_RULE_FORM);

  // ── ConfirmDialog states ──
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<ExceptionGroup | null>(null);
  const [confirmDeleteRule, setConfirmDeleteRule] = useState<ExceptionRule | null>(null);

  // ── CSV Import states ──
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [_csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<string[]>([]);
  const [csvAllUids, setCsvAllUids] = useState<string[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState<{ created: number; duplicates: number } | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  const parseCsvContent = useCallback((content: string): string[] => {
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];
    // Check if first line is a header (contains "uid" case-insensitive)
    const firstLine = lines[0].toLowerCase();
    const startIndex = firstLine === "uid" || firstLine.includes("uid") ? 1 : 0;
    const uids: string[] = [];
    for (let i = startIndex; i < lines.length; i++) {
      // Take first column if CSV has multiple columns
      const value = lines[i].split(",")[0].trim().replace(/^["']|["']$/g, "");
      if (value) uids.push(value);
    }
    return uids;
  }, []);

  function handleCsvFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setCsvResult(null);
    setCsvError(null);
    if (!file) {
      setCsvFile(null);
      setCsvPreview([]);
      setCsvAllUids([]);
      return;
    }
    setCsvFile(file);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        const uids = parseCsvContent(text);
        if (uids.length === 0) {
          setCsvError("Aucun UID trouvé dans le fichier. Vérifiez le format.");
          setCsvPreview([]);
          setCsvAllUids([]);
          return;
        }
        setCsvAllUids(uids);
        setCsvPreview(uids.slice(0, 5));
        setCsvError(null);
      } catch {
        setCsvError("Erreur de lecture du fichier CSV.");
        setCsvPreview([]);
        setCsvAllUids([]);
      }
    };
    reader.onerror = () => {
      setCsvError("Impossible de lire le fichier.");
    };
    reader.readAsText(file);
  }

  async function handleCsvImport() {
    if (csvAllUids.length === 0) return;
    setCsvImporting(true);
    setCsvError(null);
    setCsvResult(null);
    try {
      const rows = csvAllUids.map((uid) => ({
        uid,
        type: "whitelist" as const,
        status: "active" as const,
        created_at: new Date().toISOString(),
      }));

      // Insert with upsert to handle duplicates gracefully
      const { data, error } = await supabase
        .from("exceptions")
        .upsert(rows, { onConflict: "uid", ignoreDuplicates: true })
        .select();

      if (error) throw error;

      const created = data?.length ?? 0;
      const duplicates = csvAllUids.length - created;
      setCsvResult({ created, duplicates });
      queryClient.invalidateQueries({ queryKey: ["exception-rules"] });
      toastSuccess(
        "Import terminé",
        `${created} règle${created > 1 ? "s" : ""} créée${created > 1 ? "s" : ""}${duplicates > 0 ? `, ${duplicates} doublon${duplicates > 1 ? "s" : ""} ignoré${duplicates > 1 ? "s" : ""}` : ""}`
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur lors de l'import";
      setCsvError(message);
      toastError("Erreur d'import", message);
    } finally {
      setCsvImporting(false);
    }
  }

  function closeCsvModal() {
    setCsvModalOpen(false);
    setCsvFile(null);
    setCsvPreview([]);
    setCsvAllUids([]);
    setCsvResult(null);
    setCsvError(null);
    if (csvFileInputRef.current) csvFileInputRef.current.value = "";
  }

  // ── Data fetching ──
  const { data: groups, isLoading: groupsLoading } = useQuery<ExceptionGroup[]>({
    queryKey: ["exception-groups"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("exception_groups").select("*").order("created_at");
        if (error) return [];
        return (data as ExceptionGroup[]) ?? [];
      } catch {
        return [];
      }
    },
  });

  const { data: rules, isLoading: rulesLoading } = useQuery<ExceptionRule[]>({
    queryKey: ["exception-rules"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("exception_rules").select("*").order("priority");
        if (error) return [];
        return (data as ExceptionRule[]) ?? [];
      } catch {
        return [];
      }
    },
  });

  // ── Group mutations ──
  const createGroupMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_GROUP_FORM) => {
      const { data: result, error } = await supabase.from("exception_groups").insert({
        name: data.name,
        description: data.description || null,
        organization: data.organization,
        category: data.category,
        is_active: data.is_active,
      }).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exception-groups"] });
      closeGroupModal();
      toastSuccess("Groupe cr\u00e9\u00e9", "Le groupe d'exceptions a \u00e9t\u00e9 ajout\u00e9");
    },
    onError: (error: Error) => {
      toastError("Erreur", error.message || "Une erreur est survenue");
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<typeof EMPTY_GROUP_FORM>) => {
      const { data: result, error } = await supabase.from("exception_groups").update({
        name: data.name,
        description: data.description || null,
        organization: data.organization,
        category: data.category,
        is_active: data.is_active,
      }).eq("id", id).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exception-groups"] });
      closeGroupModal();
      toastSuccess("Groupe modifi\u00e9", "Les modifications ont \u00e9t\u00e9 enregistr\u00e9es");
    },
    onError: (error: Error) => {
      toastError("Erreur", error.message || "Une erreur est survenue");
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("exception_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exception-groups"] });
      setConfirmDeleteGroup(null);
      toastSuccess("Groupe supprim\u00e9");
    },
    onError: (error: Error) => {
      setConfirmDeleteGroup(null);
      toastError("Erreur", error.message || "Une erreur est survenue");
    },
  });

  // ── Rule mutations ──
  const createRuleMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_RULE_FORM) => {
      const { data: result, error } = await supabase.from("exception_rules").insert({
        group_id: data.group_id || null,
        name: data.name,
        description: data.description || null,
        type: data.type,
        scope: data.scope,
        priority: Number(data.priority) || 0,
        is_active: data.is_active,
        conditions: data.conditions,
      }).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exception-rules"] });
      closeRuleModal();
      toastSuccess("R\u00e8gle cr\u00e9\u00e9e", "La r\u00e8gle d'exception a \u00e9t\u00e9 ajout\u00e9e");
    },
    onError: (error: Error) => {
      toastError("Erreur", error.message || "Une erreur est survenue");
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<typeof EMPTY_RULE_FORM>) => {
      const { data: result, error } = await supabase.from("exception_rules").update({
        group_id: data.group_id || null,
        name: data.name,
        description: data.description || null,
        type: data.type,
        scope: data.scope,
        priority: Number(data.priority) || 0,
        is_active: data.is_active,
        conditions: data.conditions,
      }).eq("id", id).select().single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exception-rules"] });
      closeRuleModal();
      toastSuccess("R\u00e8gle modifi\u00e9e", "Les modifications ont \u00e9t\u00e9 enregistr\u00e9es");
    },
    onError: (error: Error) => {
      toastError("Erreur", error.message || "Une erreur est survenue");
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("exception_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exception-rules"] });
      setConfirmDeleteRule(null);
      toastSuccess("R\u00e8gle supprim\u00e9e");
    },
    onError: (error: Error) => {
      setConfirmDeleteRule(null);
      toastError("Erreur", error.message || "Une erreur est survenue");
    },
  });

  // ── Group modal helpers ──
  function openCreateGroup() {
    setEditingGroup(null);
    setGroupForm(EMPTY_GROUP_FORM);
    setGroupModalOpen(true);
  }

  function openEditGroup(group: ExceptionGroup) {
    setEditingGroup(group);
    setGroupForm({
      name: group.name,
      description: group.description ?? "",
      organization: group.organization,
      category: group.category,
      is_active: group.is_active,
    });
    setGroupModalOpen(true);
  }

  function closeGroupModal() {
    setGroupModalOpen(false);
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

  // ── Rule modal helpers ──
  function openCreateRule() {
    setEditingRule(null);
    setRuleForm(EMPTY_RULE_FORM);
    setRuleModalOpen(true);
  }

  function openEditRule(rule: ExceptionRule) {
    setEditingRule(rule);
    setRuleForm({
      name: rule.name,
      description: rule.description ?? "",
      type: rule.type,
      scope: rule.scope,
      priority: rule.priority,
      group_id: rule.group_id ?? "",
      is_active: rule.is_active,
      conditions: rule.conditions ?? [],
    });
    setRuleModalOpen(true);
  }

  function closeRuleModal() {
    setRuleModalOpen(false);
    setEditingRule(null);
    setRuleForm(EMPTY_RULE_FORM);
  }

  function handleRuleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, ...ruleForm });
    } else {
      createRuleMutation.mutate(ruleForm);
    }
  }

  // ── Computed ──
  const isLoading = groupsLoading || rulesLoading;
  const groupsList = groups ?? [];
  const rulesList = rules ?? [];

  const stats = useMemo(() => {
    const g = groups ?? [];
    const r = rules ?? [];
    return {
      totalGroups: g.length,
      activeGroups: g.filter((g) => g.is_active).length,
      totalRules: r.length,
      activeRules: r.filter((r) => r.is_active).length,
    };
  }, [groups, rules]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-foreground">
            Exceptions & Autorisations
          </h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            Règles d'autorisation avancées pour conducteurs, tokens et bornes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCsvModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-surface-elevated text-foreground border border-border rounded-xl text-sm font-semibold hover:bg-surface-elevated/80 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Importer CSV
          </button>
          <button
            onClick={openCreateGroup}
            className="flex items-center gap-2 px-4 py-2.5 bg-surface-elevated text-foreground border border-border rounded-xl text-sm font-semibold hover:bg-surface-elevated/80 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nouveau groupe
          </button>
          <button
            onClick={openCreateRule}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nouvelle règle
          </button>
        </div>
      </div>

      <PageHelp
        summary="Journal des erreurs et exceptions remontées par le système"
        items={[
          { label: "Exception", description: "Erreur ou comportement anormal détecté par le système (échec OCPP, timeout, erreur API)." },
          { label: "Sévérité", description: "Critical (bloquant), Warning (dégradé), Info (informatif)." },
          { label: "Source", description: "Composant à l'origine de l'erreur : borne, serveur OCPP, API, synchronisation." },
          { label: "Résolution", description: "Actions correctives recommandées ou effectuées pour résoudre l'exception." },
        ]}
        tips={["Les exceptions critiques répétées sur une même borne indiquent souvent un problème matériel."]}
      />

      {/* KPIs */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-2xl p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="w-12 h-12 rounded-xl" />
                <div className="space-y-2 flex-1"><Skeleton className="h-6 w-12" /><Skeleton className="h-3 w-24" /></div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Groupes" value={stats.totalGroups} icon={Filter} color="#60A5FA" />
          <KPICard label="Groupes actifs" value={stats.activeGroups} icon={CheckCircle2} color="#34D399" />
          <KPICard label="Règles" value={stats.totalRules} icon={ShieldAlert} color="#FBBF24" />
          <KPICard label="Règles actives" value={stats.activeRules} icon={XCircle} color="#EF4444" />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-surface border border-border rounded-xl p-1 w-fit">
        <button
          onClick={() => setActiveTab("groups")}
          className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors",
            activeTab === "groups" ? "bg-primary/15 text-primary" : "text-foreground-muted hover:text-foreground hover:bg-surface-elevated"
          )}
        >
          <Users className="w-3.5 h-3.5" />
          Groupes ({groupsList.length})
        </button>
        <button
          onClick={() => setActiveTab("rules")}
          className={cn("flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors",
            activeTab === "rules" ? "bg-primary/15 text-primary" : "text-foreground-muted hover:text-foreground hover:bg-surface-elevated"
          )}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          Règles ({rulesList.length})
        </button>
      </div>

      {/* Content */}
      {activeTab === "groups" ? (
        <div className="space-y-3">
          {groupsList.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-56 bg-surface border border-border rounded-2xl">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Users className="w-7 h-7 text-primary" />
              </div>
              <p className="text-foreground font-medium text-lg">Aucun groupe</p>
              <p className="text-sm text-foreground-muted mt-1 max-w-sm text-center">
                Créez votre premier groupe d'exceptions pour organiser vos règles d'autorisation.
              </p>
              <button
                onClick={openCreateGroup}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Créer un groupe
              </button>
            </div>
          )}
          {groupsList.map((group) => (
            <div key={group.id} className="bg-surface border border-border rounded-2xl p-5 flex items-center gap-4 hover:border-opacity-80 transition-all">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", group.is_active ? "bg-emerald-500/10" : "bg-foreground-muted/10")}>
                <ShieldAlert className={cn("w-5 h-5", group.is_active ? "text-emerald-400" : "text-foreground-muted")} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{group.name}</h3>
                  <CategoryBadge category={group.category} />
                  {!group.is_active && (
                    <span className="px-1.5 py-0.5 bg-foreground-muted/10 text-foreground-muted text-[10px] font-semibold rounded">Inactif</span>
                  )}
                </div>
                <p className="text-xs text-foreground-muted mt-0.5 line-clamp-1">{group.description}</p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold text-foreground">{group.rules_count ?? 0}</p>
                  <p className="text-[10px] text-foreground-muted">règles</p>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold text-foreground">{group.items_count ?? 0}</p>
                  <p className="text-[10px] text-foreground-muted">éléments</p>
                </div>
                <button
                  onClick={() => openEditGroup(group)}
                  className="p-2 text-foreground-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                  title="Modifier"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setConfirmDeleteGroup(group)}
                  className="p-2 text-foreground-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  title="Supprimer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {rulesList.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-56 bg-surface border border-border rounded-2xl">
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <ShieldAlert className="w-7 h-7 text-primary" />
              </div>
              <p className="text-foreground font-medium text-lg">Aucune règle</p>
              <p className="text-sm text-foreground-muted mt-1 max-w-sm text-center">
                Créez votre première règle d'exception pour gérer les autorisations.
              </p>
              <button
                onClick={openCreateRule}
                className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Créer une règle
              </button>
            </div>
          )}
          {rulesList.map((rule) => (
            <div key={rule.id} className="bg-surface border border-border rounded-2xl overflow-hidden hover:border-opacity-80 transition-all">
              <button
                onClick={() => setExpandedItem((prev) => (prev === rule.id ? null : rule.id))}
                className="w-full text-left p-5 flex items-center gap-4"
              >
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                  rule.type === "whitelist" ? "bg-emerald-500/10" : rule.type === "blacklist" ? "bg-red-500/10" : "bg-amber-500/10"
                )}>
                  {rule.type === "whitelist" ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> :
                   rule.type === "blacklist" ? <XCircle className="w-5 h-5 text-red-400" /> :
                   <AlertTriangle className="w-5 h-5 text-amber-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-foreground">{rule.name}</h3>
                    <RuleTypeBadge type={rule.type} />
                    <ScopeBadge scope={rule.scope} />
                    {!rule.is_active && (
                      <span className="px-1.5 py-0.5 bg-foreground-muted/10 text-foreground-muted text-[10px] font-semibold rounded">Inactif</span>
                    )}
                  </div>
                  <p className="text-xs text-foreground-muted mt-0.5 line-clamp-1">{rule.description}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-semibold text-foreground">P{rule.priority}</p>
                    <p className="text-[10px] text-foreground-muted">Priorité</p>
                  </div>
                  <ChevronDown className={cn("w-4 h-4 text-foreground-muted transition-transform", expandedItem === rule.id && "rotate-180")} />
                </div>
              </button>

              {expandedItem === rule.id && (
                <div className="border-t border-border px-5 py-4 space-y-3">
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider">Conditions</p>
                    {(rule.conditions ?? []).map((cond, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        <span className="text-foreground">{cond}</span>
                      </div>
                    ))}
                    {(!rule.conditions || rule.conditions.length === 0) && (
                      <p className="text-xs text-foreground-muted italic">Aucune condition définie</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-foreground-muted pt-2">
                    <Clock className="w-3.5 h-3.5" />
                    Dernière modification : {rule.updated_at ? new Date(rule.updated_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "\u2014"}
                    <span>•</span>
                    {rule.items_count ?? 0} éléments concernés
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-border">
                    <button
                      onClick={() => openEditRule(rule)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground-muted hover:text-foreground bg-surface-elevated border border-border rounded-lg transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                      Modifier
                    </button>
                    <button
                      onClick={() => setConfirmDeleteRule(rule)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/5 border border-red-500/20 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      Supprimer
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Group Create / Edit SlideOver ── */}
      <SlideOver
        open={groupModalOpen}
        onClose={closeGroupModal}
        title={editingGroup ? "Modifier le groupe" : "Nouveau groupe"}
      >
        <form onSubmit={handleGroupSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Nom *</label>
            <input
              required
              value={groupForm.name}
              onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="VIP Entreprises"
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Description</label>
            <textarea
              value={groupForm.description}
              onChange={(e) => setGroupForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="Description du groupe..."
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Organisation *</label>
              <select
                value={groupForm.organization}
                onChange={(e) => setGroupForm((f) => ({ ...f, organization: e.target.value as "emsp" | "cpo" }))}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
              >
                <option value="emsp">eMSP</option>
                <option value="cpo">CPO</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Catégorie *</label>
              <select
                value={groupForm.category}
                onChange={(e) => setGroupForm((f) => ({ ...f, category: e.target.value as "drivers" | "tokens" | "stations" }))}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
              >
                <option value="drivers">Conducteurs</option>
                <option value="tokens">Tokens</option>
                <option value="stations">Bornes</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setGroupForm((f) => ({ ...f, is_active: !f.is_active }))}
              className={cn(
                "relative w-11 h-6 rounded-full transition-colors",
                groupForm.is_active ? "bg-primary" : "bg-foreground-muted/30"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                  groupForm.is_active && "translate-x-5"
                )}
              />
            </button>
            <span className="text-sm text-foreground">
              {groupForm.is_active ? "Actif" : "Inactif"}
            </span>
          </div>
          {(createGroupMutation.error || updateGroupMutation.error) && (
            <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-sm text-red-400">
              {((createGroupMutation.error || updateGroupMutation.error) as Error)?.message}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={closeGroupModal} className="px-4 py-2 text-sm text-foreground-muted hover:text-foreground border border-border rounded-xl transition-colors">
              Annuler
            </button>
            <button
              type="submit"
              disabled={createGroupMutation.isPending || updateGroupMutation.isPending}
              className="px-5 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {createGroupMutation.isPending || updateGroupMutation.isPending ? "..." : editingGroup ? "Enregistrer" : "Cr\u00e9er"}
            </button>
          </div>
        </form>
      </SlideOver>

      {/* ── Rule Create / Edit SlideOver ── */}
      <SlideOver
        open={ruleModalOpen}
        onClose={closeRuleModal}
        title={editingRule ? "Modifier la r\u00e8gle" : "Nouvelle r\u00e8gle"}
      >
        <form onSubmit={handleRuleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Nom *</label>
            <input
              required
              value={ruleForm.name}
              onChange={(e) => setRuleForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Accès prioritaire VIP"
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Description</label>
            <textarea
              value={ruleForm.description}
              onChange={(e) => setRuleForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="Description de la règle..."
              className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Type *</label>
              <select
                value={ruleForm.type}
                onChange={(e) => setRuleForm((f) => ({ ...f, type: e.target.value as "whitelist" | "blacklist" | "override" }))}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
              >
                <option value="whitelist">Whitelist</option>
                <option value="blacklist">Blacklist</option>
                <option value="override">Override</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Scope *</label>
              <select
                value={ruleForm.scope}
                onChange={(e) => setRuleForm((f) => ({ ...f, scope: e.target.value as "driver" | "token" | "station" }))}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
              >
                <option value="driver">Conducteurs</option>
                <option value="token">Tokens</option>
                <option value="station">Bornes</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Priorité</label>
              <input
                type="number"
                min={0}
                value={ruleForm.priority}
                onChange={(e) => setRuleForm((f) => ({ ...f, priority: Number(e.target.value) }))}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Groupe</label>
              <select
                value={ruleForm.group_id}
                onChange={(e) => setRuleForm((f) => ({ ...f, group_id: e.target.value }))}
                className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-primary/50"
              >
                <option value="">Aucun groupe</option>
                {groupsList.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setRuleForm((f) => ({ ...f, is_active: !f.is_active }))}
              className={cn(
                "relative w-11 h-6 rounded-full transition-colors",
                ruleForm.is_active ? "bg-primary" : "bg-foreground-muted/30"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                  ruleForm.is_active && "translate-x-5"
                )}
              />
            </button>
            <span className="text-sm text-foreground">
              {ruleForm.is_active ? "Actif" : "Inactif"}
            </span>
          </div>
          {(createRuleMutation.error || updateRuleMutation.error) && (
            <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-lg text-sm text-red-400">
              {((createRuleMutation.error || updateRuleMutation.error) as Error)?.message}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={closeRuleModal} className="px-4 py-2 text-sm text-foreground-muted hover:text-foreground border border-border rounded-xl transition-colors">
              Annuler
            </button>
            <button
              type="submit"
              disabled={createRuleMutation.isPending || updateRuleMutation.isPending}
              className="px-5 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {createRuleMutation.isPending || updateRuleMutation.isPending ? "..." : editingRule ? "Enregistrer" : "Cr\u00e9er"}
            </button>
          </div>
        </form>
      </SlideOver>

      {/* ── Confirm Delete Group ── */}
      <ConfirmDialog
        open={!!confirmDeleteGroup}
        onCancel={() => setConfirmDeleteGroup(null)}
        onConfirm={() => {
          if (confirmDeleteGroup) deleteGroupMutation.mutate(confirmDeleteGroup.id);
        }}
        title="Supprimer ce groupe ?"
        description={confirmDeleteGroup ? `Le groupe "${confirmDeleteGroup.name}" sera d\u00e9finitivement supprim\u00e9. Cette action est irr\u00e9versible.` : ""}
        confirmLabel="Supprimer"
        variant="danger"
        loading={deleteGroupMutation.isPending}
      />

      {/* ── Confirm Delete Rule ── */}
      <ConfirmDialog
        open={!!confirmDeleteRule}
        onCancel={() => setConfirmDeleteRule(null)}
        onConfirm={() => {
          if (confirmDeleteRule) deleteRuleMutation.mutate(confirmDeleteRule.id);
        }}
        title="Supprimer cette r\u00e8gle ?"
        description={confirmDeleteRule ? `La r\u00e8gle "${confirmDeleteRule.name}" sera d\u00e9finitivement supprim\u00e9e. Cette action est irr\u00e9versible.` : ""}
        confirmLabel="Supprimer"
        variant="danger"
        loading={deleteRuleMutation.isPending}
      />

      {/* ── CSV Import Modal ── */}
      {csvModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeCsvModal} />
          <div className="relative w-full max-w-lg mx-4 bg-surface border border-border rounded-2xl shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">Importer CSV — Whitelist</h2>
                  <p className="text-xs text-foreground-muted mt-0.5">Ajout en masse de règles d'exception</p>
                </div>
              </div>
              <button
                onClick={closeCsvModal}
                className="p-2 text-foreground-muted hover:text-foreground hover:bg-surface-elevated rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
              {/* Description */}
              <div className="p-3 bg-primary/5 border border-primary/15 rounded-xl">
                <p className="text-xs text-foreground leading-relaxed">
                  <span className="font-semibold">Format attendu :</span> une colonne <code className="px-1.5 py-0.5 bg-surface-elevated border border-border rounded text-[11px] font-mono">uid</code> par ligne (identifiant token/RFID).
                  La première ligne peut être un en-tête.
                </p>
              </div>

              {/* File input */}
              <div>
                <label className="block text-xs font-semibold text-foreground-muted mb-1.5">Fichier CSV</label>
                <input
                  ref={csvFileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleCsvFileChange}
                  className="w-full px-3 py-2 bg-surface-elevated border border-border rounded-lg text-sm text-foreground file:mr-3 file:px-3 file:py-1 file:rounded-lg file:border-0 file:bg-primary/10 file:text-primary file:text-xs file:font-semibold file:cursor-pointer focus:outline-none focus:border-primary/50"
                />
              </div>

              {/* Preview */}
              {csvPreview.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-foreground-muted">
                      Aperçu ({csvAllUids.length} UID{csvAllUids.length > 1 ? "s" : ""} détecté{csvAllUids.length > 1 ? "s" : ""})
                    </label>
                    {csvAllUids.length > 5 && (
                      <span className="text-[10px] text-foreground-muted">+{csvAllUids.length - 5} autres</span>
                    )}
                  </div>
                  <div className="bg-surface-elevated border border-border rounded-lg divide-y divide-border">
                    {csvPreview.map((uid, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2">
                        <div className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-emerald-400">{i + 1}</span>
                        </div>
                        <code className="text-xs font-mono text-foreground truncate">{uid}</code>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Result */}
              {csvResult && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-emerald-400">
                    <span className="font-semibold">{csvResult.created}</span> règle{csvResult.created > 1 ? "s" : ""} créée{csvResult.created > 1 ? "s" : ""}
                    {csvResult.duplicates > 0 && (
                      <>, <span className="font-semibold">{csvResult.duplicates}</span> doublon{csvResult.duplicates > 1 ? "s" : ""} ignoré{csvResult.duplicates > 1 ? "s" : ""}</>
                    )}
                  </p>
                </div>
              )}

              {/* Error */}
              {csvError && (
                <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-xl flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{csvError}</p>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
              <button
                onClick={closeCsvModal}
                className="px-4 py-2 text-sm text-foreground-muted hover:text-foreground border border-border rounded-xl transition-colors"
              >
                {csvResult ? "Fermer" : "Annuler"}
              </button>
              {!csvResult && (
                <button
                  onClick={handleCsvImport}
                  disabled={csvAllUids.length === 0 || csvImporting}
                  className="flex items-center gap-2 px-5 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {csvImporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Import en cours...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Importer {csvAllUids.length > 0 ? `(${csvAllUids.length})` : ""}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
