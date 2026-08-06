# Génération de fiches par IA — prompt et format JSON

Ce document contient deux choses :

1. **le prompt** à donner au LLM (§1), avec les emplacements à remplir ;
2. **la référence du format JSON** (§2), qui est le contrat exact vérifié à
   l'import — utile pour comprendre un message d'erreur.

L'import se fait :

- dans l'app : **Admin → Import de fiches (JSON)** (`/admin/import`, staff uniquement) ;
- en ligne de commande : `python manage.py import_cards fiches.json --dry-run` puis sans `--dry-run` ;
- via l'API : `POST /api/v1/content/admin/microarticles/import/`.

L'import est **tout-ou-rien** : une seule carte en erreur annule le lot entier,
et le rapport liste, carte par carte, ce qu'il faut corriger. Les fiches sont
créées **en brouillon** par défaut (relecture dans Wagtail avant publication).

---

## 1) Le prompt

> Copier tout le bloc ci-dessous, puis remplir les trois sections en fin de prompt.

````text
# Rôle

Tu es rédacteur pédagogique pour PharmaPocket, une application de microlearning
en pharmacologie destinée aux pharmaciens et préparateurs francophones. Tu
produis des « fiches » (cartes) courtes, exactes et immédiatement actionnables au
comptoir.

Ta sortie est **uniquement** un tableau JSON valide, sans commentaire, sans texte
avant ou après, sans bloc de code markdown.

# Principe éditorial

Une fiche = **une seule idée**. Si l'information fournie contient plusieurs
règles indépendantes (ex : prescripteur, délai, test de grossesse, carnet), tu
produis **plusieurs fiches détails** + éventuellement **une fiche récap** qui les
relie, plutôt qu'une fiche dense.

La lecture se fait en deux niveaux :

- **Niveau 1 (la carte)** : le titre-question, la réponse express, les points
  clés, le « à retenir ». Doit être lisible en quelques secondes.
- **Niveau 2 (« voir plus »)** : au maximum 3 blocs structurés, consultés
  seulement si l'utilisateur veut approfondir.

# Règles de contenu

1. **Titre** : une vraie question, telle que l'utilisateur se la pose au
   comptoir. Ex : « Quand contrôler la kaliémie après instauration d'un IEC ? ».
   Pas de titre-étiquette (« Kaliémie et IEC »). 255 caractères max.
2. **Réponse express** (`answer_express`, obligatoire) : **une phrase
   construite**, jamais une liste à puces. Environ 350 caractères. Elle répond
   *complètement* à la question du titre : lue seule, elle suffit.
   Mets en `<b>` les éléments décisifs — chiffres, âges, doses, délais, seuils
   (ex : `<b>7 à 14 jours</b>`, `<b>65 ans et plus</b>`, `<b>≥ 30 mL/min</b>`).
   HTML autorisé : `<p> <b> <strong> <i> <em> <ul> <ol> <li> <a href>`. Rien d'autre.
3. **Points clés** (`key_points`, 0 à 5) : phrases nominales courtes, 90
   caractères max, qui **complètent** la réponse express au lieu de la répéter.
4. **À retenir** (`takeaway`, optionnel) : une phrase de synthèse, ~140
   caractères, l'idée que l'utilisateur doit garder une semaine plus tard.
5. **Voir plus** (`see_more`, 0 à 3 blocs) : ne le remplis que si la source
   apporte réellement de la matière. Choisis les blocs pertinents parmi ceux
   listés au format ; ne crée jamais un type de bloc qui n'y figure pas.
6. **Sources** (`sources`, 1 à 5, obligatoire) : uniquement celles que je te
   fournis. Reprends leur intitulé, leur éditeur et leur date tels quels.
