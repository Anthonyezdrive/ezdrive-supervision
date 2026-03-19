# Architecture EZDrive 3.0 — Diagramme interactif

## Vue d'ensemble

```mermaid
graph TB
    subgraph "Frontend"
        WEB["🌐 pro.ezdrive.fr<br/>React 18 + Vite + Tailwind<br/>Vercel"]
        IOS["📱 App iOS<br/>React Native Expo"]
        AND["📱 App Android<br/>React Native Expo"]
    end

    subgraph "Backend EZD 3.0"
        SB["🗄️ Supabase<br/>PostgreSQL 15 + Auth + RLS<br/>Edge Functions (Deno)"]
        OCPP["⚡ Serveur OCPP 1.6-J<br/>Node.js + ocpp-rpc<br/>Fly.io (Paris CDG)"]
    end

    subgraph "Paiement"
        STRIPE["💳 Stripe<br/>Connect + Billing<br/>Webhooks"]
    end

    subgraph "Backends Tiers (transitoire)"
        GFX["🟢 GreenFlux API<br/>EZDrive AG, TotalEnergies"]
        ROAD["🟠 Road / E-Flux API<br/>V-CiTY AG, EZDrive Réunion"]
    end

    subgraph "Interopérabilité"
        GIREVE["🌍 Gireve IOP<br/>OCPI 2.2.1"]
    end

    subgraph "Bornes de recharge"
        BORNE1["🔌 Bornes OCPP Direct"]
        BORNE2["🔌 Bornes via GFX"]
        BORNE3["🔌 Bornes via Road"]
    end

    WEB --> SB
    IOS --> SB
    AND --> SB

    SB --> OCPP
    SB --> STRIPE
    SB --> GFX
    SB --> ROAD
    SB --> GIREVE

    OCPP --> BORNE1
    GFX --> BORNE2
    ROAD --> BORNE3

    BORNE2 -.->|Migration| BORNE1
    BORNE3 -.->|Migration| BORNE1
```

## Flux de charge OCPP Direct

```mermaid
sequenceDiagram
    participant B as 🔌 Borne
    participant O as ⚡ Serveur OCPP
    participant DB as 🗄️ Supabase
    participant S as 💳 Stripe
    participant G as 🌍 Gireve

    B->>O: BootNotification
    O->>DB: Upsert chargepoint + auto-link station
    O-->>B: Accepted (interval: 300s)

    B->>O: StatusNotification (Available)
    O->>DB: Update station status

    Note over B,G: Conducteur badge sa carte RFID

    B->>O: Authorize (idTag)
    O->>DB: Check exception_rules + ocpi_tokens
    O-->>B: Accepted

    B->>O: StartTransaction
    O->>DB: Insert ocpp_transaction (Active)
    O->>DB: Create OCPI session
    O->>G: Push session via ocpi_push_queue

    loop Toutes les 30s
        B->>O: MeterValues (energy, power, SoC)
        O->>DB: Insert meter_values + update transaction
    end

    B->>O: StopTransaction
    O->>DB: Complete transaction + Create CDR
    O->>G: Push CDR via ocpi_push_queue
    O->>S: Create PaymentIntent (montant réel)
```

## Flux Paiement SPOT (CB pré-autorisation)

```mermaid
sequenceDiagram
    participant U as 📱 App Mobile
    participant API as 🗄️ Edge Function
    participant S as 💳 Stripe
    participant O as ⚡ Serveur OCPP
    participant B as 🔌 Borne

    U->>API: POST /spot-payment/authorize
    API->>S: PaymentIntent 20€ (capture_method: manual)
    S-->>API: client_secret
    API-->>U: Afficher PaymentSheet

    U->>S: Confirmer carte (3D Secure)
    S-->>API: PaymentIntent authorized

    API->>O: RemoteStartTransaction
    O->>B: RemoteStartTransaction
    B-->>O: Accepted
    B->>O: StartTransaction

    loop Monitoring consommation
        B->>O: MeterValues
        O->>API: Check si coût > 18€
        Note over API: Si coût > 18€
        API->>S: Nouveau PaymentIntent 20€
        alt Fonds insuffisants
            S-->>API: Declined
            API->>O: RemoteStopTransaction
            O->>B: RemoteStopTransaction
        else Fonds OK
            S-->>API: Authorized
            API->>S: Capture palier précédent (montant réel)
        end
    end

    B->>O: StopTransaction
    API->>S: Capture dernier palier (montant réel)
    API-->>U: Session terminée + reçu
```

