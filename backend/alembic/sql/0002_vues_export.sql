-- =====================================================================
-- CADERAC — Vues de restitution
--
-- CONTRAT D'INTERFACE (principe 5 du ch. 2) : le livrable destiné au
-- gestionnaire externe n'est pas la base mais cet ensemble de vues.
-- Le schéma interne peut évoluer ; la structure de ces vues doit rester
-- figée une fois validée colonne par colonne avec le gestionnaire
-- (ch. 14, « Structure des exports »).
--
-- Toute évolution de ces vues passe par une nouvelle migration et une
-- validation explicite du commanditaire.
--
-- Les vues v_export_* n'exposent QUE des données au statut « validee ».
-- =====================================================================

-- ---------------------------------------------------------------------
-- CP01 — Trous forés
-- ---------------------------------------------------------------------
CREATE VIEW v_export_foration AS
SELECT  t.id                                      AS id_technique,
        t.reference                               AS id_trou,
        s.code                                    AS site,
        ti.numero_t                               AS numero_tir,
        e.numero_parc                             AS foreuse,
        t.operateur_matricule                     AS operateur,
        p.nom_prenoms                             AS operateur_nom,
        t.poste,
        t.date_foration,
        t.heure_debut,
        t.heure_fin,
        EXTRACT(EPOCH FROM t.duree_foration) / 3600.0 AS duree_heures,
        t.utilisation_foreuse,
        t.metres_lineaires,
        t.diametre_mm,
        t.maille_longueur_m,
        t.maille_largeur_m,
        t.gps_latitude,
        t.gps_longitude,
        t.numero_taillant,
        t.numero_tige,
        t.source_collecte,
        t.saisi_le,
        t.recu_le,
        t.valide_le,
        t.statut
FROM trou_forage t
JOIN site  s  ON s.id = t.site_id
JOIN engin e  ON e.id = t.foreuse_id
LEFT JOIN tir ti ON ti.id = t.tir_id
LEFT JOIN personnel p ON p.matricule = t.operateur_matricule
WHERE t.statut = 'validee';

-- ---------------------------------------------------------------------
-- Événements engins — avec cause d'arrêt codifiée et centre de coût réel
-- ---------------------------------------------------------------------
CREATE VIEW v_export_activite_engin AS
SELECT  ev.id,
        e.numero_parc         AS engin,
        e.famille,
        e.matricule           AS immatriculation,
        s.code                AS site,
        ev.centre_cout_reel,
        cc.libelle            AS centre_cout_libelle,
        e.centre_cout_reference,
        ev.type_evenement,
        ev.horodatage,
        ev.poste,
        ev.compteur,
        ev.cause_code,
        ca.libelle            AS cause_libelle,
        ca.categorie          AS cause_categorie,
        ev.cause              AS cause_libre,
        ev.carburant_litres,
        ev.operateur_matricule,
        pe.nom_prenoms        AS operateur_nom,
        ev.source_collecte,
        ev.saisi_le,
        ev.recu_le,
        ev.valide_le,
        ev.statut
FROM evenement_engin ev
JOIN engin e ON e.id = ev.engin_id
JOIN site  s ON s.id = ev.site_id
LEFT JOIN cause_arret    ca ON ca.code      = ev.cause_code
LEFT JOIN centre_de_cout cc ON cc.code      = ev.centre_cout_reel
LEFT JOIN personnel      pe ON pe.matricule = ev.operateur_matricule
WHERE ev.statut = 'validee';

-- ---------------------------------------------------------------------
-- Rotations de dumpers — distinction stricte pesé / estimé
--
-- Les deux tonnages restent dans deux colonnes distinctes ; aucune
-- colonne « tonnage total » n'est exposée, précisément pour empêcher
-- une addition implicite en aval (principe 3 du ch. 2).
-- ---------------------------------------------------------------------
CREATE VIEW v_export_rotations AS
SELECT  r.id,
        e.numero_parc     AS dumper,
        e.capacite_nominale,
        s.code            AS site,
        r.horodatage,
        r.horodatage::date AS jour,
        r.poste,
        r.point_deversement,
        r.centre_cout_reel,
        r.operateur_matricule,
        r.poids_reel_t,
        r.quantite_estimee_t,
        r.nature_quantite,
        LAG(r.horodatage) OVER (PARTITION BY r.dumper_id, r.horodatage::date
                                ORDER BY r.horodatage) AS passage_precedent,
        EXTRACT(EPOCH FROM (
            r.horodatage - LAG(r.horodatage) OVER (PARTITION BY r.dumper_id, r.horodatage::date
                                                   ORDER BY r.horodatage)
        )) / 60.0 AS minutes_depuis_passage_precedent,
        ROW_NUMBER() OVER (PARTITION BY r.dumper_id, r.horodatage::date
                           ORDER BY r.horodatage) AS numero_rotation_du_jour,
        r.source_collecte,
        r.saisi_le,
        r.recu_le,
        r.valide_le,
        r.statut