7. **Questions** (`questions`, 0 à 3) : QCM ou vrai/faux portant sur le point
   *décisif* de la fiche, pas sur un détail anecdotique. Pour un QCM, la **bonne
   réponse est toujours en première position** (l'application mélange les
   propositions à l'affichage) et les 3 distracteurs doivent être plausibles.
8. **Catégories** : choisis-les **exclusivement** dans les listes que je te
   fournis plus bas, en recopiant les slugs à l'identique. `categories_theme`
   est obligatoire (au moins une). N'invente jamais une catégorie ; si aucune ne
   convient, mets-en une seule, la plus proche, et signale-le en fin de réponse
   dans un commentaire **hors JSON** que je supprimerai.
9. **Tags** (0 à 6) : mots-clés transversaux en minuscules, sans accent inutile
   (ex : `iec`, `grossesse`, `dispensation`).

# Règles d'exactitude — non négociables

- **N'écris rien qui ne soit pas dans la source fournie.** Pas de complément
  « de culture générale », pas d'ordre de grandeur reconstitué de mémoire.
- Si la source ne permet pas de répondre complètement à la question, **réduis la
  portée du titre** pour qu'il corresponde à ce que la source établit vraiment.
- Chiffres, doses, délais et seuils sont recopiés de la source, jamais arrondis
  ni convertis.
- Si la source est datée ou si la règle a une date d'application, mets-le dans la
  fiche (réponse express ou bloc `detail`).
- Pas de conseil personnalisé au patient, pas de posologie hors de ce que dit la
  source, pas de mention commerciale.
- En cas de doute entre deux lectures de la source, choisis la formulation la
  plus prudente et signale l'ambiguïté hors JSON.

# Fiches récap et détails

- Fiche `detail` : **une** règle, une décision, un point actionnable.
- Fiche `recap` : vue d'ensemble d'un sujet. Sa réponse express résume la
  démarche, et `recap_points` liste les points, chacun pointant vers le `slug`
  d'une fiche détail du même lot.
- Dans le tableau JSON, **place toujours les fiches `detail` avant la fiche
  `recap`** qui les référence.
- Quand plusieurs fiches forment un sujet, donne-leur le même objet `subject`.
- Une fiche isolée est de type `standard`.

# Format de sortie

Un tableau JSON de cartes. Chaque carte :

```json
{
  "title": "string, obligatoire, question, ≤ 255 car.",
  "slug": "string, optionnel (dérivé du titre par défaut)",
  "card_type": "standard | recap | detail (défaut: standard)",
  "answer_express": "string HTML, obligatoire, ~350 car., phrase construite",
  "key_points": ["string ≤ 90 car.", "… 5 max"],
  "takeaway": "string HTML, ~140 car.",
  "see_more": [
    { "type": "detail", "value": "<p>HTML, 2 à 8 lignes</p>" },
    { "type": "mechanism_3_steps", "value": { "target": "≤120", "action": "≤180", "consequence": "≤180" } },
    { "type": "indications", "value": ["≤120 car.", "1 à 8 items"] },
    { "type": "adverse_effects", "value": ["≤120 car.", "1 à 8 items"] },
    { "type": "warnings", "value": ["≤140 car.", "1 à 8 items"] },
    { "type": "interactions", "value": ["≤140 car.", "1 à 8 items"] },
    { "type": "monitoring", "value": { "what": "≤140", "why": "≤200" } },
    { "type": "final_summary", "value": "une phrase, ≤ 220 car." }
  ],
  "sources": [
    {
      "source": {
        "name": "titre du document",
        "kind": "press | institutional | book | article | thesis | lab_information | other",
        "url": "https://…",
        "publisher": "HAS, ANSM, éditeur…",
        "author": "",
        "publication_date": "AAAA-MM-JJ",
        "accessed_date": "AAAA-MM-JJ"
      },
      "note": "citation courte ou contexte (optionnel)",
      "page": "page/chapitre (optionnel)"
    }
  ],
  "links": [{ "title": "…", "url": "https://…", "type": "", "source": "", "date": "AAAA-MM-JJ" }],
  "categories_theme": ["slug"],
  "categories_maladies": ["slug"],
  "categories_medicament": ["slug"],
  "categories_pharmacologie": ["slug"],
  "tags": ["mot-cle"],
  "questions": [
    {
      "type": "qcm",
      "prompt": "≤ 500 car.",
      "answers": ["BONNE RÉPONSE", "distracteur", "distracteur", "distracteur"],
      "explanation": "correction courte",
      "difficulty": 3
    },
    {
      "type": "true_false",
      "prompt": "≤ 500 car.",
      "correct": "true",
      "explanation": "correction courte",
      "difficulty": 2
    }
  ],
  "recap_points": [{ "text": "≤ 200 car.", "detail_card_slug": "slug-d-une-fiche-detail" }],
  "related_articles": ["slug-d-une-autre-fiche"],
  "subject": { "name": "Nom du sujet", "label": "libellé court de cette fiche dans le sujet" }
}
```

Contraintes bloquantes à l'import : `see_more` **≤ 3 blocs**, `sources` **≥ 1 et
≤ 5**, `links` ≤ 5, `key_points` ≤ 5, `categories_theme` ≥ 1, un QCM a
**exactement 4 propositions**. N'ajoute aucun champ hors de cette liste.

# Auto-vérification avant de répondre

Relis ta sortie et corrige-la si l'une de ces réponses est « non » :

- [ ] Chaque affirmation est-elle littéralement soutenue par la source fournie ?
- [ ] La réponse express répond-elle seule à la question du titre ?
- [ ] Est-ce bien une phrase construite (aucune puce, aucun tiret de liste) ?
- [ ] Chaque fiche ne porte-t-elle qu'une seule idée ?
- [ ] Les slugs de catégories sont-ils copiés à l'identique de mes listes ?
- [ ] Le JSON est-il valide et sans champ inventé ?
- [ ] Les bonnes réponses des QCM sont-elles en première position ?

---

# CATÉGORIES DISPONIBLES

categories_theme (obligatoire) :
<!-- coller ici la liste des slugs disponibles -->

categories_maladies :
<!-- … -->

categories_medicament :
<!-- … -->

categories_pharmacologie :
<!-- … -->

# SOURCE

<!-- coller ici le texte de la source, avec ses références bibliographiques :
     titre, éditeur/organisme, date de publication, URL -->

# INFORMATION À FAIRE PASSER

<!-- décrire en une ou deux phrases ce que l'utilisateur doit retenir,
     et le nombre de fiches souhaité si tu as une idée précise -->
````

### Récupérer les listes de catégories

Les slugs à coller dans le prompt viennent de l'API publique :

```
GET /api/v1/taxonomies/theme/tree/
GET /api/v1/taxonomies/maladies/tree/
GET /api/v1/taxonomies/medicament/tree/
GET /api/v1/taxonomies/pharmacologie/tree/
```

L'import refuse toute catégorie inconnue (il ne la crée pas : l'arbre de
taxonomie se gère dans Wagtail).

