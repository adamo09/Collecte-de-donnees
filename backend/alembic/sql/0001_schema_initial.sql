-- =====================================================================
-- CADERAC — Système de collecte terrain
-- Schéma PostgreSQL — PÉRIMÈTRE V1 : COLLECTE UNIQUEMENT
--
-- Le calcul des coûts est assuré par le gestionnaire externe à partir
-- des vues d'export (fichier 0002_vues_export.sql).
--
-- Version 1.0 — consolidation du document de modélisation v0.1.
-- Les écarts avec le schéma v0.1 fourni sont listés dans
-- docs/ecarts-schema-v0.1.md, chacun rattaché au chapitre qui le motive.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- =====================================================================
-- 0. TYPES ÉNUMÉRÉS
-- =====================================================================

CREATE TYPE mode_collecte AS ENUM (
    'qr_code', 'saisie_directe', 'ocr', 'import_fichier', 'voix', 'interface_systeme'
);

CREATE TYPE statut_validation AS ENUM ('brute', 'controlee', 'validee', 'rejetee');

CREATE TYPE role_utilisateur AS ENUM (
    'agent_terrain', 'superviseur', 'controleur', 'admin'
);

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

-- Poste de travail : le rendement d'une équipe de nuit n'est pas comparable
-- à celui d'une équipe de jour (ch. 8.2).
CREATE TYPE poste_travail AS ENUM ('jour', 'nuit');

CREATE TYPE nature_charge AS ENUM ('administrative', 'fonctionnement');

CREATE TYPE resultat_lot AS ENUM ('ok', 'partiel', 'rejete');

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
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    login               TEXT NOT NULL UNIQUE,
    mot_de_passe_hash   TEXT NOT NULL,
    nom_complet         TEXT NOT NULL,
    role                role_utilisateur NOT NULL,
    site_id             SMALLINT REFERENCES site(id),
    matricule           TEXT,                      -- rattachement au personnel, si applicable
    actif               BOOLEAN NOT NULL DEFAULT TRUE,
    cree_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    derniere_connexion  TIMESTAMPTZ
);
CREATE INDEX idx_utilisateur_site ON utilisateur(site_id) WHERE actif;

CREATE TABLE centre_de_cout (
    code            TEXT PRIMARY KEY,              -- CP01, CP02, CP03, CP09
    libelle         TEXT NOT NULL,
    actif           BOOLEAN NOT NULL DEFAULT TRUE
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
    unite_compteur          TEXT NOT NULL DEFAULT 'heures',  -- heures | km

    -- Dernier relevé de compteur connu (ch. 4.1). Dénormalisation assumée :
    -- alimentée par les événements engins, elle évite un balayage du journal
    -- pour pré-remplir le compteur au scan suivant.
    compteur_actuel         NUMERIC(10,2),
    compteur_maj_le         TIMESTAMPTZ,

    -- Amortissement : colonnes présentes dès la V1 pour accueillir l'import
    -- Sage de la phase 2 sans migration (ch. 4.1).
    amortissement_methode   TEXT,
    amortissement_duree_ans SMALLINT,
    valeur_residuelle       NUMERIC(14,2),

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
    date_fin_affect     DATE,
    actif               BOOLEAN NOT NULL DEFAULT TRUE,
    -- Coût employeur volontairement absent : donnée RH conservée côté gestionnaire.
    CONSTRAINT chk_personnel_periode CHECK (
        date_fin_affect IS NULL OR date_debut_affect IS NULL
        OR date_fin_affect >= date_debut_affect
    )
);
CREATE INDEX idx_personnel_site ON personnel(site_id) WHERE actif;

CREATE TABLE produit (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT NOT NULL UNIQUE,
    libelle         TEXT NOT NULL,
    site_id         SMALLINT REFERENCES site(id),
    granulometrie   TEXT,
    actif           BOOLEAN NOT NULL DEFAULT TRUE
);

-- Parcours d'un produit dans les niveaux de concassage (liste ordonnée).
-- Un produit qui ne traverse pas un niveau ne doit pas en supporter le coût
-- (ch. 4.3) : donnée de paramétrage collectée en V1, exploitée en phase 2.
CREATE TABLE produit_parcours (
    produit_id      UUID NOT NULL REFERENCES produit(id) ON DELETE CASCADE,
    ordre           SMALLINT NOT NULL,
    niveau          niveau_concassage NOT NULL,
    PRIMARY KEY (produit_id, ordre),
    UNIQUE (produit_id, niveau)
);