FROM rotation_dumper r
JOIN engin e ON e.id = r.dumper_id
JOIN site  s ON s.id = r.site_id
WHERE r.statut = 'validee';

-- ---------------------------------------------------------------------
-- Pesées au pont-bascule
-- ---------------------------------------------------------------------
CREATE VIEW v_export_pesees AS
SELECT  p.id,
        s.code            AS site,
        p.horodatage,
        p.horodatage::date AS jour,
        p.client,
        p.immatriculation,
        pr.code           AS produit_code,
        pr.libelle        AS produit,
        pr.granulometrie,
        p.poids_t,
        p.numero_bon,
        p.source_collecte,
        p.saisi_le,
        p.valide_le,
        p.statut
FROM pesee_pont_bascule p
JOIN site s ON s.id = p.site_id
LEFT JOIN produit pr ON pr.id = p.produit_id
WHERE p.statut = 'validee';

-- ---------------------------------------------------------------------
-- Charges administratives et de fonctionnement par engin
-- ---------------------------------------------------------------------
CREATE VIEW v_export_charges_engin AS
SELECT  c.id,
        e.numero_parc     AS engin,
        e.famille,
        s.code            AS site,
        e.centre_cout_reference,
        c.nature,
        c.categorie,
        c.date_charge,
        c.montant,
        c.devise,
        c.periode_debut,
        c.periode_fin,
        -- Nombre de mois couverts : permet au gestionnaire d'étaler une
        -- charge annuelle sans avoir à recalculer la période.
        CASE
            WHEN c.periode_debut IS NULL OR c.periode_fin IS NULL THEN NULL
            ELSE (EXTRACT(YEAR  FROM age(c.periode_fin, c.periode_debut)) * 12
                + EXTRACT(MONTH FROM age(c.periode_fin, c.periode_debut)) + 1)
        END               AS nb_mois_couverts,
        c.reference_document,
        c.source_collecte,
        c.saisi_le,
        c.valide_le,
        c.statut
FROM charge_engin c
JOIN engin e ON e.id = c.engin_id
JOIN site  s ON s.id = e.site_id
WHERE c.statut = 'validee';

-- ---------------------------------------------------------------------
-- Complétude de la collecte — indicateur de pilotage du déploiement
--
-- « Un système parfaitement conçu mais alimenté à 40 % produit des
--   données inutilisables » (ch. 13). Cette vue répond à quatre
--   questions par site et par jour : qui déclare, qui ne déclare pas,
--   combien de trous restent non clôturés, et combien de données
--   stagnent au statut brut.
--
-- La fenêtre est de 30 jours glissants ; au-delà, interroger les tables
-- de collecte directement.
-- ---------------------------------------------------------------------
CREATE VIEW v_completude_collecte AS
SELECT  s.code                                   AS site,
        d.jour::date                             AS jour,

        COALESCE(f.trous_declares, 0)            AS trous_declares,
        COALESCE(f.trous_valides, 0)             AS trous_valides,
        COALESCE(f.trous_non_clotures, 0)        AS trous_non_clotures,
        COALESCE(f.trous_bruts, 0)               AS trous_bruts,

        COALESCE(r.rotations_declarees, 0)       AS rotations_declarees,
        COALESCE(r.rotations_validees, 0)        AS rotations_validees,
        COALESCE(r.rotations_brutes, 0)          AS rotations_brutes,
        COALESCE(r.dumpers_actifs, 0)            AS dumpers_actifs,

        COALESCE(ev.evenements_declares, 0)      AS evenements_engins_declares,
        COALESCE(ev.evenements_bruts, 0)         AS evenements_engins_bruts,
        COALESCE(ev.engins_actifs, 0)            AS engins_ayant_declare,

        COALESCE(eq.evenements_declares, 0)      AS evenements_equipements_declares,
        COALESCE(pb.pesees_declarees, 0)         AS pesees_declarees,

        -- Qui déclare : agents distincts ayant produit au moins une donnée.
        COALESCE(f.auteurs, 0) + COALESCE(r.auteurs, 0) + COALESCE(ev.auteurs, 0)
                                                 AS contributions_agents,

        -- Qui ne déclare pas : engins actifs du site sans aucun événement
        -- ni rotation ce jour-là. C'est ce chiffre qui doit déclencher
        -- l'appel au référent du site.
        GREATEST(
            COALESCE(pe.engins_actifs_site, 0)
            - COALESCE(ev.engins_actifs, 0) - COALESCE(r.dumpers_actifs, 0),
            0
        )                                        AS engins_sans_declaration
FROM site s
CROSS JOIN generate_series(CURRENT_DATE - INTERVAL '30 days', CURRENT_DATE, INTERVAL '1 day') AS d(jour)

