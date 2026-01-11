Pharma Microlearning — Guide de dev pour l’IA de l’IDE
Objectif produit

Construire une UI de microlearning ultra rapide à consommer, mais crédible et immédiatement approfondissable.

Chaque carte doit :

Donner une réponse ultra courte lisible en 2 secondes (format phrase construite).

Montrer dès l’écran initial qu’il existe du contenu plus complet (aperçu + signal visuel).

Permettre d’ouvrir les détails par glisser vers le haut (bottom sheet), et de refermer facilement.

Le problème actuel à éviter : “la carte semble vide” → on doit ajouter de la structure visuelle.

Spécification UI — MicroCard + Bottom Sheet
1) Écran principal (carte au repos)

Structure verticale (haut → bas)

A. En-tête

Titre = question (H1/H2 selon page).

Chips (catégorie / tag) + date (“Mis à jour le …”).

Objectif : donner du “poids” et de la crédibilité en 1 ligne.

B. Zone “Réponse courte” (toujours prioritaire)

Afficher une phrase construite, pas des bullets.

Typo plus grande, contraste fort.

On utilise toujours le RichText pour marqué les mots importants.

Exemples de mise en valeur : 65 ans et plus, ≥ 18 ans, 2 doses, 2–6 mois.

C. Zone “Aperçu du contenu long” (teaser contrôlé)

Typo plus petite, contraste plus faible.

Ajouter un fade en bas (dégradé vers transparent) sur le bas de la page pour suggérer “ça continue”.

Ajouter un signal clair : Glisser pour détails & sources + chevron/handle.

D. CTA bas (optionnel mais recommandé)

Bouton pleine largeur : Voir détails & sources

Le geste swipe doit fonctionner même sans cliquer.

✅ Critère d’acceptation : même si la réponse courte est très brève, l’utilisateur voit qu’il y a plus (teaser + fade + handle).

2) Bottom sheet “Détails & sources”

Comportement

Ouvre par : swipe up sur le handle / clic sur CTA.

Se referme par : swipe down / bouton “X”.

Snap points recommandés (mobile) :

peek ~ 35% (facultatif)

half ~ 60%

full ~ 90%

Le contenu dans la sheet doit être scrollable sans conflit avec le drag.

Contenu

Titre : Détails & sources

Sous-titre : la question

Section “Contenu long” :

Éviter un gros paragraphe unique.

Découper en sous-sections sobres (même si on garde des phrases) :

Contexte

Schéma

Durée de protection

Prise en charge

Section “Sources” :

Afficher une liste de références avec : titre, organisme, date, lien.

Badge “Crédibilité / Publié le …” si dispo.

✅ Critère d’acceptation : le contenu long est lisible (scan rapide), sans transformer la carte en article dense.

Données (modèle attendu côté front)

Adapter aux vrais champs, mais garder cette logique.

type MicroCard = {
  id: string;
  question: string;          // "Qui doit bénéficier du vaccin contre le zona ?"
  short_answer: string;      // phrase construite
  long_content?: string;     // texte plus complet
  sources?: Array<{
    title: string;
    publisher?: string;      // ex: "HAS"
    date?: string;           // ISO ou texte
    url?: string;
  }>;
  updated_at?: string;       // date affichable
  credibility?: {
    published_at?: string;
  };
  tags?: string[];
};

Règles de typographie & rendu (important)

La réponse courte reste une phrase construite (choix produit).

On rend cette phrase “scannable” via :

gras sur chiffres/âges/doses

ponctuation segmentante (; ou —) si nécessaire

Le teaser long est tronqué à 2–3 lignes (line-clamp) + fade.

Dans le détail, on autorise :

paragraphes courts

mini-intertitres

listes si le contenu devient trop compact (mais ne pas convertir le résumé en bullets).

Accessibilité (minimum)

La sheet se comporte comme un dialog :

aria-modal="true"

focus trap dans la sheet

fermeture via Esc (desktop)

Le handle et le bouton ont des labels accessibles.

Le contraste de la réponse courte doit rester très lisible.

Implémentation — principes techniques

Réutiliser les patterns UI déjà présents (design system, composants existants).

Ne pas ajouter de dépendances lourdes.

Si une lib bottom-sheet existe déjà dans le projet, l’utiliser.

Sinon :

solution simple : composant BottomSheet maison avec position: fixed, overlay, drag (si déjà Framer Motion)

ou lib légère (à justifier) si elle simplifie nettement (ex: wrapper Radix/Drawer)

Composants recommandés

MicroCardView : affiche question + short + teaser + CTA

MicroCardDetailsSheet : bottom sheet + détails + sources

useBottomSheet() : état open/close + snap point (optionnel)

États

isOpen (sheet)

snap (peek/half/full) (optionnel)

isDragging (si nécessaire pour éviter scroll conflict)

Style / Layout (anti “carte vide”)

Conserver une vraie “carte” visuelle :

fond légèrement distinct du background

padding généreux

coins arrondis

ombre douce (ou bordure fine)

Layout “haut/centre/bas” :

si l’écran est grand, éviter le vide en ajoutant des sections (tags/badge/CTA)

ne pas agrandir artificiellement le texte long

✅ Check : sur un écran mobile, la carte au repos doit paraître “habitée” même avec 1 phrase.

Tests (à minima)

Test UI : “le teaser long apparaît et est éventuellement tronqué”.

Test interaction : ouvrir/fermer la sheet (tap + swipe si possible).

Test accessibilité : focus dans la sheet + fermeture.

Ce que l’IA ne doit PAS faire

❌ Transformer la réponse courte en bullets (on garde une phrase construite).

❌ Afficher tout le contenu long sur l’écran principal (sinon on perd le microlearning).

❌ Laisser un écran quasi vide sous 2 lignes : toujours teaser + signal.

❌ Cacher l’accès au long derrière un bouton discret sans indication visuelle.

Définition du “Done”

La carte affiche : question + phrase courte mise en valeur + teaser long tronqué + signal “glisser”.

Le bottom sheet s’ouvre et se ferme proprement.

Les sources sont visibles dans la sheet.

L’ensemble paraît sérieux et dense, sans être bavard.