-- Nomenclature des causes d'arrêt. Table plutôt qu'ENUM : la liste s'enrichit
-- avec l'usage terrain sans migration de schéma (ch. 4.4). Le champ libre
-- reste possible (cause) mais doit rester l'exception : un motif saisi
-- librement n'est pas exploitable statistiquement.
CREATE TABLE cause_arret (
    code            TEXT PRIMARY KEY,
    libelle         TEXT NOT NULL,
    categorie       TEXT,           -- technique, organisationnel, externe
    actif           BOOLEAN NOT NULL DEFAULT TRUE
);

-- =====================================================================
-- 3. TRAÇABILITÉ (ch. 5) — colonnes communes à toute donnée collectée
--
--    Ce bloc est volontairement dupliqué sur chaque table de collecte
--    plutôt que déporté dans une table liée : il évite une jointure sur
--    chaque requête d'export et garantit qu'aucune donnée ne peut
--    exister sans sa traçabilité.
--
--      source_collecte   mode_collecte      NOT NULL
--      auteur_id         UUID               NOT NULL REFERENCES utilisateur(id)
--      saisi_le          TIMESTAMPTZ        NOT NULL  -- horodatage terrain
--      recu_le           TIMESTAMPTZ        NOT NULL  -- arrivée serveur (synchro)
--      statut            statut_validation  NOT NULL DEFAULT 'brute'
--      valide_par        UUID               REFERENCES utilisateur(id)
--      valide_le         TIMESTAMPTZ
--      piece_jointe_url  TEXT                         -- photo, scan, fichier source
--      lot_id            UUID               REFERENCES lot_synchronisation(id)
-- =====================================================================

