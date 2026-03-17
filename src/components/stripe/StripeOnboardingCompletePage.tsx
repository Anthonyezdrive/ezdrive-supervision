// ============================================================
// EZDrive — Stripe Connect Onboarding Complete
// Public page: CPO is redirected here after completing Stripe onboarding
// ============================================================

import { useEffect } from "react";
import { CheckCircle } from "lucide-react";

export function StripeOnboardingCompletePage() {
  useEffect(() => {
    document.title = "Onboarding Stripe Connect - Terminé | EZDrive";
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0f1c] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Logo / Brand */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 mx-auto">
          <CheckCircle className="w-8 h-8 text-emerald-400" />
        </div>

        <h1 className="text-2xl font-bold text-white">
          Inscription Stripe Connect terminée
        </h1>

        <p className="text-slate-400 text-sm leading-relaxed">
          Votre compte Stripe Connect a bien été configuré. L'équipe EZDrive va
          vérifier vos informations et activer le flux de paiement pour votre
          entité CPO.
        </p>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 text-left space-y-2">
          <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
            Prochaines étapes
          </p>
          <ul className="text-sm text-slate-300 space-y-1.5">
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5">1.</span>
              Validation du compte par l'équipe EZDrive (24-48h)
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5">2.</span>
              Activation du flux de commission automatique
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-400 mt-0.5">3.</span>
              Notification par email une fois le compte actif
            </li>
          </ul>
        </div>

        <p className="text-xs text-slate-600">
          Vous pouvez fermer cette page. Pour toute question :{" "}
          <a
            href="mailto:support@ezdrive.fr"
            className="text-emerald-400 hover:text-emerald-300 underline"
          >
            support@ezdrive.fr
          </a>
        </p>
      </div>
    </div>
  );
}
