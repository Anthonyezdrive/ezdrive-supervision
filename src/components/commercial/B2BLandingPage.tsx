import { Link } from "react-router-dom";
import {
  Zap, BarChart3, Users, Download, MapPin, Shield,
  Clock, Euro, Gauge, ChevronRight, ArrowRight, CheckCircle,
  Building2, Plug, TrendingUp, FileSpreadsheet,
} from "lucide-react";

// ── EZDrive Brand Colors ──
const EZ_GREEN = "#9ACC0E";
const EZ_GREEN_HOVER = "#85B50C";
const EZ_BLUE = "#00C3FF";
const EZ_BLUE_HOVER = "#00A8D6";

/* ────────────────────── HERO ────────────────────── */
function Hero() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28 px-4">
      {/* Dual gradient glow — green + blue */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-[500px] h-[400px] blur-[140px] rounded-full opacity-20" style={{ backgroundColor: EZ_GREEN }} />
        <div className="absolute top-1/3 right-1/4 w-[400px] h-[350px] blur-[120px] rounded-full opacity-15" style={{ backgroundColor: EZ_BLUE }} />
      </div>

      <div className="relative max-w-5xl mx-auto text-center space-y-6">
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 border rounded-full text-sm font-medium"
          style={{ backgroundColor: `${EZ_GREEN}15`, borderColor: `${EZ_GREEN}30`, color: EZ_GREEN }}
        >
          <Zap className="w-4 h-4" />
          Plateforme de supervision EZDrive
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-heading font-bold text-foreground leading-tight">
          Le portail dédié à{" "}
          <span style={{ color: EZ_GREEN }}>vos bornes</span>
          <br />de{" "}
          <span style={{ color: EZ_BLUE }}>recharge</span>
        </h1>

        <p className="text-lg sm:text-xl text-foreground-muted max-w-2xl mx-auto leading-relaxed">
          Suivez en temps réel la consommation de vos collaborateurs,
          analysez vos données par site et par conducteur,
          et exportez vos rapports en un clic.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <a
            href="mailto:contact@ezdrive.fr?subject=Demande de démonstration portail B2B"
            className="inline-flex items-center gap-2 px-8 py-3.5 text-white font-semibold rounded-xl transition-all shadow-lg"
            style={{ backgroundColor: EZ_GREEN, boxShadow: `0 10px 25px ${EZ_GREEN}40` }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = EZ_GREEN_HOVER)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = EZ_GREEN)}
          >
            Demander une démo
            <ArrowRight className="w-5 h-5" />
          </a>
          <Link
            to="/portail"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-surface-elevated hover:bg-surface border border-border rounded-xl font-medium text-foreground transition-colors"
          >
            Se connecter
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────── MOCK DASHBOARD ────────────────────── */
function MockDashboard() {
  const kpis = [
    { label: "Durée totale", value: "8 542h", icon: Clock, color: EZ_BLUE },
    { label: "Volume total", value: "71 570 kWh", icon: Zap, color: EZ_GREEN },
    { label: "Redevance", value: "16 326 €", icon: Euro, color: "#F39C12" },
    { label: "Saturation", value: "18,4%", icon: Gauge, color: "#E74C3C" },
  ];

  const months = [
    { name: "jan", v: 42 }, { name: "fév", v: 48 }, { name: "mars", v: 55 },
    { name: "avr", v: 52 }, { name: "mai", v: 61 }, { name: "juin", v: 68 },
    { name: "juil", v: 73 }, { name: "août", v: 65 }, { name: "sept", v: 78 },
    { name: "oct", v: 85 }, { name: "nov", v: 82 }, { name: "déc", v: 90 },
  ];
  const maxV = Math.max(...months.map((m) => m.v));

  return (
    <section className="py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-foreground">
            Un tableau de bord clair et actionnable
          </h2>
          <p className="text-foreground-muted mt-2">
            Vue d'ensemble de votre consommation, mise à jour quotidiennement
          </p>
        </div>

        {/* Mock dashboard card */}
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-xl shadow-black/20 relative overflow-hidden">
          {/* Subtle brand accent line at top */}
          <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${EZ_GREEN}, ${EZ_BLUE})` }} />

          {/* Top bar */}
          <div className="flex items-center justify-between mb-6 mt-1">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${EZ_GREEN}20` }}>
                <Building2 className="w-4 h-4" style={{ color: EZ_GREEN }} />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Votre Entreprise SA</p>
                <p className="text-xs text-foreground-muted">6 sites — 25 conducteurs</p>
              </div>
            </div>
            <div className="text-xs text-foreground-muted bg-surface-elevated px-3 py-1.5 rounded-lg border border-border">
              2025
            </div>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {kpis.map((k) => (
              <div key={k.label} className="bg-surface-elevated border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <k.icon className="w-4 h-4" style={{ color: k.color }} />
                  <span className="text-xs text-foreground-muted">{k.label}</span>
                </div>
                <p className="text-xl font-heading font-bold text-foreground">{k.value}</p>
              </div>
            ))}
          </div>

          {/* Bar chart mock */}
          <div className="bg-surface-elevated border border-border rounded-xl p-4">
            <p className="text-sm font-medium text-foreground mb-4">Volume mensuel (kWh)</p>
            <div className="flex items-end gap-1.5 h-40">
              {months.map((m, i) => (
                <div key={m.name} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-md transition-all"
                    style={{
                      height: `${(m.v / maxV) * 100}%`,
                      backgroundColor: i % 2 === 0 ? EZ_GREEN : EZ_BLUE,
                      opacity: 0.8,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.8")}
                  />
                  <span className="text-[10px] text-foreground-muted">{m.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────── FEATURES ────────────────────── */
function Features() {
  const features = [
    {
      icon: BarChart3,
      title: "Vue d'ensemble",
      desc: "KPIs en temps réel : volume, durée, redevance, saturation. Courbe mensuelle de votre consommation avec croissance visible.",
      color: EZ_GREEN,
    },
    {
      icon: FileSpreadsheet,
      title: "Rapport mensuel",
      desc: "Détail mois par mois avec ventilation sessions payantes vs gratuites (avantage salarié). Export CSV en un clic.",
      color: EZ_BLUE,
    },
    {
      icon: MapPin,
      title: "Analyse par site",
      desc: "Répartition de la consommation par borne et par site. Taux de saturation, CO2 évité, nombre de sessions.",
      color: "#F39C12",
    },
    {
      icon: Users,
      title: "Suivi par conducteur",
      desc: "Identifiez vos plus gros consommateurs, suivez les badges RFID, visualisez la répartition du volume gratuit.",
      color: EZ_BLUE,
    },
    {
      icon: Download,
      title: "Exports illimités",
      desc: "Téléchargez vos données au format CSV depuis n'importe quelle vue. Idéal pour vos reportings internes ou comptables.",
      color: EZ_GREEN,
    },
    {
      icon: Shield,
      title: "Accès sécurisé",
      desc: "Chaque entreprise dispose de son propre espace isolé. Vos données ne sont visibles que par vos utilisateurs autorisés.",
      color: EZ_BLUE,
    },
  ];

  return (
    <section className="py-16 px-4 bg-surface-elevated/30">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-foreground">
            Tout ce dont vous avez besoin
          </h2>
          <p className="text-foreground-muted mt-2">
            Un portail complet pour piloter votre infrastructure de recharge
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-surface border border-border rounded-2xl p-6 transition-all group hover:shadow-lg"
              style={{ ["--hover-border" as string]: `${f.color}40` }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${f.color}40`)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
                style={{ backgroundColor: `${f.color}15` }}
              >
                <f.icon className="w-5 h-5" style={{ color: f.color }} />
              </div>
              <h3 className="text-base font-semibold text-foreground mb-2">{f.title}</h3>
              <p className="text-sm text-foreground-muted leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────── USE CASES ────────────────────── */
function UseCases() {
  const cases = [
    {
      icon: Building2,
      title: "Entreprise multisites",
      subtitle: "Flottes & collaborateurs",
      points: [
        "Suivi de la consommation par site (siège, agences, entrepôts)",
        "Gestion des badges RFID par collaborateur",
        "Ventilation sessions payantes vs avantage salarié",
        "Reporting consolidé pour la direction",
      ],
      color: EZ_BLUE,
    },
    {
      icon: Plug,
      title: "Bornes publiques DC",
      subtitle: "Investisseurs & foncières",
      points: [
        "Suivi du chiffre d'affaires par station",
        "Analyse du roaming multi-opérateurs (Ionity, TotalEnergies…)",
        "Taux de fréquentation et saturation par borne",
        "Calcul automatique de la redevance",
      ],
      color: EZ_GREEN,
    },
  ];

  return (
    <section className="py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-foreground">
            Adapté à votre activité
          </h2>
          <p className="text-foreground-muted mt-2">
            Deux cas d'usage, un seul portail
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {cases.map((c) => (
            <div
              key={c.title}
              className="bg-surface border border-border rounded-2xl p-8 relative overflow-hidden"
            >
              {/* Subtle glow */}
              <div
                className="absolute top-0 right-0 w-40 h-40 rounded-full blur-[80px] opacity-20"
                style={{ backgroundColor: c.color }}
              />
              <div className="relative">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${c.color}15` }}
                  >
                    <c.icon className="w-6 h-6" style={{ color: c.color }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{c.title}</h3>
                    <p className="text-sm text-foreground-muted">{c.subtitle}</p>
                  </div>
                </div>
                <ul className="space-y-3">
                  {c.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-sm text-foreground-muted">
                      <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: c.color }} />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────── STATS ────────────────────── */
function Stats() {
  const stats = [
    { value: "125 000+", label: "Sessions de charge", icon: Zap, color: EZ_GREEN },
    { value: "50+", label: "Entreprises clientes", icon: Building2, color: EZ_BLUE },
    { value: "2M+", label: "kWh distribués", icon: TrendingUp, color: EZ_GREEN },
    { value: "24/7", label: "Données accessibles", icon: Clock, color: EZ_BLUE },
  ];

  return (
    <section className="py-16 px-4 bg-surface-elevated/30">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <s.icon className="w-6 h-6 mx-auto mb-3" style={{ color: s.color }} />
              <p className="text-3xl sm:text-4xl font-heading font-bold text-foreground">{s.value}</p>
              <p className="text-sm text-foreground-muted mt-1">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────── CTA ────────────────────── */
function CTA() {
  return (
    <section className="py-20 px-4">
      <div className="max-w-3xl mx-auto text-center">
        <div
          className="border rounded-3xl p-10 sm:p-14 relative overflow-hidden"
          style={{ borderColor: `${EZ_GREEN}25`, background: `linear-gradient(135deg, ${EZ_GREEN}08, transparent 40%, ${EZ_BLUE}06)` }}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] blur-[100px] rounded-full opacity-20" style={{ background: `linear-gradient(90deg, ${EZ_GREEN}, ${EZ_BLUE})` }} />
          <div className="relative space-y-5">
            <h2 className="text-2xl sm:text-3xl font-heading font-bold text-foreground">
              Prêt à piloter vos bornes ?
            </h2>
            <p className="text-foreground-muted max-w-lg mx-auto">
              Contactez-nous pour une démonstration personnalisée.
              Nous configurons votre espace en moins de 24h.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              <a
                href="mailto:contact@ezdrive.fr?subject=Demande de démonstration portail B2B"
                className="inline-flex items-center gap-2 px-8 py-3.5 text-white font-semibold rounded-xl transition-all shadow-lg"
                style={{ backgroundColor: EZ_GREEN, boxShadow: `0 10px 25px ${EZ_GREEN}40` }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = EZ_GREEN_HOVER)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = EZ_GREEN)}
              >
                Demander une démo
                <ArrowRight className="w-5 h-5" />
              </a>
              <a
                href="tel:+33596601234"
                className="inline-flex items-center gap-2 text-sm text-foreground-muted hover:text-foreground transition-colors"
              >
                ou appelez-nous au 05 96 60 12 34
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────── FOOTER ────────────────────── */
function Footer() {
  return (
    <footer className="border-t border-border py-8 px-4">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img src="/logo-ezdrive.png" alt="EZDrive" className="h-8" />
          <span className="text-sm text-foreground-muted">
            Supervision de bornes de recharge
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm text-foreground-muted">
          <Link to="/portail" className="hover:text-foreground transition-colors">
            Connexion portail
          </Link>
          <a href="mailto:contact@ezdrive.fr" className="hover:text-foreground transition-colors">
            Contact
          </a>
          <a href="https://www.ezdrive.fr" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
            ezdrive.fr
          </a>
        </div>
      </div>
    </footer>
  );
}

/* ────────────────────── MAIN PAGE ────────────────────── */
export function B2BLandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 backdrop-blur-lg bg-background/80 border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/offre-b2b" className="flex items-center gap-2.5">
            <img src="/logo-ezdrive.png" alt="EZDrive" className="h-9" />
          </Link>
          <div className="flex items-center gap-3">
            <a
              href="mailto:contact@ezdrive.fr?subject=Demande de démonstration portail B2B"
              className="hidden sm:inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground transition-colors"
            >
              Demander une démo
            </a>
            <Link
              to="/portail"
              className="inline-flex items-center gap-1.5 px-5 py-2 text-white text-sm font-semibold rounded-lg transition-colors"
              style={{ backgroundColor: EZ_GREEN }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = EZ_GREEN_HOVER)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = EZ_GREEN)}
            >
              Se connecter
            </Link>
          </div>
        </div>
      </nav>

      <Hero />
      <MockDashboard />
      <Features />
      <UseCases />
      <Stats />
      <CTA />
      <Footer />
    </div>
  );
}