---

## 2) Référence du format

### Ce que l'import résout tout seul

| Élément | Règle |
|---|---|
| `slug` | dérivé du titre si absent ; refusé s'il existe déjà (change le titre ou fournis un `slug` explicite) |
| Sources | retrouvées par `url` puis par `name` (+ `publisher`) ; **créées** si inconnues |
| Catégories | retrouvées par slug, par nom (accents/casse ignorés) ou par chemin `parent/enfant` ; **jamais créées** |
| Tags | créés à la volée |
| `detail_card_slug`, `related_articles` | cherchés d'abord dans le lot en cours, puis en base |
| `subject` | retrouvé par slug, **créé** s'il n'existe pas ; la fiche y est ajoutée en fin de liste |
| Questions | une question de même énoncé et de même type est réutilisée au lieu d'être dupliquée |
| Rich text | nettoyé (seules les balises autorisées survivent) |

### Ce que l'import refuse

Longueurs et cardinalités listées ci-dessus, type de bloc `see_more` inconnu,
catégorie inconnue, `categories_theme` vide, aucune source, slug déjà pris, QCM
sans 4 propositions, vrai/faux sans bonne réponse, date mal formée, champ
racine inconnu (celui-là est un simple avertissement : le champ est ignoré).

### Ce qui n'est pas dans le format

- **Les images** : elles ne peuvent pas être générées. `cover_image_id` et le
  bloc `see_more.image` acceptent un identifiant d'image Wagtail existant, à
  renseigner à la main après coup.
- **Le rattachement aux packs** : il se fait dans **Admin → Packs**, où l'ajout
  en masse accepte une liste de slugs — ceux que l'import vient de retourner.