-- Journal d'audit : toute modification d'une donnée déjà synchronisée.
-- C'est cette table qui permet au contrôle de gestion de défendre un
-- chiffre contesté (ch. 5.1).
CREATE TABLE audit_modification (
    id              BIGSERIAL PRIMARY KEY,
    table_cible     TEXT NOT NULL,
    -- Clé primaire de l'enregistrement sous forme textuelle : les données
    -- collectées sont identifiées par UUID, mais les référentiels le sont
    -- par code (personnel.matricule, centre_de_cout.code). Une colonne TEXT
    -- permet d'auditer les deux avec une seule table.
    enregistrement  TEXT NOT NULL,
    champ           TEXT NOT NULL,
    ancienne_valeur TEXT,
    nouvelle_valeur TEXT,
    auteur_id       UUID NOT NULL REFERENCES utilisateur(id),
    motif           TEXT,
    modifie_le      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_cible ON audit_modification(table_cible, enregistrement);
CREATE INDEX idx_audit_date  ON audit_modification(modifie_le DESC);

-- =====================================================================
-- 4. SYNCHRONISATION HORS LIGNE (ch. 12)
--    Déclarée avant les tables de collecte : celles-ci référencent le lot
--    dont elles sont issues.
-- =====================================================================

CREATE TABLE lot_synchronisation (
    id                  UUID PRIMARY KEY,          -- clé d'idempotence envoyée par le terminal
    terminal_id         TEXT NOT NULL,
    utilisateur_id      UUID NOT NULL REFERENCES utilisateur(id),
    application_version TEXT,
    nb_enregistrements  INTEGER NOT NULL,
    nb_acceptes         INTEGER NOT NULL DEFAULT 0,
    nb_rejetes          INTEGER NOT NULL DEFAULT 0,
    envoye_le           TIMESTAMPTZ NOT NULL,
    recu_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    resultat            resultat_lot NOT NULL DEFAULT 'ok',
    CONSTRAINT chk_lot_compte CHECK (nb_acceptes + nb_rejetes <= nb_enregistrements)
);
CREATE INDEX idx_lot_terminal ON lot_synchronisation(terminal_id, recu_le DESC);
CREATE INDEX idx_lot_utilisateur ON lot_synchronisation(utilisateur_id, recu_le DESC);

-- Détail enregistrement par enregistrement du sort réservé à chaque élément
-- d'un lot. Sans ce détail, l'absence d'une rotation reste indiscernable
-- entre un oubli de l'opérateur, un terminal en panne et un échec de
-- transmission (ch. 12).
CREATE TABLE lot_enregistrement (
    lot_id          UUID NOT NULL REFERENCES lot_synchronisation(id) ON DELETE CASCADE,
    table_cible     TEXT NOT NULL,
    enregistrement  UUID NOT NULL,
    accepte         BOOLEAN NOT NULL,
    doublon         BOOLEAN NOT NULL DEFAULT FALSE,  -- déjà présent : renvoi idempotent
    erreur          TEXT,
    traite_le       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (lot_id, table_cible, enregistrement)
);
CREATE INDEX idx_lot_enr_cible ON lot_enregistrement(table_cible, enregistrement);

-- Numéro de version des référentiels : permet au terminal de savoir s'il
-- doit rafraîchir sa copie locale (ch. 12).
CREATE TABLE version_referentiel (
    nom_referentiel TEXT PRIMARY KEY,              -- engin, personnel, produit...
    version         BIGINT NOT NULL DEFAULT 1,
    maj_le          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =====================================================================
-- 5. CP01 — FORATION (ch. 6)
--    Cycle en deux scans : le premier crée l'enregistrement lorsque la
--    foreuse est positionnée, le second le clôture en fin de forage.
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
    reference               TEXT UNIQUE,           -- identifiant lisible (KOS-T12-0043), généré serveur
    site_id                 SMALLINT NOT NULL REFERENCES site(id),
    tir_id                  UUID REFERENCES tir(id),
    foreuse_id              UUID NOT NULL REFERENCES engin(id),
    operateur_matricule     TEXT REFERENCES personnel(matricule),
    poste                   poste_travail,

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
    cloture_le              TIMESTAMPTZ,           -- horodatage serveur du 2e scan

    -- Grandeurs dérivées. Colonnes générées et non colonnes saisies : elles
    -- se recalculent d'elles-mêmes lorsqu'un relevé de compteur est corrigé
    -- (principe 2 du ch. 2). Aucune durée n'est jamais saisie à la main.
    duree_foration          INTERVAL GENERATED ALWAYS AS (heure_fin - heure_debut) STORED,
    utilisation_foreuse     NUMERIC(10,2) GENERATED ALWAYS AS (compteur_fin - compteur_debut) STORED,
    est_cloture             BOOLEAN GENERATED ALWAYS AS (heure_fin IS NOT NULL) STORED,

    commentaire             TEXT,

    -- Traçabilité
    source_collecte         mode_collecte NOT NULL DEFAULT 'qr_code',
    auteur_id               UUID NOT NULL REFERENCES utilisateur(id),
    saisi_le                TIMESTAMPTZ NOT NULL DEFAULT now(),
    recu_le                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    statut                  statut_validation NOT NULL DEFAULT 'brute',
    valide_par              UUID REFERENCES utilisateur(id),
    valide_le               TIMESTAMPTZ,
    piece_jointe_url        TEXT,
    lot_id                  UUID REFERENCES lot_synchronisation(id),

    CONSTRAINT chk_trou_chronologie CHECK (heure_fin IS NULL OR heure_fin >= heure_debut),
    CONSTRAINT chk_trou_compteur    CHECK (compteur_fin IS NULL OR compteur_debut IS NULL
                                           OR compteur_fin >= compteur_debut),
    CONSTRAINT chk_trou_gps         CHECK (
        (gps_latitude IS NULL AND gps_longitude IS NULL)
        OR (gps_latitude BETWEEN -90 AND 90 AND gps_longitude BETWEEN -180 AND 180)
    )
);
CREATE INDEX idx_trou_date_site ON trou_forage(date_foration, site_id);
CREATE INDEX idx_trou_foreuse   ON trou_forage(foreuse_id, date_foration);
CREATE INDEX idx_trou_statut    ON trou_forage(statut) WHERE statut <> 'validee';
-- Index dédié à l'écran « trous non clôturés » (contrôle à prévoir dès le pilote, ch. 6).
CREATE INDEX idx_trou_ouvert    ON trou_forage(site_id, heure_debut) WHERE heure_fin IS NULL;
CREATE INDEX idx_trou_tir       ON trou_forage(tir_id);

-- =====================================================================
-- 6. CP02 — MINAGE (prestation externe, ch. 7)
-- =====================================================================

CREATE TABLE prestation_minage (
    id                  UUID PRIMARY KEY,
    tir_id              UUID REFERENCES tir(id),
    site_id             SMALLINT NOT NULL REFERENCES site(id),
    date_prestation     DATE NOT NULL,
    prestataire         TEXT,
    numero_facture      TEXT,
    montant             NUMERIC(14,2),
    devise              TEXT NOT NULL DEFAULT 'XOF',
    mode_reception      TEXT,                      -- excel | pdf | papier
    commentaire         TEXT,

    source_collecte     mode_collecte NOT NULL DEFAULT 'saisie_directe',
    auteur_id           UUID NOT NULL REFERENCES utilisateur(id),
    saisi_le            TIMESTAMPTZ NOT NULL DEFAULT now(),
    recu_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    statut              statut_validation NOT NULL DEFAULT 'brute',
    valide_par          UUID REFERENCES utilisateur(id),
    valide_le           TIMESTAMPTZ,
    piece_jointe_url    TEXT,                      -- photo/scan de la facture
    lot_id              UUID REFERENCES lot_synchronisation(id),

    CONSTRAINT chk_minage_montant CHECK (montant IS NULL OR montant >= 0)
);
CREATE INDEX idx_minage_site_date ON prestation_minage(site_id, date_prestation);
CREATE INDEX idx_minage_tir       ON prestation_minage(tir_id);

-- Engins CADERAC ponctuellement mobilisés sur un tir.
CREATE TABLE minage_engin_mobilise (
    prestation_id   UUID NOT NULL REFERENCES prestation_minage(id) ON DELETE CASCADE,
    engin_id        UUID NOT NULL REFERENCES engin(id),
    duree_heures    NUMERIC(8,2),
    PRIMARY KEY (prestation_id, engin_id)
);

-- =====================================================================
-- 7. ÉVÉNEMENTS ENGINS (CP03, CP09 — BRH, pelle, dumpers, chargeuse, ch. 8.1)
--    Table append-only : socle de la synchronisation hors ligne.
--    Les temps de marche, temps d'arrêt et nombres de reprises sont des
--    agrégations de cette table, jamais des colonnes stockées.
-- =====================================================================

CREATE TABLE evenement_engin (
    id                  UUID PRIMARY KEY,          -- généré par le terminal (idempotence)
    engin_id            UUID NOT NULL REFERENCES engin(id),
    site_id             SMALLINT NOT NULL REFERENCES site(id),
    centre_cout_reel    TEXT REFERENCES centre_de_cout(code),  -- activité réellement réalisée
    type_evenement      type_evenement_engin NOT NULL,
    horodatage          TIMESTAMPTZ NOT NULL,      -- heure terrain
    compteur            NUMERIC(10,2),
    cause_code          TEXT REFERENCES cause_arret(code),
    cause               TEXT,                      -- motif libre : l'exception, pas la règle
    carburant_litres    NUMERIC(10,2),
    operateur_matricule TEXT REFERENCES personnel(matricule),
    poste               poste_travail,
    commentaire         TEXT,
    donnees_extra       JSONB NOT NULL DEFAULT '{}'::jsonb,

    source_collecte     mode_collecte NOT NULL DEFAULT 'qr_code',
    auteur_id           UUID NOT NULL REFERENCES utilisateur(id),
    saisi_le            TIMESTAMPTZ NOT NULL DEFAULT now(),
    recu_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    statut              statut_validation NOT NULL DEFAULT 'brute',
    valide_par          UUID REFERENCES utilisateur(id),
    valide_le           TIMESTAMPTZ,
    piece_jointe_url    TEXT,
    lot_id              UUID REFERENCES lot_synchronisation(id),

    CONSTRAINT chk_evt_engin_carburant CHECK (carburant_litres IS NULL OR carburant_litres >= 0),
    CONSTRAINT chk_evt_engin_compteur  CHECK (compteur IS NULL OR compteur >= 0)
);
CREATE INDEX idx_evt_engin_horodatage ON evenement_engin(engin_id, horodatage);
CREATE INDEX idx_evt_engin_site_date  ON evenement_engin(site_id, horodatage);
CREATE INDEX idx_evt_engin_statut     ON evenement_engin(statut) WHERE statut <> 'validee';
CREATE INDEX idx_evt_engin_cause      ON evenement_engin(cause_code) WHERE cause_code IS NOT NULL;

-- =====================================================================
-- 8. ROTATIONS DE DUMPERS ET CAMPAGNE DE PESAGE (ch. 8.2, 8.3)
--    Table la plus volumineuse du système.
-- =====================================================================

CREATE TABLE rotation_dumper (
    id                      UUID PRIMARY KEY,
    dumper_id               UUID NOT NULL REFERENCES engin(id),
    site_id                 SMALLINT NOT NULL REFERENCES site(id),
    horodatage              TIMESTAMPTZ NOT NULL,  -- passage au point de déversement
    point_deversement       TEXT,                  -- niveau de concassage concerné
    poste                   poste_travail,
    operateur_matricule     TEXT REFERENCES personnel(matricule),
    centre_cout_reel        TEXT REFERENCES centre_de_cout(code),

    -- Séparation stricte entre mesure réelle et estimation (principe 3 du
    -- ch. 2). Les deux colonnes ne sont jamais confondues ni additionnées
    -- implicitement : c'est cette exigence qui conditionne la crédibilité
    -- de tout coût à la tonne calculé en aval.
    poids_reel_t            NUMERIC(10,2),         -- si pesée disponible
    quantite_estimee_t      NUMERIC(10,2),         -- capacité nominale, si pas de pesée
    nature_quantite         nature_quantite NOT NULL DEFAULT 'estimation',

    commentaire             TEXT,

    source_collecte         mode_collecte NOT NULL DEFAULT 'saisie_directe',
    auteur_id               UUID NOT NULL REFERENCES utilisateur(id),
    saisi_le                TIMESTAMPTZ NOT NULL DEFAULT now(),
    recu_le                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    statut                  statut_validation NOT NULL DEFAULT 'brute',
    valide_par              UUID REFERENCES utilisateur(id),
    valide_le               TIMESTAMPTZ,
    piece_jointe_url        TEXT,
    lot_id                  UUID REFERENCES lot_synchronisation(id),

    CONSTRAINT chk_rotation_quantite CHECK (
        (nature_quantite = 'pesee_reelle' AND poids_reel_t IS NOT NULL)
     OR (nature_quantite = 'estimation'   AND quantite_estimee_t IS NOT NULL)
    ),
    CONSTRAINT chk_rotation_poids CHECK (
        (poids_reel_t IS NULL OR poids_reel_t >= 0)
        AND (quantite_estimee_t IS NULL OR quantite_estimee_t >= 0)
    )
);
CREATE INDEX idx_rotation_dumper_date ON rotation_dumper(dumper_id, horodatage);
CREATE INDEX idx_rotation_site_date   ON rotation_dumper(site_id, horodatage);
CREATE INDEX idx_rotation_statut      ON rotation_dumper(statut) WHERE statut <> 'validee';

CREATE TABLE campagne_pesage (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engin_id            UUID NOT NULL REFERENCES engin(id),
    date_pesee          DATE NOT NULL,
    poids_a_vide_t      NUMERIC(10,2),
    poids_charge_t      NUMERIC(10,2),
    nombre_pesees       SMALLINT,
    capacite_retenue_t  NUMERIC(10,2),
    commentaire         TEXT,

    source_collecte     mode_collecte NOT NULL DEFAULT 'saisie_directe',
    auteur_id           UUID NOT NULL REFERENCES utilisateur(id),
    saisi_le            TIMESTAMPTZ NOT NULL DEFAULT now(),
    recu_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    statut              statut_validation NOT NULL DEFAULT 'brute',
    valide_par          UUID REFERENCES utilisateur(id),
    valide_le           TIMESTAMPTZ,
    piece_jointe_url    TEXT,

    CONSTRAINT chk_campagne_poids CHECK (
        poids_charge_t IS NULL OR poids_a_vide_t IS NULL OR poids_charge_t >= poids_a_vide_t
    ),
    CONSTRAINT chk_campagne_nombre CHECK (nombre_pesees IS NULL OR nombre_pesees > 0)
);
CREATE INDEX idx_campagne_engin ON campagne_pesage(engin_id, date_pesee DESC);

-- =====================================================================
-- 9. CONCASSAGE (ch. 9)
--    La distinction marche à charge / marche à vide est indispensable au
--    calcul ultérieur du coût énergétique à la tonne.
-- =====================================================================

CREATE TABLE evenement_equipement (
    id                  UUID PRIMARY KEY,
    equipement_id       UUID NOT NULL REFERENCES equipement_concassage(id),
    site_id             SMALLINT NOT NULL REFERENCES site(id),
    type_evenement      type_evenement_equipement NOT NULL,
    heure_debut         TIMESTAMPTZ NOT NULL,
    heure_fin           TIMESTAMPTZ,
    poste               poste_travail,
    cause_code          TEXT REFERENCES cause_arret(code),
    cause               TEXT,
    production_t        NUMERIC(12,2),
    taux_charge_pct     NUMERIC(5,2),
    operateur_matricule TEXT REFERENCES personnel(matricule),
    commentaire         TEXT,
    donnees_extra       JSONB NOT NULL DEFAULT '{}'::jsonb,

    duree               INTERVAL GENERATED ALWAYS AS (heure_fin - heure_debut) STORED,

    source_collecte     mode_collecte NOT NULL DEFAULT 'qr_code',
    auteur_id           UUID NOT NULL REFERENCES utilisateur(id),
    saisi_le            TIMESTAMPTZ NOT NULL DEFAULT now(),
    recu_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    statut              statut_validation NOT NULL DEFAULT 'brute',
    valide_par          UUID REFERENCES utilisateur(id),
    valide_le           TIMESTAMPTZ,
    piece_jointe_url    TEXT,
    lot_id              UUID REFERENCES lot_synchronisation(id),

    CONSTRAINT chk_equip_chronologie CHECK (heure_fin IS NULL OR heure_fin >= heure_debut),
    CONSTRAINT chk_taux_charge  CHECK (taux_charge_pct IS NULL OR taux_charge_pct BETWEEN 0 AND 100),
    CONSTRAINT chk_equip_prod   CHECK (production_t IS NULL OR production_t >= 0)
);
CREATE INDEX idx_evt_equip_date   ON evenement_equipement(equipement_id, heure_debut);
CREATE INDEX idx_evt_equip_site   ON evenement_equipement(site_id, heure_debut);
CREATE INDEX idx_evt_equip_statut ON evenement_equipement(statut) WHERE statut <> 'validee';

-- Sorties magasin rattachées à un équipement ou à un engin (ch. 9.1).
-- Le rattachement au niveau, à la ligne et au site n'est pas stocké : il se
-- déduit de l'équipement concerné. Une seule information à saisir, aucune
-- incohérence possible.
CREATE TABLE sortie_piece (
    id              UUID PRIMARY KEY,
    date_sortie     DATE NOT NULL,
    equipement_id   UUID REFERENCES equipement_concassage(id),
    engin_id        UUID REFERENCES engin(id),
    reference_piece TEXT NOT NULL,
    designation     TEXT,
    quantite        NUMERIC(10,2) NOT NULL,
    cout_unitaire   NUMERIC(14,2),
    devise          TEXT NOT NULL DEFAULT 'XOF',
    numero_bon      TEXT,                          -- référence du bon de sortie
    commentaire     TEXT,

    source_collecte mode_collecte NOT NULL DEFAULT 'import_fichier',
    auteur_id       UUID NOT NULL REFERENCES utilisateur(id),
    saisi_le        TIMESTAMPTZ NOT NULL DEFAULT now(),
    recu_le         TIMESTAMPTZ NOT NULL DEFAULT now(),
    statut          statut_validation NOT NULL DEFAULT 'brute',
    valide_par      UUID REFERENCES utilisateur(id),
    valide_le       TIMESTAMPTZ,
    piece_jointe_url TEXT,
    lot_id          UUID REFERENCES lot_synchronisation(id),

    -- La cible est l'un ou l'autre, jamais les deux, jamais aucun.
    CONSTRAINT chk_sortie_cible    CHECK (num_nonnulls(equipement_id, engin_id) = 1),
    CONSTRAINT chk_sortie_quantite CHECK (quantite > 0),
    CONSTRAINT chk_sortie_cout     CHECK (cout_unitaire IS NULL OR cout_unitaire >= 0)
);
CREATE INDEX idx_sortie_date   ON sortie_piece(date_sortie);
CREATE INDEX idx_sortie_equip  ON sortie_piece(equipement_id) WHERE equipement_id IS NOT NULL;
CREATE INDEX idx_sortie_engin  ON sortie_piece(engin_id) WHERE engin_id IS NOT NULL;

-- =====================================================================
-- 10. CP09 — PONT-BASCULE, VENTE ET EXPÉDITION (ch. 10)
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
    commentaire         TEXT,

    source_collecte     mode_collecte NOT NULL DEFAULT 'saisie_directe',
    auteur_id           UUID NOT NULL REFERENCES utilisateur(id),
    saisi_le            TIMESTAMPTZ NOT NULL DEFAULT now(),
    recu_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    statut              statut_validation NOT NULL DEFAULT 'brute',
    valide_par          UUID REFERENCES utilisateur(id),
    valide_le           TIMESTAMPTZ,
    piece_jointe_url    TEXT,
    lot_id              UUID REFERENCES lot_synchronisation(id),

    CONSTRAINT chk_pesee_poids CHECK (poids_t IS NULL OR poids_t >= 0)
);
CREATE INDEX idx_pesee_site_date ON pesee_pont_bascule(site_id, horodatage);
CREATE INDEX idx_pesee_bon       ON pesee_pont_bascule(numero_bon) WHERE numero_bon IS NOT NULL;

