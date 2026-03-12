# EZDrive 3.0 Operator Hub — Documentation Produit

> **Projet Lovable** : https://lovable.dev/projects/4d912ab8-d8b6-4e44-8a5b-07f304e1c3d1
> **Version** : 3.0 — Mars 2026
> **Entite** : Suraya / EZDrive

---

## 1. Contexte & Vision

### 1.1 Qui est EZDrive

**EZDrive** (filiale operationnelle de **Suraya**) est un operateur de recharge de vehicules electriques (IRVE) positionne sur les **territoires ultramarins francais** : Martinique, Guadeloupe, Reunion et Guyane.

L'entreprise cumule les deux roles fondamentaux de la chaine de valeur IRVE :
- **CPO** (Charge Point Operator) — exploitant de bornes de recharge
- **eMSP** (e-Mobility Service Provider) — fournisseur de services de mobilite aux conducteurs

### 1.2 Ecosysteme logiciel actuel

EZDrive opere aujourd'hui avec plusieurs plateformes tierces, chacune presentant des limites :

| Plateforme | Role | Clients deploys | Part du parc | Problematique |
|------------|------|-----------------|--------------|---------------|
| **GreenFlux (Shell)** | CPO + eMSP backend | EZDrive + TotalEnergies | ~70% | Rachat Shell = roadmap Shell-centric, +30% tarifs en 3 ans, monolithe Java legacy, pas de sous-CPO |
| **ROAD.io** | CPO + eMSP backend | V-CiTY AG + V-CiTY SRPP | ~30% | PHP/Symfony v3.4, dette technique 8+ ans, OCPP 1.6 uniquement, R&D arretee |
| **Resonovia (Sekaop)** | CPO + eMSP + App + Portail | EZDrive (nouveau) | En cours | Licence marque blanche 40k€, PI reste chez Resonovia, modules OCPP/OCPI obfusques |

### 1.3 Cartographie des deployements

| Client / Marque | Plateforme | Territoire | Application | Facturation |
|----------------|------------|-----------|-------------|-------------|
| EZDrive | GreenFlux | 971-972-973-974 | EZDrive App | Via GFX API + Zoho |
| TotalEnergies | GreenFlux | Antilles | TE branded | Via GFX |
| V-CiTY AG (Rubis) | ROAD.io | Antilles-Guyane | V-CiTY App | ROAD → Rubis |
| V-CiTY SRPP | ROAD.io | Reunion | V-CiTY App | ROAD → SRPP |
| EZDrive NEW | Resonovia | Tous territoires | Nouvelle app EZD | Resonovia → Pennylane |

### 1.4 Strategie de souverainete (3 phases)

L'objectif strategique est de **reprendre le controle total** sur l'ensemble de la chaine logicielle :

| Phase | Horizon | Action |
|-------|---------|--------|
| **Phase 1** (Actuel) | Court terme | Deployer avec Resonovia la suite EZDrive proprietaire (app, backend CPO/eMSP, portail) |
| **Phase 2** | Moyen terme | Migrer EZDrive de GreenFlux vers nouvelle plateforme. Recettage, tests GIREVE, basculement progressif |
| **Phase 3** | Long terme | Remplacement des whitelabels (V-CiTY, TotalEnergies) par solution proprietaire. Dev interne OCPP/OCPI |

### 1.5 Vision produit : 4 piliers strategiques

| Pilier | Description | Modele economique |
|--------|-------------|-------------------|
| **EZ DRIVE** | SaaS pour operateurs CPO/eMSP et conducteurs — Backend CPO + eMSP + App mobile + Portail admin | Usage + abonnements |
| **EZ MOOVE** | SaaS gestion de flottes — Integration OBD2, correlation donnees vehicules, optimisation TCO | Abonnement + analytics |
| **EZ PLATFORM** (PaaS) | Infrastructure de provisionnement d'environnements white-label via Terraform. Isolation totale par tenant | Facturation par instance |
| **EZ DATA** | Hub de donnees intelligent — GraphQL, base graph, analyse predictive, detection d'anomalies | Premium analytics |

---

## 2. Ce produit : EZDrive 3.0 Operator Hub

