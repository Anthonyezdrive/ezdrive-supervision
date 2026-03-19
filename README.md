# EZDrive Supervision (EZD3)

**Plateforme SaaS de supervision de bornes de recharge electrique**

Scope : DOM-TOM (Guadeloupe, Martinique, Guyane) + France metro + Europe via roaming OCPI

---

## Acces

| Environnement | URL |
|---------------|-----|
| **Production** | [pro.ezdrive.fr](https://pro.ezdrive.fr) |
| **Portail B2B** | [pro.ezdrive.fr/b2b/overview](https://pro.ezdrive.fr/b2b/overview) |
| **Serveur OCPP** | `wss://ezdrive-ocpp.fly.dev/ocpp/{identity}` |
| **Health Check OCPP** | [ezdrive-ocpp.fly.dev/health](https://ezdrive-ocpp.fly.dev/health) |

---

## Stack technique

| Couche | Technologie | Version |
|--------|-------------|---------|
| Frontend | React + TypeScript | 18.3 + 5.7 |
| Build | Vite | 6.2 |
| CSS | Tailwind CSS | 4 |
| State | TanStack React Query | 5.62 |
| Charts | Recharts | 2.14 |
| Routing | React Router | 7.1 |
| Maps | Leaflet + React-Leaflet | 1.9 / 4.2 |
| Backend | Supabase PostgreSQL 15 | Auth + RLS + Edge Functions |
| OCPP Server | Node.js + ocpp-rpc | 22.x / 2.2 |
| Hebergement Frontend | Vercel | Auto-deploy on push |
| Hebergement OCPP | Fly.io (Paris CDG) | 2 machines |
| Paiement | Stripe + Stripe Connect | API 2023-10-16 |

---

## Architecture sous-CPO

3 modeles de backend — tous migreront vers OCPP Direct a terme.

| Sous-CPO | Backend | Conducteurs | CDRs | Paiement | Statut |
|----------|---------|-------------|------|----------|--------|
| **EZDrive AG** | GreenFlux | CDR parsing (6 353) | 132 787 CDRs | Stripe direct | Actif |
| **TotalEnergies** | GreenFlux | CDR parsing | GFX sync | Via EZDrive | Actif |
| **V-CiTY AG** | Road -> OCPP Direct | En attente API Road | Road sync | Stripe Connect | Migration en cours |
| **EZDrive Reunion** | Road | En attente fix Road | Road sync | Via EZDrive | En attente |
| **OCPP Direct** | Notre serveur OCPP | `consumer_profiles` | `ocpp_transactions` | Spot payment (CB + SEPA) | Cible finale |

---

## Modules (24 pages)

Toutes les pages sont filtrees par sous-CPO selectionne.

### Supervision
- **Dashboard** — KPIs, graphiques CPO/territoire, activite recente CDRs
- **Carte interactive** — Leaflet/OpenStreetMap, marqueurs par statut
- **Analytics SLA** — Disponibilite reseau, export CSV
- **Monitoring** — Temps reel, alertes, sessions actives

### CPO (Charge Point Operator)
- **Bornes** — Liste filtrable, 6 tabs detail, CRUD, export CSV
- **Localisations** — Gestion OCPI des locations/EVSEs
- **Smart Charging** — Groupes, profils, plannings, gestion capacite
- **Energy Mix** — Profils energetiques, calcul CO2 automatique

### Gestion commerciale
- **Clients** — 6 353 conducteurs (sync GFX/Road)
- **Conducteurs** — Donnees enrichies, filtre CPO
- **Tokens RFID** — 6 959 tokens, tabs actif/inactif
- **Sessions CDR** — 132 787 CDRs, filtres avances
- **Factures** — Generation depuis CDRs, export PDF
- **Tarifs** — Grilles tarifaires OCPI, association station-tarif
- **Coupons** — Validation RPC avec calcul reduction

### Roaming
- **Vue CPO** — Metriques de publication
- **Reseaux CPO/eMSP** — Gestion partenariats et contrats
- **Accords** — Conditions commerciales inter-operateurs
- **OCPI Gireve** — Credentials, diagnostics, push queue

### Portail B2B Client
- **Vue d'ensemble** — KPIs, comparaison N-1, filtres multi-select
- **Rapports** — Par borne, par conducteur, export CSV et PDF
- **Mon Entreprise** — Gestion logo, nom, utilisateurs

### Administration
- **Utilisateurs** — Gestion profils, roles, territoires
- **Configuration** — Association station-CPO, alertes
- **Gestion B2B** — CRUD clients et utilisateurs B2B

---

## Edge Functions

| Fonction | Declenchement | Description |
|----------|--------------|-------------|
| `gfx-sync` | pg_cron 5 min | Sync stations GreenFlux |
| `gfx-cdr-sync` | pg_cron 6h | Sync CDRs GreenFlux |
| `gfx-driver-sync` | Manuel | Sync conducteurs CRM GreenFlux |
| `road-sync` | pg_cron 5 min | Sync reseau Road |
| `ocpi-push` | pg_cron 1 min | Push OCPI vers Gireve |
| `stripe-webhook` | Evenementiel | Reception evenements Stripe |
| `spot-payment` | Evenementiel | Paiement SPOT (CB pre-auth 20EUR + SEPA) |
| `alert-check` | pg_cron 5 min | Verification alertes |

---

## Base de donnees

- **30+ migrations SQL**
- **132 787 CDRs** importes (aout 2023 — mars 2026)
- **6 353 conducteurs** extraits des CDRs
- **6 959 tokens RFID** extraits des CDRs
- **439 stations** synchronisees
- **22 clients B2B** configures
- **RLS** actif sur toutes les tables sensibles (isolation multi-tenant)
- **Vues unifiees** : `all_consumers`, `all_tokens` (merge GFX/Road/OCPP)

---

## Stripe

| Composant | ID |
|-----------|-----|
| Compte master EZDrive | `acct_1HCAONLxFiM9ZN7M` |
| Compte connecte V-CiTY AG | `acct_1TCeTjL4IOusGgnX` |
| Webhook | EZD3 (7 evenements, comptes connectes) |

### Paiement SPOT
- **CB** : pre-autorisation par paliers de 20 EUR, capture au reel en fin de charge
- **SEPA** : debit post-session via mandat SEPA
- Si fonds insuffisants : RemoteStopTransaction + borne en Finishing

---

## Deploiement

```bash
# Frontend — auto-deploy sur Vercel
git push origin main

# OCPP Server — deploy sur Fly.io
fly deploy --app ezdrive-ocpp

# Edge Functions — deploy sur Supabase
supabase functions deploy <function-name>
```

---

## Livrables (v1.1 — Mars 2026)

| # | Document | Pages |
|---|----------|-------|
| 01 | Dossier Architecture Technique | 16 |
| 02 | Guide Utilisation Plateforme | 4 |
| 03 | Guide Portail B2B Client | 5 |
| 04 | Guide Connexion Bornes OCPP | 5 |
| 05 | Dossier Securite & Conformite | 4 |
| 06 | PV Livraison & Recette | 5 |
| 07 | Plan Maintenance & SLA | 5 |
| 08 | Budget Materiel | 7 |

---

## Securite

- Supabase Auth (JWT HS256 + bcrypt)
- RLS sur toutes les tables sensibles
- TLS 1.3 partout (HTTPS, WSS, SSL/TLS)
- OWASP Top 10 adresse
- RGPD : donnees en Europe, pas de PII sensibles
- Stripe PCI-DSS compliance (paiements)
- Secrets en variables d'environnement (jamais en dur)

---

**EZDrive by Suraya** — Mars 2026 — CONFIDENTIEL
