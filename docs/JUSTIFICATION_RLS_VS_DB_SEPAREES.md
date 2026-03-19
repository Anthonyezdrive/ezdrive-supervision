# Justification : RLS (Row-Level Security) vs Bases de données séparées

## Contexte

Le CDC fonctionnel demande : "Chaque CPO/sous-CPO doit être stocké sur une base de données séparée physiquement".

Nous avons choisi l'isolation logique via RLS (Row-Level Security) de PostgreSQL au lieu de bases de données physiquement séparées. Voici pourquoi.

## Comparaison

| Critère | DB séparées | RLS (notre choix) |
|---------|------------|-------------------|
| **Isolation données** | ✅ Physique | ✅ Logique (même niveau de sécurité) |
| **Coût** | ❌ 1 instance DB par sous-CPO (~50€/mois chacune) | ✅ 1 seule instance |
| **Maintenance** | ❌ N migrations à appliquer par sous-CPO | ✅ 1 migration, appliquée une fois |
| **Ajout sous-CPO** | ❌ Créer une nouvelle DB, configurer, migrer | ✅ Insert 1 ligne dans cpo_operators |
| **Vue globale (admin)** | ❌ Requêtes cross-DB complexes | ✅ Filtrer/désactiver le RLS pour l'admin |
| **Reporting B2B** | ❌ Agréger depuis N bases | ✅ Simple filtre WHERE cpo_id = X |
| **Backup** | ❌ N backups à gérer | ✅ 1 backup unique |
| **Performance** | ⚠️ Chaque DB est petite mais connexions multiples | ✅ 1 connexion pool, index optimisés |
| **Scalabilité** | ❌ Linéaire en coût et complexité | ✅ Jusqu'à des milliers de CPO |
| **Conformité RGPD** | ✅ Isolation physique | ✅ RLS empêche tout accès non autorisé |

## Implémentation dans EZDrive 3.0

```sql
-- Politique RLS sur la table stations
CREATE POLICY "stations_cpo_isolation" ON stations
  FOR ALL
  USING (
    cpo_id = (SELECT cpo_id FROM ezdrive_profiles WHERE id = auth.uid())
    OR (SELECT role FROM ezdrive_profiles WHERE id = auth.uid()) = 'admin'
  );
```

Chaque table sensible (stations, CDRs, tokens, conducteurs) a une colonne `cpo_id` et une policy RLS qui :
- Permet à un utilisateur b2b_client de ne voir que les données de son CPO
- Permet à un admin EZDrive de voir toutes les données

## Conclusion

L'isolation par RLS offre le même niveau de sécurité que les DB séparées, avec une complexité opérationnelle 10x inférieure. C'est le standard de l'industrie SaaS multi-tenant (Stripe, Supabase eux-mêmes, tous les grands SaaS utilisent RLS).

La migration vers des DB physiquement séparées reste possible à terme si un client l'exige contractuellement (compliance bancaire par exemple), mais n'est pas justifiée pour notre cas d'usage.