### 2.1 Positionnement

**EZDrive 3.0 Operator Hub** est le **back-office web (portail admin)** de la plateforme EZDrive. C'est la **tour de controle** qui permet aux equipes internes de piloter l'ensemble du reseau de bornes, la gestion des clients eMSP, le roaming OCPI et la facturation.

Ce portail est developpe sur **Lovable** et connecte a **Supabase** comme backend (PostgreSQL + Auth + Edge Functions).

### 2.2 Utilisateurs cibles

| Role | Responsabilites |
|------|-----------------|
| **Super Admin (EZDrive)** | Acces universel a tous les sous-CPO, configuration globale, gestion utilisateurs, contrats roaming |
| **Admin sous-CPO** | Gestion de son propre perimetre de bornes, tarifs, clients, facturation |
| **Operator** | Supervision quotidienne, gestion clients eMSP, facturation, suivi SLA |
| **Tech** | Maintenance, monitoring OCPP, diagnostic de pannes, mise a jour firmware |

### 2.3 Objectifs du Operator Hub

1. **Centraliser** toutes les operations CPO et eMSP dans une interface unique
2. **Monitorer en temps reel** l'etat de chaque borne (OCPP : disponible, en charge, en panne, hors ligne)
3. **Gerer le cycle de vie client eMSP** : conducteurs, abonnements, tokens RFID, facturation retail
4. **Superviser le roaming OCPI** via GIREVE (accords, contrats, remboursement inter-operateurs)
5. **Administrer les tarifs** conformes OCPI Tariff v2.2.1 (kWh, session, parking, plages horaires)
6. **Offrir une parite fonctionnelle** avec GreenFlux evportal (portail de reference actuel)
7. **Gerer le multi-CPO / sous-CPO** avec isolation des donnees par operateur

---

## 3. Chaine de valeur IRVE et protocoles

### 3.1 Les 7 maillons de la chaine IRVE

| Maillon | Acteurs types | Positionnement EZDrive |
|---------|---------------|------------------------|
| 1. Fabrication bornes | ABB, Schneider, Autel, Alfen, Wallbox | Acheteur/integrateur |
| 2. Installation IRVE | Installateurs certifies | Realise en propre + sous-traitants |
| 3. CPO (Exploitation) | Izivia, Electra, Ionity | **CPO sur tous ses territoires** |
| 4. eMSP (Service usager) | ChargeMap, Freshmile | **eMSP pour ses clients** |
| 5. Roaming / Itinerance | GIREVE, Hubject | **Connecte via GIREVE** |
| 6. Energie / Smart Grid | EDF SEI, producteurs ENR | Partenaire EDF + EZsolar |
| 7. Data & Analytics | BI, reporting, open data | Dashboard + EZ Data |

### 3.2 Protocoles critiques

| Protocole | Couche | Fonction | Version cible |
|-----------|--------|----------|---------------|
| **OCPP** | Borne ↔ Backend CPO | Supervision, sessions, smart charging, diagnostics | 1.6J actuel → 2.0.1 cible |
| **OCPI** | CPO ↔ eMSP (backend) | Itinerance, tarifs, CDR, locations, tokens | 2.1.1 GIREVE → 2.2.1 cible |
| **ISO 15118** | Vehicule ↔ Borne | Plug & Charge, V2G, authentification PKI | Vision long terme |
| **GIREVE/eMIP** | Hub national FR | Interconnexion operateurs, certification | Actif — OCPI 2.1.1 |

> **En une phrase** :
> - OCPP fait fonctionner les bornes au quotidien (terrain ↔ cloud CPO)
> - OCPI fait circuler les kWh et les euros entre acteurs du reseau (CPO ↔ eMSP / hub roaming)

### 3.3 Flux financiers

| Acteur | Source de revenus | Mecanisme de marge |
|--------|-------------------|--------------------|
| CPO | Sessions de charge (direct ou wholesale) | Prix kWh - cout electricite - OPEX |
| eMSP | Marge retail + abonnements | Tarif public - tarif wholesale CPO |
| Hub (GIREVE) | Abonnements + frais/session | ~0,02 €/session + forfait annuel |

