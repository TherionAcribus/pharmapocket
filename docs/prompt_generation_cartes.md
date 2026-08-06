# Génération de fiches par IA — prompt et format JSON

Boucle de travail : **Admin → Import de fiches (JSON)** (`/admin/import`, staff).
La page fait les deux moitiés du travail.

1. **Générer le prompt** : on saisit l'information à faire passer, les références
   de la source et — surtout — **le contenu de la source collé**. Les quatre
   taxonomies sont injectées automatiquement depuis la base. Bouton *Copier le
   prompt* → à coller dans le LLM.
2. **Importer le JSON** : on colle la réponse, on *Vérifie* (dry-run), on crée.
   Si le modèle a proposé des catégories nouvelles, elles apparaissent dans un
   panneau **Catégories à créer** où l'on ajuste nom, slug et parent avant de les
   créer, puis on relance.

Le texte du prompt vit dans
[`frontend/src/lib/promptTemplate.ts`](../frontend/src/lib/promptTemplate.ts) —
**source unique**, pour qu'il ne diverge pas d'une copie collée ici. Le bouton
*Aperçu* de la page l'affiche en entier. Ce document décrit ce que le prompt
impose et ce que l'import vérifie.

Autres portes d'entrée pour le même import :

- `python manage.py import_cards fiches.json --dry-run` puis sans `--dry-run` ;
- `POST /api/v1/content/admin/microarticles/import/`.

L'import est **tout-ou-rien** : une seule carte en erreur annule le lot, et le
rapport liste, carte par carte, ce qu'il faut corriger. Les fiches sont créées
**en brouillon** par défaut.

---

## 1) Ce que le prompt impose au modèle

**Structure éditoriale**

- Une fiche = **une seule idée**. Plusieurs règles dans la source ⇒ plusieurs
  fiches `detail` + une fiche `recap` qui les relie.
- Le titre est une **question**, telle qu'elle se pose au comptoir.
- `answer_express` est **une phrase construite** (jamais des puces), ~350 car.,
  avec du gras sur les chiffres, âges, doses, délais et seuils.
- `key_points` (≤ 5, 90 car.) **complètent** la réponse express.
- `answer_detail` est le développement long. **Règle centrale : chaque point clé
  doit y être développé.** Un point clé qui n'est repris nulle part dans
  `answer_detail` est une information orpheline. C'est ce champ que l'API sert en
  tête de `see_more` — donc le premier texte que lit l'utilisateur qui déplie.
- `see_more` (≤ 3 blocs) est réservé à l'information *structurée* (mécanisme,
  listes, surveillance), pas à de la prose qui doublonnerait `answer_detail`.

**Exactitude**

- Rien qui ne soit dans la source. Chiffres recopiés, jamais arrondis.
- Si la source ne suffit pas, le modèle doit **réduire la portée du titre**.
- **Si le contenu de la source n'est pas collé et que le modèle n'a pas accès à
  l'URL, il doit refuser de générer** plutôt que combler de mémoire. C'est pour
  cette raison que le champ « Contenu de la source » compte plus que l'URL.
