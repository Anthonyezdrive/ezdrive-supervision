import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { Zap, MapPin, CreditCard, Loader2, CheckCircle, AlertCircle, Battery, Clock, Euro, ChevronRight, Shield } from "lucide-react";
import { useTranslation } from "react-i18next";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";
const STRIPE_PK = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "";

// Stripe.js loader (no npm needed — loads via script tag)
let stripePromise: Promise<any> | null = null;
function getStripe(): Promise<any> {
  if (!stripePromise) {
    stripePromise = new Promise((resolve, reject) => {
      if ((window as any).Stripe) {
        resolve((window as any).Stripe(STRIPE_PK));
        return;
      }
      const script = document.createElement("script");
      script.src = "https://js.stripe.com/v3/";
      script.onload = () => resolve((window as any).Stripe(STRIPE_PK));
      script.onerror = () => reject(new Error("Impossible de charger Stripe.js"));
      document.head.appendChild(script);
    });
  }
  return stripePromise;
}

// Direct Pay states
type PayState = "loading" | "station_info" | "payment" | "authorizing" | "charging" | "completing" | "completed" | "error";

interface StationInfo {
  id: string;
  name: string;
  address: string;
  city: string;
  status: string;
  max_power_kw: number;
  connectors: Array<{ type: string; max_power: number }>;
  cpo_name: string;
  tariff?: { energy_price: number; time_price?: number; flat_fee?: number; currency: string };
}

interface SessionStatus {
  energy_kwh: number;
  duration_min: number;
  estimated_cost: number;
  status: string;
}