CREATE TABLE vente (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id             SMALLINT NOT NULL REFERENCES site(id),
    date_vente          DATE NOT NULL,
    client              TEXT,
    produit_id          UUID REFERENCES produit(id),
    quantite_t          NUMERIC(12,3),
    montant             NUMERIC(16,2),
    devise              TEXT NOT NULL DEFAULT 'XOF',
    pesee_id            UUID REFERENCES pesee_pont_bascule(id),
    vendeur_matricule   TEXT REFERENCES personnel(matricule),
    numero_facture      TEXT,
    commentaire         TEXT,

    source_collecte     mode_collecte NOT NULL DEFAULT 'saisie_directe',
    auteur_id           UUID NOT NULL REFERENCES utilisateur(id),
    saisi_le            TIMESTAMPTZ NOT NULL DEFAULT now(),
    recu_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    statut              statut_validation NOT NULL DEFAULT 'brute',
    valide_par          UUID REFERENCES utilisateur(id),
    valide_le           TIMESTAMPTZ,
    piece_jointe_url    TEXT,
    lot_id              UUID REFERENCES lot_synchronisation(id),

    CONSTRAINT chk_vente_quantite CHECK (quantite_t IS NULL OR quantite_t >= 0),
    CONSTRAINT chk_vente_montant  CHECK (montant IS NULL OR montant >= 0)
);
CREATE INDEX idx_vente_date ON vente(site_id, date_vente);