---

## 4. Architecture technique

### 4.1 Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    EZDrive 3.0 OPERATOR HUB (ce projet)                  │
│          React 18 + TypeScript + Tailwind CSS + Vite                     │
│          React Router (client-side) + React Query (data layer)           │
├──────────────────────────────────────────────────────────────────────────┤
│                            SUPABASE CLOUD                                │
│   ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐         │
│   │ PostgreSQL    │  │   Auth       │  │   Edge Functions      │         │
│   │ (40+ tables)  │  │ (JWT + RLS)  │  │  (API REST gateway)   │         │
│   │ (24 migr.)    │  │              │  │                       │         │
│   └──────────────┘  └──────────────┘  └───────────────────────┘         │
├──────────────────────────────────────────────────────────────────────────┤
│                         SERVEUR OCPP                                     │
│   WebSocket server ↔ bornes physiques (chargepoints, transactions,       │
│   heartbeats, messages, firmware updates)                                │
├──────────────────────────────────────────────────────────────────────────┤
│                    INTEGRATIONS EXTERNES                                  │
│   GIREVE (OCPI 2.2.1)  │  Stripe (paiements)  │  Pennylane (compta)    │
│   GreenFlux (migration) │  ROAD (migration)    │  Zoho (CRM)           │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Stack technique

| Couche | Technologie | Version | Role |
|--------|-------------|---------|------|
| **Rendu** | React | 18.3 | UI composants |
| **Typage** | TypeScript | 5.7 | Securite du code |
| **Routing** | React Router | 7.1 | Navigation SPA |
| **Data** | TanStack React Query | 5.62 | Fetching, cache, polling |
| **Style** | Tailwind CSS | 4.1 | Design system utility-first |
| **Icones** | Lucide React | 0.468 | Iconographie coherente |
| **Charts** | Recharts | 2.14 | Visualisation donnees (donut, bars) |
| **Carte** | React Leaflet | 4.2 | Cartographie stations (bornes) |
| **Backend** | Supabase | 2.49 | BDD + Auth + API |
| **Build** | Vite | 6.2 | Bundler ultra-rapide |
| **Deploiement** | Lovable + Vercel | — | Hebergement + CDN |

### 4.3 Architecture frontend

```
src/
├── App.tsx                    # Routes (33 pages)
├── main.tsx                   # Point d'entree React
├── index.css                  # Design tokens + theme sombre
│
├── components/
│   ├── auth/                  # Login (Supabase Auth)
│   ├── layout/                # AppShell, Sidebar, TopBar, ProtectedRoute
│   ├── ui/                    # 7 composants partages
│   └── [module]/              # 30+ modules metier (1 dossier = 1 page)
│
├── contexts/
│   ├── AuthContext.tsx         # Etat d'authentification (user, session, profile, role)
│   └── ToastContext.tsx        # Notifications toast (success, error, warning, info)
│
├── hooks/                     # 9 hooks React Query (stations, KPIs, CPOs, SLA...)
├── lib/                       # Supabase client, API helpers, utilitaires, constantes
└── types/                     # Types TypeScript partages (Station, Auth, Filters)
```

### 4.4 Pattern CRUD (utilise par 15+ pages)

Chaque page metier suit un squelette identique :

```
1. Interface TypeScript pour le modele
2. Template vide pour le formulaire (EMPTY_TEMPLATE)
3. Etats React : modal, editing, form, confirmDelete, search, tab, sort, page
4. useQuery        → fetch des donnees Supabase
5. useMutation x3  → create, update, delete
6. useMemo         → filtrage (onglets + recherche texte)
7. Rendu :
   ├── KPICards (metriques en haut de page)
   ├── Barre de recherche + bouton "Ajouter"
   ├── Onglets filtrants (ex: Tous / Actifs / Inactifs)
   ├── Table triable + paginee (20 items/page)
   ├── SlideOver (panneau lateral pour create/edit)
   └── ConfirmDialog (modale de confirmation suppression)
```

### 4.5 Base de donnees (40+ tables, 24 migrations)

