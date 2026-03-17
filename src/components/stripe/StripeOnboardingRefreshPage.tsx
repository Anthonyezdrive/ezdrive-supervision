// ============================================================
// EZDrive — Stripe Connect Onboarding Refresh
// Public page: CPO is redirected here if the Stripe link expired
// ============================================================

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

export function StripeOnboardingRefreshPage() {
  useEffect(() => {
    document.title = "Onboarding Stripe Connect - Lien expiré | EZDrive";
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0f1c] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Logo / Brand */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/30 mx-auto">
          <RefreshCw className="w-8 h-8 text-amber-400" />
        </div>

        <h1 className="text-2xl font-bold text-white">
          Lien d'inscription expiré
        </h1>

        <p className="text-slate-400 text-sm leading-relaxed">
          Le lien d'inscription Stripe Connect a expiré ou n'est plus valide.
          Cela peut arriver si la session a pris trop de temps.
        </p>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-left space-y-2">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
            Que faire ?
          </p>
          <ul className="text-sm text-slate-300 space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="text-amber-400 mt-0.5">1.</span>
              Contactez l'équipe EZDrive pour obtenir un nouveau lien
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-400 mt-0.5">2.</span>
              Un nouveau lien d'inscription vous sera envoyé par email
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-400 mt-0.5">3.</span>
              Vos informations précédemment saisies ont été sauvegardées
            </li>
          </ul>
        </div>

        <p className="text-xs text-slate-600">
          Contact :{" "}
          <a
            href="mailto:support@ezdrive.fr"
            className="text-amber-400 hover:text-amber-300 underline"
          >
            support@ezdrive.fr
          </a>
        </p>
      </div>
    </div>
  );
}
