import { Link } from "react-router-dom";
import {
  Zap, BarChart3, Users, Download, MapPin, Shield,
  Clock, Euro, Gauge, ChevronRight, ArrowRight, CheckCircle,
  Building2, Plug, TrendingUp, FileSpreadsheet, AlertTriangle,
  Eye, Target, Lightbulb, ArrowUpRight, Star, Leaf,
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
          Transformez vos bornes en{" "}
          <span style={{ color: EZ_GREEN }}>levier de performance</span>
        </h1>

        <p className="text-lg sm:text-xl text-foreground-muted max-w-3xl mx-auto leading-relaxed">
          Vos bornes de recharge produisent des milliers de données chaque jour.
          Sans outil adapté, vous perdez en visibilité, en rentabilité et en contrôle.{" "}
          <span className="text-foreground font-medium">EZDrive transforme ces données en décisions.</span>
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <a
            href="mailto:contact@ezdrive.fr?subject=Demande de démonstration portail B2B"
            className="inline-flex items-center gap-2 px-8 py-3.5 text-white font-semibold rounded-xl transition-all shadow-lg"
            style={{ backgroundColor: EZ_GREEN, boxShadow: `0 10px 25px ${EZ_GREEN}40` }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = EZ_GREEN_HOVER)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = EZ_GREEN)}
          >
            Demander une démo gratuite
            <ArrowRight className="w-5 h-5" />
          </a>
          <Link
            to="/portail"
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-surface-elevated hover:bg-surface border border-border rounded-xl font-medium text-foreground transition-colors"
          >
            Accéder à mon portail
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Trust bar */}
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 pt-6 text-sm text-foreground-muted">
          <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4" style={{ color: EZ_GREEN }} /> Mise en service en 24h</span>
          <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4" style={{ color: EZ_GREEN }} /> Sans engagement</span>
          <span className="flex items-center gap-1.5"><CheckCircle className="w-4 h-4" style={{ color: EZ_GREEN }} /> Support dédié</span>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────── PAIN POINTS ────────────────────── */
