// ============================================================
// useEdgeFunction — Generic hook to invoke Supabase Edge Functions
// Usage: const { invoke, loading } = useEdgeFunction("gfx-cdr-sync");
//        await invoke({ year: 2024, month: 3 });
// ============================================================

import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface UseEdgeFunctionOptions {
  /** Query keys to invalidate on success */
  invalidateKeys?: string[];
  /** Use service_role auth instead of user token */
  useServiceRole?: boolean;
}

interface InvokeResult<T = Record<string, unknown>> {
  data: T | null;
  error: string | null;
}

export function useEdgeFunction<T = Record<string, unknown>>(
  functionName: string,
  options: UseEdgeFunctionOptions = {}
) {
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<InvokeResult<T> | null>(null);
  const queryClient = useQueryClient();

  const invoke = useCallback(
    async (body?: Record<string, unknown>): Promise<InvokeResult<T>> => {
      setLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/${functionName}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session?.access_token}`,
              "Content-Type": "application/json",
            },
            body: body ? JSON.stringify(body) : undefined,
          }
        );

        if (!res.ok) {
          const errText = await res.text();
          const result: InvokeResult<T> = {
            data: null,
            error: `HTTP ${res.status}: ${errText}`,
          };
          setLastResult(result);
          return result;
        }

        const data = (await res.json()) as T;
        const result: InvokeResult<T> = { data, error: null };
        setLastResult(result);

        // Invalidate specified query keys on success
        if (options.invalidateKeys?.length) {
          for (const key of options.invalidateKeys) {
            queryClient.invalidateQueries({ queryKey: [key] });
          }
        }

        return result;
      } catch (err) {
        const result: InvokeResult<T> = {
          data: null,
          error: err instanceof Error ? err.message : "Erreur inconnue",
        };
        setLastResult(result);
        return result;
      } finally {
        setLoading(false);
      }
    },
    [functionName, options.invalidateKeys, queryClient]
  );

  return { invoke, loading, lastResult };
}