- Les remarques (ambiguïtés, catégories proposées) vont après une ligne
  `--- REMARQUES ---`, hors JSON. La page d'import extrait le tableau JSON même
  quand ces remarques suivent, ou quand la réponse est encadrée par des ```.

**Catégories**

- Les catégories existantes sont injectées dans le prompt (slug + nom, arbre
  indenté) ; le modèle doit **recopier les slugs à l'identique**.
- Quand aucune ne convient, il **doit en proposer une nouvelle**, en écrivant son
  **nom complet en français** (« Insuffisance rénale chronique »), pas un slug
  inventé, et justifier son choix dans les remarques.
- L'import refuse alors le lot **mais renvoie ces catégories dans
  `unknown_categories`** : la page les affiche avec nom, slug et parent
  éditables, et un bouton *Créer*.

---

## 2) Référence du format JSON

### Champs d'une carte

| Champ | Règle |
|---|---|
| `title` | obligatoire, question, ≤ 255 car. |
| `slug` | optionnel, dérivé du titre ; refusé s'il existe déjà |
| `card_type` | `standard` (défaut), `recap`, `detail` |
| `answer_express` | **obligatoire**, HTML, ~350 car. (au-delà : avertissement) |
| `answer_detail` | HTML long, ~2000 car. (au-delà : avertissement) |
| `key_points` | ≤ 5 items de 90 car. |
| `takeaway` | HTML, ~200 car. |
| `see_more` | ≤ 3 blocs (voir ci-dessous) |
| `sources` | **1 à 5, obligatoire** |
| `links` | ≤ 5, `title` + `url` http(s) obligatoires |
| `categories_theme` | **≥ 1 obligatoire** ; `categories_maladies`, `_medicament`, `_pharmacologie` optionnelles |
| `tags` | libres, créés à la volée |
| `questions` | `qcm` (exactement 4 propositions, bonne réponse en 1re) ou `true_false` (`correct: "true"|"false"`), `difficulty` 1–5 |
| `recap_points` | fiches `recap` uniquement ; `text` + `detail_card_slug` optionnel |
| `related_articles` | slugs |
| `subject` | `{name, slug?, label?}` — créé s'il n'existe pas |
| `cover_image_id` | id d'image Wagtail existante (jamais généré par le LLM) |

Tout champ hors de cette liste est **ignoré avec un avertissement** — c'est le
signal le plus utile quand le modèle invente un champ.

### Blocs `see_more`

`detail` (HTML) · `mechanism_3_steps` (`target` 120, `action` 180,
`consequence` 180) · `indications` / `adverse_effects` (1–8 items de 120 car.) ·
`warnings` / `interactions` (1–8 items de 140 car.) · `monitoring`
(`what` 140, `why` 200) · `references` (1–8 références) · `final_summary`
(≤ 220 car.) · `image` (`image_id` + `caption`).

Un type inconnu est refusé, avec la liste des types acceptés dans le message.

### Ce que l'import résout tout seul

| Élément | Règle |
|---|---|
| `slug` | dérivé du titre si absent ; refusé s'il existe déjà |
| Sources | retrouvées par `url` puis par `name` (+ `publisher`) ; **créées** si inconnues |
| Catégories | retrouvées par slug, par nom (accents/casse ignorés) ou par chemin `parent/enfant` ; **jamais créées en silence** — elles remontent dans `unknown_categories` |
| Tags | créés à la volée |
| `detail_card_slug`, `related_articles` | cherchés d'abord dans le lot en cours, puis en base |
| `subject` | retrouvé par slug, **créé** s'il n'existe pas ; la fiche est ajoutée en fin de liste |
| Questions | une question de même énoncé et de même type est réutilisée |
| Rich text | nettoyé (seules les balises autorisées survivent) |

### Ce qui reste manuel

- **Les images** : `cover_image_id` et le bloc `see_more.image` acceptent un id
  d'image Wagtail existante, à renseigner après coup.
- **Le rattachement aux packs** : **Admin → Packs**, l'ajout en masse accepte une
  liste de slugs — ceux que l'import vient de retourner.
- **La publication** : brouillon par défaut ; « Publier directement » (ou
  `--publish`) seulement pour du contenu relu.
- **Le renommage / déplacement d'une catégorie existante** : dans Wagtail
  (`/cms/`), snippets de catégories. La page d'import ne fait que *créer*.

### Exemple — un sujet en trois fiches

```json
[
  {
    "title": "Quel délai entre le test de grossesse et la délivrance d'isotrétinoïne ?",
    "card_type": "detail",
    "answer_express": "<p>La délivrance doit intervenir dans les <b>7 jours</b> suivant la prescription, elle-même conditionnée à un test de grossesse négatif.</p>",
    "key_points": ["Délai de 7 jours non prolongeable", "Test à refaire si le délai est dépassé"],
    "answer_detail": "<p>Le délai de <b>7 jours</b> court à compter de la date de prescription : au-delà, l'ordonnance ne peut plus être exécutée pour ce médicament.</p><p>Si le délai est dépassé, la patiente doit refaire un test de grossesse et obtenir une nouvelle prescription : le test initial n'est plus considéré comme contemporain de la délivrance.</p>",
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

---

## 3) Boucle de travail

1. `/admin/import` → remplir information + source (**contenu collé**) → *Copier le prompt*.
2. Coller dans le LLM, récupérer la réponse.
3. Coller la réponse → *Vérifier (sans écrire)*.
4. Créer les catégories proposées si elles tiennent la route, corriger le JSON
   sinon — les messages d'erreur sont rédigés pour être **recollés tels quels**
   dans la conversation avec le modèle.
5. *Importer* en brouillon, relire dans Wagtail (`/cms/`), ajouter une image,
   publier.
6. Rattacher les fiches à un pack depuis **Admin → Packs** via leurs slugs.
