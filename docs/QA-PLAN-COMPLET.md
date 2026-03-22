# Plan QA Complet — EZDrive Supervision v2.0

> **Objectif** : Verifier que 100% des pages, boutons, chemins et fonctionnalites du produit sont operationnels.
> **Methode** : Checklist exhaustive organisee par section du sidebar, avec scenarii de test pour chaque interaction.
> **Duree estimee** : 2-3 jours de test manuel complet (ou 1 jour avec 3 testeurs).

---

## 0. Pre-requis avant tests

- [ ] Build production reussi (`npm run build` → 0 erreurs)
- [ ] ESLint hooks valide (`npm run lint:hooks` → 0 erreurs)
- [ ] Base de donnees peuplee (stations, CDRs, tokens, drivers, tarifs)
- [ ] Comptes de test crees :
  - **Admin** : toutes permissions (stations.view, billing.view, admin.users, etc.)
  - **Operateur CPO** : permissions stations/billing uniquement
  - **Utilisateur B2B admin** : role `admin` sur un client B2B
  - **Utilisateur B2B employee** : role `employee` sur un client B2B
- [ ] Edge functions deployees et fonctionnelles
- [ ] Cron jobs actifs (verifier via `SELECT * FROM cron.job`)

---

## 1. Authentification & Routing

### 1.1 Login Admin (`/login`)
- [ ] Affichage du formulaire email/password
- [ ] Connexion avec identifiants valides → redirection `/dashboard`
- [ ] Connexion avec identifiants invalides → message d'erreur
- [ ] Reset password → email envoye
- [ ] Page `/reset-password` accessible et fonctionnelle

### 1.2 Login B2B (`/portail`)
- [ ] Affichage formulaire B2B
- [ ] Connexion B2B client → redirection `/b2b/overview`
- [ ] Connexion admin via `/portail` → redirection `/dashboard`

### 1.3 Page publique paiement direct (`/charge/:identity/:evseUid?`)
- [ ] Affichage page de paiement spot
- [ ] QR code scannable
- [ ] Flow Stripe checkout

### 1.4 Redirections legacy
- [ ] `/sessions` → `/billing`
- [ ] `/rfid` → `/payment-methods`
- [ ] `/maintenance` → `/monitoring`
- [ ] `/admin` → `/admin-config`
- [ ] `/agreements` → `/roaming-contracts`
- [ ] URL inconnue → `/login`

### 1.5 Protection des routes
- [ ] Acces a `/dashboard` sans auth → redirection `/login`
- [ ] Utilisateur B2B ne voit PAS les sections CPO/eMSP/Admin
- [ ] Operateur sans `admin.users` ne voit PAS la section Admin

---

## 2. HOME — Dashboard & Analytics

### 2.1 Business Overview (`/dashboard`)
- [ ] KPIs charges (stations, sessions, energie, revenus)
- [ ] Filtres par CPO fonctionnels
- [ ] Filtres par periode (timeRange) fonctionnels
- [ ] Graphiques de sessions/energie affichees
- [ ] Cards Road.io connectivity et activity (si integre)
- [ ] Bouton sync visible et fonctionnel
- [ ] Pas d'erreur console au chargement

### 2.2 Carte (`/map`)
- [ ] Carte Leaflet s'affiche avec marqueurs
- [ ] Differenciation visuelle des sources (Road/GFX/OCPP) via badges
- [ ] Click sur marqueur → popup avec infos station
- [ ] Filtres source dans la carte
- [ ] Zoom/pan fonctionnels
- [ ] Clustering des marqueurs

### 2.3 Analytics SLA (`/analytics`)
- [ ] Chargement des donnees
- [ ] Graphiques de disponibilite
- [ ] Indicateurs SLA

### 2.4 Analytics avances (`/advanced-analytics`)
- [ ] Chargement page
- [ ] Visualisations interactives

---

## 3. CPO — Overview & Network

### 3.1 Vue d'ensemble CPO (`/cpo-overview`)
- [ ] KPIs CPO charges
- [ ] Statistiques reseau

### 3.2 Reseaux CPO (`/cpo-networks`)
- [ ] Liste des reseaux CPO
- [ ] Ajout d'un reseau
- [ ] Edition d'un reseau
- [ ] Suppression d'un reseau

---

## 4. CPO — Assets