```
┌──────────────────┐     ┌──────────────────┐
│   auth.users     │────▶│ ezdrive_profiles │
│ (Supabase Auth)  │     │ (role: admin/     │
└──────────────────┘     │  operator/tech)  │
                         └──────────────────┘

┌──────────────────┐     ┌──────────────────┐     ┌────────────────┐
│  cpo_operators   │◀────│    stations      │────▶│  territories   │
│ (nom, code)      │     │ (OCPP, geo, etc) │     │ (972, 971...)  │
└──────────────────┘     └────────┬─────────┘     └────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼              ▼
          ┌─────────────┐ ┌────────────┐ ┌──────────────┐
          │ station_    │ │ connectors │ │ station_cpo_ │
          │ status_log  │ │ (JSONB)    │ │ overrides    │
          └─────────────┘ └────────────┘ └──────────────┘

┌──────────────────┐     ┌──────────────────┐     ┌────────────────┐
│ consumer_profiles│────▶│user_subscriptions│◀────│subscription_   │
│ (conducteurs     │     │ (instances)      │     │ offers (plans) │
│  eMSP)           │     └──────────────────┘     └────────────────┘
└───────┬──────────┘
        │
        ├────────────▶ rfid_cards (tokens physiques)
        ├────────────▶ ocpi_tokens (tokens roaming)
        └────────────▶ invoices (factures retail)

┌──────────────────┐     ┌──────────────────┐
│  cpo_networks    │◀────│  cpo_contracts   │
└──────────────────┘     └────────┬─────────┘
                                  │
┌──────────────────┐     ┌────────┴─────────┐
│  emsp_networks   │◀────│ emsp_contracts   │
└──────────────────┘     └────────┬─────────┘
                                  │
                         ┌────────┴─────────┐
                         │   roaming_       │
                         │   agreements     │──── Accords bilateraux
                         └────────┬─────────┘     CPO ↔ eMSP
                                  │
                         ┌────────┴─────────┐
                         │  reimbursement_  │──── Tarifs wholesale
                         │  rules           │     roaming
                         └──────────────────┘
```

### 4.6 Securite

| Couche | Implementation |
|--------|---------------|
| **Authentification** | Supabase Auth (email/password), JWT, refresh automatique |
| **Autorisation** | Row-Level Security (RLS) sur toutes les tables PostgreSQL |
| **RBAC** | Roles admin/operator/tech + roles custom avec permissions granulaires |
| **Chiffrement** | HTTPS, TLS 1.3, Supabase Cloud (backups auto, chiffrement at-rest) |
| **Protection client** | `ProtectedRoute` guard, redirection `/login` si non authentifie |

---

## 5. Design System

### 5.1 Theme sombre ("Dark Mode First")

Le design adopte un theme sombre premium conforme au Design System EZ Drive defini dans le CDC :

| Token | Valeur | Usage |
|-------|--------|-------|
| `--color-primary` / `$ezgreen-primary` | `#00D4AA` | Vert electrique moderne — couleur principale EZDrive |
| `--color-background` / `$dark-matter` | `#0A0E27` | Fond sombre premium |
| `--color-surface` | `#111638` | Fond des cartes et panneaux |
| `--color-foreground` / `$light-cloud` | `#F7F9FC` | Texte principal |
| `--color-foreground-muted` | `#8892B0` | Texte secondaire |
| `--color-border` | `#2A2F5A` | Bordures |
| `--color-danger` | `#FF6B6B` | Erreurs et alertes critiques |
| `--color-warning` | `#F39C12` | Avertissements |

### 5.2 Typographie

| Usage | Police | Poids |
|-------|--------|-------|
| Titres et accroches | **Sora** (sans-serif) | 600, 700, 800 |
| Corps de texte | **Inter** (-apple-system) | 400, 500, 600, 700 |

### 5.3 Statuts OCPP (code couleur bornes)

| Statut | Couleur | Code |
|--------|---------|------|
| Available | Vert EZDrive | `#00D4AA` |
| Charging | Cyan | `#4ECDC4` |
| Preparing | Orange | `#F39C12` |
| SuspendedEVSE / SuspendedEV | Orange fonce | `#E67E22` |
| Finishing | Bleu | `#3498DB` |
| Unavailable | Gris clair | `#BDC3C7` |
| Faulted | Rouge | `#FF6B6B` |
| Offline | Gris | `#95A5A6` |

