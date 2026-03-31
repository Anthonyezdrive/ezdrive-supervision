import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Trash2, Shield, Building2, Crown, Truck, UserPlus, MapPin, Tag, X, Loader2, Search, Check } from "lucide-react";
import { useAccessGroups, useAccessGroupMembers, useCreateAccessGroup, useDeleteAccessGroup, useAddGroupMember, useRemoveGroupMember, type AccessGroup } from "../../hooks/useAccessGroups";
import { supabase } from "@/lib/supabase";

const GROUP_TYPE_LABELS: Record<string, { label: string; color: string; icon: typeof Users }> = {
  public: { label: "Public", color: "bg-gray-100 text-gray-700", icon: Users },
  employee: { label: "Employés", color: "bg-blue-100 text-blue-700", icon: Building2 },
  vip: { label: "VIP", color: "bg-amber-100 text-amber-700", icon: Crown },
  fleet: { label: "Fleet", color: "bg-purple-100 text-purple-700", icon: Truck },
  visitor: { label: "Visiteur", color: "bg-green-100 text-green-700", icon: UserPlus },
  partner: { label: "Partenaire", color: "bg-indigo-100 text-indigo-700", icon: Shield },
  custom: { label: "Personnalisé", color: "bg-gray-100 text-gray-600", icon: Tag },
};

