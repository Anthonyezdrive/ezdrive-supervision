# Roadmap Migration OCPP 1.6-J → 2.0.1

## Situation actuelle

Notre serveur OCPP tourne en **1.6-J** (JSON over WebSocket). C'est le protocole le plus déployé au monde (>90% des bornes en production).

## Pourquoi migrer vers 2.0.1 ?

| Fonctionnalité | OCPP 1.6-J | OCPP 2.0.1 |
|---------------|-----------|------------|
| Plug & Charge (ISO 15118) | ❌ | ✅ CertificateSigned, InstallCertificate |
| Device Management | Basique | ✅ DeviceModel, Variables, Monitoring |
| Transaction Events | Start/Stop | ✅ TransactionEvent (granulaire) |
| Smart Charging | SetChargingProfile | ✅ + NotifyChargingLimit, ClearedChargingLimit |
| Sécurité | Basic Auth | ✅ Profils de sécurité 1-3 (TLS mutual auth) |
| Firmware Update | Simple | ✅ Signée (anti-tampering) |
| Réservation | ReserveNow | ✅ + ReservationStatusUpdate |
| Display Message | ❌ | ✅ SetDisplayMessage |
| Cost | ❌ | ✅ CostUpdated (coût en temps réel sur l'écran) |
| Tariff | Via OCPI uniquement | ✅ SetDefaultTariff (tarif natif OCPP) |
| ISO 15118 | ❌ | ✅ Get15118EVCertificate, GetCertificateStatus |

## Plan de migration

### Phase 1 — Préparation (T2 2026)
- [ ] Étudier la spec OCPP 2.0.1 (600+ pages)
- [ ] Identifier les bornes du parc compatibles 2.0.1 (firmware check)
- [ ] Évaluer les librairies Node.js OCPP 2.0.1 disponibles
- [ ] Concevoir l'architecture dual-stack (1.6 + 2.0.1 en parallèle)

### Phase 2 — Implémentation (T3 2026)
- [ ] Nouveau handler WebSocket avec routage par protocole
- [ ] Implémenter les messages core : BootNotification, Heartbeat, StatusNotification, TransactionEvent, MeterValues
- [ ] Adapter la DB pour le nouveau modèle de données (DeviceModel, Variables)
- [ ] Tester avec un simulateur OCPP 2.0.1

### Phase 3 — Plug & Charge (T4 2026)
- [ ] Contrat avec Certificate Authority (Hubject ou CharIN)
- [ ] PKI infrastructure (CA root, Sub-CA, certificats borne)
- [ ] Implémenter ISO 15118 message flow
- [ ] Tester avec véhicule compatible

### Phase 4 — Migration progressive (2027)
- [ ] Basculer les bornes compatibles une par une
- [ ] Maintenir le dual-stack 1.6 + 2.0.1 pendant la transition
- [ ] Désactiver 1.6 quand toutes les bornes sont migrées

## OCPP 2.1.1 et 2.3.0

### OCPP 2.1.1
- Extension de 2.0.1 avec des corrections
- Rétrocompatible avec 2.0.1
- Adopté par certains fabricants mais pas encore mainstream

### OCPP 2.3.0
- Nouvelle version en cours de spécification par l'OCA
- N'apporte pas de fonctionnalités supplémentaires majeures par rapport à 2.2.1 superposé à 2.1.1
- Viabilité à évaluer quand la spec sera finalisée

**Recommandation** : cibler OCPP 2.0.1 qui est la version stable et la plus déployée. Monitorer 2.1.1 pour les corrections de bugs. Attendre que 2.3.0 soit finalisée avant de se prononcer.

## Estimation d'effort

| Phase | Durée | Ressources |
|-------|-------|-----------|
| Préparation | 2 semaines | 1 dev |
| Implémentation core | 4 semaines | 1 dev |
| Plug & Charge | 3 semaines | 1 dev + 1 infra |
| Migration | Continue | Ops |
| **Total** | **~10 semaines** | |