### 5.4 Composants UI partages

| Composant | Description |
|-----------|-------------|
| **KPICard** | Carte metrique avec icone, valeur numerique, label, couleur d'accent |
| **SlideOver** | Panneau lateral anime (droite) pour formulaires create/edit et details |
| **ConfirmDialog** | Modale de confirmation avec variantes danger/warning, etat de chargement |
| **FilterBar** | Barre de recherche + filtres dropdown (CPO, Territoire, Statut OCPP) |
| **StatusBadge** | Badge colore pour les statuts OCPP |
| **Skeleton** | Placeholders de chargement (lignes, cartes, tableaux) |
| **ErrorState** | Message d'erreur avec bouton de retry |

---

## 6. Fonctionnalites (33 pages)

### 6.1 Supervision (3 pages)

#### Dashboard (`/dashboard`)
Vue synthetique du reseau avec KPIs (bornes disponibles/en charge/en panne/hors ligne), repartition par territoire et par CPO, metriques business.

#### Carte (`/map`)
Carte interactive Leaflet avec marqueurs de bornes couleur-codes par statut OCPP, filtres (CPO, territoire, statut, puissance), popup detail au clic, clustering par zoom.

#### Analytics SLA (`/analytics`)
Suivi du taux de disponibilite par station/territoire/CPO, MTTR (temps moyen de reparation), tendances sur periodes configurables, alertes sur depassement de seuils.

---

### 6.2 Module CPO — Gestion du reseau (6 pages)

Conforme au **Module CPO** du CDC (section 7.2) et au **Module Asset** (section 7.3).

#### Bornes (`/stations`)
Table avec toutes les bornes : nom, adresse, ville, CPO, territoire, statut OCPP, connecteurs, puissance. Filtres avances, detail SlideOver, export CSV, polling 30s temps reel.

#### Localisations (`/locations`)
Gestion des emplacements physiques (sites, parkings) avec coordonnees GPS.

#### Maintenance (`/maintenance`)
Vue des bornes en panne (Faulted) et hors ligne, prioritisation par duree de panne, historique des changements de statut.

#### Monitoring (`/monitoring`)
Monitoring technique en temps reel : heartbeats OCPP, log des messages, etat de connexion en ligne/hors ligne.

#### Smart Charging (`/smart-charging`)
Groupes de bornes pour equilibrage dynamique (round-robin, priorite, seuils). Conforme OCPP Smart Charging + profils OCPI ChargingPreferences.

#### Energy Mix (`/energy-mix`)
Declaration mix energetique (% PV, % ENR), tarif achat EDF (vert, bleu, jaune), calcul CO2 economise par session/client. CRUD complet.

---

### 6.3 Module eMSP — Gestion clients (4 pages)

Conforme au **Module eMSP** du CDC (section 7.4).

#### Gestion Clients (`/customers`)
Modele relationnel : client → conducteur → token → CDR. Profils avec nom, email, telephone, pays, statut, gestionnaire de compte.

#### Abonnements (`/subscriptions`)
5 types de forfaits : Pay-as-you-go, RFID Fidelite, Premium Mensuel, Premium Annuel, Business. Suivi souscriptions actives, metriques (MRR, taux de conversion).

#### Tokens RFID (`/rfid`)
Inventaire et gestion des cartes RFID : statut (active/blocked/expired/lost), visual_id, auth_id, date validite, roaming on/off, postpaid/prepaid.

