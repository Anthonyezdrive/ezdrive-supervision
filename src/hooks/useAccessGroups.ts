import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export interface AccessGroup {
  id: string;
  name: string;
  description: string | null;
  type: "public" | "employee" | "vip" | "fleet" | "visitor" | "partner" | "custom";
  cpo_id: string | null;
  b2b_client_id: string | null;
  is_default: boolean;
  color: string;
  member_count: number;
  station_count: number;
  created_at: string;
}

export interface AccessGroupMember {
  id: string;
  access_group_id: string;
  token_uid: string | null;
  driver_id: string | null;
  consumer_id: string | null;
  added_at: string;
}

export function useAccessGroups() {
  return useQuery({
    queryKey: ["access-groups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_groups")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as AccessGroup[];
    },
  });
}

export function useAccessGroupMembers(groupId: string | null) {
  return useQuery({
    queryKey: ["access-group-members", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("access_group_members")
        .select("*")
        .eq("access_group_id", groupId)
        .order("added_at", { ascending: false });
      if (error) throw error;
      return data as AccessGroupMember[];
    },
    enabled: !!groupId,
  });
}

export function useAccessGroupStations(groupId: string | null) {
  return useQuery({
    queryKey: ["access-group-stations", groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const { data, error } = await supabase
        .from("access_group_stations")
        .select("*, stations!inner(id, name, address, ocpp_status)")
        .eq("access_group_id", groupId);
      if (error) throw error;
      return data;
    },
    enabled: !!groupId,
  });
}

export function useCreateAccessGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (group: Partial<AccessGroup>) => {
      const { data, error } = await supabase.from("access_groups").insert(group).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["access-groups"] }),
  });
}

export function useUpdateAccessGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<AccessGroup> & { id: string }) => {
      const { data, error } = await supabase.from("access_groups").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["access-groups"] }),
  });
}

export function useDeleteAccessGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("access_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["access-groups"] }),
  });
}

export function useAddGroupMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (member: Partial<AccessGroupMember>) => {
      const { data, error } = await supabase.from("access_group_members").insert(member).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["access-group-members", vars.access_group_id] });
      qc.invalidateQueries({ queryKey: ["access-groups"] });
    },
  });
}

export function useRemoveGroupMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, groupId }: { id: string; groupId: string }) => {
      const { error } = await supabase.from("access_group_members").delete().eq("id", id);
      if (error) throw error;
      return groupId;
    },
    onSuccess: (groupId) => {
      qc.invalidateQueries({ queryKey: ["access-group-members", groupId] });
      qc.invalidateQueries({ queryKey: ["access-groups"] });
    },
  });
}