export default function DirectPayPage() {
  const { t } = useTranslation();
  const { identity, evseUid } = useParams<{ identity: string; evseUid?: string }>();
  const [state, setState] = useState<PayState>("loading");
  const [station, setStation] = useState<StationInfo | null>(null);
  const [email, setEmail] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>({ energy_kwh: 0, duration_min: 0, estimated_cost: 0, status: "" });
  const [error, setError] = useState("");
  const [paymentProcessing, setPaymentProcessing] = useState(false);

  // Stripe refs
  const stripeRef = useRef<any>(null);
  const cardElementRef = useRef<any>(null);
  const cardContainerRef = useRef<HTMLDivElement>(null);
  const [cardReady, setCardReady] = useState(false);
  const [cardError, setCardError] = useState("");

  // Resolve station from QR code
  useEffect(() => {
    if (!identity) { setError(t("directPay.missingIdentity", "Identifiant de borne manquant")); setState("error"); return; }

    const fetchStation = async () => {
      try {
        const url = `${SUPABASE_URL}/functions/v1/qr-charge/${identity}${evseUid ? `/${evseUid}` : ""}`;
        const res = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY } });
        const data = await res.json();

        if (!res.ok || data.error) throw new Error(data.error ?? "Borne introuvable");

        setStation({
          id: data.station_id ?? data.id,
          name: data.station_name ?? data.name ?? "Borne EZDrive",
          address: data.address ?? "",
          city: data.city ?? "",
          status: data.status ?? data.ocpp_status ?? "Unknown",
          max_power_kw: data.max_power_kw ?? 22,
          connectors: data.connectors ?? [],
          cpo_name: data.cpo_name ?? "EZDrive",
          tariff: data.tariff ?? { energy_price: 0.35, currency: "EUR" },
        });
        setState("station_info");
      } catch (err) {
        setError((err as Error).message);
        setState("error");
      }
    };

    fetchStation();
  }, [identity, evseUid]);

  // Poll session status during charging
  useEffect(() => {
    if (state !== "charging" || !sessionId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/spot-payment/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const data = await res.json();
        if (data.session) {
          const s = data.session;
          setSessionStatus({
            energy_kwh: s.energy_kwh ?? (station?.tariff?.energy_price ? (s.total_consumed_cents ?? 0) / 100 / station.tariff.energy_price : 0),
            duration_min: s.duration_min ?? Math.floor((Date.now() - new Date(s.created_at).getTime()) / 60000),
            estimated_cost: (s.total_consumed_cents ?? 0) / 100,
            status: s.status,
          });
          if (s.status === "completed") {
            setState("completed");
          }
        }
      } catch (e) { /* continue polling */ }
    }, 5000);

    return () => clearInterval(interval);
  }, [state, sessionId]);

  const handleStartPayment = () => {
    if (!email || !email.includes("@")) { setError(t("directPay.emailRequired", "Email requis pour le reçu")); return; }
    setError("");
    setState("payment");
  };

  // Mount Stripe Card Element when entering payment state
  useEffect(() => {
    if (state !== "payment") return;

    let mounted = true;

    const initStripe = async () => {
      try {
        const stripe = await getStripe();
        if (!mounted) return;
        stripeRef.current = stripe;

        const elements = stripe.elements({ locale: "fr" });
        const card = elements.create("card", {
          style: {
            base: {
              fontSize: "16px",
              color: "#1f2937",
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              "::placeholder": { color: "#9ca3af" },
            },
            invalid: { color: "#ef4444" },
          },
          hidePostalCode: true,
        });

        // Wait for the container to be rendered
        const waitForContainer = () => {
          if (cardContainerRef.current && mounted) {
            card.mount(cardContainerRef.current);
            cardElementRef.current = card;

            card.on("ready", () => { if (mounted) setCardReady(true); });
            card.on("change", (event: any) => {
              if (!mounted) return;
              setCardError(event.error ? event.error.message : "");
              setCardReady(event.complete);
            });
          } else if (mounted) {
            requestAnimationFrame(waitForContainer);
          }
        };
        waitForContainer();
      } catch (err) {
        if (mounted) {
          setError("Impossible d'initialiser le module de paiement");
        }
      }
    };

    initStripe();

    return () => {
      mounted = false;
      if (cardElementRef.current) {
        try { cardElementRef.current.destroy(); } catch (_) {}
        cardElementRef.current = null;
      }
      setCardReady(false);
      setCardError("");
    };
  }, [state]);

  const handlePayAndCharge = useCallback(async () => {
    if (!station || !stripeRef.current || !cardElementRef.current) return;
    setPaymentProcessing(true);
    setError("");

    try {
      // 1. Create a PaymentIntent on the backend
      const intentRes = await fetch(`${SUPABASE_URL}/functions/v1/spot-payment/create-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({
          station_id: station.id,
          connector_id: 1,
          email,
          amount: 2000, // 20€ pre-auth in cents
        }),
      });

      const intentData = await intentRes.json();
      if (!intentRes.ok || !intentData.client_secret) {
        throw new Error(intentData.error ?? intentData.message ?? "Erreur lors de la création du paiement");
      }

      // 2. Confirm the payment with Stripe
      const { error: stripeError, paymentIntent } = await stripeRef.current.confirmCardPayment(
        intentData.client_secret,
        {
          payment_method: {
            card: cardElementRef.current,
            billing_details: { email },
          },
        }
      );

      if (stripeError) {
        throw new Error(stripeError.message ?? "Le paiement a échoué");
      }

      if (paymentIntent?.status !== "succeeded" && paymentIntent?.status !== "requires_capture") {
        throw new Error("Le paiement n'a pas été confirmé. Veuillez réessayer.");
      }

      // 3. Start the charge on the backend
      setState("authorizing");
      const startRes = await fetch(`${SUPABASE_URL}/functions/v1/qr-charge/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({
          station_id: station.id,
          ocpp_identity: intentData.ocpp_identity,
          id_tag: "DIRECT_PAY",
          connector_id: 1,
        }),
      });

      const startData = await startRes.json();
      if (!startRes.ok || !startData.success) {
        throw new Error(startData.error ?? startData.message ?? "Erreur lors du démarrage de la charge");
      }

      // 4. Move to charging state
      setSessionId(intentData.session_id);
      setState("charging");
    } catch (err) {
      setError((err as Error).message);
      setPaymentProcessing(false);
      setState("payment");
    }
  }, [station, email]);

  // ─── Render ───────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-gray-900 to-gray-800 text-white px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-6 h-6 text-emerald-400" />
          <span className="font-bold text-lg">EZDrive</span>
          <span className="text-xs text-gray-400 ml-1">Direct Pay</span>
        </div>
        <Shield className="w-5 h-5 text-gray-400" />
      </header>

      <main className="max-w-md mx-auto px-4 py-6 space-y-4">
        {/* Loading */}
        {state === "loading" && (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">{t("directPay.searchingStation", "Recherche de la borne...")}</p>
            <p className="text-sm text-gray-400 mt-1">{identity}</p>
          </div>
        )}

        {/* Error */}
        {state === "error" && (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("common.error")}</h2>
            <p className="text-gray-600">{error}</p>
            <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-gray-100 rounded-lg text-sm text-gray-700 hover:bg-gray-200">
              {t("directPay.retry", "Réessayer")}
            </button>
          </div>
        )}

        {/* Station Info */}
        {state === "station_info" && station && (
          <>
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Zap className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h1 className="text-lg font-bold text-gray-900">{station.name}</h1>
                  <div className="flex items-center gap-1 text-sm text-gray-500 mt-0.5">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{station.address}{station.city ? `, ${station.city}` : ""}</span>
                  </div>
                  <span className="text-xs text-gray-400">{station.cpo_name}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="text-xs text-gray-500 mb-1">{t("directPay.maxPower", "Puissance max")}</div>
                  <div className="text-lg font-bold text-gray-900">{station.max_power_kw} kW</div>
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <div className="text-xs text-gray-500 mb-1">{t("common.status")}</div>
                  <div className={`text-lg font-bold ${station.status === "Available" ? "text-emerald-600" : "text-amber-600"}`}>
                    {station.status === "Available" ? t("status.available") : station.status === "Charging" ? t("status.charging") : station.status}
                  </div>
                </div>
              </div>
            </div>

            {/* Tariff */}
            {station.tariff && (
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Euro className="w-4 h-4 text-emerald-500" />
                  {t("directPay.applicableTariff", "Tarif applicable")}
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t("analytics.energy")}</span>
                    <span className="font-medium">{station.tariff.energy_price?.toFixed(2) ?? "0.35"}&euro;/kWh</span>
                  </div>
                  {station.tariff.time_price && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t("directPay.time", "Temps")}</span>
                      <span className="font-medium">{station.tariff.time_price.toFixed(2)}&euro;/h</span>
                    </div>
                  )}
                  {station.tariff.flat_fee && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">{t("directPay.startFee", "Frais de démarrage")}</span>
                      <span className="font-medium">{station.tariff.flat_fee.toFixed(2)}&euro;</span>
                    </div>
                  )}
                  <div className="pt-2 border-t text-xs text-gray-400">
                    {t("directPay.vatIncluded", "TVA 8,5% incluse (DOM-TOM). Pré-autorisation de 20€.")}
                  </div>
                </div>
              </div>
            )}

            {/* Email + Start */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t("directPay.emailForReceipt", "Email (pour le reçu)")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
              {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
              <button
                onClick={handleStartPayment}
                disabled={station.status !== "Available"}
                className="w-full mt-4 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <CreditCard className="w-5 h-5" />
                {t("directPay.payAndCharge", "Payer et recharger")}
                <ChevronRight className="w-4 h-4" />
              </button>
              {station.status !== "Available" && (
                <p className="text-center text-xs text-amber-600 mt-2">
                  {t("directPay.stationUnavailable", "Cette borne n'est pas disponible actuellement")}
                </p>
              )}
            </div>
          </>
        )}

        {/* Payment Form */}
        {state === "payment" && station && (
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-500" />
              {t("directPay.securePayment", "Paiement sécurisé")}
            </h2>

            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <div className="text-sm text-gray-600 mb-1">{t("directPay.preAuthorization", "Pré-autorisation")}</div>
              <div className="text-2xl font-bold text-gray-900">20,00 &euro;</div>
              <div className="text-xs text-gray-400 mt-1">
                {t("directPay.onlyRealAmount", "Seul le montant réel sera débité en fin de session")}
              </div>
            </div>

            {/* Stripe Card Element */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t("directPay.bankCard", "Carte bancaire")}
              </label>
              <div
                ref={cardContainerRef}
                className="border border-gray-200 rounded-xl px-4 py-3.5 bg-white focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-transparent transition-shadow"
              />
              {cardError && (
                <p className="text-red-500 text-xs mt-1.5">{cardError}</p>
              )}
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                <CreditCard className="w-3.5 h-3.5" />
                Visa, Mastercard, CB, Apple Pay, Google Pay
              </div>
            </div>

            <button
              onClick={handlePayAndCharge}
              disabled={paymentProcessing || !cardReady}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 disabled:cursor-not-allowed text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              {paymentProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {t("directPay.authorizingPayment", "Autorisation en cours...")}
                </>
              ) : (
                <>
                  <Shield className="w-5 h-5" />
                  {t("directPay.confirmAndStart", "Confirmer et démarrer la charge")}
                </>
              )}
            </button>

            <p className="text-center text-xs text-gray-400 mt-3 flex items-center justify-center gap-1">
              <Shield className="w-3 h-3" />
              {t("directPay.stripeSecure", "Paiement sécurisé par Stripe. Vos données sont chiffrées.")}
            </p>
          </div>
        )}

        {/* Authorizing */}
        {state === "authorizing" && (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">{t("directPay.startingCharge", "Démarrage de la charge...")}</h2>
            <p className="text-sm text-gray-500">{t("directPay.paymentAccepted", "Paiement accepté. Communication avec la borne en cours.")}</p>
          </div>
        )}

        {/* Charging Session */}
        {state === "charging" && (
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Battery className="w-8 h-8 text-emerald-600 animate-pulse" />
              </div>
              <h2 className="text-xl font-bold text-gray-900">{t("directPay.chargingInProgress", "Charge en cours")}</h2>
              <p className="text-sm text-gray-500 mt-1">{station?.name}</p>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-emerald-50 rounded-xl p-3 text-center">
                <Zap className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                <div className="text-lg font-bold text-emerald-700">{sessionStatus.energy_kwh.toFixed(1)}</div>
                <div className="text-xs text-emerald-600">kWh</div>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <Clock className="w-5 h-5 text-blue-600 mx-auto mb-1" />
                <div className="text-lg font-bold text-blue-700">{sessionStatus.duration_min}</div>
                <div className="text-xs text-blue-600">min</div>
              </div>
              <div className="bg-amber-50 rounded-xl p-3 text-center">
                <Euro className="w-5 h-5 text-amber-600 mx-auto mb-1" />
                <div className="text-lg font-bold text-amber-700">{sessionStatus.estimated_cost.toFixed(2)}</div>
                <div className="text-xs text-amber-600">&euro; estimé</div>
              </div>
            </div>

            <div className="w-full bg-emerald-100 rounded-full h-2 mb-4">
              <div className="bg-emerald-500 h-2 rounded-full animate-pulse" style={{ width: "60%" }} />
            </div>

            <p className="text-center text-xs text-gray-400">
              {t("directPay.updateEvery5s", "Mise à jour toutes les 5 secondes. Déconnectez le câble pour arrêter la charge.")}
            </p>
          </div>
        )}

        {/* Completed */}
        {state === "completed" && (
          <div className="bg-white rounded-2xl p-6 shadow-sm text-center">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">{t("directPay.chargeCompleted", "Charge terminée !")}</h2>

            <div className="bg-gray-50 rounded-xl p-4 my-4 text-left">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">{t("directPay.station", "Borne")}</span>
                  <span className="font-medium">{station?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t("analytics.energy")}</span>
                  <span className="font-medium">{sessionStatus.energy_kwh.toFixed(2)} kWh</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">{t("sessions.duration")}</span>
                  <span className="font-medium">{sessionStatus.duration_min} min</span>
                </div>
                <div className="flex justify-between pt-2 border-t">
                  <span className="font-semibold text-gray-900">{t("common.total")}</span>
                  <span className="font-bold text-emerald-600">{sessionStatus.estimated_cost.toFixed(2)} &euro;</span>
                </div>
              </div>
            </div>

            <p className="text-sm text-gray-500 mb-4">
              {t("directPay.receiptSentTo", "Un reçu a été envoyé à")} <strong>{email}</strong>
            </p>

            <button
              onClick={() => { setState("station_info"); setSessionId(null); }}
              className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700 transition-colors"
            >
              {t("directPay.newCharge", "Nouvelle charge")}
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-4 text-xs text-gray-400">
        {t("directPay.poweredBy", "Propulsé par")} <strong>EZDrive</strong> — {t("directPay.domTomCharging", "Recharge électrique DOM-TOM")}
      </footer>
    </div>
  );
}