-- =====================================================================
-- 11. COÛTS ET AFFECTATION DU PARC (ch. 11)
--     Ces tables ne portent aucune règle de calcul : le système enregistre
--     des montants et des durées, il ne les impute pas.
-- =====================================================================

CREATE TABLE charge_engin (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    engin_id            UUID NOT NULL REFERENCES engin(id),
    nature              nature_charge NOT NULL,
    categorie           TEXT NOT NULL,   -- assurance, vignette, stationnement, taxe,
                                         -- carburant, maintenance, pieces, consommables,
                                         -- pneumatiques, lubrifiants, energie, autre
    date_charge         DATE NOT NULL,
    montant             NUMERIC(16,2),
    devise              TEXT NOT NULL DEFAULT 'XOF',
    -- Période couverte : permet au gestionnaire d'étaler une assurance
    -- annuelle sur les mois concernés plutôt que de l'imputer intégralement
    -- au mois de son paiement.
    periode_debut       DATE,
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
    lot_id              UUID REFERENCES lot_synchronisation(id),

    CONSTRAINT chk_charge_periode CHECK (periode_fin IS NULL OR periode_debut IS NULL
                                         OR periode_fin >= periode_debut),
    CONSTRAINT chk_charge_montant CHECK (montant IS NULL OR montant >= 0)
);
CREATE INDEX idx_charge_engin_date ON charge_engin(engin_id, date_charge);
CREATE INDEX idx_charge_categorie  ON charge_engin(categorie, date_charge);

