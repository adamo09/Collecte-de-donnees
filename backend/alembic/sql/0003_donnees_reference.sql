-- =====================================================================
-- CADERAC — Données de référence
--
-- Uniquement les nomenclatures fixes issues du document de modélisation.
-- Les référentiels à fort contenu (engins, équipements, personnel,
-- produits) relèvent d'un inventaire physique à mener sur chaque site
-- (ch. 4) : ils sont chargés par import, pas par migration.
-- =====================================================================

INSERT INTO site (code, libelle) VALUES
    ('KOS', 'Kossihouen (Abidjan)'),
    ('BKE', 'Bouaké'),
    ('ABO', 'Aboisso'),
    ('LDB', 'Laoudi Ba')
ON CONFLICT (code) DO NOTHING;

INSERT INTO centre_de_cout (code, libelle) VALUES
    ('CP01', 'Foration'),
    ('CP02', 'Minage'),
    ('CP03', 'Marinage'),
    ('CP04', 'Concassage primaire'),
    ('CP05', 'Concassage secondaire'),
    ('CP06', 'Concassage tertiaire'),
    ('CP07', 'Concassage quaternaire'),
    ('CP09', 'Stockage / Vente')
ON CONFLICT (code) DO NOTHING;

-- Nomenclature codifiée des motifs d'arrêt et de panne (ch. 4.4).
-- Liste fermée mais enrichissable sans migration de schéma.
INSERT INTO cause_arret (code, libelle, categorie) VALUES
    ('PANNE_MEC',  'Panne mécanique',                  'technique'),
    ('PANNE_HYD',  'Panne hydraulique',                'technique'),
    ('PANNE_ELEC', 'Panne électrique',                 'technique'),
    ('PANNE_PNEU', 'Crevaison / pneumatique',          'technique'),
    ('ENTRETIEN',  'Entretien programmé',              'technique'),
    ('CARBURANT',  'Attente carburant',                'organisationnel'),
    ('ATT_CHARG',  'Attente chargement ou engin',      'organisationnel'),
    ('ATT_PIECE',  'Attente pièce de rechange',        'organisationnel'),
    ('ATT_OPER',   'Absence d''opérateur',             'organisationnel'),
    ('PAUSE',      'Pause équipe / relève de poste',   'organisationnel'),
    ('METEO',      'Intempéries',                      'externe'),
    ('COUP_ELEC',  'Coupure du réseau électrique',     'externe'),
    ('TIR',        'Arrêt pour tir de mine',           'externe'),
    ('AUTRE',      'Autre (préciser en commentaire)',  'externe')
ON CONFLICT (code) DO NOTHING;

-- Amorce des compteurs de version, pour les référentiels qu'aucune
-- insertion initiale n'a encore déclenchés.
INSERT INTO version_referentiel (nom_referentiel) VALUES
    ('engin'), ('equipement_concassage'), ('personnel'), ('produit')
ON CONFLICT (nom_referentiel) DO NOTHING;
