-- =====================================================================
-- CADERAC — Système de collecte terrain
-- Schéma PostgreSQL — PÉRIMÈTRE V1 : COLLECTE UNIQUEMENT
-- Le calcul des coûts est assuré par le gestionnaire externe.
-- Version 0.1 — à valider avec le commanditaire avant développement.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- =====================================================================
-- 0. TYPES ÉNUMÉRÉS
-- =====================================================================

CREATE TYPE mode_collecte AS ENUM (
    'qr_code', 'saisie_directe', 'ocr', 'import_fichier', 'voix', 'interface_systeme'
);

CREATE TYPE statut_validation AS ENUM ('brute', 'controlee', 'validee', 'rejetee');

CREATE TYPE famille_engin AS ENUM (
    'dumper', 'foreuse', 'chargeuse', 'pelle', 'bull', 'brh', 'camion', 'autre'
);

CREATE TYPE type_equipement AS ENUM (
    'broyeur', 'concasseur', 'crible', 'convoyeur', 'moteur', 'trommel', 'autre'
);

CREATE TYPE niveau_concassage AS ENUM (
    'primaire', 'secondaire', 'tertiaire', 'quaternaire', 'trommel'
);

CREATE TYPE type_evenement_engin AS ENUM (
    'debut', 'arret', 'panne', 'maintenance', 'reprise', 'fin', 'ravitaillement'
);

CREATE TYPE type_evenement_equipement AS ENUM (
    'marche_a_charge', 'marche_a_vide', 'arret', 'panne', 'maintenance', 'reprise', 'fin'
);

CREATE TYPE nature_quantite AS ENUM ('pesee_reelle', 'estimation');

-- =====================================================================
-- 1. UTILISATEURS ET SITES
-- =====================================================================

