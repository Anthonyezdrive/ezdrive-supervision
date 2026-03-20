# EZDrive Supervision — Gap-Filling Roadmap (88 Gaps, 6 Sprints)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Combler les 88 gaps fonctionnels identifiés lors de l'audit page-par-page, pour rendre la plateforme production-ready pour des opérateurs CPO/eMSP au quotidien.

**Architecture:** Chaque sprint attaque un workflow métier complet (incident → facturation → roaming → clients → smart charging). Les modifications sont principalement frontend (composants React existants) avec quelques Edge Functions et RPCs Supabase. On suit les patterns existants (hooks custom, SlideOver/Modal, React Query, Supabase client).

**Tech Stack:** React 18 + TypeScript, TanStack React Query, Supabase (Postgres + Edge Functions + Storage), Recharts, Leaflet, Stripe, Resend, Tailwind CSS + shadcn/ui patterns.

**Project Root:** `/Users/anthonymalartre/Desktop/Claude/Claude SI/Claude SI EZD3/ezdrive-supervision/`

---

## Conventions & Prérequis

### Répertoires à créer
- `src/components/shared/` — composants UI réutilisables (n'existe pas encore)
- Note : `src/components/b2b/ExportButtons.tsx` existe déjà pour l'export B2B. Les nouveaux `ExportButton.tsx` et `BatchActionBar.tsx` seront génériques et réutilisés partout.

### Migrations DB
Chaque task nécessitant des changements de schéma est marquée **[MIGRATION]**. Les migrations doivent être créées via `supabase migration new <nom>` et appliquées avant le code frontend.

### Hooks existants — noms exacts
- `useCPOs()` (PAS `useCpo`) — `src/hooks/useCPOs.ts`
- `useTerritories()` — `src/hooks/useTerritories.ts`
- `useSLAData()` — `src/hooks/useSLAData.ts`
- `useMaintenanceStations()` — `src/hooks/useMaintenanceStations.ts`

### RPCs Supabase existantes confirmées
- `reactivate_prepaid_token(p_token_uid, p_recharge_amount)` — existe (utilisé par stripe-webhook)
- `deduct_prepaid_balance(p_token_uid, p_session_cost)` — existe
- `check_site_capacity()` — existe

### Dépendances inter-tasks
- Task 1.5, 1.7 → dépendent de Task 1.1 (`useOcppCommand` hook)
- Task 6.6 steps 3+ → dépendent de Task 6.5 (`audit_logs` table)
- Tasks Sprint 2 → réutilisent `useOcppCommand` de Sprint 1

---

## Gap-to-Task Mapping

| Gap ID (Excel) | Description | Task |
|---|---|---|
| Dashboard: Export | Export CSV dashboard | 1.3 |
| Dashboard: Drill-down KPIs | Navigation depuis KPI cards | 1.3 |
| Dashboard: Indicateur refresh | Timer auto-refresh | 1.9 |
| Carte: Recherche adresse | Geocoding Nominatim | 1.2 |
| Carte: Filtre CPO/territoire | Dropdowns filtres | 1.2 |
| Carte: Filtre puissance | Toggle AC/DC | 1.2 |
| Carte: Layers heatmap | Vue heatmap | 1.2 (basique) |
| Analytics: Date picker SLA | Sélecteur période | 1.4 |
| Analytics: Tendance SLA | Line chart historique | 6.3 |
| Analytics: Objectif SLA | Champ seuil configurable | 6.3 |
| Analytics: Drill-down station | Clic station → détail | 1.4 |
| Analytics avancées: Date picker | Sélecteur période | 1.4 |
| Analytics avancées: Export | CSV par onglet | 1.4 |
| Analytics avancées: Graphiques | Charts Recharts | 1.4 |
| Analytics avancées: Marge | Coût vs revenu | 1.4 |
| CPO Overview: Export faulted | CSV bornes en panne | 1.5 |
| CPO Overview: Actions faulted | Reset + créer intervention | 1.5 |
| CPO Overview: Acknowledge | Badge "Vu" | 1.5 |
| Stations: Gestion connecteurs | CRUD connecteurs | 1.6 |
| Stations: Batch operations | Multi-select + actions | 1.7 |
| Stations: Firmware update | OCPP UpdateFirmware | 1.7 (via batch) |
| Stations: Picker GPS | Carte dans formulaire | 6.6 (polish) |
| Stations: Photos/documents | Upload fichiers | Couvert par pattern Sprint 2 |
| Locations: Supprimer | Soft delete | 4.5 |
| Locations: Bulk publish | Action groupée | 4.5 |
| Locations: Push OCPI | Force sync partenaires | 4.3 |
| Locations: Photos | Galerie photos OCPI | 4.4 |
| Locations: Horaires | Opening times edit | 4.4 (dans l'éditeur) |
| Locations: Accessibilité | Champs OCPI optionnels | 4.4 |
| Monitoring: Reset depuis monitoring | Bouton reset inline | 1.1 |
| Monitoring: Lien station | Nom cliquable → détail | 1.1 |
| Monitoring: Modifier règle alerte | Modal édition | 2.1 |
| Monitoring: Supprimer règle alerte | Bouton supprimer | 2.1 |
| Monitoring: Alerte → intervention auto | Création automatique | 2.1 |
| Monitoring: Canaux notification | SMS/Slack/webhook | 2.1 (toggle dans wizard) |
| Monitoring: Filtre type OCPP logs | Dropdown type message | 1.8 |
| Interventions: Assignation technicien | Dropdown users | 2.2 |
| Interventions: Upload photos | Galerie + upload | 2.3 |
| Interventions: Vue calendrier | Grid mensuel | 2.4 |
| Interventions: Temps passé | Start/stop timer | 2.5 |
| Interventions: Maintenance récurrente | Planification périodique | 2.7 |
| Facturation: Génération batch | Wizard 3 étapes | 3.1 |
| Facturation: Avoir/Credit note | Modal avoir | 3.2 |
| Facturation: Relance paiement | Email dunning | 3.3 |
| Facturation: Export comptable | Format FEC | 3.6 |
| Facturation: Réconciliation | CDRs vs factures | 3.6 |
| Facturation: Simulation billing profiles | Bouton simuler | 3.5 |
| Tarifs: Constructeur visuel | Builder OCPI sans JSON | 3.4 |
| Tarifs: Versioning | Historique versions | 3.4 (basique) |
| Tarifs: Tarification dynamique | Prix variable | 3.4 (structure prête) |
| OCPI: Création credential | Wizard registration | 4.1 |
| OCPI: Handshake | Modal handshake | 4.2 |
| OCPI: Test endpoint | Panel diagnostic | 4.2 |
| OCPI: Push location | Force sync | 4.3 |
| OCPI: Sync tokens | Pull tokens | 4.3 |
| OCPI: Pull/Push CDR | Manuel | 4.3 |
| Roaming: Réconciliation | CDR vs accord | 4.6 |
| Roaming: PJ contrat | Upload PDF | 4.6 |
| Exceptions: Import CSV | Whitelist batch | 4.5 |
| RFID: Recharge admin prépayé | Bouton créditer | 5.6 |
| RFID: Génération batch tokens | Créer N tokens | 5.6 (bonus) |
| RFID: Validation contextuelle | Test par station | 5.6 |
| Clients: Supprimer | Soft delete | 5.3 |
| Clients: Vue 360° | Page détail complète | 5.1 |
| Clients: Historique communications | Timeline | 5.1 |
| Drivers: Supprimer | Soft delete | 5.3 |
| Drivers: Lien token | Association/dissociation | 5.2 |
| Drivers: Historique sessions | Sessions par driver | 5.2 |
| B2B: Self-service flotte | Ajouter/retirer driver | 5.4 |
| B2B: Limites budget | Plafond + jauge | 5.5 |
| B2B: Rapports planifiés | Toggle email mensuel | 5.5 |
| Support: Assignation ticket | Dropdown user | 2.6 |
| Support: Commentaires | Thread par ticket | 2.6 |
| Support: SLA tickets | Badges temps | 2.6 |
| Support: Notification email | Email on update | 2.6 |
| Smart Charging: Temps réel | Gauge chart | 6.1 |
| Smart Charging: Historique courbes | Area chart | 6.2 |
| Smart Charging: Prix énergie | Intégration spot | 6.2 (structure) |
| Energy Mix: Assignation stations | Multi-select | 6.4 |
| Energy Mix: CO2 évité | Calcul estimation | 6.4 |
| Admin: API keys | CRUD clés API | 6.5 |
| Admin: Audit log | Journal actions | 6.5 |
| Admin: User activity log | Dernières actions | 6.6 |
| Access Groups: Tarif par groupe | Dropdown tarif | 6.6 |
| Access Groups: Stations par groupe | Multi-select | 6.6 |
| Roles: Cloner | Bouton dupliquer | 6.6 |
| Abonnements: Créer | Bouton + Stripe Checkout | 6.6 |
| Coupons: Suivi utilisation | Colonne count | 6.6 |

---

## File Structure Overview

### Existing files to modify (most common)
```
src/components/monitoring/MonitoringPage.tsx          # Tab orchestrator
src/components/monitoring/MonitoringInterventionsTab.tsx
src/components/monitoring/MonitoringAlertsTab.tsx
src/components/monitoring/MonitoringOcppLogsTab.tsx
src/components/monitoring/MonitoringCapacityTab.tsx
src/components/map/MapPage.tsx
src/components/dashboard/DashboardPage.tsx
src/components/analytics/AnalyticsPage.tsx
src/components/analytics/AdvancedAnalyticsPage.tsx
src/components/cpo-overview/CpoOverviewPage.tsx
src/components/stations/StationsPage.tsx
src/components/stations/StationDetailView.tsx         # 93KB — will need splits
src/components/stations/StationFormModal.tsx
src/components/billing/BillingPage.tsx
src/components/billing/BillingProfilesPage.tsx
src/components/tariffs/TariffsPage.tsx
src/components/ocpi/OcpiPage.tsx
src/components/locations/LocationsPage.tsx
src/components/customers/CustomersPage.tsx
src/components/drivers/DriversPage.tsx
src/components/support/SupportPage.tsx
src/components/technician/InterventionsPage.tsx
src/components/b2b/B2BFleetPage.tsx
src/components/b2b/B2BOverviewPage.tsx
src/components/smart-charging/SmartChargingPage.tsx
src/components/payment-methods/PaymentMethodsPage.tsx
src/components/exceptions/ExceptionsPage.tsx
src/components/admin-config/AdminConfigPage.tsx
```

### New files to create
```
# Sprint 1 — Quick Wins
src/components/monitoring/QuickActions.tsx             # Reset/reboot buttons for monitoring
src/components/shared/BatchActionBar.tsx               # Reusable batch selection bar
src/components/shared/ExportButton.tsx                 # Reusable export button component
src/hooks/useOcppCommands.ts                           # Hook for OCPP remote commands

# Sprint 2 — Workflow Incident
src/components/monitoring/InterventionCreateFromAlert.tsx
src/components/technician/InterventionCalendar.tsx
src/components/technician/PhotoUpload.tsx
src/hooks/useInterventions.ts                          # Centralized interventions hook
src/hooks/useTickets.ts                                # Support tickets hook

# Sprint 3 — Facturation & Tarifs
src/components/billing/InvoiceGenerationWizard.tsx
src/components/billing/CreditNoteModal.tsx
src/components/billing/PaymentReminderModal.tsx
src/components/tariffs/TariffVisualBuilder.tsx          # Visual OCPI tariff builder
src/hooks/useInvoiceGeneration.ts

# Sprint 4 — Roaming OCPI
src/components/ocpi/OcpiCredentialWizard.tsx
src/components/ocpi/OcpiHandshakeModal.tsx
src/components/ocpi/OcpiEndpointTest.tsx
src/components/ocpi/OcpiPushModal.tsx
src/components/locations/LocationPhotoManager.tsx
src/hooks/useOcpiCredentials.ts
supabase/functions/ocpi-handshake/index.ts
supabase/functions/ocpi-push-locations/index.ts

# Sprint 5 — Clients & B2B
src/components/customers/CustomerDetailPage.tsx         # 360° view
src/components/customers/CustomerTimeline.tsx
src/components/drivers/DriverTokenLink.tsx
src/components/b2b/B2BFleetManagement.tsx
src/hooks/useCustomerDetail.ts
src/hooks/useDriverTokens.ts

# Sprint 6 — Smart Charging & Analytics
src/components/smart-charging/RealtimeLoadChart.tsx
src/components/smart-charging/LoadHistoryChart.tsx
src/components/analytics/SlaDateRangePicker.tsx
src/components/analytics/SlaTrendChart.tsx
src/hooks/useSmartChargingRealtime.ts
src/hooks/useSlaHistory.ts
```

---

# SPRINT 1 — Quick Wins UX (5 jours, ~25 gaps)

**Objectif:** Boucher tous les trous évidents qu'un opérateur remarquerait en 5 minutes. Boutons manquants, exports absents, liens de navigation, recherche carte.

---

### Task 1.1: Bouton Reset/Reboot depuis le Monitoring

**Files:**
- Create: `src/components/monitoring/QuickActions.tsx`
- Create: `src/hooks/useOcppCommands.ts`
- Modify: `src/components/monitoring/MonitoringPage.tsx`
- Modify: `src/components/monitoring/monitoring-shared.ts`

- [ ] **Step 1: Créer le hook useOcppCommands**

```typescript
// src/hooks/useOcppCommands.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

interface OcppCommand {
  stationId: string;
  command: "Reset" | "RemoteStartTransaction" | "RemoteStopTransaction" | "UnlockConnector";
  params?: Record<string, unknown>;
}

export function useOcppCommand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ stationId, command, params }: OcppCommand) => {
      const { data, error } = await supabase.functions.invoke("api", {
        body: { action: "ocpp_command", station_id: stationId, command, params },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["monitoring-stations"] });
    },
  });
}
```

- [ ] **Step 2: Créer le composant QuickActions (boutons Reset/Reboot inline)**

```typescript
// src/components/monitoring/QuickActions.tsx
// Composant : bouton Reset + bouton Détail pour chaque ligne station dans le monitoring
// Props: stationId, stationName
// Utilise useOcppCommand() pour envoyer les commandes
// Confirmation dialog avant reset
// Toast success/error
```

- [ ] **Step 3: Intégrer QuickActions dans le tableau monitoring**

Modifier `MonitoringPage.tsx` — ajouter une colonne "Actions" au tableau des stations avec les boutons QuickActions.

- [ ] **Step 4: Ajouter lien rapide vers détail station**

Dans chaque ligne du tableau monitoring, le nom de la station devient un `<Link to={"/stations?detail=" + station.id}>` cliquable.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useOcppCommands.ts src/components/monitoring/QuickActions.tsx src/components/monitoring/MonitoringPage.tsx
git commit -m "feat(monitoring): add Reset/Reboot quick actions + station detail link"
```

---

### Task 1.2: Recherche adresse + filtres CPO/territoire sur la Carte

**Files:**
- Modify: `src/components/map/MapPage.tsx`

- [ ] **Step 1: Ajouter barre de recherche avec geocoding**

Ajouter un `<input>` de recherche en haut de la carte. Utiliser l'API Nominatim (OpenStreetMap) gratuite pour le geocoding :
```
fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=5`)
```
Au clic sur un résultat, `map.flyTo([lat, lng], 14)`.

- [ ] **Step 2: Ajouter filtres CPO et territoire**

Ajouter des `<select>` pour filtrer par CPO et territoire. Les stations filtrées sont passées au layer Leaflet. Utiliser `useCPOs()` (de `src/hooks/useCPOs.ts`) pour la liste des CPOs et `useTerritories()` (de `src/hooks/useTerritories.ts`) pour les territoires.

- [ ] **Step 3: Ajouter filtre par type de puissance**

Boutons toggle : "Tous", "AC", "DC", "AC+DC". Filtrer `stations` par `max_power_kw` (DC > 22kW convention).

- [ ] **Step 4: Commit**

```bash
git add src/components/map/MapPage.tsx
git commit -m "feat(map): add address search, CPO/territory/power filters"
```

---

### Task 1.3: Export Dashboard + Drill-down KPIs

**Files:**
- Modify: `src/components/dashboard/DashboardPage.tsx`
- Create: `src/components/shared/ExportButton.tsx`

- [ ] **Step 1: Créer composant ExportButton réutilisable**

```typescript
// src/components/shared/ExportButton.tsx
// Props: data, filename, columns
// Génère CSV avec header + rows
// Bouton avec icône Download
```

- [ ] **Step 2: Ajouter ExportButton au dashboard**

Bouton "Exporter" en haut du dashboard qui exporte les KPIs + données tableau en CSV.

- [ ] **Step 3: Ajouter drill-down sur les KPI cards**

Chaque KPI card devient cliquable :
- "Sessions en cours" → navigate `/billing` (onglet Sessions)
- "Bornes actives" → navigate `/monitoring`
- "Énergie totale" → navigate `/analytics`
- "Disponibilité" → navigate `/analytics`

Utiliser `useNavigate()` + `cursor-pointer` + tooltip "Cliquer pour voir le détail".

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/ExportButton.tsx src/components/dashboard/DashboardPage.tsx
git commit -m "feat(dashboard): add export CSV + KPI drill-down navigation"
```

---

### Task 1.4: Date picker + Export pour Analytics avancées

**Files:**
- Modify: `src/components/analytics/AdvancedAnalyticsPage.tsx`
- Modify: `src/components/analytics/AnalyticsPage.tsx`
- Modify: `src/hooks/useSLAData.ts`

- [ ] **Step 1: Ajouter date range picker à AnalyticsPage**

Ajouter un sélecteur de période (presets 7j/30j/90j/1an + custom) au-dessus du tableau SLA. Passer les dates au hook `useSLAData` pour filtrer.

- [ ] **Step 2: Modifier useSLAData pour accepter dateRange**

Ajouter paramètres `from` et `to` au hook. Modifier la requête Supabase pour filtrer par période.

- [ ] **Step 3: Ajouter date picker à AdvancedAnalyticsPage**

Même pattern : sélecteur de période en haut de page, partagé entre les 4 onglets.

- [ ] **Step 4: Ajouter bouton Export CSV à chaque onglet**

4 boutons export (un par onglet) qui exportent les données du tableau courant.

- [ ] **Step 5: Ajouter graphiques Recharts aux onglets Revenue et Utilization**

- Onglet Revenue : bar chart mensuel en plus du tableau
- Onglet Utilization : horizontal bar chart classement stations

- [ ] **Step 6: Commit**

```bash
git add src/components/analytics/ src/hooks/useSLAData.ts
git commit -m "feat(analytics): add date range picker, exports, charts to analytics pages"
```

---

### Task 1.5: Actions sur bornes en panne (CPO Overview)

**Depends on:** Task 1.1 (`useOcppCommand` hook)

**Files:**
- Modify: `src/components/cpo-overview/CpoOverviewPage.tsx`

- [ ] **Step 1: Ajouter colonne Actions au tableau faulted**

Dans l'onglet "Bornes en panne", ajouter une colonne avec :
- Bouton "Reset" (utilise `useOcppCommand` de Task 1.1)
- Bouton "Créer intervention" (ouvre modal pré-rempli avec station)
- Bouton "Voir détail" (navigue vers `/stations?detail={id}`)

- [ ] **Step 2: Ajouter export CSV bornes en panne**

Bouton "Exporter" au-dessus du tableau faulted stations.

- [ ] **Step 3: Ajouter badge "Acknowledge"**

Bouton "Vu" par station en panne qui persiste dans `localStorage` (pas besoin de DB pour ça). Badge visuel pour distinguer "vu" de "nouveau".

- [ ] **Step 4: Commit**

```bash
git add src/components/cpo-overview/CpoOverviewPage.tsx
git commit -m "feat(cpo-overview): add reset, create intervention, export on faulted stations"
```

---

### Task 1.6: Gestion connecteurs dans Stations **[MIGRATION]**

**Files:**
- Modify: `src/components/stations/StationDetailView.tsx`
- Migration: `supabase/migrations/YYYYMMDD_add_connectors_crud.sql`

**Migration SQL requise:**
```sql
-- Vérifier que la table evse_connectors existe (ou station_connectors)
-- Si elle n'existe pas, la créer :
-- CREATE TABLE IF NOT EXISTS station_connectors (
--   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
--   station_id uuid REFERENCES stations(id),
--   connector_id int,
--   standard text, -- IEC_62196_T2, CHADEMO, etc.
--   format text,   -- SOCKET, CABLE
--   power_type text, -- AC_1_PHASE, AC_3_PHASE, DC
--   max_voltage int,
--   max_amperage int,
--   max_electric_power int,
--   status text DEFAULT 'Available',
--   created_at timestamptz DEFAULT now()
-- );
```

- [ ] **Step 1: Créer la migration DB si nécessaire**

Vérifier l'existence de la table connecteurs. Si absente, créer la migration.

- [ ] **Step 2: Ajouter CRUD connecteurs dans l'onglet Details**

Dans la section "Connecteurs" du StationDetailView, ajouter :
- Bouton "Ajouter connecteur" → mini formulaire (type, puissance, standard OCPI)
- Bouton "Modifier" par connecteur → édition inline
- Bouton "Supprimer" par connecteur → confirmation

- [ ] **Step 2: Créer les mutations Supabase**

```typescript
// Insert/Update/Delete sur la table des connecteurs (evse_connectors ou équivalent)
// Invalider queryKey ["station-detail", stationId]
```

- [ ] **Step 3: Commit**

```bash
git add src/components/stations/StationDetailView.tsx
git commit -m "feat(stations): add connector CRUD in station detail view"
```

---

### Task 1.7: Batch Operations — Sélection multiple stations

**Depends on:** Task 1.1 (`useOcppCommand` hook)

**Files:**
- Create: `src/components/shared/BatchActionBar.tsx`
- Modify: `src/components/stations/StationsPage.tsx`
- Modify: `src/components/stations/StationTable.tsx`

- [ ] **Step 1: Créer BatchActionBar réutilisable**

```typescript
// src/components/shared/BatchActionBar.tsx
// Barre fixe en bas quand des items sont sélectionnés
// Props: selectedCount, onAction(actionType), actions[]
// Affiche: "X sélectionnés" + boutons d'action + bouton "Tout désélectionner"
```

- [ ] **Step 2: Ajouter checkboxes au StationTable**

Checkbox en première colonne + checkbox "tout sélectionner" dans le header. State `selectedIds: Set<string>` dans StationsPage.

- [ ] **Step 3: Implémenter les actions batch**

Actions disponibles :
- "Reset toutes" → boucle sur `useOcppCommand` pour chaque station
- "Assigner tarif" → modal choix tarif → update batch
- "Changer statut" → modal choix statut → update batch

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/BatchActionBar.tsx src/components/stations/StationsPage.tsx src/components/stations/StationTable.tsx
git commit -m "feat(stations): add batch selection with reset, tariff assign, status change"
```

---

### Task 1.8: Filtre OCPP Logs par type de message

**Files:**
- Modify: `src/components/monitoring/MonitoringOcppLogsTab.tsx`

- [ ] **Step 1: Ajouter dropdown filtre par type de message**

```typescript
const OCPP_MESSAGE_TYPES = [
  "BootNotification", "StatusNotification", "Heartbeat",
  "StartTransaction", "StopTransaction", "MeterValues",
  "Authorize", "RemoteStartTransaction", "RemoteStopTransaction",
  "Reset", "ChangeConfiguration", "GetConfiguration",
];
// <select> en haut du log viewer, filtre les résultats
```

- [ ] **Step 2: Commit**

```bash
git add src/components/monitoring/MonitoringOcppLogsTab.tsx
git commit -m "feat(monitoring): add OCPP message type filter in logs tab"
```

---

### Task 1.9: Indicateur de rafraîchissement auto

**Files:**
- Modify: `src/components/dashboard/DashboardPage.tsx`
- Modify: `src/components/monitoring/MonitoringPage.tsx`

- [ ] **Step 1: Créer un composant RefreshIndicator**

Petit badge en haut à droite : icône 🔄 + "Mis à jour il y a Xs" avec countdown vers le prochain refresh. Utilise `dataUpdatedAt` de React Query.

- [ ] **Step 2: Intégrer dans Dashboard et Monitoring**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add auto-refresh indicator on dashboard and monitoring"
```

---

# SPRINT 2 — Workflow Incident Complet (5 jours, ~15 gaps)

**Objectif:** Un opérateur voit un incident → crée une intervention → assigne un technicien → upload photos → clôture avec rapport. Bout en bout.

---

### Task 2.1: Alerte → Création intervention automatique **[MIGRATION]**

**Files:**
- Modify: `src/components/monitoring/MonitoringAlertsTab.tsx`
- Modify: `src/components/monitoring/MonitoringHistoryTab.tsx`
- Create: `src/components/monitoring/InterventionCreateFromAlert.tsx`
- Modify: `supabase/functions/alert-check/index.ts`
- Migration: `supabase/migrations/YYYYMMDD_alert_auto_intervention.sql`

**Migration SQL:**
```sql
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS auto_create_intervention boolean DEFAULT false;
```

- [ ] **Step 1: Ajouter bouton "Créer intervention" par alerte dans l'historique**

Dans l'onglet Historique, chaque ligne alerte a un bouton "→ Intervention" qui ouvre un modal pré-rempli (station, type, description depuis l'alerte).

- [ ] **Step 2: Créer le composant InterventionCreateFromAlert**

Modal avec champs pré-remplis depuis l'alerte : station, catégorie (maintenance/repair selon alert_type), description, priorité. L'opérateur peut ajuster avant de confirmer.

- [ ] **Step 3: Option auto-create dans la config alerte**

Dans le Wizard de création d'alerte (étape 2 Config), ajouter un toggle : "Créer automatiquement une intervention quand cette alerte se déclenche".

Stocker `auto_create_intervention: boolean` dans `alert_rules`.

- [ ] **Step 4: Implémenter l'auto-création dans alert-check Edge Function**

Si `rule.auto_create_intervention === true`, après l'envoi d'email, insérer aussi dans la table `interventions`.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(monitoring): alert-to-intervention automation (manual + auto)"
```

---

### Task 2.2: Assignation technicien sur les interventions **[MIGRATION]**

**Files:**
- Modify: `src/components/technician/InterventionsPage.tsx`
- Modify: `src/components/monitoring/MonitoringInterventionsTab.tsx`
- Create: `src/hooks/useInterventions.ts`
- Migration: `supabase/migrations/YYYYMMDD_intervention_assigned_to.sql`

**Migration SQL:**
```sql
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id);
```

- [ ] **Step 1: Créer hook centralisé useInterventions**

```typescript
// Queries: list interventions, get by id
// Mutations: create, update, assign, close
// Includes: list of available technicians (users with role "technician")
```

- [ ] **Step 2: Ajouter champ "Technicien assigné" au formulaire d'intervention**

Dropdown des utilisateurs avec rôle technicien. Champ `assigned_to` dans la table interventions.

- [ ] **Step 3: Ajouter filtre par technicien dans la liste**

Dropdown filtre "Technicien" dans la page Interventions.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(interventions): add technician assignment with user dropdown"
```

---

### Task 2.3: Upload photos sur les interventions

**Files:**
- Create: `src/components/technician/PhotoUpload.tsx`
- Modify: `src/components/technician/InterventionsPage.tsx`
- Modify: `src/components/monitoring/MonitoringInterventionsTab.tsx`

- [ ] **Step 1: Créer bucket Supabase Storage "intervention-photos"**

Via SQL ou dashboard : bucket public, limite 5MB, types image/*.

- [ ] **Step 2: Créer composant PhotoUpload**

```typescript
// Props: interventionId, existingPhotos[]
// Upload via supabase.storage.from("intervention-photos").upload()
// Affiche galerie miniatures existantes
// Bouton "Ajouter photo" avec file input (accept="image/*")
// Suppression photo avec confirmation
```

- [ ] **Step 3: Intégrer PhotoUpload dans le détail/rapport d'intervention**

Ajouter le composant dans le modal de rapport et dans le détail de l'intervention.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(interventions): add photo upload with Supabase Storage"
```

---

### Task 2.4: Vue calendrier des interventions

**Files:**
- Create: `src/components/technician/InterventionCalendar.tsx`
- Modify: `src/components/technician/InterventionsPage.tsx`

- [ ] **Step 1: Installer une lib calendrier légère**

Option : `@schedule-x/react` ou construire un calendrier simple avec CSS Grid (jours du mois, couleur par statut).

- [ ] **Step 2: Créer InterventionCalendar**

Vue mensuelle avec les interventions positionnées par date. Couleur par statut (planned=bleu, in_progress=orange, completed=vert). Clic sur une intervention → ouvre le détail.

- [ ] **Step 3: Toggle vue liste / vue calendrier**

Boutons "Liste" / "Calendrier" en haut de la page interventions.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(interventions): add calendar view with monthly grid"
```

---

### Task 2.5: Temps passé par intervention **[MIGRATION]**

**Files:**
- Modify: `src/components/technician/InterventionsPage.tsx`
- Modify: `src/hooks/useInterventions.ts`
- Migration: `supabase/migrations/YYYYMMDD_intervention_time_tracking.sql`

**Migration SQL:**
```sql
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS started_work_at timestamptz;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS completed_work_at timestamptz;
```

- [ ] **Step 1: Appliquer migration + Ajouter champs time tracking**

Champs `started_work_at` et `completed_work_at` dans la table interventions. Calcul automatique de la durée.

- [ ] **Step 2: Bouton Start/Stop timer dans le détail**

Bouton "Démarrer le travail" → enregistre `started_work_at`. Bouton "Terminer" → enregistre `completed_work_at`. Affiche la durée en temps réel pendant le travail.

- [ ] **Step 3: Afficher la durée dans la liste**

Colonne "Durée" dans le tableau des interventions.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(interventions): add time tracking with start/stop buttons"
```

---

### Task 2.6: Support tickets — Assignation + Commentaires **[MIGRATION]**

**Files:**
- Modify: `src/components/support/SupportPage.tsx`
- Create: `src/hooks/useTickets.ts`
- Migration: `supabase/migrations/YYYYMMDD_ticket_comments_sla.sql`

**Migration SQL:**
```sql
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id);
CREATE TABLE IF NOT EXISTS ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_ticket_comments_ticket ON ticket_comments(ticket_id);
```

- [ ] **Step 1: Créer hook useTickets**

```typescript
// Queries: list tickets, get by id with comments
// Mutations: create, update, assign, addComment, close
```

- [ ] **Step 2: Ajouter champ assignation dans le formulaire ticket**

Dropdown "Assigné à" avec liste des utilisateurs. Champ `assigned_to` dans la table tickets.

- [ ] **Step 3: Ajouter fil de commentaires**

Sous le détail du ticket, section commentaires :
- Liste chronologique des commentaires (auteur, date, texte)
- Champ texte + bouton "Ajouter commentaire"
- Table `ticket_comments (id, ticket_id, user_id, content, created_at)`

- [ ] **Step 4: Ajouter SLA tracking basique**

Calculer et afficher :
- "Temps depuis création" (badge couleur : vert <4h, orange <24h, rouge >24h)
- "Temps première réponse" (premier commentaire après création)

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(support): add ticket assignment, comments thread, SLA tracking"
```

---

### Task 2.7: Maintenance planifiée récurrente **[MIGRATION]**

**Files:**
- Modify: `src/components/technician/InterventionsPage.tsx`
- Modify: `src/hooks/useInterventions.ts`
- Migration: `supabase/migrations/YYYYMMDD_intervention_recurring.sql`

**Migration SQL:**
```sql
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS is_recurring boolean DEFAULT false;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS recurrence_interval text; -- 'weekly', 'monthly', 'quarterly'
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS next_occurrence date;
```

- [ ] **Step 1: Appliquer migration + Ajouter option "Récurrente" à la création d'intervention**

Toggle "Intervention récurrente" dans le formulaire. Si activé, champs :
- Fréquence (hebdomadaire, mensuelle, trimestrielle)
- Prochaine date

- [ ] **Step 2: Stocker la récurrence**

Champs `is_recurring`, `recurrence_interval`, `next_occurrence` dans la table interventions.

- [ ] **Step 3: Edge Function ou cron pour créer les occurrences**

Logique simple : quand une intervention récurrente est complétée, créer automatiquement la prochaine occurrence.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(interventions): add recurring maintenance scheduling"
```

---

# SPRINT 3 — Workflow Facturation & Tarifs (5 jours, ~15 gaps)

**Objectif:** L'opérateur peut générer des factures en batch, créer des avoirs, envoyer des relances, et construire des tarifs OCPI visuellement.

---

### Task 3.1: Génération de factures batch **[MIGRATION]**

**Files:**
- Create: `src/components/billing/InvoiceGenerationWizard.tsx`
- Create: `src/hooks/useInvoiceGeneration.ts`
- Modify: `src/components/billing/BillingPage.tsx`
- Migration: `supabase/migrations/YYYYMMDD_invoice_generation_batch.sql`

**Note:** Le `settlement-engine` Edge Function existant gère déjà la logique de calcul. La génération batch utilisera une **RPC Supabase** (`generate_batch_invoices`) qui réutilise la logique existante du settlement-engine plutôt qu'une nouvelle Edge Function.

**Migration SQL:**
```sql
CREATE OR REPLACE FUNCTION generate_batch_invoices(
  p_period_from date, p_period_to date, p_cpo_id uuid DEFAULT NULL, p_group_by text DEFAULT 'customer'
) RETURNS jsonb AS $$
-- Regroupe les CDRs sans facture de la période
-- Crée une facture par groupe (customer/station)
-- Retourne { invoices_created: N, total_amount: X }
$$ LANGUAGE plpgsql;
```

- [ ] **Step 1: Créer la migration + RPC generate_batch_invoices**

- [ ] **Step 2: Créer le hook useInvoiceGeneration**

```typescript
// Mutation: generateInvoices({ period: { from, to }, cpoId?, groupBy: "customer" | "station" })
// Appelle la RPC generate_batch_invoices qui :
// 1. Récupère tous les CDRs de la période sans facture
// 2. Groupe par client/station
// 3. Crée les factures avec lignes
// 4. Retourne le nombre de factures créées
```

- [ ] **Step 2: Créer InvoiceGenerationWizard**

Modal en 3 étapes :
1. Choisir la période (mois, ou custom)
2. Choisir le groupement (par client, par station, par CPO)
3. Aperçu des factures à générer (nombre, montant total) + bouton "Générer"

- [ ] **Step 3: Intégrer dans l'onglet Factures**

Bouton "Générer factures" en haut de l'onglet Invoices de BillingPage.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(billing): add batch invoice generation wizard"
```

---

### Task 3.2: Avoir / Credit Note

**Files:**
- Create: `src/components/billing/CreditNoteModal.tsx`
- Modify: `src/components/billing/BillingPage.tsx`

- [ ] **Step 1: Créer CreditNoteModal**

Modal pour créer un avoir :
- Sélectionner la facture d'origine
- Montant de l'avoir (total ou partiel)
- Motif (dropdown : erreur, remboursement, geste commercial)
- Crée une entrée `invoices` avec `type: "credit_note"` et `parent_invoice_id`

- [ ] **Step 2: Ajouter bouton "Créer avoir" par facture**

Dans la liste factures, action "Avoir" par ligne (uniquement sur factures `paid` ou `issued`).

- [ ] **Step 3: Afficher les avoirs dans la liste**

Les credit notes apparaissent dans le même tableau avec un badge "Avoir" et montant négatif.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(billing): add credit note creation linked to invoices"
```

---

### Task 3.3: Relance paiement (Dunning) **[MIGRATION]**

**Files:**
- Create: `src/components/billing/PaymentReminderModal.tsx`
- Modify: `src/components/billing/BillingPage.tsx`
- Migration: `supabase/migrations/YYYYMMDD_invoice_reminders.sql`

**Migration SQL:**
```sql
CREATE TABLE IF NOT EXISTS invoice_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id),
  sent_to text NOT NULL,
  sent_at timestamptz DEFAULT now()
);
```

- [ ] **Step 1: Créer PaymentReminderModal**

Modal pour envoyer une relance email :
- Affiche les infos facture (numéro, montant, date échéance)
- Champ email destinataire (pré-rempli depuis le client)
- Template email de relance (HTML basique, même style que les alertes)
- Envoi via Resend (réutiliser le pattern alert-check)

- [ ] **Step 2: Ajouter bouton "Relancer" par facture impayée**

Visible uniquement sur les factures avec statut `pending` ou `past_due`.

- [ ] **Step 3: Logger la relance**

Stocker dans `invoice_reminders (id, invoice_id, sent_at, sent_to)` pour éviter le spam.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(billing): add payment reminder email for unpaid invoices"
```

---

### Task 3.4: Constructeur visuel de tarifs OCPI

**Files:**
- Create: `src/components/tariffs/TariffVisualBuilder.tsx`
- Modify: `src/components/tariffs/TariffsPage.tsx`

- [ ] **Step 1: Créer TariffVisualBuilder**

Remplace la saisie JSON par un formulaire visuel :

```
Composants tarifaires :
[+ Ajouter composant]

Composant 1 : [Type ▼ ENERGY]
  Prix : [0.35] €/kWh
  TVA : [20] %

Composant 2 : [Type ▼ TIME]
  Prix : [0.05] €/min
  TVA : [20] %

Composant 3 : [Type ▼ FLAT]
  Prix : [1.00] € (frais session)
  TVA : [20] %

[Restrictions horaires ▼]
  Jour : [Lun-Ven]  Heures : [08:00 - 20:00]

--- Aperçu JSON OCPI ---
{ "elements": [...] }
```

- [ ] **Step 2: Intégrer dans TariffsPage**

Remplacer le champ `<textarea>` JSON par le TariffVisualBuilder dans le modal de création/édition de tarif OCPI. Garder un toggle "Mode avancé (JSON)" pour les power users.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(tariffs): add visual OCPI tariff builder replacing raw JSON"
```

---

### Task 3.5: Simulation tarif dans Billing Profiles

**Files:**
- Modify: `src/components/billing/BillingProfilesPage.tsx`

- [ ] **Step 1: Ajouter bouton "Simuler" par règle tarifaire**

Réutiliser le même pattern que la simulation dans TariffsPage. Ouvrir un modal avec champs : durée session, énergie consommée, type connecteur. Afficher le prix calculé.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(billing-profiles): add tariff simulation button"
```

---

### Task 3.6: Export comptable + Réconciliation

**Files:**
- Modify: `src/components/billing/BillingPage.tsx`

- [ ] **Step 1: Ajouter export format comptable**

Bouton "Export FEC" (Fichier des Écritures Comptables) dans l'onglet Factures. Génère un CSV au format FEC avec les colonnes standard : JournalCode, JournalLib, EcritureNum, EcritureDate, CompteNum, CompteLib, Debit, Credit.

- [ ] **Step 2: Ajouter onglet ou section "Réconciliation"**

Tableau comparant : CDRs de la période vs factures générées. Mettre en évidence les CDRs sans facture et les écarts de montant.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(billing): add FEC accounting export and CDR reconciliation view"
```

---

# SPRINT 4 — Workflow Roaming OCPI (5 jours, ~12 gaps)

**Objectif:** L'opérateur peut enregistrer un partenaire OCPI, lancer un handshake, pousser ses locations, synchroniser les tokens, gérer les photos de stations.

---

### Task 4.1: Wizard création credential OCPI

**Files:**
- Create: `src/components/ocpi/OcpiCredentialWizard.tsx`
- Create: `src/hooks/useOcpiCredentials.ts`
- Modify: `src/components/ocpi/OcpiPage.tsx`

- [ ] **Step 1: Créer le hook useOcpiCredentials**

```typescript
// Mutations:
// - generateToken(): génère un token OCPI côté CPO
// - registerPartner({ url, token, partyId, countryCode }): enregistre un partenaire
// - triggerHandshake(credentialId): lance le credentials exchange
// - testEndpoint(url, token): teste la connectivité
```

- [ ] **Step 2: Créer OcpiCredentialWizard**

Modal wizard 4 étapes :
1. **Infos partenaire** : Nom, country_code, party_id, rôle (CPO/eMSP/HUB)
2. **URLs** : versions endpoint URL du partenaire
3. **Tokens** : Générer notre token + saisir le token partenaire
4. **Handshake** : Bouton "Lancer le handshake" + résultat en direct (success/fail)

- [ ] **Step 3: Intégrer dans OcpiPage**

Bouton "Nouvelle connexion OCPI" en haut de la page, ouvre le wizard.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(ocpi): add credential registration wizard with handshake"
```

---

### Task 4.2: Test endpoint OCPI + Handshake manuel

**Files:**
- Create: `src/components/ocpi/OcpiEndpointTest.tsx`
- Create: `src/components/ocpi/OcpiHandshakeModal.tsx`
- Modify: `src/components/ocpi/OcpiPage.tsx`

- [ ] **Step 1: Créer OcpiEndpointTest**

Panel de test dans le détail d'une souscription OCPI :
- Dropdown : choisir un module (locations, tokens, cdrs, tariffs, sessions)
- Bouton "Tester" → appelle l'endpoint et affiche le résultat (status code, response preview)
- Badge vert/rouge par module

- [ ] **Step 2: Créer Edge Function ocpi-handshake**

```typescript
// supabase/functions/ocpi-handshake/index.ts
// Reçoit: { credential_id, partner_url, partner_token }
// 1. POST /ocpi/2.2/credentials vers le partenaire avec notre token
// 2. Récupère les endpoints du partenaire
// 3. Stocke les credentials échangées en DB
// 4. Retourne success/failure avec détails
// Réutilise les helpers existants de _shared/ocpi-client.ts
```

- [ ] **Step 3: Créer OcpiHandshakeModal**

Bouton "Re-handshake" dans le détail souscription. Modal avec :
- Token actuel affiché
- Bouton "Régénérer token"
- Bouton "Lancer handshake" → appelle Edge Function ocpi-handshake
- Log en temps réel du processus

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(ocpi): add endpoint testing panel and manual handshake"
```

---

### Task 4.3: Push locations + Sync tokens OCPI

**Files:**
- Create: `src/components/ocpi/OcpiPushModal.tsx`
- Create: `supabase/functions/ocpi-push-locations/index.ts`
- Modify: `src/components/ocpi/OcpiPage.tsx`
- Modify: `src/components/locations/LocationsPage.tsx`

- [ ] **Step 1: Créer Edge Function ocpi-push-locations**

```typescript
// Récupère les locations publiées
// Pour chaque partenaire OCPI actif, PUT les locations via l'endpoint partenaire
// Retourne le nombre de locations poussées par partenaire
```

- [ ] **Step 2: Créer OcpiPushModal**

Modal avec :
- Liste des partenaires OCPI actifs (checkboxes)
- Choix : "Toutes les locations" ou "Sélection"
- Bouton "Pousser" → appelle l'Edge Function
- Résultat : X locations poussées vers Y partenaires

- [ ] **Step 3: Ajouter bouton "Push OCPI" dans LocationsPage**

Bouton par location (push individuelle) + bouton global "Push toutes".

- [ ] **Step 4: Ajouter bouton "Sync tokens" dans OcpiPage**

Par partenaire, bouton "Synchroniser tokens" qui pull les tokens depuis le partenaire.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(ocpi): add location push and token sync capabilities"
```

---

### Task 4.4: Gestion photos locations

**Files:**
- Create: `src/components/locations/LocationPhotoManager.tsx`
- Modify: `src/components/locations/LocationsPage.tsx`

- [ ] **Step 1: Créer bucket "location-photos" dans Supabase Storage**

- [ ] **Step 2: Créer LocationPhotoManager**

Composant galerie :
- Affiche les photos existantes de la location (thumbnail grid)
- Bouton "Ajouter photo" (file input, accept="image/*", max 5MB)
- Upload vers `location-photos/{location_id}/{filename}`
- Supprimer une photo
- Champ "catégorie" par photo : OWNER, ENTRANCE, LOCATION, EVSE, OTHER (enum OCPI)

- [ ] **Step 3: Intégrer dans l'éditeur de location**

Ajouter le composant dans la vue d'édition de LocationsPage.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(locations): add photo management with OCPI image categories"
```

---

### Task 4.5: Supprimer location + Bulk publish + Import CSV exceptions

**Files:**
- Modify: `src/components/locations/LocationsPage.tsx`
- Modify: `src/components/exceptions/ExceptionsPage.tsx`

- [ ] **Step 1: Ajouter bouton supprimer par location**

Avec confirmation dialog. Soft delete (flag `deleted_at`) pour ne pas casser les CDRs historiques.

- [ ] **Step 2: Ajouter bulk publish/unpublish**

Checkboxes + barre d'action batch "Publier sélection" / "Dépublier sélection".

- [ ] **Step 3: Import CSV whitelist dans ExceptionsPage**

Bouton "Importer CSV" dans la page Exceptions. Accepte un CSV avec colonne `uid`. Crée les règles d'exception en batch.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add location delete/bulk-publish + exception CSV import"
```

---

### Task 4.6: Réconciliation CDR/Accord roaming + PJ contrat

**Files:**
- Modify: `src/components/agreements/AgreementsPage.tsx`

- [ ] **Step 1: Ajouter section réconciliation par accord**

Dans le détail d'un accord roaming, onglet "Réconciliation" :
- Tableau CDRs du partenaire sur la période
- Montant total CDRs vs montant remboursement attendu
- Badge "Conforme" / "Écart de X€"

- [ ] **Step 2: Ajouter upload PJ contrat**

Bouton "Joindre contrat PDF" par accord. Upload vers Supabase Storage `roaming-contracts/{agreement_id}/`.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(roaming): add CDR reconciliation per agreement + contract PDF upload"
```

---

# SPRINT 5 — Workflow Client / Fleet / B2B (5 jours, ~12 gaps)

**Objectif:** Vue 360° client, lien driver↔token, self-service B2B flotte, suppression client/driver.

---

### Task 5.1: Vue 360° Client

**Files:**
- Create: `src/components/customers/CustomerDetailPage.tsx`
- Create: `src/components/customers/CustomerTimeline.tsx`
- Create: `src/hooks/useCustomerDetail.ts`
- Modify: `src/components/customers/CustomersPage.tsx`

- [ ] **Step 1: Créer hook useCustomerDetail**

```typescript
// Query: récupère en parallèle pour un customer_id :
// - Profil client (customers table)
// - Sessions de charge (ocpp_transactions + ocpi_cdrs)
// - Factures (invoices)
// - Tokens (ocpi_tokens)
// - Abonnements (user_subscriptions)
// - Tickets support (tickets)
```

- [ ] **Step 2: Créer CustomerDetailPage**

Page détail en slide-over large (ou page dédiée) avec :
- **Header** : nom, email, téléphone, statut, date inscription
- **KPIs** : total sessions, énergie totale, dépense totale, dette en cours
- **Onglets** :
  1. Sessions (tableau avec date, station, énergie, coût)
  2. Factures (tableau avec statut paiement)
  3. Tokens (liste avec statut, solde prépayé)
  4. Abonnements (offre, statut, dates)
  5. Tickets (historique support)

- [ ] **Step 3: Créer CustomerTimeline**

Timeline verticale montrant les événements récents du client (session, paiement, ticket, changement statut) en ordre chronologique.

- [ ] **Step 4: Intégrer dans CustomersPage**

Clic sur un client → ouvre CustomerDetailPage en slide-over.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(customers): add 360° customer detail view with all history"
```

---

### Task 5.2: Lien Driver ↔ Token

**Files:**
- Create: `src/components/drivers/DriverTokenLink.tsx`
- Create: `src/hooks/useDriverTokens.ts`
- Modify: `src/components/drivers/DriversPage.tsx`

- [ ] **Step 1: Créer hook useDriverTokens**

```typescript
// Query: tokens associés à un driver (via driver_id ou contract_id)
// Mutations: linkToken(driverId, tokenUid), unlinkToken(tokenId)
```

- [ ] **Step 2: Créer DriverTokenLink**

Dans le détail d'un driver, section "Tokens associés" :
- Liste des tokens liés (UID, type, statut, solde)
- Bouton "Associer token" → modal recherche par UID → link
- Bouton "Dissocier" par token

- [ ] **Step 3: Ajouter historique sessions dans le détail driver**

Onglet "Sessions" dans le détail driver montrant toutes les sessions de ses tokens.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(drivers): add token linking and session history"
```

---

### Task 5.3: Supprimer client + driver

**Files:**
- Modify: `src/components/customers/CustomersPage.tsx`
- Modify: `src/components/drivers/DriversPage.tsx`

- [ ] **Step 1: Ajouter bouton supprimer client**

Bouton avec confirmation dialog double (saisir le nom pour confirmer). Soft delete : `deleted_at` timestamp.

- [ ] **Step 2: Ajouter bouton supprimer driver**

Même pattern. Vérifier qu'aucun token actif n'est lié avant suppression.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add soft delete for customers and drivers"
```

---

### Task 5.4: Self-service flotte B2B **[MIGRATION]**

**Files:**
- Create: `src/components/b2b/B2BFleetManagement.tsx`
- Modify: `src/components/b2b/B2BFleetPage.tsx`
- Migration: `supabase/migrations/YYYYMMDD_b2b_token_requests.sql`

**Migration SQL:**
```sql
CREATE TABLE IF NOT EXISTS token_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  b2b_client_id uuid NOT NULL REFERENCES b2b_clients(id),
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  driver_name text,
  status text DEFAULT 'pending', -- pending, approved, rejected
  approved_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);
```

- [ ] **Step 1: Ajouter "Ajouter conducteur" au portail B2B**

Le client B2B peut ajouter un conducteur à sa flotte :
- Formulaire : nom, prénom, email, véhicule (optionnel)
- Crée le driver + l'associe au client B2B
- Le driver hérite des tokens/accès du client

- [ ] **Step 2: Ajouter "Retirer conducteur"**

Bouton par conducteur pour le retirer de la flotte (ne supprime pas le driver, juste le lien B2B).

- [ ] **Step 3: Ajouter demande de token**

Bouton "Demander un badge RFID" → crée une demande (table `token_requests`) que l'admin validera.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(b2b): add self-service fleet management (add/remove driver, request token)"
```

---

### Task 5.5: Limites budget + Rapports planifiés B2B **[MIGRATION]**

**Files:**
- Modify: `src/components/b2b/B2BOverviewPage.tsx`
- Modify: `src/components/b2b/B2BCompanyPage.tsx`
- Migration: `supabase/migrations/YYYYMMDD_b2b_budget_limits.sql`

**Migration SQL:**
```sql
ALTER TABLE b2b_clients ADD COLUMN IF NOT EXISTS monthly_budget numeric;
ALTER TABLE b2b_clients ADD COLUMN IF NOT EXISTS budget_alert_enabled boolean DEFAULT false;
ALTER TABLE b2b_clients ADD COLUMN IF NOT EXISTS budget_block_enabled boolean DEFAULT false;
ALTER TABLE b2b_clients ADD COLUMN IF NOT EXISTS monthly_report_email boolean DEFAULT false;
```

- [ ] **Step 1: Ajouter configuration budget dans Mon Entreprise**

Section "Budget" dans B2BCompanyPage :
- Champ "Plafond mensuel (€)" éditable
- Toggle "Alerte quand 80% du budget atteint"
- Toggle "Bloquer les sessions quand 100% atteint"

Stocke dans `b2b_clients` : `monthly_budget`, `budget_alert_enabled`, `budget_block_enabled`.

- [ ] **Step 2: Afficher la jauge budget dans le dashboard B2B**

Progress bar dans B2BOverviewPage : "Budget utilisé : 2 450€ / 5 000€ (49%)" avec couleur vert/orange/rouge.

- [ ] **Step 3: Ajouter "Recevoir rapport mensuel" dans Mon Entreprise**

Toggle "Recevoir un rapport PDF par email chaque mois". Stocke `monthly_report_email: boolean`.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(b2b): add budget limits, spending gauge, monthly report toggle"
```

---

### Task 5.6: Validation token contextuelle + Recharge admin prépayé

**Files:**
- Modify: `src/components/validate-token/ValidateTokenPage.tsx`
- Modify: `src/components/payment-methods/PaymentMethodsPage.tsx`

- [ ] **Step 1: Ajouter champ "Station" à la validation token**

Dropdown optionnel pour tester "ce token est-il accepté sur cette station ?". Vérifie les exceptions, whitelist/blacklist, accès groups.

- [ ] **Step 2: Ajouter bouton "Créditer" pour tokens prépayés**

Dans la liste tokens (PaymentMethodsPage), bouton "Créditer" par token prépayé. Modal avec champ montant. Appelle directement `reactivate_prepaid_token` RPC sans passer par Stripe.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: add contextual token validation + admin prepaid top-up"
```

---

# SPRINT 6 — Smart Charging + Analytics + Polish (5 jours, ~9 gaps + polish)

**Objectif:** Smart charging temps réel, tendance SLA historique, polish général, et les gaps restants (basse priorité).

---

### Task 6.1: Smart Charging — Visualisation temps réel

**Files:**
- Create: `src/components/smart-charging/RealtimeLoadChart.tsx`
- Create: `src/hooks/useSmartChargingRealtime.ts`
- Modify: `src/components/smart-charging/SmartChargingPage.tsx`

- [ ] **Step 1: Créer hook useSmartChargingRealtime**

```typescript
// Query: pour un groupe de charge, récupère :
// - Capacité max configurée
// - Charge actuelle (somme des meter_values des sessions actives)
// - Par EVSE : puissance en cours
// RefetchInterval: 10s
```

- [ ] **Step 2: Créer RealtimeLoadChart**

Gauge chart (demi-cercle) avec :
- Charge actuelle vs capacité max
- Couleur : vert <60%, orange 60-85%, rouge >85%
- Liste des EVSEs actifs avec leur puissance individuelle
- Sparkline des 30 dernières minutes

- [ ] **Step 3: Intégrer dans SmartChargingPage**

Quand un groupe est sélectionné, afficher le RealtimeLoadChart au-dessus des settings.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(smart-charging): add realtime load monitoring with gauge chart"
```

---

### Task 6.2: Smart Charging — Historique courbes de charge

**Files:**
- Create: `src/components/smart-charging/LoadHistoryChart.tsx`
- Modify: `src/components/smart-charging/SmartChargingPage.tsx`

- [ ] **Step 1: Créer LoadHistoryChart**

Graphique Recharts (Area chart) montrant :
- Charge (kW) sur l'axe Y
- Temps sur l'axe X (24h, 7j, 30j sélectionnables)
- Ligne de capacité max en pointillé
- Zone rouge quand dépassement

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(smart-charging): add historical load curves chart"
```

---

### Task 6.3: Analytics — Tendance SLA historique

**Files:**
- Create: `src/components/analytics/SlaTrendChart.tsx`
- Create: `src/hooks/useSlaHistory.ts`
- Modify: `src/components/analytics/AnalyticsPage.tsx`

- [ ] **Step 1: Créer hook useSlaHistory**

```typescript
// Query: SLA par jour/semaine/mois sur la période sélectionnée
// Requête agrégée depuis station_status_history ou stations_enriched snapshots
```

- [ ] **Step 2: Créer SlaTrendChart**

Line chart Recharts :
- Axe X : temps (jours/semaines/mois)
- Axe Y : % disponibilité
- Ligne horizontale pointillée : objectif SLA (configurable)
- Zone sous l'objectif en rouge

- [ ] **Step 3: Ajouter champ objectif SLA**

Input dans AnalyticsPage : "Objectif SLA : [95] %" stocké en localStorage (ou admin-config).

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(analytics): add SLA trend chart with configurable target"
```

---

### Task 6.4: Energy Mix — Assignation profil + CO2

**Files:**
- Modify: `src/components/energy-mix/EnergyMixPage.tsx`

- [ ] **Step 1: Ajouter assignation profil → stations**

Dans le détail d'un profil énergie, section "Stations associées" :
- Multi-select de stations
- Sauvegarde le lien dans `station_energy_profiles (station_id, profile_id)`

- [ ] **Step 2: Ajouter estimation CO2 évité**

Calcul basique : énergie totale × facteur d'émission du profil. Afficher "X tonnes CO2 évitées" en KPI.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(energy-mix): add station assignment and CO2 estimation"
```

---

### Task 6.5: Admin — API keys + Audit log **[MIGRATION]**

**Files:**
- Modify: `src/components/admin-config/AdminConfigPage.tsx`
- Migration: `supabase/migrations/YYYYMMDD_api_keys_audit_logs.sql`

**Migration SQL:**
```sql
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_hash text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text,
  entity_id text,
  details jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
```

- [ ] **Step 1: Appliquer migration + Ajouter onglet "API Keys" dans admin-config**

CRUD de clés API :
- Générer une clé (UUID v4 affiché une seule fois)
- Nom, description, date création, dernière utilisation
- Révoquer une clé

Table : `api_keys (id, name, key_hash, created_by, created_at, revoked_at, last_used_at)`

- [ ] **Step 2: Ajouter onglet "Audit Log"**

Tableau chronologique des actions admin :
- User, action, entité concernée, timestamp
- Filtres par user, par type d'action, par date

Table : `audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)`

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(admin): add API key management and audit log viewer"
```

---

### Task 6.6: Polish — Gaps basse priorité restants

**Depends on:** Task 6.5 (pour audit_logs dans Step 3)

**Files:** Multiples

- [ ] **Step 1: Access Groups — tarif + stations par groupe**

Dans AccessGroupsPage, ajouter :
- Dropdown "Tarif du groupe" par access group
- Multi-select "Stations autorisées" par access group

- [ ] **Step 2: Roles — cloner un rôle**

Bouton "Dupliquer" par rôle → crée une copie avec nom "Copie de {role}".

- [ ] **Step 3: Users — log d'activité basique**

Dans la page Users, bouton "Activité" par user → affiche les 20 dernières actions depuis `audit_logs`.

- [ ] **Step 4: Abonnements — bouton création**

Dans PaymentMethodsPage, onglet Subscriptions, bouton "Créer abonnement" → modal avec choix user + offre → crée l'abonnement et la Stripe Checkout Session.

- [ ] **Step 5: Coupons — suivi utilisation**

Dans la liste coupons, colonne "Utilisations" avec count. Clic → détail des utilisations (qui, quand, montant).

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: polish remaining low-priority gaps across multiple pages"
```

---

# Résumé des sprints

| Sprint | Jours | Gaps | Thème |
|--------|-------|------|-------|
| S1 | J1-J5 | 25 | Quick Wins UX (boutons, exports, filtres, batch) |
| S2 | J6-J10 | 15 | Workflow Incident (intervention, technicien, photos, support) |
| S3 | J11-J15 | 15 | Facturation & Tarifs (batch invoices, avoirs, visual builder) |
| S4 | J16-J20 | 12 | Roaming OCPI (credentials, handshake, push, photos) |
| S5 | J21-J25 | 12 | Client/Fleet/B2B (360°, driver↔token, self-service) |
| S6 | J26-J30 | 9+polish | Smart Charging + Analytics + Polish |
| **TOTAL** | **30 jours** | **88** | **Plateforme production-ready** |

## Checkpoint recettage par sprint

Après chaque sprint, mettre à jour le fichier Excel `EZDrive_Cahier_des_Charges_Recettage.xlsx` :
- Passer les gaps comblés de "Non" à "Oui" dans la colonne Statut
- Jean-Luc peut tester les scénarios correspondants au fur et à mesure