-- Affectation RÉELLE d'un engin (ch. 11.2). Distingue l'activité
-- effectivement réalisée de l'affectation analytique de référence portée
-- par la fiche engin : un dumper rattaché à CP03 peut intervenir
-- ponctuellement en CP09, et son coût doit alors suivre l'activité réelle.
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
    recu_le             TIMESTAMPTZ NOT NULL DEFAULT now(),
    statut              statut_validation NOT NULL DEFAULT 'brute',
    valide_par          UUID REFERENCES utilisateur(id),
    valide_le           TIMESTAMPTZ,
    piece_jointe_url    TEXT,
    lot_id              UUID REFERENCES lot_synchronisation(id),

    CONSTRAINT chk_affect_duree CHECK (duree_heures IS NULL
                                       OR (duree_heures >= 0 AND duree_heures <= 24))
);
CREATE INDEX idx_affect_reelle ON affectation_reelle_engin(engin_id, date_activite);
CREATE INDEX idx_affect_cc     ON affectation_reelle_engin(centre_cout_reel, date_activite);

-- =====================================================================
-- 12. AUTOMATISMES
-- =====================================================================

-- Incrémente la version d'un référentiel dès qu'il est modifié, pour que
-- le terminal sache qu'il doit rafraîchir sa copie locale (ch. 12).
CREATE OR REPLACE FUNCTION incrementer_version_referentiel()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO version_referentiel (nom_referentiel, version, maj_le)
    VALUES (TG_TABLE_NAME, 1, now())
    ON CONFLICT (nom_referentiel)
    DO UPDATE SET version = version_referentiel.version + 1, maj_le = now();
    RETURN NULL;   -- trigger AFTER ... FOR EACH STATEMENT
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_version_engin
    AFTER INSERT OR UPDATE OR DELETE ON engin
    FOR EACH STATEMENT EXECUTE FUNCTION incrementer_version_referentiel();