#### Coupons (`/coupons`)
3 types : credit (montant fixe), pourcentage, charge gratuite. Regles (expiration, nombre d'utilisations max, montant minimum). CRUD complet.

---

### 6.4 Facturation (3 pages)

Conforme au module **Sessions/CDR CPO** et **Sessions/Forfaits retail eMSP** du CDC (sections 7.2-7.4).

#### Sessions CDR (`/sessions`)
CDR conformes OCPI v2.2.1 : conducteur, station, connecteur, debut/fin, energie (kWh), cout HT/TTC, token, duree, eMSP. Filtrage (reussi/suspect/depose), export CSV.

#### Factures (`/invoices`)
Gestion de la facturation : statuts (brouillon, envoyee, payee, annulee), lignes detaillees, telechargement PDF. Integration Stripe + Pennylane.

#### Tarifs (`/tariffs`)
Tarification conforme OCPI Tariff v2.2.1 : au kWh, par session, par parking, plages horaires, seuils, abonnement. Affectation dynamique aux bornes/tokens/groupes.

---

### 6.5 Integrations (1 page)

#### OCPI Gireve (`/ocpi`)
Integration avec la plateforme d'interoperabilite **GIREVE** via OCPI 2.2.1 : credentials, locations, EVSEs, connectors, tokens, CDRs. Certification et echanges inter-operateurs.

---

### 6.6 Roaming CPO (5 pages)

Gestion du volet CPO dans les accords de roaming inter-operateurs.

#### Vue d'ensemble CPO (`/cpo-overview`)
Dashboard avec 4 KPIs + 3 graphiques donut (Recharts) : connexion bornes, etat EVSE, derniere communication OCPP. Onglet "Bornes en panne".

#### Reseaux CPO (`/cpo-networks`)
Reseaux de partenaires CPO (internes/externes). CRUD complet avec metriques (contrats, accords).

#### Contrats CPO (`/cpo-contracts`)
Contrats avec les reseaux CPO : nom, reseau parent, code pays, party ID, code contrat, devise, URL. CRUD complet avec selection FK.

#### Remboursement (`/reimbursement`)
Regles de remboursement roaming : tarification (prix/kWh, prix/minute, frais demarrage, frais inactivite), periode de validite, associations multi-FK. Conforme au module "Remboursement et repartition" du CDC.

#### Accords (`/agreements`)
Accords bilateraux CPO ↔ eMSP : parties (reseau + contrat de chaque cote), methode de connexion, contacts pro/tech, statuts (actif/expire/planifie). CRUD complet.

---

### 6.7 Roaming eMSP (5 pages)

Miroir du volet CPO, cote fournisseur de services de mobilite.

#### Reseaux eMSP (`/emsp-networks`)
Reseaux eMSP partenaires (internes/externes). CRUD complet.

#### Contrats eMSP (`/emsp-contracts`)
Contrats avec les reseaux eMSP. CRUD complet.

#### eMSPs (`/emsps`)
Entites eMSP : nom, ID externe, CRM ID, URL OCPI, reseau, contrat. CRUD complet.

#### Conducteurs (`/drivers`)
Vue des profils conducteurs (consumer_profiles) — lecture seule. KPIs (total, actifs, inactifs, avec abonnement Stripe), onglets, detail SlideOver.

#### Valider Token (`/validate-token`)
Utilitaire de validation RFID/OCPI : 3 modes (Auth ID, Chip ID, Visual ID), recherche dans `rfid_cards` puis `ocpi_tokens`, resolution du profil conducteur associe.

---

### 6.8 Administration (5 pages)

Conforme au **Module Exception et Acces** du CDC (section 7.5).

#### Gestion CPO (`/admin`)
Assignation des bornes aux operateurs CPO (selection station → CPO, override manuel).

#### Utilisateurs (`/users`)
Gestion des comptes du back-office : nom, email, role, territoire.

#### Roles & Permissions (`/roles`)
Systeme RBAC : super admin, chef de flotte, compta, conducteur. Permissions granulaires (read/write/delete par module). CRUD complet.

#### Exceptions (`/exceptions`)
Groupes d'exception : acces restreint a certaines bornes ou sous-CPO. Suivi des anomalies systeme avec severites.

#### Parametres (`/settings`)
Configuration globale, feature toggles, preferences d'affichage, configuration des alertes.

---

## 7. Deploiement

### 7.1 Environnement

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | URL du projet Supabase (`phnqtqvwofzrhpuydoom`) |
| `VITE_SUPABASE_ANON_KEY` | Cle publique (anon) Supabase |

### 7.2 Commandes

```bash
npm run dev              # Vite dev server (port 5173)
npm run build            # TypeScript check + Vite build → dist/
npm run preview          # Preview production locale
```

### 7.3 Infrastructure

```
┌───────────────────┐         ┌──────────────────┐
│  Lovable / Vercel │         │  Supabase Cloud  │
│                   │         │                  │
│  - CDN global     │  HTTPS  │  - PostgreSQL    │
│  - SPA rewrite    │◀───────▶│  - Auth (JWT)    │
│  - Auto-deploy    │         │  - Edge Functions│
│  - Preview PR     │         │  - Realtime      │
└───────────────────┘         └──────────────────┘
         │                             │
         │                    ┌────────┴────────┐
         │                    │  Serveur OCPP   │
         │                    │  (WebSocket)    │
         │                    └────────┬────────┘
         │                             │
         │                    ┌────────┴────────┐
         │                    │  Bornes IRVE    │
         │                    │  (ABB, Autel...)│
         │                    └─────────────────┘
         │
    ┌────┴──────────────────────────────────────┐
    │           Integrations externes            │
    ├────────────┬──────────────┬────────────────┤
    │  GIREVE    │  Stripe      │  Pennylane     │
    │  (OCPI)   │  (paiements) │  (comptabilite)│
    └────────────┴──────────────┴────────────────┘
```

---

## 8. Migrations SQL (24 fichiers)

| # | Migration | Contenu |
|---|-----------|---------|
| 001 | `ezdrive_profiles` | Profils utilisateurs + trigger auth |
| 002 | `ezdrive_stations` | Bornes, status_log, CPO operators, territories |
| 003 | `ezdrive_views` | Vues : station_kpis, stations_enriched, maintenance_stations |
| 004 | `ezdrive_alerts` | Configurations d'alertes |
| 005 | `ezdrive_sla_views` | Vues SLA |
| 006 | `ezdrive_cron` | Jobs planifies (pg_cron) |
| 007 | `road_stations` | Source ROAD.io |
| 008 | `ocpi_schema` | Schema OCPI 2.2.1 complet (credentials, locations, EVSEs, tokens, CDRs) |
| 009 | `consumer_profiles` | Profils conducteurs eMSP |
| 010 | `stations_geo` | Index geospatiaux (PostGIS) |
| 011 | `vehicles_favorites` | Vehicules et favoris |
| 012 | `reviews_reports` | Avis et signalements |
| 013 | `subscriptions_rfid` | Abonnements, cartes RFID, contacts business |
| 014 | `api_fixes` | Correctifs API |
| 015 | `ocpp_server` | Integration OCPP (chargepoints, transactions, heartbeats) |
| 016 | `ocpp_consumer_link` | Liaison transactions OCPP ↔ conducteurs |
| 017 | `cron_jobs` | Jobs cron supplementaires |
| 018 | `gfx_cdrs_tariff` | CDRs et tarifs GreenFlux (migration) |
| 019 | `sovereignty` | Conformite souverainete donnees |
| 020 | `admin_crm` | CRM administratif |
| 021 | `admin_stations_smart_charging` | Admin stations + smart charging |
| 022 | `invoices` | Factures avec lignes + feature toggles |
| 023 | `coupons_roles_energymix_exceptions` | Coupons, roles RBAC, energy mix, exceptions |
| 024 | `networks_agreements_reimbursement` | Reseaux, contrats, accords, remboursement (roaming) |

---

## 9. Glossaire

| Terme | Definition |
|-------|-----------|
| **CPO** | Charge Point Operator — operateur de bornes de recharge (EZDrive = CPO) |
| **eMSP** | e-Mobility Service Provider — fournisseur de services de mobilite aux conducteurs (EZDrive = eMSP) |
| **IRVE** | Infrastructure de Recharge pour Vehicules Electriques |
| **CSMS** | Charging Station Management System — systeme central de gestion des bornes |
| **OCPP** | Open Charge Point Protocol — protocole de communication borne ↔ serveur CPO |
| **OCPI** | Open Charge Point Interface — protocole d'interoperabilite CPO ↔ eMSP |
| **ISO 15118** | Standard Plug & Charge / V2G (vehicule ↔ borne) |
| **EVSE** | Electric Vehicle Supply Equipment — equipement de recharge (= borne) |
| **CDR** | Charge Detail Record — enregistrement detaille d'une session de recharge |
| **GIREVE** | Plateforme francaise d'interoperabilite pour la recharge electrique |
| **Roaming** | Capacite d'un conducteur a utiliser des bornes hors de son reseau d'origine |
| **SLA** | Service Level Agreement — engagement de niveau de service |
| **MTTR** | Mean Time To Repair — temps moyen de reparation |
| **RFID** | Radio-Frequency Identification — technologie d'identification sans contact (cartes/badges) |
| **Sous-CPO** | Operateur CPO rattache a un super-CPO (EZDrive), avec environnement hermétique (bornes, tarifs, clients, branding) |
| **Wholesale** | Tarif de gros entre CPO et eMSP (vs retail = tarif conducteur) |
| **RLS** | Row-Level Security — securite au niveau des lignes PostgreSQL |
| **RBAC** | Role-Based Access Control — controle d'acces base sur les roles |

---

## 10. Documents de reference

| Document | Emplacement | Contenu |
|----------|-------------|---------|
| **CDC Codetics** | `emsp cpo/Cahier_des_charges_EZ_Drive_EZD-App.pdf` | Architecture microservices, modules detailles, API REST, Kafka, Auth0, infra K8s |
| **Master CPO/eMSP v3** | `emsp cpo/EZDrive_Master_CPO_eMSP_v3.docx` | Ecosysteme complet, chaine de valeur IRVE, protocoles, plateformes, strategie souverainete, UI/UX, modules CPO/eMSP/Asset, app mobile, feuille de route |
| **Guide OCPI Gireve** | `emsp cpo/Gireve_Tech_OCPI-V2.2.1_ImplementationGuide_V1.2.pdf` | Guide technique d'implementation OCPI 2.2.1 |
| **Release Plan Codetics** | `emsp cpo/CODETICS_ReleasePlan-Visualisation EZ Drive- Oct 2025.xlsx` | Planning de releases |

---

## 11. Roadmap

### Fait (Operator Hub)

- [x] Infrastructure Supabase + Auth + RLS (24 migrations)
- [x] 33 pages fonctionnelles couvrant CPO + eMSP + Roaming + Admin
- [x] Supervision temps reel des bornes (polling 30s)
- [x] Carte interactive Leaflet
- [x] CRUD complet sur 15+ entites
- [x] Integration OCPI 2.2.1 (module Gireve)
- [x] Roaming CPO + eMSP complet (10 pages, parite GreenFlux evportal)
- [x] Systeme RBAC avec permissions granulaires
- [x] Design system dark theme conforme au Design System EZ Drive
- [x] Notifications toast
- [x] Export CSV

### A venir (Operator Hub)

- [ ] Realtime Supabase (WebSocket) pour remplacer le polling 30s
- [ ] Notifications push (alertes de panne)
- [ ] Multi-tenancy sous-CPO (isolation par operateur)
- [ ] Integration Stripe Connect (paiements)
- [ ] Integration Pennylane (facturation comptable)
- [ ] Integration Zoho CRM
- [ ] Internationalisation (i18n) FR/EN
- [ ] Tests unitaires et E2E (Vitest + Playwright)
- [ ] Code splitting (lazy loading des pages)
- [ ] Audit trail complet (qui a fait quoi, quand)

### Ecosysteme EZDrive (hors Operator Hub)

- [ ] Application mobile conducteur (SwiftUI + Jetpack Compose natif)
- [ ] Application technicien (maintenance terrain)
- [ ] EZ Moove (gestion de flottes, OBD2)
- [ ] EZ Platform (PaaS white-label, Terraform)
- [ ] EZ Data (hub GraphQL, base graph, analytics predictives)
- [ ] Dev interne OCPP/OCPI (souverainete complete)
- [ ] Certification OCPP OCA
- [ ] Migration GreenFlux → plateforme proprietaire
- [ ] Migration ROAD → plateforme proprietaire
