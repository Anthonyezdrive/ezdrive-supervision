// ============================================================
// EZDrive — OCPI Endpoint Test Panel
// Inline panel to test OCPI modules for a given subscription
// ============================================================

import { useState } from "react";
import {
  Play,
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTestEndpoint } from "@/hooks/useOcpiCredentials";
import type { EndpointTestResult } from "@/hooks/useOcpiCredentials";

interface Subscription {
  id: string;
  versions_url: string | null;
  token_b: string | null;
  name?: string;
}

interface Props {
  subscription: Subscription;
}

const MODULES = [
  { key: "locations", label: "Locations", path: "/2.2.1/locations" },
  { key: "tokens", label: "Tokens", path: "/2.2.1/tokens" },
  { key: "cdrs", label: "CDRs", path: "/2.2.1/cdrs" },
  { key: "tariffs", label: "Tariffs", path: "/2.2.1/tariffs" },
  { key: "sessions", label: "Sessions", path: "/2.2.1/sessions" },
  { key: "commands", label: "Commands", path: "/2.2.1/commands" },
] as const;

export function OcpiEndpointTest({ subscription }: Props) {
  const [selectedModule, setSelectedModule] = useState<string>("locations");
  const [results, setResults] = useState<Record<string, EndpointTestResult>>({});
  const [testingModule, setTestingModule] = useState<string | null>(null);
  const [testingAll, setTestingAll] = useState(false);

  const testMutation = useTestEndpoint();

  const baseUrl = subscription.versions_url
    ? subscription.versions_url.replace(/\/versions\/?$/, "")
    : "";

  const handleTest = async (moduleKey: string) => {
    if (!subscription.token_b || !baseUrl) return;

    setTestingModule(moduleKey);
    const mod = MODULES.find((m) => m.key === moduleKey);

    try {
      const result = await testMutation.mutateAsync({
        module: moduleKey,
        url: `${baseUrl}${mod?.path ?? `/${moduleKey}`}`,
        token: subscription.token_b,
      });
      setResults((prev) => ({ ...prev, [moduleKey]: result }));
    } catch {
      setResults((prev) => ({
        ...prev,
        [moduleKey]: {
          module: moduleKey,
          status_code: 0,
          latency_ms: 0,
          response_preview: "Erreur de connexion",
          success: false,
        },
      }));
    } finally {
      setTestingModule(null);
    }
  };

  const handleTestAll = async () => {
    setTestingAll(true);
    try {
      for (const mod of MODULES) {
        await handleTest(mod.key);
      }
    } finally {
      setTestingAll(false);
    }
  };

  return (
    <div className="bg-surface border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Wifi className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Test des endpoints</h3>
        </div>
        <button
          onClick={handleTestAll}
          disabled={!subscription.token_b || !baseUrl || testingModule !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
        >
          <Play className="w-3 h-3" />
          Tester tous
        </button>
      </div>

      {/* Base URL display */}
      <div className="px-5 py-2.5 bg-surface-elevated/30 border-b border-border">
        <p className="text-xs text-foreground-muted">
          Base URL: <span className="font-mono text-foreground">{baseUrl || "Non configure"}</span>
        </p>
      </div>

      {/* Module list */}
      <div className="divide-y divide-border">
        {MODULES.map((mod) => {
          const result = results[mod.key];
          const isTesting = testingModule === mod.key;

          return (
            <div
              key={mod.key}
              className={cn(
                "flex items-center gap-4 px-5 py-3 transition-colors",
                selectedModule === mod.key ? "bg-surface-elevated/50" : "hover:bg-surface-elevated/30"
              )}
              onClick={() => setSelectedModule(mod.key)}
            >
              {/* Module name */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{mod.label}</span>
                  <span className="text-xs font-mono text-foreground-muted">{mod.path}</span>
                </div>

                {/* Result preview */}
                {result && (
                  <p className="text-xs text-foreground-muted mt-1 font-mono truncate max-w-[400px]">
                    {result.response_preview}
                  </p>
                )}
              </div>

              {/* Status badge */}
              {result && (
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded text-xs font-mono font-semibold",
                      result.success
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-red-500/15 text-red-400"
                    )}
                  >
                    {result.status_code || "ERR"}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-foreground-muted">
                    <Clock className="w-3 h-3" />
                    {result.latency_ms}ms
                  </span>
                  {result.success ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400" />
                  )}
                </div>
              )}

              {/* Test button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleTest(mod.key);
                }}
                disabled={!subscription.token_b || !baseUrl || isTesting || testingAll}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-elevated border border-border rounded-lg text-xs font-medium hover:bg-surface transition-colors disabled:opacity-50 shrink-0"
              >
                {isTesting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
                Tester
              </button>
            </div>
          );
        })}
      </div>

      {/* Summary footer */}
      {Object.keys(results).length > 0 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-surface-elevated/20">
          <div className="flex items-center gap-4 text-xs text-foreground-muted">
            <span className="flex items-center gap-1">
              <CheckCircle className="w-3 h-3 text-emerald-400" />
              {Object.values(results).filter((r) => r.success).length} OK
            </span>
            <span className="flex items-center gap-1">
              <XCircle className="w-3 h-3 text-red-400" />
              {Object.values(results).filter((r) => !r.success).length} echoue(s)
            </span>
          </div>
          <span className="text-xs text-foreground-muted">
            Latence moy.:{" "}
            {Math.round(
              Object.values(results).reduce((s, r) => s + r.latency_ms, 0) /
                Object.values(results).length
            )}
            ms
          </span>
        </div>
      )}
    </div>
  );
}