LEFT JOIN LATERAL (
    SELECT COUNT(*)                                                   AS trous_declares,
           COUNT(*) FILTER (WHERE t.statut = 'validee')                AS trous_valides,
           COUNT(*) FILTER (WHERE t.heure_fin IS NULL)                 AS trous_non_clotures,
           COUNT(*) FILTER (WHERE t.statut = 'brute')                  AS trous_bruts,
           COUNT(DISTINCT t.auteur_id)                                 AS auteurs
    FROM trou_forage t
    WHERE t.site_id = s.id AND t.date_foration = d.jour::date
) f ON TRUE

LEFT JOIN LATERAL (
    SELECT COUNT(*)                                                   AS rotations_declarees,
           COUNT(*) FILTER (WHERE ro.statut = 'validee')               AS rotations_validees,
           COUNT(*) FILTER (WHERE ro.statut = 'brute')                 AS rotations_brutes,
           COUNT(DISTINCT ro.dumper_id)                                AS dumpers_actifs,
           COUNT(DISTINCT ro.auteur_id)                                AS auteurs
    FROM rotation_dumper ro
    WHERE ro.site_id = s.id AND ro.horodatage::date = d.jour::date
) r ON TRUE

LEFT JOIN LATERAL (
    SELECT COUNT(*)                                                   AS evenements_declares,
           COUNT(*) FILTER (WHERE e2.statut = 'brute')                 AS evenements_bruts,
           COUNT(DISTINCT e2.engin_id)                                 AS engins_actifs,
           COUNT(DISTINCT e2.auteur_id)                                AS auteurs
    FROM evenement_engin e2
    WHERE e2.site_id = s.id AND e2.horodatage::date = d.jour::date
) ev ON TRUE

LEFT JOIN LATERAL (
    SELECT COUNT(*) AS evenements_declares
    FROM evenement_equipement q
    WHERE q.site_id = s.id AND q.heure_debut::date = d.jour::date
) eq ON TRUE

LEFT JOIN LATERAL (
    SELECT COUNT(*) AS pesees_declarees
    FROM pesee_pont_bascule pp
    WHERE pp.site_id = s.id AND pp.horodatage::date = d.jour::date
) pb ON TRUE

LEFT JOIN LATERAL (
    SELECT COUNT(*) AS engins_actifs_site
    FROM engin g
    WHERE g.site_id = s.id AND g.actif
) pe ON TRUE

WHERE s.actif;

-- =====================================================================
-- VUES DE PILOTAGE OPÉRATIONNEL
-- Hors contrat d'interface : destinées aux écrans de l'application, elles
-- peuvent évoluer librement, et exposent volontairement les données non
-- encore validées.
-- =====================================================================

-- Écran « trous non clôturés par foreuse et par jour » (ch. 6) : l'anomalie
-- la plus probable du module foration est l'oubli du second scan.
CREATE VIEW v_pilotage_trous_non_clotures AS
SELECT  t.id,
        t.reference,
        s.code                AS site,
        s.id                  AS site_id,
        e.numero_parc         AS foreuse,
        e.id                  AS foreuse_id,
        t.operateur_matricule,
        t.date_foration,
        t.heure_debut,
        now() - t.heure_debut AS anciennete,
        EXTRACT(EPOCH FROM (now() - t.heure_debut)) / 3600.0 AS anciennete_heures,
        t.auteur_id,
        t.statut
FROM trou_forage t
JOIN site  s ON s.id = t.site_id
JOIN engin e ON e.id = t.foreuse_id
WHERE t.heure_fin IS NULL
  AND t.statut <> 'rejetee';

-- File d'attente du contrôle : ce qui reste à contrôler ou à valider,
-- toutes tables de collecte confondues.
CREATE VIEW v_pilotage_file_validation AS
SELECT 'trou_forage'        AS table_cible, t.id, t.site_id, t.statut,
       t.saisi_le, t.recu_le, t.auteur_id
FROM trou_forage t WHERE t.statut IN ('brute', 'controlee')
UNION ALL
SELECT 'evenement_engin', e.id, e.site_id, e.statut, e.saisi_le, e.recu_le, e.auteur_id
FROM evenement_engin e WHERE e.statut IN ('brute', 'controlee')
UNION ALL
SELECT 'rotation_dumper', r.id, r.site_id, r.statut, r.saisi_le, r.recu_le, r.auteur_id
FROM rotation_dumper r WHERE r.statut IN ('brute', 'controlee')
UNION ALL
SELECT 'evenement_equipement', q.id, q.site_id, q.statut, q.heure_debut, q.recu_le, q.auteur_id
FROM evenement_equipement q WHERE q.statut IN ('brute', 'controlee')
UNION ALL
SELECT 'pesee_pont_bascule', p.id, p.site_id, p.statut, p.saisi_le, p.recu_le, p.auteur_id
FROM pesee_pont_bascule p WHERE p.statut IN ('brute', 'controlee')
UNION ALL
SELECT 'prestation_minage', m.id, m.site_id, m.statut, m.saisi_le, m.recu_le, m.auteur_id
FROM prestation_minage m WHERE m.statut IN ('brute', 'controlee');

-- =====================================================================
-- FIN DES VUES
-- =====================================================================
