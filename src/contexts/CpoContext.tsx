import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CpoOperator {
  id: string;
  name: string;
  code: string;
  color: string | null;
  parent_id: string | null;
  level: number;
  is_white_label: boolean;
  logo_url: string | null;
  territory_ids: string[] | null;
  description: string | null;
}

interface CpoState {
  /** null means "all CPOs" (EZDrive root view) */
  selectedCpoId: string | null;
  selectedCpo: CpoOperator | null;
  cpos: CpoOperator[];
  /** Level 0 eMSP root */
  rootCpo: CpoOperator | null;
  /** Level 1 CPO brands */
  level1Cpos: CpoOperator[];
  /** Whether the CPO list is still loading */
  loading: boolean;
  /** Select a CPO – pass null for "all / root" */
  selectCpo: (id: string | null) => void;
  /** Check whether a given CPO id is the currently selected one */
  isSelected: (id: string) => boolean;
  /** Get direct children of a given CPO */
  childrenOf: (parentId: string) => CpoOperator[];
  /** The user's assigned CPO id from their profile (null = admin / unrestricted) */
  userCpoId: string | null;
  /** true if the user can only see a single CPO */
  isRestricted: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = "selected-cpo-id";

function readPersistedId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistId(id: string | null) {
  try {
    if (id === null) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, id);
    }
  } catch {
    // localStorage unavailable – silently ignore
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const CpoContext = createContext<CpoState | undefined>(undefined);

export function CpoProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const userCpoId = profile?.cpo_id ?? null;
  const isRestricted = userCpoId !== null;

  const [selectedCpoId, setSelectedCpoId] = useState<string | null>(
    readPersistedId,
  );

  // When the user is restricted to a specific CPO, force-select it
  useEffect(() => {
    if (isRestricted && selectedCpoId !== userCpoId) {
      setSelectedCpoId(userCpoId);
      persistId(userCpoId);
    }
  }, [isRestricted, userCpoId, selectedCpoId]);

  // Fetch all CPO operators
  const { data: cpos = [], isLoading } = useQuery<CpoOperator[]>({
    queryKey: ["cpo_operators"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cpo_operators")
        .select(
          "id, name, code, color, parent_id, level, is_white_label, logo_url, territory_ids, description",
        )
        .order("level", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      return (data ?? []) as CpoOperator[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Derived values (memoized to avoid re-renders)
  const rootCpo = useMemo(() => cpos.find((c) => c.level === 0) ?? null, [cpos]);

  const level1Cpos = useMemo(() => {
    const l1 = cpos.filter((c) => c.level === 1);
    // Restricted users only see their own CPO in the list
    if (isRestricted) {
      return l1.filter((c) => c.id === userCpoId);
    }
    return l1;
  }, [cpos, isRestricted, userCpoId]);

  const selectedCpo = useMemo(
    () => cpos.find((c) => c.id === selectedCpoId) ?? null,
    [cpos, selectedCpoId],
  );

  // Actions
  const selectCpo = useCallback(
    (id: string | null) => {
      // Restricted users cannot change their CPO selection
      if (isRestricted) return;
      setSelectedCpoId(id);
      persistId(id);
    },
    [isRestricted],
  );

  const isSelected = useCallback(
    (id: string) => selectedCpoId === id,
    [selectedCpoId],
  );

  const childrenOf = useCallback(
    (parentId: string) => cpos.filter((c) => c.parent_id === parentId),
    [cpos],
  );

  // Memoize the context value to prevent full-tree re-renders
  // Only re-creates when actual state/data changes
  const contextValue = useMemo<CpoState>(
    () => ({
      selectedCpoId,
      selectedCpo,
      cpos,
      rootCpo,
      level1Cpos,
      loading: isLoading,
      selectCpo,
      isSelected,
      childrenOf,
      userCpoId,
      isRestricted,
    }),
    [selectedCpoId, selectedCpo, cpos, rootCpo, level1Cpos, isLoading, selectCpo, isSelected, childrenOf, userCpoId, isRestricted],
  );

  return (
    <CpoContext.Provider value={contextValue}>
      {children}
    </CpoContext.Provider>
  );
}

export function useCpo() {
  const ctx = useContext(CpoContext);
  if (!ctx) throw new Error("useCpo must be used within CpoProvider");
  return ctx;
}