## Architecture sous-CPO

```mermaid
graph LR
    subgraph "EZDrive Master"
        MASTER["🏢 EZDrive<br/>acct_1HCAONLxFiM9ZN7M"]
    end

    subgraph "API GreenFlux"
        EZDAG["🟢 EZDrive AG<br/>439 bornes"]
        TOTAL["🟢 TotalEnergies<br/>Marque blanche"]
    end

    subgraph "API Road"
        VCITY["🟠 V-CiTY AG<br/>acct_1TCeTjL4IOusGgnX"]
        EZDREU["🟠 EZDrive Réunion<br/>100% Road"]
    end

    subgraph "OCPP Direct (cible)"
        DIRECT["🔵 Bornes migrées<br/>Serveur OCPP souverain"]
    end

    MASTER --> EZDAG
    MASTER --> TOTAL
    MASTER --> VCITY
    MASTER --> EZDREU

    EZDAG -.->|Migration| DIRECT
    TOTAL -.->|Migration| DIRECT
    VCITY -.->|Migration| DIRECT
    EZDREU -.->|Migration| DIRECT
```

## Tables principales

```mermaid
erDiagram
    stations ||--o{ ocpp_chargepoints : "ocpp_identity"
    stations ||--o{ station_tariffs : "station_id"
    stations }|--|| cpo_operators : "cpo_id"
    stations }|--|| territories : "territory_id"

    ocpp_chargepoints ||--o{ ocpp_transactions : "chargepoint_id"
    ocpp_transactions ||--o{ ocpp_meter_values : "transaction_id"

    station_tariffs }|--|| ocpi_tariffs : "tariff_id"

    gfx_consumers ||--o{ gfx_tokens : "driver_external_id"
    gfx_consumers ||--o{ ocpi_cdrs : "driver_external_id"

    consumer_profiles ||--o{ user_subscriptions : "user_id"
    user_subscriptions }|--|| subscription_offers : "offer_id"

    consumer_profiles ||--o{ rfid_cards : "user_id"
    rfid_cards ||--o{ ocpi_tokens : "token_uid"

    b2b_clients ||--o{ b2b_client_access : "b2b_client_id"

    roaming_agreements }|--o| cpo_networks : "cpo_network_id"
    roaming_agreements }|--o| emsp_networks : "emsp_network_id"
```

## Infrastructure de déploiement

| Composant | Service | Région | URL |
|-----------|---------|--------|-----|
| Frontend | Vercel | Auto (Edge) | pro.ezdrive.fr |
| Base de données | Supabase PostgreSQL 15 | eu-west-1 | phnqtqvwofzrhpuydoom.supabase.co |
| Edge Functions | Supabase Deno | eu-west-1 | .../functions/v1/* |
| Serveur OCPP | Fly.io | cdg (Paris) | wss://ezdrive-ocpp.fly.dev |
| Paiement | Stripe | EU | dashboard.stripe.com |
| DNS | Vercel DNS | Global | ezdrive.fr |

## Ports et protocoles

| Service | Protocole | Port | Auth |
|---------|-----------|------|------|
| Frontend | HTTPS | 443 | Supabase JWT |
| API REST | HTTPS | 443 | Bearer JWT |
| OCPP WebSocket | WSS | 443 | Identity in URL |
| Supabase Realtime | WSS | 443 | API Key |
| Stripe Webhook | HTTPS | 443 | Signature whsec_ |