### 4.1 Bornes (`/stations`)
- [ ] Liste des stations avec pagination
- [ ] Recherche par nom/ID
- [ ] **Filtre par source** (Toutes/Road.io/GreenFlux/OCPP) — **PHASE 2**
- [ ] **Badges source** colores dans la table — **PHASE 2**
- [ ] Click sur station → detail avec champs enrichis Road.io
- [ ] **Champs Road.io visibles** : vendor, model, max_power, firmware — **PHASE 2**
- [ ] Ajout d'une station
- [ ] Edition d'une station
- [ ] Suppression d'une station
- [ ] Import CSV de stations
- [ ] Export CSV/PDF de stations
- [ ] Envoi de commandes OCPP (Reset, UnlockConnector, etc.)

### 4.2 Localisations (`/locations`)
- [ ] Liste des locations OCPI
- [ ] Creation d'une location
- [ ] Edition d'une location
- [ ] Suppression d'une location

### 4.3 Monitoring (`/monitoring`)
- [ ] Tableau des stations avec statut temps reel
- [ ] Indicateurs de connectivite
- [ ] Filtres par statut (online/offline/error)
- [ ] Actions rapides (reset, diagnostic)
- [ ] Logs OCPP visibles

### 4.4 Smart Charging (`/smart-charging`)
- [ ] Configuration des profils de charge
- [ ] Envoi de profils aux bornes
- [ ] Historique des profils

### 4.5 Energy Mix (`/energy-mix`)
- [ ] Visualisation du mix energetique
- [ ] Configuration des sources

---

## 5. CPO — Billing

### 5.1 CDRs & Factures (`/billing`)
- [ ] Liste des CDRs avec pagination
- [ ] Recherche et filtres
- [ ] Detail d'un CDR (click → drawer)
- [ ] Simulation de CDR
- [ ] Generation de facture
- [ ] Export CSV/PDF

### 5.2 Profils de facturation (`/billing-profiles`)
- [ ] Liste des profils
- [ ] Creation d'un profil
- [ ] Edition d'un profil
- [ ] Suppression d'un profil

### 5.3 Tarifs (`/tariffs`)
- [ ] **Onglet Tarifs OCPI** : liste avec pagination
- [ ] **Filtre par source** (Toutes/Road.io/GFX) — **PHASE 2**
- [ ] **Badges source** dans la table — **PHASE 2**
- [ ] Creation d'un tarif
- [ ] Edition d'un tarif
- [ ] Suppression d'un tarif
- [ ] **Onglet Tarifs dynamiques** (si present)

### 5.4 Accords & Remboursement (`/roaming-contracts`)
- [ ] Liste des accords de roaming
- [ ] Creation d'un accord
- [ ] Edition d'un accord
- [ ] Suppression d'un accord

---

## 6. CPO — Roaming

### 6.1 OCPI Gireve (`/ocpi`)
- [ ] Dashboard OCPI (connexions, push stats)
- [ ] Liste des partenaires
- [ ] Configuration des endpoints
- [ ] Push queue visible
- [ ] Historique des push
- [ ] Actions manuelles (force sync, resend)

---

## 7. eMSP — Network & Customers

### 7.1 EMSP Network (`/emsp-networks`)
- [ ] Liste des reseaux eMSP
- [ ] Ajout/edition/suppression

### 7.2 Clients (`/customers`)
- [ ] Liste des clients (consumer_profiles)
- [ ] Recherche
- [ ] Detail d'un client
- [ ] Abonnements Stripe visibles

### 7.3 Conducteurs (`/drivers`)
- [ ] Liste des conducteurs (all_consumers view)
- [ ] **Filtre par source** (Toutes/Road.io/GreenFlux) — **PHASE 2**
- [ ] **Badges source** dans la table — **PHASE 2**
- [ ] **Colonne billing_plan** pour drivers Road — **PHASE 2**
- [ ] Recherche par nom/email
- [ ] Detail d'un conducteur

### 7.4 Tokens & Abonnements (`/payment-methods`)
- [ ] **Onglet Tokens RFID** : liste des tokens (gfx_tokens)
- [ ] **Filtre par source** (Toutes/Road.io/GreenFlux) — **PHASE 2**
- [ ] **Badges source** dans la table — **PHASE 2**
- [ ] **Bouton Block/Unblock** pour tokens Road.io — **PHASE 2**
- [ ] Recherche par UID/nom
- [ ] Ajout d'un token
- [ ] Import CSV de tokens
- [ ] **Onglet Abonnements Stripe**
- [ ] **Onglet Coupons**