- **La publication** : par défaut les fiches arrivent en brouillon. Coche
  « Publier directement » (ou `--publish`) seulement pour du contenu relu.

### Exemple complet — un sujet en trois fiches

```json
[
  {
    "title": "Quel délai entre le test de grossesse et la délivrance d'isotrétinoïne ?",
    "card_type": "detail",
    "answer_express": "<p>La délivrance doit intervenir dans les <b>7 jours</b> suivant la prescription, elle-même conditionnée à un test de grossesse négatif.</p>",
    "key_points": ["Délai de 7 jours non prolongeable", "Test à refaire si le délai est dépassé"],
    "takeaway": "<p>Au-delà de <b>7 jours</b>, la patiente repasse par la case prescription.</p>",
    "categories_theme": ["dispensation"],
    "categories_medicament": ["retinoides"],
    "tags": ["isotretinoine", "grossesse"],
    "sources": [
      {
        "source": {
          "name": "Isotrétinoïne orale : conditions de prescription et de délivrance",
          "kind": "institutional",
          "publisher": "ANSM",
          "url": "https://ansm.sante.fr/…",
          "publication_date": "2024-01-15"
        }
      }
    ],
    "questions": [
      {
        "type": "qcm",
        "prompt": "Quel est le délai maximal entre prescription et délivrance d'isotrétinoïne chez une femme en âge de procréer ?",
        "answers": ["7 jours", "24 heures", "1 mois", "3 mois"],
        "explanation": "Au-delà de 7 jours, la prescription n'est plus valable.",
        "difficulty": 2
      }
    ],
    "subject": { "name": "Délivrance isotrétinoïne", "label": "Délai de délivrance" }
  },
  {
    "title": "Qui peut initier un traitement par isotrétinoïne orale ?",
    "card_type": "detail",
    "answer_express": "<p>L'initiation est réservée aux <b>dermatologues</b> ; le renouvellement peut ensuite être assuré par tout prescripteur.</p>",
    "categories_theme": ["dispensation"],
    "sources": [
      {
        "source": {
          "name": "Isotrétinoïne orale : conditions de prescription et de délivrance",
          "kind": "institutional",
          "publisher": "ANSM",
          "url": "https://ansm.sante.fr/…",
          "publication_date": "2024-01-15"
        }
      }
    ],
    "subject": { "name": "Délivrance isotrétinoïne", "label": "Prescripteur" }
  },
  {
    "title": "Que vérifier avant de délivrer de l'isotrétinoïne ?",
    "card_type": "recap",
    "answer_express": "<p>Trois vérifications conditionnent la délivrance : le <b>prescripteur</b>, le <b>test de grossesse</b> et le <b>délai de 7 jours</b>.</p>",
    "categories_theme": ["dispensation"],
    "sources": [
      {
        "source": {
          "name": "Isotrétinoïne orale : conditions de prescription et de délivrance",
          "kind": "institutional",
          "publisher": "ANSM",
          "url": "https://ansm.sante.fr/…",
          "publication_date": "2024-01-15"
        }
      }
    ],
    "recap_points": [
      { "text": "Prescripteur habilité", "detail_card_slug": "qui-peut-initier-un-traitement-par-isotretinoine-orale" },
      { "text": "Délai de délivrance", "detail_card_slug": "quel-delai-entre-le-test-de-grossesse-et-la-delivrance-disotretinoine" }
    ],
    "subject": { "name": "Délivrance isotrétinoïne", "label": "Vue d'ensemble" }
  }
]
```

### Boucle de travail conseillée

1. Générer le JSON avec le prompt, source + information en pièces jointes.
2. Le coller dans **Admin → Import de fiches** et cliquer **Vérifier (sans écrire)**.
3. Renvoyer les messages d'erreur au LLM tels quels — ils sont rédigés pour être
   recollés dans la conversation.
4. **Importer** en brouillon, relire dans Wagtail (`/cms/`), ajouter une image si
   besoin, puis publier.
5. Rattacher les fiches à un pack depuis **Admin → Packs** via leurs slugs.
