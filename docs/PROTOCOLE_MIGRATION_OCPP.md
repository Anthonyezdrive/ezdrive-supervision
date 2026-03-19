# Protocole de Migration — GFX/Road vers OCPP Direct EZDrive

**Version** : 1.0
**Date** : 19 mars 2026
**Auteur** : Anthony Malartre — EZDrive by Suraya

---

## Objectif

Migrer progressivement les bornes de recharge des backends tiers (GreenFlux, Road/E-Flux) vers notre serveur OCPP souverain EZDrive (`wss://ezdrive-ocpp.fly.dev`), sans interruption de service ni doublons sur les cartes/applications.

## Sous-CPO concernés

| Sous-CPO | Backend actuel | Backend cible | Priorité |
|----------|---------------|---------------|----------|
| V-CiTY AG | Road | OCPP Direct EZDrive | P1 (1er avril) |
| EZDrive AG | GreenFlux | OCPP Direct EZDrive | P2 |
| TotalEnergies | GreenFlux | OCPP Direct EZDrive | P2 |
| EZDrive Réunion | Road | OCPP Direct EZDrive | P3 |

---

## Prérequis

### Accès API nécessaires

- [ ] API GreenFlux CRM avec permissions en écriture (désactivation bornes)
- [ ] API Road/E-Flux avec credentials valides (désactivation bornes)
- [ ] Accès physique ou distant à la borne (pour reconfigurer l'URL OCPP)

### Infrastructure vérifiée

- [x] Serveur OCPP EZDrive opérationnel (`wss://ezdrive-ocpp.fly.dev`)
- [x] Handlers OCPP fonctionnels (Boot, Heartbeat, Status, Authorize, Start/Stop, MeterValues)
- [x] Auto-link station ↔ chargepoint par `ocpp_identity`
- [x] Plateforme pro.ezdrive.fr avec page `/stations` (CRUD + monitoring)

---

## Protocole par borne (étape par étape)

### Phase 1 — Préparation (J-1)

1. **Identifier la borne** dans le backend actuel (GFX ou Road)
   - Relever l'identifiant unique (EVSE ID, serial number)
   - Relever la configuration actuelle (URL OCPP, protocole, identité)
   - Noter le tarif appliqué

2. **Créer la borne dans EZDrive**
   - pro.ezdrive.fr → Bornes → + Ajouter Nouveau
   - Renseigner : nom, adresse, ville, CP, GPS, puissance, CPO, territoire
   - **OCPP Identity** : utiliser le même identifiant que celui configuré dans la borne physique
   - Sauvegarder

3. **Configurer le tarif**
   - pro.ezdrive.fr → Tarifs → Créer un tarif OCPI (si pas déjà fait)
   - Assigner le tarif à la nouvelle station

4. **Préparer la communication**
   - Informer l'équipe exploitation de la date de bascule
   - Informer le client B2B si applicable (interruption potentielle de 5-10 min)

### Phase 2 — Bascule (Jour J)

**Fenêtre recommandée** : entre 2h et 5h du matin (faible utilisation)

5. **Vérifier qu'aucune charge n'est en cours**
   - Sur le backend actuel (GFX/Road) : vérifier qu'il n'y a pas de session active
   - Si session en cours : attendre qu'elle se termine

6. **Désactiver la borne dans le backend actuel**

   **Pour GreenFlux :**
   ```bash
   # Désactiver l'EVSE dans GreenFlux
   curl -X PUT https://platform-a.greenflux.com/api/1.0/cpo/{cpoId}/evseControllers/{evseControllerId} \
     -H "Authorization: Bearer {GFX_API_KEY}" \
     -H "Content-Type: application/json" \
     -d '{"status": "INACTIVE"}'
   ```

   **Pour Road/E-Flux :**
   ```bash
   # Désactiver l'EVSE dans Road
   # (endpoint exact à confirmer avec Road - credentials en attente)
   curl -X PUT https://api.road.io/v1/evse-controllers/{controllerId}/status \
     -H "Authorization: Bearer {ROAD_API_KEY}" \
     -d '{"status": "inactive"}'
   ```

   **Si pas d'accès API** : demander à GFX/Road de désactiver manuellement via leur dashboard.

7. **Reconfigurer la borne physique**

   Accéder aux paramètres réseau de la borne (via interface web locale, Bluetooth, ou télécommande) :

   | Paramètre | Ancienne valeur | Nouvelle valeur |
   |-----------|----------------|-----------------|
   | OCPP Server URL | `wss://charge.greenflux.com/...` ou `wss://...road.io/...` | `wss://ezdrive-ocpp.fly.dev/ocpp/{IDENTITY}` |
   | Protocole OCPP | 1.6-J (ne pas changer) | 1.6-J |
   | OCPP Identity | (garder le même) | (garder le même) |

   **Important** : l'identité OCPP de la borne doit correspondre exactement à l'`ocpp_identity` renseigné dans pro.ezdrive.fr à l'étape 2.

8. **Redémarrer la borne**
   - La borne va se connecter à `wss://ezdrive-ocpp.fly.dev/ocpp/{IDENTITY}`
   - `BootNotification` arrive → chargepoint créé/mis à jour dans `ocpp_chargepoints`
   - Auto-link avec la station créée à l'étape 2
   - La station passe en "En Ligne" sur pro.ezdrive.fr

### Phase 3 — Vérification (J+0)

9. **Vérifier la connexion**
   - pro.ezdrive.fr → Bornes → la station doit être "En Ligne" (pastille verte)
   - Vérifier dans le détail station : onglet "Diagnostic" → chargepoint connecté

10. **Tester une charge**
    - Badger une carte RFID ou lancer via l'app
    - Vérifier que la session apparaît dans le monitoring temps réel
    - Vérifier que le `StopTransaction` génère bien un CDR

11. **Vérifier l'absence de doublons**
    - Sur l'app GreenFlux/Road : la borne ne doit plus apparaître (désactivée)
    - Sur Gireve (si OCPI actif) : vérifier qu'il n'y a qu'une seule entrée par emplacement
    - Sur pro.ezdrive.fr/map : la borne apparaît une seule fois

### Phase 4 — Nettoyage (J+7)

12. **Supprimer la référence dans le backend actuel** (après 7 jours de fonctionnement OK)

    **Pour GreenFlux :**
    ```bash
    # Supprimer l'EVSE controller
    curl -X DELETE https://platform-a.greenflux.com/api/1.0/cpo/{cpoId}/evseControllers/{evseControllerId} \
      -H "Authorization: Bearer {GFX_API_KEY}"
    ```

    **Pour Road :**
    ```bash
    # Supprimer l'EVSE
    curl -X DELETE https://api.road.io/v1/evse-controllers/{controllerId} \
      -H "Authorization: Bearer {ROAD_API_KEY}"
    ```

13. **Mettre à jour le suivi de migration**
    - Cocher la borne dans le tableau de suivi
    - Mettre à jour le fichier `source` de la station dans pro.ezdrive.fr : "manual" → "ocpp_direct"

---

## Rollback (en cas de problème)

Si la borne ne se connecte pas à notre serveur ou si des problèmes sont détectés :

1. **Reconfigurer la borne** avec l'ancienne URL OCPP (GFX ou Road)
2. **Réactiver la borne** dans le backend actuel
3. **Marquer la station** comme "Hors Ligne" dans pro.ezdrive.fr
4. **Analyser les logs** :
   - Fly.io : `fly logs -a ezdrive-ocpp`
   - Supabase : Dashboard → Edge Functions → api → Logs

---

## Checklist par borne

```
Borne: ___________________  CPO: ___________________  Date: ___________

PRÉPARATION
[ ] Borne identifiée dans backend actuel (ID: _______________)
[ ] Station créée dans pro.ezdrive.fr (OCPP Identity: _______________)
[ ] Tarif assigné
[ ] Exploitation informée

BASCULE
[ ] Aucune session en cours vérifiée
[ ] Borne désactivée dans backend actuel
[ ] URL OCPP reconfigurée sur la borne physique
[ ] Borne redémarrée

VÉRIFICATION
[ ] Station "En Ligne" sur pro.ezdrive.fr
[ ] Chargepoint visible dans onglet Diagnostic
[ ] Charge test réussie
[ ] Pas de doublon sur les cartes

NETTOYAGE (J+7)
[ ] Référence supprimée dans backend actuel
[ ] Source mise à jour dans pro.ezdrive.fr
```

---

## Estimation durée par borne

| Étape | Durée | Commentaire |
|-------|-------|-------------|
| Préparation | 10 min | Création station + tarif |
| Bascule | 5-15 min | Dépend de l'accès à la borne (physique vs distant) |
| Vérification | 10 min | Test charge + vérification doublons |
| **Total par borne** | **25-35 min** | |

Pour 439 bornes (EZDrive AG) : ~200 heures de travail → à planifier par lots de 10-20 bornes par nuit.

---

## Points d'attention

1. **Bornes avec SIM** : vérifier que l'APN est compatible avec notre serveur (pas de VPN GFX/Road bloquant)
2. **Bornes avec firmware ancien** : certains firmwares ne supportent pas le changement d'URL OCPP à distance → intervention physique requise
3. **OCPI Gireve** : ne pas migrer une borne tant que l'audit Gireve n'est pas passé pour éviter les doublons sur le réseau interopérable
4. **Horaires de bascule** : toujours entre 2h-5h du matin pour minimiser l'impact
5. **Communication client** : prévenir les clients B2B 48h avant la migration de leurs bornes