### 7.5 Groupes d'acces (`/access-groups`)
- [ ] Liste des groupes
- [ ] Creation d'un groupe
- [ ] Edition d'un groupe
- [ ] Suppression d'un groupe
- [ ] Affectation de tokens a un groupe

---

## 8. Automation

### 8.1 Exceptions (`/exceptions`)
- [ ] Liste des exceptions/alertes
- [ ] Filtres par type/severite
- [ ] Resolution d'une exception
- [ ] Detail d'une exception

---

## 9. Admin

### 9.1 Utilisateurs (`/users`)
- [ ] Liste des utilisateurs
- [ ] Creation d'un utilisateur (invite)
- [ ] Edition d'un utilisateur
- [ ] Desactivation d'un utilisateur
- [ ] Attribution de roles

### 9.2 Roles & Permissions (`/roles`)
- [ ] Liste des roles
- [ ] Creation d'un role
- [ ] Edition des permissions d'un role
- [ ] Suppression d'un role

### 9.3 Configuration (`/admin-config`)
- [ ] Parametres generaux
- [ ] Configuration OCPP
- [ ] Templates de notifications
- [ ] Parametres Stripe

### 9.4 Gestion B2B (`/admin/b2b`)
- [ ] **Onglet Clients** : liste des clients B2B
- [ ] Ajout d'un client B2B
- [ ] Edition d'un client B2B
- [ ] Suppression d'un client B2B
- [ ] **Onglet Utilisateurs** : liste des users B2B
- [ ] Ajout d'un utilisateur B2B (avec role admin/manager/employee)
- [ ] **Onglet Remboursements** (si present — importe depuis useReimbursements)
- [ ] Generation de credentials B2B

---

## 10. Configuration

### 10.1 Valider Token (`/validate-token`)
- [ ] Saisie d'un UID token
- [ ] Verification du token → resultat affiche (valide/invalide)

### 10.2 Support & Ressources (`/support`)
- [ ] Contenu de la page support
- [ ] Liens vers documentation
- [ ] Formulaire de contact (si present)

### 10.3 Interventions (`/interventions`)
- [ ] Liste des interventions
- [ ] Creation d'une intervention
- [ ] Suivi d'une intervention
- [ ] Cloture d'une intervention

---

## 11. Portail B2B (user B2B connecte)

> **Tester avec un compte B2B admin puis un compte B2B employee**

### 11.1 Vue d'ensemble (`/b2b/overview`)
- [ ] KPIs charges (sessions, energie, cout, redevance, saturation)
- [ ] Filtre sessions gratuites/payantes
- [ ] Graphique volume mensuel
- [ ] Comparaison N-1 (bouton "Comparer")
- [ ] Jauge budget mensuel (si configure)
- [ ] Export CSV et PDF
- [ ] Bouton "Telecharger facture"

### 11.2 Rapport mensuel (`/b2b/monthly`)
- [ ] Tableau mensuel avec totaux
- [ ] Drilldown par mois (click → CDRs du mois)
- [ ] Export CSV/PDF

### 11.3 Sessions (`/b2b/sessions`)
- [ ] Liste des CDRs du client
- [ ] Recherche par lieu/conducteur/token
- [ ] **Recherche par nom de conducteur** (resolu via gfx_consumers) — **PHASE 2**
- [ ] Filtres date (du/au)
- [ ] Filtre type (Toutes/Payantes/Gratuites)
- [ ] **Colonne Conducteur** affiche le nom au lieu de l'ID — **PHASE 2**
- [ ] Click sur session → drawer detail
- [ ] **Drawer enrichi** : nom conducteur, infos borne (vendeur, modele, puissance) — **PHASE 2**
- [ ] Pagination "Afficher plus"
- [ ] Export CSV

### 11.4 Par borne (`/b2b/chargepoints`)
- [ ] Tableau des bornes du client
- [ ] Metriques par borne (sessions, energie, saturation, CO2)
- [ ] Enrichissement hardware (vendeur, modele, puissance)