CREATE TABLE site (
    id              SMALLSERIAL PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,          -- KOS, BKE, ABO, LDB
    libelle         TEXT NOT NULL,
    actif           BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE utilisateur (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    login           TEXT NOT NULL UNIQUE,
    nom_complet     TEXT NOT NULL,
    role            TEXT NOT NULL,                 -- agent_terrain, superviseur, controleur, admin
    site_id         SMALLINT REFERENCES site(id),
    actif           BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE centre_de_cout (
    code            TEXT PRIMARY KEY,              -- CP01, CP02, CP03, CP09
    libelle         TEXT NOT NULL
);

-- =====================================================================
-- 2. RÉFÉRENTIELS
-- =====================================================================

CREATE TABLE engin (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_parc             TEXT NOT NULL UNIQUE,  -- DU01, FE02...
    matricule               TEXT UNIQUE,
    famille                 famille_engin NOT NULL,
    type_engin              TEXT,
    marque                  TEXT,
    modele                  TEXT,
    site_id                 SMALLINT NOT NULL REFERENCES site(id),
    centre_cout_reference   TEXT REFERENCES centre_de_cout(code),
    capacite_nominale       NUMERIC(10,2),         -- alimentée par la campagne de pesage
    unite_capacite          TEXT,                  -- t, m3
    puissance_kw            NUMERIC(10,2),
    date_acquisition        DATE,
    date_mise_en_service    DATE,
    cout_acquisition        NUMERIC(14,2),
    unite_compteur          TEXT DEFAULT 'heures', -- heures | km
    qr_token                TEXT UNIQUE,           -- valeur encodée dans le QR physique
    actif                   BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_engin_site_famille ON engin(site_id, famille) WHERE actif;

CREATE TABLE equipement_concassage (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    designation     TEXT NOT NULL,
    type            type_equipement NOT NULL,
    site_id         SMALLINT NOT NULL REFERENCES site(id),
    ligne           TEXT,                          -- ligne 1, ligne 2
    niveau          niveau_concassage,
    poste           TEXT,
    puissance_kw    NUMERIC(10,2),
    qr_token        TEXT UNIQUE,
    actif           BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_equipement_site_niveau ON equipement_concassage(site_id, niveau) WHERE actif;

CREATE TABLE personnel (
    matricule           TEXT PRIMARY KEY,
    nom_prenoms         TEXT NOT NULL,
    fonction            TEXT,
    site_id             SMALLINT REFERENCES site(id),
    centre_cout         TEXT REFERENCES centre_de_cout(code),
    date_debut_affect   DATE,
    date_fin_affect     DATE
    -- Coût employeur volontairement absent : donnée RH conservée côté gestionnaire.
);

CREATE TABLE produit (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT NOT NULL UNIQUE,
    libelle         TEXT NOT NULL,
    site_id         SMALLINT REFERENCES site(id),
    granulometrie   TEXT
);

-- Parcours d'un produit dans les niveaux de concassage (liste ordonnée)
CREATE TABLE produit_parcours (
    produit_id      UUID NOT NULL REFERENCES produit(id) ON DELETE CASCADE,
    ordre           SMALLINT NOT NULL,
    niveau          niveau_concassage NOT NULL,
    PRIMARY KEY (produit_id, ordre)
);

-- =====================================================================
-- 3. TRAÇABILITÉ (chapitre 10) — colonnes communes à toute donnée collectée
--    Reproduire ce bloc sur chaque table de collecte.
-- =====================================================================
-- source_collecte   mode_collecte      NOT NULL
-- auteur_id         UUID               NOT NULL REFERENCES utilisateur(id)
-- saisi_le          TIMESTAMPTZ        NOT NULL DEFAULT now()   -- horodatage terrain
-- recu_le           TIMESTAMPTZ        NOT NULL DEFAULT now()   -- arrivée serveur (synchro)
-- statut            statut_validation  NOT NULL DEFAULT 'brute'
-- valide_par        UUID               REFERENCES utilisateur(id)
-- valide_le         TIMESTAMPTZ
-- piece_jointe_url  TEXT                                        -- photo, scan, fichier source

-- Journal d'audit : toute modification d'une donnée déjà synchronisée.
CREATE TABLE audit_modification (
    id              BIGSERIAL PRIMARY KEY,
    table_cible     TEXT NOT NULL,
    enregistrement  UUID NOT NULL,
    champ           TEXT NOT NULL,
    ancienne_valeur TEXT,
    nouvelle_valeur TEXT,
    auteur_id       UUID NOT NULL REFERENCES utilisateur(id),
    motif           TEXT,
    modifie_le      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_cible ON audit_modification(table_cible, enregistrement);

-- =====================================================================
-- 4. CP01 — FORATION
-- =====================================================================

CREATE TABLE tir (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_t        TEXT NOT NULL,                 -- T1, T2, T3
    site_id         SMALLINT NOT NULL REFERENCES site(id),
    date_tir        DATE,
    UNIQUE (site_id, numero_t)
);

CREATE TABLE trou_forage (
    id                      UUID PRIMARY KEY,      -- UUID généré par le terminal
    reference               TEXT UNIQUE,           -- identifiant lisible, généré serveur
    site_id                 SMALLINT NOT NULL REFERENCES site(id),
    tir_id                  UUID REFERENCES tir(id),
    foreuse_id              UUID NOT NULL REFERENCES engin(id),
    operateur_matricule     TEXT REFERENCES personnel(matricule),

    -- 1er scan
    date_foration           DATE NOT NULL,
    heure_debut             TIMESTAMPTZ NOT NULL,
    compteur_debut          NUMERIC(10,2),
    diametre_mm             NUMERIC(6,2),
    maille_longueur_m       NUMERIC(6,2),
    maille_largeur_m        NUMERIC(6,2),
    gps_latitude            NUMERIC(9,6),
    gps_longitude           NUMERIC(9,6),

    -- 2e scan
    heure_fin               TIMESTAMPTZ,
    compteur_fin            NUMERIC(10,2),
    metres_lineaires        NUMERIC(8,2),
    numero_taillant         TEXT,
    numero_tige             TEXT,

    -- Calculs automatiques
    duree_foration          INTERVAL GENERATED ALWAYS AS (heure_fin - heure_debut) STORED,
    utilisation_foreuse     NUMERIC(10,2) GENERATED ALWAYS AS (compteur_fin - compteur_debut) STORED,

    -- Traçabilité
    source_collecte         mode_collecte NOT NULL DEFAULT 'qr_code',
    auteur_id               UUID NOT NULL REFERENCES utilisateur(id),
    saisi_le                TIMESTAMPTZ NOT NULL DEFAULT now(),
    recu_le                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    statut                  statut_validation NOT NULL DEFAULT 'brute',
    valide_par              UUID REFERENCES utilisateur(id),
    valide_le               TIMESTAMPTZ,

    CONSTRAINT chk_trou_chronologie CHECK (heure_fin IS NULL OR heure_fin >= heure_debut),
    CONSTRAINT chk_trou_compteur    CHECK (compteur_fin IS NULL OR compteur_fin >= compteur_debut)
);
CREATE INDEX idx_trou_date_site ON trou_forage(date_foration, site_id);
CREATE INDEX idx_trou_foreuse   ON trou_forage(foreuse_id, date_foration);
CREATE INDEX idx_trou_statut    ON trou_forage(statut) WHERE statut <> 'validee';

-- =====================================================================
-- 5. CP02 — MINAGE (prestation externe)
-- =====================================================================

CREATE TABLE prestation_minage (
    id                  UUID PRIMARY KEY,
    tir_id              UUID REFERENCES tir(id),
    site_id             SMALLINT NOT NULL REFERENCES site(id),
    date_prestation     DATE NOT NULL,
    prestataire         TEXT,
    numero_facture      TEXT,
    montant             NUMERIC(14,2),
    devise              TEXT DEFAULT 'XOF',
    mode_reception      TEXT,                      -- excel | papier

    source_collecte     mode_collecte NOT NULL DEFAULT 'saisie_directe',
    auteur_id           UUID NOT NULL REFERENCES utilisateur(id),
    saisi_le            TIMESTAMPTZ NOT NULL DEFAULT now(),
    recu_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    statut              statut_validation NOT NULL DEFAULT 'brute',
    valide_par          UUID REFERENCES utilisateur(id),
    valide_le           TIMESTAMPTZ,
    piece_jointe_url    TEXT                       -- photo/scan de la facture
);

-- Engins CADERAC mobilisés sur un tir
CREATE TABLE minage_engin_mobilise (
    prestation_id   UUID NOT NULL REFERENCES prestation_minage(id) ON DELETE CASCADE,
    engin_id        UUID NOT NULL REFERENCES engin(id),
    PRIMARY KEY (prestation_id, engin_id)
);

-- =====================================================================
-- 6. ÉVÉNEMENTS ENGINS (CP03, CP09 — BRH, pelle, dumpers, chargeuse)
--    Table append-only : socle de la synchronisation hors ligne.
-- =====================================================================

CREATE TABLE evenement_engin (
    id                  UUID PRIMARY KEY,          -- généré par le terminal (idempotence)
    engin_id            UUID NOT NULL REFERENCES engin(id),
    site_id             SMALLINT NOT NULL REFERENCES site(id),
    centre_cout_reel    TEXT REFERENCES centre_de_cout(code),  -- activité réellement réalisée
    type_evenement      type_evenement_engin NOT NULL,
    horodatage          TIMESTAMPTZ NOT NULL,      -- heure terrain
    compteur            NUMERIC(10,2),
    cause               TEXT,                      -- motif d'arrêt ou de panne
    carburant_litres    NUMERIC(10,2),
    operateur_matricule TEXT REFERENCES personnel(matricule),
    commentaire         TEXT,
    donnees_extra       JSONB NOT NULL DEFAULT '{}'::jsonb,

    source_collecte     mode_collecte NOT NULL DEFAULT 'qr_code',
    auteur_id           UUID NOT NULL REFERENCES utilisateur(id),
    saisi_le            TIMESTAMPTZ NOT NULL DEFAULT now(),
    recu_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    statut              statut_validation NOT NULL DEFAULT 'brute',
    valide_par          UUID REFERENCES utilisateur(id),
    valide_le           TIMESTAMPTZ
);
CREATE INDEX idx_evt_engin_horodatage ON evenement_engin(engin_id, horodatage);
CREATE INDEX idx_evt_engin_site_date  ON evenement_engin(site_id, horodatage);
CREATE INDEX idx_evt_engin_statut     ON evenement_engin(statut) WHERE statut <> 'validee';

-- =====================================================================
-- 7. ROTATIONS DE DUMPERS ET CAMPAGNE DE PESAGE
-- =====================================================================

CREATE TABLE rotation_dumper (
    id                      UUID PRIMARY KEY,
    dumper_id               UUID NOT NULL REFERENCES engin(id),
    site_id                 SMALLINT NOT NULL REFERENCES site(id),
    horodatage              TIMESTAMPTZ NOT NULL,  -- passage au point de déversement
    point_deversement       TEXT,                  -- niveau de concassage concerné
    poids_reel_t            NUMERIC(10,2),         -- si pesée disponible
    quantite_estimee_t      NUMERIC(10,2),         -- capacité nominale, si pas de pesée
    nature_quantite         nature_quantite NOT NULL DEFAULT 'estimation',

    source_collecte         mode_collecte NOT NULL DEFAULT 'saisie_directe',
    auteur_id               UUID NOT NULL REFERENCES utilisateur(id),
    saisi_le                TIMESTAMPTZ NOT NULL DEFAULT now(),
    recu_le                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    statut                  statut_validation NOT NULL DEFAULT 'brute',
    valide_par              UUID REFERENCES utilisateur(id),
    valide_le               TIMESTAMPTZ,

    -- Une quantité réelle et une quantité estimée ne sont jamais confondues.
    CONSTRAINT chk_rotation_quantite CHECK (
        (nature_quantite = 'pesee_reelle' AND poids_reel_t IS NOT NULL)
     OR (nature_quantite = 'estimation'   AND quantite_estimee_t IS NOT NULL)
    )
);
CREATE INDEX idx_rotation_dumper_date ON rotation_dumper(dumper_id, horodatage);
CREATE INDEX idx_rotation_site_date   ON rotation_dumper(site_id, horodatage);

CREATE TABLE campagne_pesage (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engin_id            UUID NOT NULL REFERENCES engin(id),
    date_pesee          DATE NOT NULL,
    poids_a_vide_t      NUMERIC(10,2),
    poids_charge_t      NUMERIC(10,2),
    nombre_pesees       SMALLINT,
    capacite_retenue_t  NUMERIC(10,2),
    auteur_id           UUID NOT NULL REFERENCES utilisateur(id),
    statut              statut_validation NOT NULL DEFAULT 'brute',
    valide_par          UUID REFERENCES utilisateur(id),
    valide_le           TIMESTAMPTZ
);

-- =====================================================================
-- 8. CONCASSAGE
-- =====================================================================

CREATE TABLE evenement_equipement (
    id                  UUID PRIMARY KEY,
    equipement_id       UUID NOT NULL REFERENCES equipement_concassage(id),
    site_id             SMALLINT NOT NULL REFERENCES site(id),
    type_evenement      type_evenement_equipement NOT NULL,
    heure_debut         TIMESTAMPTZ NOT NULL,
    heure_fin           TIMESTAMPTZ,
    cause               TEXT,
    production_t        NUMERIC(12,2),
    taux_charge_pct     NUMERIC(5,2),
    donnees_extra       JSONB NOT NULL DEFAULT '{}'::jsonb,

    source_collecte     mode_collecte NOT NULL DEFAULT 'qr_code',
    auteur_id           UUID NOT NULL REFERENCES utilisateur(id),
    saisi_le            TIMESTAMPTZ NOT NULL DEFAULT now(),
    recu_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    statut              statut_validation NOT NULL DEFAULT 'brute',
    valide_par          UUID REFERENCES utilisateur(id),
    valide_le           TIMESTAMPTZ,

    CONSTRAINT chk_equip_chronologie CHECK (heure_fin IS NULL OR heure_fin >= heure_debut),
    CONSTRAINT chk_taux_charge CHECK (taux_charge_pct IS NULL OR taux_charge_pct BETWEEN 0 AND 100)
);
CREATE INDEX idx_evt_equip_date ON evenement_equipement(equipement_id, heure_debut);

-- Sorties magasin rattachées à un équipement ou à un engin
CREATE TABLE sortie_piece (
    id              UUID PRIMARY KEY,
    date_sortie     DATE NOT NULL,
    equipement_id   UUID REFERENCES equipement_concassage(id),
    engin_id        UUID REFERENCES engin(id),
    reference_piece TEXT NOT NULL,
    designation     TEXT,
    quantite        NUMERIC(10,2) NOT NULL,
    cout_unitaire   NUMERIC(14,2),

    source_collecte mode_collecte NOT NULL DEFAULT 'import_fichier',
    auteur_id       UUID NOT NULL REFERENCES utilisateur(id),
    saisi_le        TIMESTAMPTZ NOT NULL DEFAULT now(),
    statut          statut_validation NOT NULL DEFAULT 'brute',
    valide_par      UUID REFERENCES utilisateur(id),
    valide_le       TIMESTAMPTZ,

    CONSTRAINT chk_sortie_cible CHECK (num_nonnulls(equipement_id, engin_id) = 1)
);

-- =====================================================================
-- 9. CP09 — PONT-BASCULE ET EXPÉDITION
-- =====================================================================

CREATE TABLE pesee_pont_bascule (
    id                  UUID PRIMARY KEY,
    site_id             SMALLINT NOT NULL REFERENCES site(id),
    horodatage          TIMESTAMPTZ NOT NULL,
    client              TEXT,
    immatriculation     TEXT,
    produit_id          UUID REFERENCES produit(id),
    poids_t             NUMERIC(10,2),
    numero_bon          TEXT,

    source_collecte     mode_collecte NOT NULL DEFAULT 'saisie_directe',
    auteur_id           UUID NOT NULL REFERENCES utilisateur(id),
    saisi_le            TIMESTAMPTZ NOT NULL DEFAULT now(),
    statut              statut_validation NOT NULL DEFAULT 'brute',
    valide_par          UUID REFERENCES utilisateur(id),
    valide_le           TIMESTAMPTZ
);
CREATE INDEX idx_pesee_site_date ON pesee_pont_bascule(site_id, horodatage);

-- =====================================================================
-- 10. SYNCHRONISATION HORS LIGNE
-- =====================================================================

CREATE TABLE lot_synchronisation (
    id                  UUID PRIMARY KEY,          -- clé d'idempotence envoyée par le terminal
    terminal_id         TEXT NOT NULL,
    utilisateur_id      UUID NOT NULL REFERENCES utilisateur(id),
    nb_enregistrements  INTEGER NOT NULL,
    envoye_le           TIMESTAMPTZ NOT NULL,
    recu_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    resultat            TEXT NOT NULL DEFAULT 'ok' -- ok | partiel | rejete
);

CREATE TABLE version_referentiel (
    nom_referentiel TEXT PRIMARY KEY,              -- engin, personnel, produit...
    version         BIGINT NOT NULL DEFAULT 1,
    maj_le          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 11. VUES D'EXPORT — livrable destiné au gestionnaire externe
--     Seules les données validées sont exposées.
-- =====================================================================

CREATE VIEW v_export_foration AS
SELECT  t.reference           AS id_trou,
        s.code                AS site,
        ti.numero_t           AS numero_tir,
        e.numero_parc         AS foreuse,
        t.operateur_matricule AS operateur,
        t.date_foration,
        t.heure_debut,
        t.heure_fin,
        EXTRACT(EPOCH FROM t.duree_foration)/3600 AS duree_heures,
        t.utilisation_foreuse,
        t.metres_lineaires,
        t.diametre_mm,
        t.maille_longueur_m,
        t.maille_largeur_m,
        t.numero_taillant,
        t.numero_tige,
        t.statut
FROM trou_forage t
JOIN site s  ON s.id = t.site_id
JOIN engin e ON e.id = t.foreuse_id
LEFT JOIN tir ti ON ti.id = t.tir_id
WHERE t.statut = 'validee';

CREATE VIEW v_export_activite_engin AS
SELECT  ev.id,
        e.numero_parc         AS engin,
        e.famille,
        s.code                AS site,
        ev.centre_cout_reel,
        ev.type_evenement,
        ev.horodatage,
        ev.compteur,
        ev.cause,
        ev.carburant_litres,
        ev.operateur_matricule,
        ev.statut
FROM evenement_engin ev
JOIN engin e ON e.id = ev.engin_id
JOIN site  s ON s.id = ev.site_id
WHERE ev.statut = 'validee';

CREATE VIEW v_export_rotations AS
SELECT  r.id,
        e.numero_parc     AS dumper,
        s.code            AS site,
        r.horodatage,
        r.point_deversement,
        r.poids_reel_t,
        r.quantite_estimee_t,
        r.nature_quantite,
        LAG(r.horodatage) OVER (PARTITION BY r.dumper_id, r.horodatage::date
                                ORDER BY r.horodatage) AS passage_precedent,
        r.statut
FROM rotation_dumper r
JOIN engin e ON e.id = r.dumper_id
JOIN site  s ON s.id = r.site_id
WHERE r.statut = 'validee';

CREATE VIEW v_export_pesees AS
SELECT  p.id, s.code AS site, p.horodatage, p.client, p.immatriculation,
        pr.libelle AS produit, p.poids_t, p.numero_bon, p.statut
FROM pesee_pont_bascule p
JOIN site s ON s.id = p.site_id
LEFT JOIN produit pr ON pr.id = p.produit_id
WHERE p.statut = 'validee';

-- Suivi de la complétude de la collecte (pilotage du déploiement)
CREATE VIEW v_completude_collecte AS
SELECT  s.code AS site,
        d.jour::date,
        COUNT(*) FILTER (WHERE t.id IS NOT NULL)                    AS trous_declares,
        COUNT(*) FILTER (WHERE t.statut = 'validee')                AS trous_valides,
        COUNT(*) FILTER (WHERE t.heure_fin IS NULL)                 AS trous_non_clotures
FROM site s
CROSS JOIN generate_series(CURRENT_DATE - 30, CURRENT_DATE, '1 day') AS d(jour)
LEFT JOIN trou_forage t ON t.site_id = s.id AND t.date_foration = d.jour::date
GROUP BY s.code, d.jour;


-- =====================================================================
-- 12. COMPLÉMENTS — nomenclature des arrêts, charges et affectations
-- =====================================================================

-- Nomenclature des causes d'arrêt. Table plutôt qu'ENUM : la liste
-- s'enrichit avec l'usage terrain sans migration de schéma.
-- Le champ libre reste possible (cause_libre) mais doit rester
-- l'exception : un motif saisi librement n'est pas exploitable
-- statistiquement.
CREATE TABLE cause_arret (
    code            TEXT PRIMARY KEY,
    libelle         TEXT NOT NULL,
    categorie       TEXT,           -- technique, organisationnel, externe
    actif           BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE evenement_engin
    ADD COLUMN cause_code TEXT REFERENCES cause_arret(code);
ALTER TABLE evenement_equipement
    ADD COLUMN cause_code TEXT REFERENCES cause_arret(code);

-- ---------------------------------------------------------------------
-- Charges administratives et de fonctionnement des engins (ch. 7.1/7.2)
-- Collectées en v1, valorisées par le gestionnaire externe.
-- ---------------------------------------------------------------------
CREATE TABLE charge_engin (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engin_id            UUID NOT NULL REFERENCES engin(id),
    nature              TEXT NOT NULL,   -- administrative | fonctionnement
    categorie           TEXT NOT NULL,   -- assurance, vignette, stationnement, taxe,
                                         -- carburant, maintenance, pieces, consommables,
                                         -- pneumatiques, lubrifiants, energie, autre
    date_charge         DATE NOT NULL,
    montant             NUMERIC(16,2),
    devise              TEXT DEFAULT 'XOF',
    periode_debut       DATE,            -- charges annuelles : période couverte
    periode_fin         DATE,
    reference_document  TEXT,
    commentaire         TEXT,

    source_collecte     mode_collecte NOT NULL DEFAULT 'saisie_directe',
    auteur_id           UUID NOT NULL REFERENCES utilisateur(id),
    saisi_le            TIMESTAMPTZ NOT NULL DEFAULT now(),
    recu_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    statut              statut_validation NOT NULL DEFAULT 'brute',
    valide_par          UUID REFERENCES utilisateur(id),
    valide_le           TIMESTAMPTZ,
    piece_jointe_url    TEXT,

    CONSTRAINT chk_charge_periode CHECK (periode_fin IS NULL OR periode_debut IS NULL
                                         OR periode_fin >= periode_debut)
);
CREATE INDEX idx_charge_engin_date ON charge_engin(engin_id, date_charge);

-- ---------------------------------------------------------------------
-- Affectation RÉELLE d'un engin (ch. 7.3)
-- Distingue l'activité effectivement réalisée de l'affectation
-- analytique de référence portée par la fiche engin : un dumper
-- rattaché à CP03 peut intervenir ponctuellement en CP09.
-- ---------------------------------------------------------------------
CREATE TABLE affectation_reelle_engin (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engin_id            UUID NOT NULL REFERENCES engin(id),
    date_activite       DATE NOT NULL,
    centre_cout_reel    TEXT NOT NULL REFERENCES centre_de_cout(code),
    activite            TEXT,
    duree_heures        NUMERIC(8,2),
    commentaire         TEXT,

    source_collecte     mode_collecte NOT NULL DEFAULT 'saisie_directe',
    auteur_id           UUID NOT NULL REFERENCES utilisateur(id),
    saisi_le            TIMESTAMPTZ NOT NULL DEFAULT now(),
    statut              statut_validation NOT NULL DEFAULT 'brute',
    valide_par          UUID REFERENCES utilisateur(id),
    valide_le           TIMESTAMPTZ
);
CREATE INDEX idx_affect_reelle ON affectation_reelle_engin(engin_id, date_activite);

-- ---------------------------------------------------------------------
-- Vente / expédition (CP09)
-- ---------------------------------------------------------------------
CREATE TABLE vente (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id             SMALLINT NOT NULL REFERENCES site(id),
    date_vente          DATE NOT NULL,
    client              TEXT,
    produit_id          UUID REFERENCES produit(id),
    quantite_t          NUMERIC(12,3),
    montant             NUMERIC(16,2),
    devise              TEXT DEFAULT 'XOF',
    pesee_id            UUID REFERENCES pesee_pont_bascule(id),
    vendeur_matricule   TEXT REFERENCES personnel(matricule),
    numero_facture      TEXT,

    source_collecte     mode_collecte NOT NULL DEFAULT 'saisie_directe',
    auteur_id           UUID NOT NULL REFERENCES utilisateur(id),
    saisi_le            TIMESTAMPTZ NOT NULL DEFAULT now(),
    statut              statut_validation NOT NULL DEFAULT 'brute',
    valide_par          UUID REFERENCES utilisateur(id),
    valide_le           TIMESTAMPTZ
);
CREATE INDEX idx_vente_date ON vente(site_id, date_vente);

-- Export des charges engin destiné au gestionnaire externe
CREATE VIEW v_export_charges_engin AS
SELECT  e.numero_parc AS engin, e.famille, s.code AS site,
        c.nature, c.categorie, c.date_charge, c.montant, c.devise,
        c.periode_debut, c.periode_fin, c.statut
FROM charge_engin c
JOIN engin e ON e.id = c.engin_id
JOIN site  s ON s.id = e.site_id
WHERE c.statut = 'validee';

-- =====================================================================
-- 13. JEU DE DONNÉES INITIAL
-- =====================================================================

INSERT INTO site (code, libelle) VALUES
    ('KOS', 'Kossihouen (Abidjan)'),
    ('BKE', 'Bouake'),
    ('ABO', 'Aboisso'),
    ('LDB', 'Laoudi Ba');

INSERT INTO centre_de_cout (code, libelle) VALUES
    ('CP01', 'Foration'),
    ('CP02', 'Minage'),
    ('CP03', 'Marinage'),
    ('CP04', 'Concassage primaire'),
    ('CP05', 'Concassage secondaire'),
    ('CP06', 'Concassage tertiaire'),
    ('CP07', 'Concassage quaternaire'),
    ('CP09', 'Stockage / Vente');

INSERT INTO cause_arret (code, libelle, categorie) VALUES
    ('PANNE_MEC',  'Panne mecanique',                'technique'),
    ('PANNE_HYD',  'Panne hydraulique',              'technique'),
    ('PANNE_ELEC', 'Panne electrique',               'technique'),
    ('ENTRETIEN',  'Entretien programme',            'technique'),
    ('CARBURANT',  'Attente carburant',              'organisationnel'),
    ('ATT_CHARG',  'Attente chargement ou engin',    'organisationnel'),
    ('ATT_PIECE',  'Attente piece de rechange',      'organisationnel'),
    ('PAUSE',      'Pause equipe / releve de poste', 'organisationnel'),
    ('METEO',      'Intemperies',                    'externe'),
    ('COUP_ELEC',  'Coupure du reseau electrique',   'externe'),
    ('AUTRE',      'Autre (preciser en commentaire)','externe');

-- =====================================================================
-- FIN DU SCHEMA
-- =====================================================================