CREATE TRIGGER trg_version_equipement
    AFTER INSERT OR UPDATE OR DELETE ON equipement_concassage
    FOR EACH STATEMENT EXECUTE FUNCTION incrementer_version_referentiel();
CREATE TRIGGER trg_version_personnel
    AFTER INSERT OR UPDATE OR DELETE ON personnel
    FOR EACH STATEMENT EXECUTE FUNCTION incrementer_version_referentiel();
CREATE TRIGGER trg_version_produit
    AFTER INSERT OR UPDATE OR DELETE ON produit
    FOR EACH STATEMENT EXECUTE FUNCTION incrementer_version_referentiel();
CREATE TRIGGER trg_version_cause_arret
    AFTER INSERT OR UPDATE OR DELETE ON cause_arret
    FOR EACH STATEMENT EXECUTE FUNCTION incrementer_version_referentiel();
CREATE TRIGGER trg_version_site
    AFTER INSERT OR UPDATE OR DELETE ON site
    FOR EACH STATEMENT EXECUTE FUNCTION incrementer_version_referentiel();
CREATE TRIGGER trg_version_centre_de_cout
    AFTER INSERT OR UPDATE OR DELETE ON centre_de_cout
    FOR EACH STATEMENT EXECUTE FUNCTION incrementer_version_referentiel();

-- Tient à jour le dernier relevé de compteur connu de l'engin. Le relevé
-- ne peut que progresser : un événement arrivé en retard (synchronisation
-- différée) ne doit pas faire régresser le compteur courant.
CREATE OR REPLACE FUNCTION maj_compteur_engin()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.compteur IS NOT NULL THEN
        UPDATE engin
           SET compteur_actuel = NEW.compteur,
               compteur_maj_le = NEW.horodatage
         WHERE id = NEW.engin_id
           AND (compteur_maj_le IS NULL OR NEW.horodatage > compteur_maj_le);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_maj_compteur_engin
    AFTER INSERT ON evenement_engin
    FOR EACH ROW EXECUTE FUNCTION maj_compteur_engin();

-- =====================================================================
-- FIN DU SCHÉMA — les vues d'export sont dans 0002_vues_export.sql
-- =====================================================================