### 11.5 Par conducteur (`/b2b/drivers`)
- [ ] Tableau des conducteurs
- [ ] Graphique pie chart (top 15)
- [ ] Export CSV/PDF

### 11.6 Flotte & Tokens (`/b2b/fleet`) — **admin seulement**
- [ ] Liste des drivers de la flotte
- [ ] Gestion des tokens (ajout, suppression, blocage)
- [ ] Statistiques par driver
- [ ] Recherche et filtres
- [ ] Visible uniquement pour role `admin`

### 11.7 Mon Entreprise (`/b2b/company`) — **admin seulement**
- [ ] Informations de l'entreprise
- [ ] Configuration budget
- [ ] Gestion des alertes budget
- [ ] Visible uniquement pour role `admin`

### 11.8 Isolation par role B2B
- [ ] **Employee** : ne voit QUE overview (pas monthly, sessions, fleet, company)
- [ ] **Manager** : voit overview + monthly + sessions + chargepoints + drivers
- [ ] **Admin** : voit tout y compris fleet et company
- [ ] Le sidebar B2B masque les onglets selon le role

---

## 12. Edge Functions & Syncs

### 12.1 Sync automatiques (cron)
- [ ] `gfx-sync` : stations GFX → toutes les 5 min
- [ ] `road-sync` : stations Road.io → toutes les 5 min
- [ ] `gfx-cdr-sync` : CDRs GFX → toutes les 6h
- [ ] `road-cdr-sync` : CDRs Road.io → toutes les 6h
- [ ] `road-token-sync` : tokens Road.io → toutes les 6h
- [ ] `road-driver-sync` : drivers Road.io → tous les jours (02h)
- [ ] `road-tariff-sync` : tarifs Road.io → tous les jours (02h30)
- [ ] `ocpi-push` : push OCPI → toutes les minutes
- [ ] Heartbeat stale detection → toutes les 2 min
- [ ] Command timeout cleanup → toutes les minutes

### 12.2 Edge functions invocables
- [ ] `road-token-action` : block/unblock token → test via frontend
- [ ] `alert-check` : verification des alertes
- [ ] `push-notify` : envoi de notifications push
- [ ] `spot-payment` : paiement spot Stripe
- [ ] `stripe-webhook` : reception des webhooks Stripe

### 12.3 Verification des watermarks
- [ ] `SELECT * FROM sync_watermarks` → tous les watermarks ont `last_synced_at` recent
- [ ] Pas d'erreurs dans les metadata

---

## 13. Tests transversaux

### 13.1 Responsive design
- [ ] Toutes les pages s'affichent correctement sur mobile (375px)
- [ ] Sidebar collapse/expand fonctionne
- [ ] Tableaux scrollables horizontalement sur mobile
- [ ] Filtres utilisables sur mobile

### 13.2 Dark mode / Theme
- [ ] Verification que les couleurs sont coherentes
- [ ] Badges source lisibles en dark mode
- [ ] Graphiques lisibles

### 13.3 Performance
- [ ] Dashboard charge en < 3s
- [ ] Pages B2B chargent en < 2s
- [ ] Pas de re-renders excessifs (React DevTools Profiler)
- [ ] Pas de memory leaks sur navigation repetee

### 13.4 Gestion d'erreurs
- [ ] Error boundary s'affiche en cas de crash (pas d'ecran blanc)
- [ ] Bouton "Reessayer" fonctionne
- [ ] Bouton "Retour au tableau de bord" fonctionne
- [ ] Requetes Supabase echouees → message d'erreur visible (pas silent fail)

### 13.5 Multi-CPO / Isolation hermetique
- [ ] Selecteur CPO visible pour admins multi-CPO
- [ ] Stations filtrees par CPO selectionne
- [ ] CDRs filtres par CPO
- [ ] Tokens filtres par CPO
- [ ] Drivers filtres par CPO
- [ ] Pas de fuite de donnees entre CPOs

### 13.6 Exports
- [ ] Export CSV fonctionne sur toutes les pages qui l'offrent
- [ ] Export PDF fonctionne sur toutes les pages qui l'offrent
- [ ] Fichiers telecharges ont le bon nom et contenu
- [ ] Caracteres speciaux (accents) preserves dans les exports

---

## 14. Recommandations