export default function AccessGroupsPage() {
  const { t } = useTranslation();
  const { data: groups = [], isLoading } = useAccessGroups();
  const createGroup = useCreateAccessGroup();
  const deleteGroup = useDeleteAccessGroup();

  const [selectedGroup, setSelectedGroup] = useState<AccessGroup | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", description: "", type: "custom" as string });
  const [showMembers, setShowMembers] = useState(false);

  const handleCreate = async () => {
    await createGroup.mutateAsync({ name: editForm.name, description: editForm.description, type: editForm.type as AccessGroup["type"] });
    setShowCreate(false);
    setEditForm({ name: "", description: "", type: "custom" });
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("accessGroups.confirmDelete", "Supprimer ce groupe ?"))) return;
    await deleteGroup.mutateAsync(id);
    if (selectedGroup?.id === id) setSelectedGroup(null);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="w-7 h-7 text-emerald-600" />
            {t("admin.accessGroups.title")}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t("admin.accessGroups.description")}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {t("accessGroups.newGroup", "Nouveau groupe")}
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: t("accessGroups.groups", "Groupes"), value: groups.length, color: "text-emerald-600" },
          { label: t("accessGroups.totalMembers", "Membres total"), value: groups.reduce((s, g) => s + g.member_count, 0), color: "text-blue-600" },
          { label: t("accessGroups.coveredStations", "Bornes couvertes"), value: groups.reduce((s, g) => s + g.station_count, 0), color: "text-purple-600" },
          { label: t("accessGroups.withTariff", "Avec tarif"), value: groups.filter(g => !g.is_default).length, color: "text-amber-600" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <div className="text-sm text-gray-500">{kpi.label}</div>
            <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Groups Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group) => {
            const typeInfo = GROUP_TYPE_LABELS[group.type] ?? GROUP_TYPE_LABELS.custom;
            const Icon = typeInfo.icon;
            return (
              <div
                key={group.id}
                onClick={() => { setSelectedGroup(group); setShowMembers(true); }}
                className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:border-emerald-200 hover:shadow-md transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${typeInfo.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{group.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${typeInfo.color}`}>{typeInfo.label}</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(group.id); }} className="p-1.5 text-gray-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {group.description && <p className="text-sm text-gray-500 mb-3 line-clamp-2">{group.description}</p>}
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{group.member_count} {t("accessGroups.members", "membres")}</span>
                  <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{group.station_count} {t("accessGroups.stations", "bornes")}</span>
                </div>
                {group.is_default && (
                  <div className="mt-2 text-xs text-emerald-600 bg-emerald-50 rounded px-2 py-1 inline-block">
                    {t("accessGroups.defaultGroup", "Groupe par défaut")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{t("accessGroups.newGroup", "Nouveau groupe")}</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                <input value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Ex: Employés Orange" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={editForm.description} onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" rows={2} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select value={editForm.type} onChange={(e) => setEditForm(f => ({ ...f, type: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm">
                  {Object.entries(GROUP_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <button onClick={handleCreate} disabled={!editForm.name || createGroup.isPending} className="w-full py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:bg-gray-300">
                {createGroup.isPending ? t("common.loading") : t("accessGroups.createGroup", "Créer le groupe")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Members Slide-over */}
      {showMembers && selectedGroup && (
        <MembersPanel group={selectedGroup} onClose={() => setShowMembers(false)} />
      )}
    </div>
  );
}

function MembersPanel({ group, onClose }: { group: AccessGroup; onClose: () => void }) {
  const { data: members = [], isLoading } = useAccessGroupMembers(group.id);
  const addMember = useAddGroupMember();
  const removeMember = useRemoveGroupMember();
  const queryClient = useQueryClient();
  const [tokenInput, setTokenInput] = useState("");

  // ── Tariff dropdown ──
  const { data: tariffs = [] } = useQuery({
    queryKey: ["tariffs-list"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("tariffs").select("id, name").order("name");
        if (error) { console.warn("[AccessGroups] tariffs:", error.message); return []; }
        return (data ?? []) as { id: string; name: string }[];
      } catch { return []; }
    },
  });

  const [selectedTariffId, setSelectedTariffId] = useState<string>((group as any).tariff_id ?? "");
  const [savingTariff, setSavingTariff] = useState(false);

  const handleSaveTariff = async (tariffId: string) => {
    setSelectedTariffId(tariffId);
    setSavingTariff(true);
    try {
      await supabase.from("access_groups").update({ tariff_id: tariffId || null }).eq("id", group.id);
      queryClient.invalidateQueries({ queryKey: ["access-groups"] });
    } catch (err) {
      console.warn("[AccessGroups] tariff save error:", err);
    } finally {
      setSavingTariff(false);
    }
  };

  // ── Stations multi-select ──
  const { data: allStations = [] } = useQuery({
    queryKey: ["stations-list"],
    retry: false,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from("stations").select("id, name").order("name");
        if (error) { console.warn("[AccessGroups] stations:", error.message); return []; }
        return (data ?? []) as { id: string; name: string }[];
      } catch { return []; }
    },
  });

  const [assignedStationIds, setAssignedStationIds] = useState<Set<string>>(new Set());
  const [stationsLoaded, setStationsLoaded] = useState(false);
  const [stationSearch, setStationSearch] = useState("");
  const [savingStations, setSavingStations] = useState(false);
  const [stationsError, setStationsError] = useState<string | null>(null);

  // Load current station assignments
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("access_group_stations")
          .select("station_id")
          .eq("group_id", group.id);
        if (error) {
          // Also try access_group_id column name
          const { data: data2, error: error2 } = await supabase
            .from("access_group_stations")
            .select("station_id")
            .eq("access_group_id", group.id);
          if (error2) {
            console.warn("[AccessGroups] stations assignment:", error2.message);
            setStationsError("Table non disponible");
            setStationsLoaded(true);
            return;
          }
          setAssignedStationIds(new Set((data2 ?? []).map((d: any) => d.station_id)));
        } else {
          setAssignedStationIds(new Set((data ?? []).map((d: any) => d.station_id)));
        }
        setStationsLoaded(true);
      } catch {
        setStationsError("Table non disponible");
        setStationsLoaded(true);
      }
    })();
  }, [group.id]);

  const toggleStation = (stationId: string) => {
    setAssignedStationIds(prev => {
      const next = new Set(prev);
      if (next.has(stationId)) next.delete(stationId);
      else next.add(stationId);
      return next;
    });
  };

  const handleSaveStations = async () => {
    setSavingStations(true);
    try {
      // Try with group_id column first
      const { error: delError } = await supabase
        .from("access_group_stations")
        .delete()
        .eq("group_id", group.id);

      if (delError) {
        // Try access_group_id column
        await supabase
          .from("access_group_stations")
          .delete()
          .eq("access_group_id", group.id);
      }

      if (assignedStationIds.size > 0) {
        const rows = Array.from(assignedStationIds).map(sid => ({
          group_id: group.id,
          access_group_id: group.id,
          station_id: sid,
        }));
        await supabase.from("access_group_stations").insert(rows);
      }
      queryClient.invalidateQueries({ queryKey: ["access-groups"] });
      queryClient.invalidateQueries({ queryKey: ["access-group-stations", group.id] });
    } catch (err) {
      console.warn("[AccessGroups] stations save error:", err);
    } finally {
      setSavingStations(false);
    }
  };

  const filteredStations = allStations.filter(s =>
    !stationSearch || s.name?.toLowerCase().includes(stationSearch.toLowerCase())
  );

  const handleAdd = async () => {
    if (!tokenInput.trim()) return;
    await addMember.mutateAsync({ access_group_id: group.id, token_uid: tokenInput.trim() });
    setTokenInput("");
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-xl h-full overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-gray-900">{group.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-6">
          {/* ── Tarif du groupe ── */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Tarif du groupe</label>
            <div className="flex items-center gap-2">
              <select
                value={selectedTariffId}
                onChange={(e) => handleSaveTariff(e.target.value)}
                className="flex-1 px-3 py-2 border rounded-lg text-sm bg-white"
                disabled={savingTariff}
              >
                <option value="">Aucun tarif</option>
                {tariffs.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {savingTariff && <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />}
            </div>
            {tariffs.length === 0 && (
              <p className="text-xs text-gray-400 mt-1">Aucun tarif disponible</p>
            )}
          </div>

          {/* ── Stations autorisées ── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-gray-700">
                Stations autorisées ({assignedStationIds.size})
              </label>
              <button
                onClick={handleSaveStations}
                disabled={savingStations || !!stationsError}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:bg-gray-300 transition-colors"
              >
                {savingStations ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Enregistrer
              </button>
            </div>
            {stationsError ? (
              <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">{stationsError}</p>
            ) : (
              <>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    value={stationSearch}
                    onChange={(e) => setStationSearch(e.target.value)}
                    placeholder="Rechercher une station..."
                    className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                  {!stationsLoaded ? (
                    <div className="p-3 text-center"><Loader2 className="w-4 h-4 text-emerald-500 animate-spin mx-auto" /></div>
                  ) : filteredStations.length === 0 ? (
                    <div className="p-3 text-xs text-gray-400 text-center">Aucune station</div>
                  ) : (
                    filteredStations.map(station => (
                      <label key={station.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={assignedStationIds.has(station.id)}
                          onChange={() => toggleStation(station.id)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="text-sm text-gray-700 truncate">{station.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Membres ── */}
          <div className="border-t pt-4">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Membres</label>
            <div className="flex gap-2 mb-3">
              <input value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder="Token UID ou Driver ID" className="flex-1 px-3 py-2 border rounded-lg text-sm" />
              <button onClick={handleAdd} disabled={addMember.isPending} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:bg-gray-300">
                <UserPlus className="w-4 h-4" />
              </button>
            </div>
            <div className="text-sm text-gray-500 mb-2">{members.length} membre(s)</div>
            {isLoading ? (
              <Loader2 className="w-6 h-6 text-emerald-500 animate-spin mx-auto" />
            ) : (
              <div className="space-y-2">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{m.token_uid ?? m.driver_id ?? "—"}</div>
                      <div className="text-xs text-gray-400">{new Date(m.added_at).toLocaleDateString("fr-FR")}</div>
                    </div>
                    <button onClick={() => removeMember.mutate({ id: m.id, groupId: group.id })} className="text-gray-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