function PainPoints() {
  const pains = [
    {
      icon: AlertTriangle,
      pain: "Vous recevez des factures d'énergie sans savoir qui consomme quoi",
      solve: "Ventilation automatique par conducteur, par badge, par tarif (payant vs avantage salarié)",
    },
    {
      icon: Eye,
      pain: "Impossible de savoir si vos bornes sont réellement utilisées",
      solve: "Taux de saturation en temps réel par borne et par site, avec alertes de sous-utilisation",
    },
    {
      icon: Euro,
      pain: "Le calcul des redevances et des refacturations est un casse-tête",
      solve: "Calcul automatique des redevances, rapports mensuels prêts à transmettre à la comptabilité",
    },
  ];

  return (
    <section className="py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-foreground">
            Vous gérez des bornes de recharge ?
          </h2>
          <p className="text-foreground-muted mt-2 max-w-2xl mx-auto">
            Ces situations vous parlent sûrement. EZDrive les résout.
          </p>
        </div>

        <div className="space-y-4">
          {pains.map((p, i) => (
            <div key={i} className="bg-surface border border-border rounded-2xl p-6 flex flex-col sm:flex-row gap-6 items-start">
              <div className="flex items-center gap-4 sm:w-1/2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-red-500/10">
                  <p.icon className="w-5 h-5 text-red-400" />
                </div>
                <p className="text-sm text-foreground-muted leading-relaxed">{p.pain}</p>
              </div>
              <div className="hidden sm:block w-px h-12 bg-border self-center" />
              <div className="flex items-center gap-4 sm:w-1/2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${EZ_GREEN}15` }}>
                  <CheckCircle className="w-5 h-5" style={{ color: EZ_GREEN }} />
                </div>
                <p className="text-sm text-foreground font-medium leading-relaxed">{p.solve}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────── MOCK DASHBOARD ────────────────────── */
function MockDashboard() {
  const kpis = [
    { label: "Durée totale", value: "757h48min", icon: Clock, color: EZ_BLUE },
    { label: "Volume total", value: "28 575 kWh", icon: Zap, color: EZ_GREEN },
    { label: "Redevance", value: "3 964,65 €", icon: Euro, color: "#F39C12" },
    { label: "Saturation", value: "12,3%", icon: Gauge, color: EZ_GREEN },
  ];

  const months = [
    { name: "jan", v: 9409, label: "9 409" },
    { name: "fév", v: 9451, label: "9 451" },
    { name: "mars", v: 9715, label: "9 715" },
    { name: "avr", v: 8820, label: "8 820" },
    { name: "mai", v: 10230, label: "10 230" },
    { name: "juin", v: 11050, label: "11 050" },
    { name: "juil", v: 9870, label: "9 870" },
    { name: "août", v: 7540, label: "7 540" },
    { name: "sept", v: 10680, label: "10 680" },
    { name: "oct", v: 11290, label: "11 290" },
    { name: "nov", v: 10450, label: "10 450" },
    { name: "déc", v: 8920, label: "8 920" },
  ];
  const maxV = Math.max(...months.map((m) => m.v));

  return (
    <section className="py-16 px-4 bg-surface-elevated/30">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-foreground">
            Une vision claire, des décisions rapides
          </h2>
          <p className="text-foreground-muted mt-2 max-w-2xl mx-auto">
            Toutes vos données de recharge consolidées dans un tableau de bord unique,
            mis à jour quotidiennement, accessible depuis n'importe quel appareil.
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
                <p className="text-sm font-semibold text-foreground">Entreprise Démo SA</p>
                <p className="text-xs text-foreground-muted">4 sites — 32 bornes — 18 conducteurs</p>
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
            <p className="text-sm font-medium text-foreground mb-2">Somme de Volume par Mois</p>
            {/* Y axis labels + bars */}
            <div className="flex gap-2">
              <div className="flex flex-col justify-between text-[10px] text-foreground-muted py-1 w-10 text-right shrink-0" style={{ height: "180px" }}>
                <span>12 000</span>
                <span>9 000</span>
                <span>6 000</span>
                <span>3 000</span>
                <span>0</span>
              </div>
              <div className="flex items-end gap-1 flex-1" style={{ height: "180px" }}>
                {months.map((m, i) => (
                  <div key={m.name} className="flex-1 flex flex-col items-center gap-0.5">
                    <span className="text-[9px] text-foreground-muted font-medium">{m.label}</span>
                    <div
                      className="w-full rounded-t-md transition-all cursor-pointer"
                      style={{
                        height: `${(m.v / maxV) * 100}%`,
                        backgroundColor: EZ_GREEN,
                        opacity: 0.85,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.85")}
                    />
                    <span className="text-[10px] text-foreground-muted">{m.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Secondary stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            {[
              { label: "Sessions", value: "1 847", sub: "total" },
              { label: "Vol. moyen / session", value: "15,5 kWh", sub: "" },
              { label: "CO₂ évité", value: "8,2 tonnes", sub: "vs thermique" },
              { label: "Taux d'utilisation", value: "67%", sub: "heures ouvrées" },
            ].map((s) => (
              <div key={s.label} className="bg-surface border border-border rounded-xl p-3 text-center">
                <p className="text-[10px] text-foreground-muted">{s.label}</p>
                <p className="text-sm font-heading font-bold text-foreground">{s.value}</p>
                {s.sub && <p className="text-[9px] text-foreground-muted">{s.sub}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────── VALUE PROPOSITIONS ────────────────────── */
function ValueProps() {
  const values = [
    {
      icon: Target,
      title: "Optimisez la rentabilité de chaque borne",
      desc: "Identifiez les bornes sous-utilisées, les créneaux creux et les sites les plus rentables. Prenez les bonnes décisions d'investissement grâce à des données concrètes, pas des suppositions.",
      metric: "Jusqu'à 30% de gains d'exploitation",
      color: EZ_GREEN,
    },
    {
      icon: Clock,
      title: "Gagnez des heures de gestion chaque mois",
      desc: "Plus besoin de croiser manuellement fichiers Excel et factures. Les rapports mensuels sont générés automatiquement avec la ventilation par conducteur, par tarif et par site.",
      metric: "Export CSV en 1 clic",
      color: EZ_BLUE,
    },
    {
      icon: Euro,
      title: "Maîtrisez vos coûts et vos revenus",
      desc: "Redevances calculées automatiquement, sessions payantes distinguées des avantages salariés, refacturation simplifiée. Votre comptabilité vous remerciera.",
      metric: "Calcul automatique des redevances",
      color: "#F39C12",
    },
    {
      icon: Users,
      title: "Gardez le contrôle sur chaque utilisateur",
      desc: "Chaque badge RFID est tracé. Vous savez qui charge, où, quand et combien. Idéal pour gérer les flottes, les avantages en nature et les abus éventuels.",
      metric: "Suivi individuel par badge",
      color: EZ_BLUE,
    },
    {
      icon: MapPin,
      title: "Pilotez vos sites à distance",
      desc: "Que vous ayez 2 ou 200 sites, le portail consolide tout. Comparez les performances entre sites, détectez les anomalies et arbitrez vos priorités.",
      metric: "Vision multi-sites unifiée",
      color: EZ_GREEN,
    },
    {
      icon: Leaf,
      title: "Valorisez votre impact environnemental",
      desc: "Le CO2 évité est calculé automatiquement pour chaque session. Intégrez ces données dans vos rapports RSE et communiquez sur votre engagement vert.",
      metric: "Rapport CO2 intégré",
      color: "#22C55E",
    },
  ];

  return (
    <section className="py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-foreground">
            Ce qu'EZDrive change concrètement pour vous
          </h2>
          <p className="text-foreground-muted mt-2 max-w-2xl mx-auto">
            Pas juste des graphiques. Des résultats mesurables sur votre exploitation.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {values.map((f) => (
            <div
              key={f.title}
              className="bg-surface border border-border rounded-2xl p-6 transition-all group hover:shadow-lg flex flex-col"
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
              <p className="text-sm text-foreground-muted leading-relaxed flex-1">{f.desc}</p>
              <div
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full w-fit"
                style={{ backgroundColor: `${f.color}12`, color: f.color }}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                {f.metric}
              </div>
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
      title: "Entreprises & flottes",
      subtitle: "Parkings privés, avantage salarié, multi-sites",
      points: [
        "Suivi de la consommation par site (siège, agences, entrepôts, parkings)",
        "Gestion des badges RFID par collaborateur avec plafonds de consommation",
        "Ventilation automatique sessions payantes vs avantage en nature",
        "Reporting consolidé prêt pour la direction financière et les RH",
      ],
      cta: "Vous gérez des bornes en entreprise ? Parlons-en →",
      color: EZ_BLUE,
    },
    {
      icon: Plug,
      title: "Opérateurs & investisseurs",
      subtitle: "Bornes publiques DC, roaming, foncières",
      points: [
        "Suivi du chiffre d'affaires en temps réel par station et par opérateur",
        "Analyse du roaming multi-opérateurs (Ionity, TotalEnergies, Freshmile...)",
        "Taux de fréquentation et saturation par borne avec historique",
        "Calcul automatique de la redevance et des marges par point de charge",
      ],
      cta: "Vous investissez dans la recharge publique ? Discutons →",
      color: EZ_GREEN,
    },
  ];

  return (
    <section className="py-16 px-4 bg-surface-elevated/30">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-foreground">
            Adapté à votre modèle, quel qu'il soit
          </h2>
          <p className="text-foreground-muted mt-2 max-w-2xl mx-auto">
            Que vous soyez une entreprise avec des bornes pour vos salariés
            ou un investisseur avec des stations publiques, EZDrive s'adapte.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {cases.map((c) => (
            <div
              key={c.title}
              className="bg-surface border border-border rounded-2xl p-8 relative overflow-hidden flex flex-col"
            >
              {/* Subtle glow */}
              <div
                className="absolute top-0 right-0 w-40 h-40 rounded-full blur-[80px] opacity-20"
                style={{ backgroundColor: c.color }}
              />
              <div className="relative flex-1">
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
                <ul className="space-y-3 mb-6">
                  {c.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-sm text-foreground-muted">
                      <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: c.color }} />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <a
                href="mailto:contact@ezdrive.fr?subject=Demande de démonstration portail B2B"
                className="text-sm font-medium transition-colors"
                style={{ color: c.color }}
              >
                {c.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ────────────────────── WHY EZDRIVE ────────────────────── */
function WhyEZDrive() {
  const diffs = [
    {
      icon: Lightbulb,
      title: "Conçu par un opérateur, pour les opérateurs",
      desc: "EZDrive n'est pas un outil générique. Nous exploitons nous-mêmes des bornes de recharge. Chaque fonctionnalité répond à un besoin terrain que nous avons vécu.",
    },
    {
      icon: Zap,
      title: "Opérationnel en 24 heures",
      desc: "Pas de projet IT de 6 mois. On connecte vos bornes, on configure votre espace et vous avez accès à vos données dès le lendemain. C'est aussi simple que ça.",
    },
    {
      icon: Shield,
      title: "Vos données restent les vôtres",
      desc: "Chaque entreprise dispose d'un espace totalement isolé. Aucune donnée partagée, aucun accès croisé. Hébergement sécurisé et conforme RGPD.",
    },
    {
      icon: Star,
      title: "Un accompagnement humain, pas un chatbot",
      desc: "Un interlocuteur dédié vous accompagne de la mise en service au quotidien. Questions, personnalisations, évolutions : on est là.",
    },
  ];

  return (
    <section className="py-16 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-foreground">
            Pourquoi choisir EZDrive ?
          </h2>
          <p className="text-foreground-muted mt-2 max-w-2xl mx-auto">
            Ce qui nous distingue, c'est notre approche terrain et notre engagement à vos côtés.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {diffs.map((d, i) => (
            <div key={i} className="flex items-start gap-4 p-5 rounded-2xl border border-border bg-surface hover:bg-surface-elevated transition-colors">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: i % 2 === 0 ? `${EZ_GREEN}15` : `${EZ_BLUE}15` }}
              >
                <d.icon className="w-5 h-5" style={{ color: i % 2 === 0 ? EZ_GREEN : EZ_BLUE }} />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground mb-1">{d.title}</h3>
                <p className="text-sm text-foreground-muted leading-relaxed">{d.desc}</p>
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
    { value: "125 000+", label: "Sessions supervisées", icon: Zap, color: EZ_GREEN },
    { value: "50+", label: "Entreprises nous font confiance", icon: Building2, color: EZ_BLUE },
    { value: "2M+", label: "kWh suivis et analysés", icon: TrendingUp, color: EZ_GREEN },
    { value: "24h", label: "Pour être opérationnel", icon: Clock, color: EZ_BLUE },
  ];

  return (
    <section className="py-16 px-4 bg-surface-elevated/30">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-foreground">
            La confiance se mesure en chiffres
          </h2>
        </div>
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

/* ────────────────────── HOW IT WORKS ────────────────────── */
function HowItWorks() {
  const steps = [
    { num: "01", title: "Contactez-nous", desc: "Un appel de 15 min pour comprendre votre parc et vos besoins.", color: EZ_GREEN },
    { num: "02", title: "On configure tout", desc: "Connexion de vos bornes, import des conducteurs, paramétrage des tarifs.", color: EZ_BLUE },
    { num: "03", title: "C'est en ligne", desc: "Votre portail est prêt. Vos équipes se connectent et pilotent.", color: EZ_GREEN },
  ];

  return (
    <section className="py-16 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-heading font-bold text-foreground">
            Démarrez en 3 étapes
          </h2>
          <p className="text-foreground-muted mt-2">
            Pas de cahier des charges, pas de développement. On s'occupe de tout.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-6">
          {steps.map((s, i) => (
            <div key={i} className="flex-1 relative">
              <div className="bg-surface border border-border rounded-2xl p-6 text-center h-full">
                <div
                  className="text-3xl font-heading font-bold mb-3"
                  style={{ color: s.color, opacity: 0.3 }}
                >
                  {s.num}
                </div>
                <h3 className="text-base font-semibold text-foreground mb-2">{s.title}</h3>
                <p className="text-sm text-foreground-muted leading-relaxed">{s.desc}</p>
              </div>
              {i < steps.length - 1 && (
                <div className="hidden sm:block absolute top-1/2 -right-3 transform -translate-y-1/2 z-10">
                  <ChevronRight className="w-5 h-5 text-foreground-muted" />
                </div>
              )}
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
              Prêt à reprendre le contrôle de vos bornes ?
            </h2>
            <p className="text-foreground-muted max-w-lg mx-auto">
              Réservez une démo de 15 minutes. On vous montre le portail avec vos propres données.
              Aucun engagement, aucun frais de setup.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              <a
                href="mailto:contact@ezdrive.fr?subject=Demande de démonstration portail B2B"
                className="inline-flex items-center gap-2 px-8 py-3.5 text-white font-semibold rounded-xl transition-all shadow-lg"
                style={{ backgroundColor: EZ_GREEN, boxShadow: `0 10px 25px ${EZ_GREEN}40` }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = EZ_GREEN_HOVER)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = EZ_GREEN)}
              >
                Réserver ma démo gratuite
                <ArrowRight className="w-5 h-5" />
              </a>
              <a
                href="tel:+33596601234"
                className="inline-flex items-center gap-2 text-sm text-foreground-muted hover:text-foreground transition-colors"
              >
                ou appelez le 05 96 60 12 34
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
      <PainPoints />
      <MockDashboard />
      <ValueProps />
      <UseCases />
      <WhyEZDrive />
      <Stats />
      <HowItWorks />
      <CTA />
      <Footer />
    </div>
  );
}