### 14.1 Qualite du code — A faire MAINTENANT

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 1 | **Scanner TOUTES les pages pour hooks-after-return** | Critique — previent crash #300 | 1h |
| 2 | **Ajouter `npm run lint:hooks` au CI/CD** (pre-commit hook ou GitHub Action) | Empeche les regressions | 30min |
| 3 | **Fixer les TS errors dans DashboardPage** (`.in()` sur mauvais type) | Potentiel crash runtime | 1h |
| 4 | **Fixer les TS errors dans AgreementsPage** (`editingAgreement` undefined) | Crash si on ouvre l'edition | 1h |
| 5 | **Supprimer les imports inutilises** partout (`npm run lint` et corriger les warnings) | Proprete, bundle size | 1h |

### 14.2 Testing automatise — A faire CETTE SEMAINE

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 6 | **Ajouter Vitest + React Testing Library** pour les composants critiques | Detecte les regressions | 2-3 jours |
| 7 | **Tests E2E avec Playwright** pour les flows critiques (login, B2B overview, station CRUD) | Detecte les bugs d'integration | 3-4 jours |
| 8 | **Smoke test automatique** : script qui navigue sur TOUTES les routes et verifie qu'aucune ne crash | Detecte les imports casses, hooks invalides | 1 jour |

### 14.3 Architecture — A planifier

| # | Action | Impact | Effort |
|---|--------|--------|--------|
| 9 | **Error boundary granulaire** : un par section (B2B, CPO, eMSP) au lieu d'un global | Un crash dans B2B ne casse pas tout le dashboard | 2h |
| 10 | **Loading states coherents** : standardiser le pattern `if (!data) return <Skeleton>` avec hooks AVANT | Evite les violations Rules of Hooks | 2h |
| 11 | **Deplacer les useMemo/computations dans des hooks dedies** au lieu de les mettre dans les composants page | Separation of concerns, testabilite | 1-2 jours |
| 12 | **Monitoring Sentry/LogRocket** en production | Detecte les erreurs que les utilisateurs ne reportent pas | 2h setup |
| 13 | **Health check endpoint** : edge function qui ping toutes les syncs et reporte leur statut | Detecte les syncs silencieusement cassees | 2h |

### 14.4 Process — Pour eviter les regressions

| # | Action | Pourquoi |
|---|--------|---------|
| 14 | **Pre-commit hook** : `npm run lint:hooks` avant chaque commit | Bloque les hooks invalides avant qu'ils n'entrent dans le code |
| 15 | **Checklist de review** : pour chaque feature ajoutee, verifier (a) hooks avant early returns, (b) pas d'import mort, (c) pas d'objet rendu comme React child | Responsabilise |
| 16 | **Smoke test apres chaque deploy** : visiter les 5 pages les plus critiques (dashboard, B2B overview, stations, billing, map) | Detecte immediatement les crashes |
| 17 | **Quand Claude ajoute du code** : toujours executer `npm run lint:hooks` + verifier les pages impactees visuellement | Ne plus se fier uniquement a `vite build` |

### 14.5 Priorite critique — Bugs potentiels detectes par `tsc`

```
DashboardPage.tsx:162  — .in() sur mauvais type PostgrestQueryBuilder
AgreementsPage.tsx:1351 — editingAgreement non defini (crash a l'ouverture)
```

Ces erreurs TypeScript sont des **bugs runtime potentiels** que `vite build` laisse passer (il ignore les erreurs de type). Ils doivent etre fixes en priorite.

---

## 15. Ordre d'execution recommande

1. **Jour 1 matin** : Sections 1 (Auth), 2 (Home), 3-6 (CPO complet)
2. **Jour 1 apres-midi** : Sections 7 (eMSP), 8 (Automation), 9 (Admin)
3. **Jour 2 matin** : Section 11 (Portail B2B complet avec 3 roles)
4. **Jour 2 apres-midi** : Sections 12 (Edge functions), 13 (Tests transversaux)
5. **Jour 3** : Corrections des bugs trouves + recommandations 1-5

> **Regle d'or** : Pour chaque page, tester dans cet ordre :
> 1. La page charge sans erreur
> 2. Les donnees s'affichent
> 3. Les filtres fonctionnent
> 4. Les actions (CRUD) fonctionnent
> 5. Les exports fonctionnent
> 6. Le responsive fonctionne
