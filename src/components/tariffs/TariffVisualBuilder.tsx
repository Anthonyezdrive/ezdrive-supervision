import { useState, useCallback, useEffect } from "react";
import {
  Plus,
  X,
  Trash2,
  ChevronDown,
  ChevronUp,
  Code,
  Eye,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// OCPI Tariff Visual Builder
// ============================================================

const COMPONENT_TYPES = [
  { type: "ENERGY", label: "Energie", unit: "€/kWh", icon: "⚡" },
  { type: "TIME", label: "Temps", unit: "€/min", icon: "⏱️" },
  { type: "FLAT", label: "Fixe", unit: "€/session", icon: "💰" },
  { type: "PARKING_TIME", label: "Stationnement", unit: "€/min", icon: "🅿️" },
] as const;

const DAYS_OF_WEEK = [
  { key: "MONDAY", label: "Lun" },
  { key: "TUESDAY", label: "Mar" },
  { key: "WEDNESDAY", label: "Mer" },
  { key: "THURSDAY", label: "Jeu" },
  { key: "FRIDAY", label: "Ven" },
  { key: "SATURDAY", label: "Sam" },
  { key: "SUNDAY", label: "Dim" },
] as const;

interface PriceComponent {
  type: string;
  price: number;
  vat?: number;
  step_size?: number;
}

interface Restrictions {
  day_of_week?: string[];
  start_time?: string;
  end_time?: string;
}

interface TariffElement {
  price_components: PriceComponent[];
  restrictions?: Restrictions;
}

interface TariffValue {
  elements: TariffElement[];
}

interface OcpiTariff {
  elements?: Array<{
    price_components?: Array<{
      type?: string;
      price?: number;
      step_size?: number;
      vat?: number;
    }>;
    restrictions?: Record<string, unknown>;
  }>;
}

export interface TariffVisualBuilderProps {
  value: OcpiTariff | OcpiTariff[] | null;
  onChange: (value: OcpiTariff) => void;
  showJsonToggle?: boolean;
}

function normalizeValue(value: OcpiTariff | OcpiTariff[] | null): TariffValue {
  if (!value) return { elements: [] };
  // If it's an array, take the first element
  if (Array.isArray(value)) {
    const first = value[0];
    if (first?.elements && Array.isArray(first.elements)) return first as TariffValue;
    return { elements: [] };
  }
  // If it's already the right shape
  if (value.elements && Array.isArray(value.elements)) return value as TariffValue;
  return { elements: [] };
}

function makeDefaultComponent(): PriceComponent {
  return { type: "ENERGY", price: 0.35, vat: 20, step_size: 1 };
}

function makeDefaultElement(): TariffElement {
  return {
    price_components: [makeDefaultComponent()],
  };
}

export function TariffVisualBuilder({
  value,
  onChange,
  showJsonToggle = true,
}: TariffVisualBuilderProps) {
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [expandedRestrictions, setExpandedRestrictions] = useState<Record<number, boolean>>({});

  const tariff = normalizeValue(value);
  const elements = tariff.elements;

  // Sync JSON text when value changes externally
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (jsonMode) {
      setJsonText(JSON.stringify(normalizeValue(value), null, 2));
    }
  }, [value, jsonMode]);

  const updateElements = useCallback(
    (newElements: TariffElement[]) => {
      onChange({ elements: newElements } as any);
    },
    [onChange]
  );

  // ── Element operations ──
  function addElement() {
    updateElements([...elements, makeDefaultElement()]);
  }

  function removeElement(index: number) {
    updateElements(elements.filter((_, i) => i !== index));
  }

  // ── Component operations ──
  function addComponent(elementIndex: number) {
    const newElements = [...elements];
    const el = { ...newElements[elementIndex] };
    el.price_components = [...el.price_components, makeDefaultComponent()];
    newElements[elementIndex] = el;
    updateElements(newElements);
  }

  function removeComponent(elementIndex: number, compIndex: number) {
    const newElements = [...elements];
    const el = { ...newElements[elementIndex] };
    el.price_components = el.price_components.filter((_, i) => i !== compIndex);
    newElements[elementIndex] = el;
    updateElements(newElements);
  }

  function updateComponent(
    elementIndex: number,
    compIndex: number,
    field: keyof PriceComponent,
    val: string | number
  ) {
    const newElements = [...elements];
    const el = { ...newElements[elementIndex] };
    el.price_components = el.price_components.map((c, i) =>
      i === compIndex ? { ...c, [field]: val } : c
    );
    newElements[elementIndex] = el;
    updateElements(newElements);
  }

  // ── Restriction operations ──
  function toggleRestrictions(elementIndex: number) {
    setExpandedRestrictions((prev) => ({
      ...prev,
      [elementIndex]: !prev[elementIndex],
    }));
  }

  function updateRestriction(
    elementIndex: number,
    field: keyof Restrictions,
    val: string[] | string | undefined
  ) {
    const newElements = [...elements];
    const el = { ...newElements[elementIndex] };
    el.restrictions = { ...(el.restrictions ?? {}), [field]: val };
    // Clean up empty restrictions
    if (
      !el.restrictions.day_of_week?.length &&
      !el.restrictions.start_time &&
      !el.restrictions.end_time
    ) {
      delete el.restrictions;
    }
    newElements[elementIndex] = el;
    updateElements(newElements);
  }

  function toggleDay(elementIndex: number, day: string) {
    const el = elements[elementIndex];
    const currentDays = el.restrictions?.day_of_week ?? [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter((d) => d !== day)
      : [...currentDays, day];
    updateRestriction(elementIndex, "day_of_week", newDays);
  }

  // ── JSON mode handlers ──
  function handleJsonChange(text: string) {
    setJsonText(text);
    setJsonError(null);
    try {
      const parsed = JSON.parse(text);
      const normalized = normalizeValue(parsed);
      onChange(normalized as OcpiTariff);
    } catch (e: unknown) {
      setJsonError("JSON invalide : " + (e instanceof Error ? e.message : String(e)));
    }
  }

  function switchToJsonMode() {
    setJsonText(JSON.stringify(tariff, null, 2));
    setJsonError(null);
    setJsonMode(true);
  }

  function switchToVisualMode() {
    // Try to parse current JSON before switching
    if (jsonText.trim()) {
      try {
        const parsed = JSON.parse(jsonText);
        const normalized = normalizeValue(parsed);
        onChange(normalized as OcpiTariff);
      } catch {
        // Keep current value if JSON is invalid
      }
    }
    setJsonMode(false);
  }

  const getUnitLabel = (type: string) =>
    COMPONENT_TYPES.find((ct) => ct.type === type)?.unit ?? "€";

  const inputClass =
    "px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground font-mono focus:outline-none focus:border-primary/50 transition-colors";

  return (
    <div className="space-y-4">
      {/* Toggle bar */}
      {showJsonToggle && (
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground-muted uppercase tracking-wider">
            Elements tarifaires
          </p>
          <button
            type="button"
            onClick={() => (jsonMode ? switchToVisualMode() : switchToJsonMode())}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground-muted hover:text-foreground bg-surface-elevated border border-border rounded-lg transition-colors"
          >
            {jsonMode ? (
              <>
                <Eye className="w-3.5 h-3.5" />
                Mode visuel
              </>
            ) : (
              <>
                <Code className="w-3.5 h-3.5" />
                Mode avance (JSON)
              </>
            )}
          </button>
        </div>
      )}

      {/* JSON Mode */}
      {jsonMode ? (
        <div className="space-y-2">
          <textarea
            value={jsonText}
            onChange={(e) => handleJsonChange(e.target.value)}
            className="w-full h-80 px-4 py-3 bg-card border border-border rounded-xl text-xs font-mono text-foreground placeholder:text-foreground-muted/50 focus:outline-none focus:border-primary/50 resize-y transition-colors"
            spellCheck={false}
            placeholder='{"elements": [...]}'
          />
          {jsonError && (
            <div className="flex items-center gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <p className="text-xs text-red-400">{jsonError}</p>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Visual Mode */}
          {elements.length === 0 && (
            <div className="py-10 text-center bg-surface-elevated border border-border border-dashed rounded-xl">
              <p className="text-sm text-foreground-muted mb-3">
                Aucun element tarifaire
              </p>
              <button
                type="button"
                onClick={addElement}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-background rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Ajouter un element
              </button>
            </div>
          )}

          <div className="space-y-4">
            {elements.map((element, elIdx) => (
              <div
                key={elIdx}
                className="bg-surface-elevated border border-border rounded-xl p-4 space-y-4"
              >
                {/* Element header */}
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground">
                    Element {elIdx + 1}
                  </h4>
                  <button
                    type="button"
                    onClick={() => removeElement(elIdx)}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Supprimer
                  </button>
                </div>

                {/* Price components */}
                <div className="space-y-3">
                  {element.price_components.map((comp, compIdx) => (
                    <div
                      key={compIdx}
                      className="flex flex-wrap items-end gap-3 p-3 bg-surface border border-border rounded-lg"
                    >
                      {/* Type */}
                      <div className="flex-shrink-0">
                        <label className="block text-[10px] text-foreground-muted mb-1">
                          Type
                        </label>
                        <select
                          value={comp.type}
                          onChange={(e) =>
                            updateComponent(elIdx, compIdx, "type", e.target.value)
                          }
                          className={cn(inputClass, "w-44")}
                        >
                          {COMPONENT_TYPES.map((ct) => (
                            <option key={ct.type} value={ct.type}>
                              {ct.icon} {ct.label} ({ct.type})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Price */}
                      <div className="flex-shrink-0">
                        <label className="block text-[10px] text-foreground-muted mb-1">
                          Prix ({getUnitLabel(comp.type)})
                        </label>
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={comp.price}
                          onChange={(e) =>
                            updateComponent(
                              elIdx,
                              compIdx,
                              "price",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className={cn(inputClass, "w-28 text-right")}
                        />
                      </div>

                      {/* VAT */}
                      <div className="flex-shrink-0">
                        <label className="block text-[10px] text-foreground-muted mb-1">
                          TVA (%)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={comp.vat ?? 20}
                          onChange={(e) =>
                            updateComponent(
                              elIdx,
                              compIdx,
                              "vat",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className={cn(inputClass, "w-20 text-right")}
                        />
                      </div>

                      {/* Step size (not for FLAT) */}
                      {comp.type !== "FLAT" && (
                        <div className="flex-shrink-0">
                          <label className="block text-[10px] text-foreground-muted mb-1">
                            Step size
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={comp.step_size ?? 1}
                            onChange={(e) =>
                              updateComponent(
                                elIdx,
                                compIdx,
                                "step_size",
                                parseInt(e.target.value) || 1
                              )
                            }
                            className={cn(inputClass, "w-20 text-center")}
                          />
                        </div>
                      )}

                      {/* Remove component */}
                      {element.price_components.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeComponent(elIdx, compIdx)}
                          className="p-2 text-foreground-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors mb-0.5"
                          title="Supprimer ce composant"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}

                  {/* Add component button */}
                  <button
                    type="button"
                    onClick={() => addComponent(elIdx)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary hover:text-primary/80 hover:bg-primary/5 border border-dashed border-primary/30 rounded-lg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Ajouter composant
                  </button>
                </div>

                {/* Restrictions toggle */}
                <div className="border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={() => toggleRestrictions(elIdx)}
                    className="flex items-center gap-2 text-xs font-medium text-foreground-muted hover:text-foreground transition-colors"
                  >
                    {expandedRestrictions[elIdx] ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                    Restrictions horaires (optionnel)
                  </button>

                  {expandedRestrictions[elIdx] && (
                    <div className="mt-3 space-y-3 pl-1">
                      {/* Days of week */}
                      <div>
                        <label className="block text-[10px] text-foreground-muted mb-2">
                          Jours de la semaine
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {DAYS_OF_WEEK.map((day) => {
                            const isActive =
                              element.restrictions?.day_of_week?.includes(
                                day.key
                              ) ?? false;
                            return (
                              <button
                                key={day.key}
                                type="button"
                                onClick={() => toggleDay(elIdx, day.key)}
                                className={cn(
                                  "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                                  isActive
                                    ? "bg-primary/10 border-primary/30 text-primary"
                                    : "bg-surface border-border text-foreground-muted hover:text-foreground hover:border-foreground-muted"
                                )}
                              >
                                {day.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Time range */}
                      <div className="flex items-center gap-3">
                        <div>
                          <label className="block text-[10px] text-foreground-muted mb-1">
                            Heure debut
                          </label>
                          <input
                            type="time"
                            value={element.restrictions?.start_time ?? ""}
                            onChange={(e) =>
                              updateRestriction(
                                elIdx,
                                "start_time",
                                e.target.value || undefined
                              )
                            }
                            className={cn(inputClass, "w-32")}
                          />
                        </div>
                        <span className="text-foreground-muted mt-4">—</span>
                        <div>
                          <label className="block text-[10px] text-foreground-muted mb-1">
                            Heure fin
                          </label>
                          <input
                            type="time"
                            value={element.restrictions?.end_time ?? ""}
                            onChange={(e) =>
                              updateRestriction(
                                elIdx,
                                "end_time",
                                e.target.value || undefined
                              )
                            }
                            className={cn(inputClass, "w-32")}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Add element button */}
          {elements.length > 0 && (
            <button
              type="button"
              onClick={addElement}
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-foreground-muted hover:text-foreground bg-surface border border-dashed border-border hover:border-foreground-muted rounded-xl transition-colors w-full justify-center"
            >
              <Plus className="w-4 h-4" />
              Ajouter un element tarifaire
            </button>
          )}
        </>
      )}

      {/* JSON Preview (always visible in visual mode, below elements) */}
      {!jsonMode && elements.length > 0 && (
        <div className="border-t border-border pt-4">
          <p className="text-[10px] font-semibold text-foreground-muted uppercase tracking-wider mb-2">
            Apercu JSON OCPI
          </p>
          <pre className="p-3 bg-card border border-border rounded-lg text-[11px] font-mono text-foreground-muted overflow-x-auto max-h-48 overflow-y-auto">
            {JSON.stringify(tariff, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
