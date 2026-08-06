/**
 * Prompt de génération de fiches, assemblé avec les taxonomies réelles.
 *
 * Le texte de référence est documenté dans `docs/prompt_generation_cartes.md` ;
 * cette version-ci est celle que produit le back-office, avec les listes de
 * catégories et la source déjà injectées. Les règles éditoriales doivent rester
 * alignées sur les garde-fous de `content/importers.py` — c'est lui qui refuse.
 */

import type { TaxonomyNode } from "@/lib/types";

export type PromptSource = {
  name: string;
  publisher: string;
  url: string;
  publicationDate: string;
  content: string;
};

export type PromptTaxonomies = {
  theme: TaxonomyNode[];
  maladies: TaxonomyNode[];
  medicament: TaxonomyNode[];
  pharmacologie: TaxonomyNode[];
};

export type PromptInput = {
  information: string;
  cardCount: string;
  source: PromptSource;
  taxonomies: PromptTaxonomies;
  tags: string[];
};

/** Aplatit l'arbre en lignes indentées « slug — Nom », lisibles par le LLM. */
function formatTree(nodes: TaxonomyNode[], depth = 0): string[] {
  const lines: string[] = [];
  for (const node of nodes) {
    lines.push(`${"  ".repeat(depth)}- ${node.slug} — ${node.name}`);
    if (node.children?.length) lines.push(...formatTree(node.children, depth + 1));
  }
  return lines;
}

function taxonomySection(label: string, nodes: TaxonomyNode[]): string {
  const lines = formatTree(nodes);
  if (!lines.length) return `${label} :\n(aucune catégorie existante — propose des noms)`;
  return `${label} :\n${lines.join("\n")}`;
}

function sourceSection(source: PromptSource): string {
  const meta = [
    source.name ? `Intitulé : ${source.name}` : null,
    source.publisher ? `Éditeur / organisme : ${source.publisher}` : null,
    source.publicationDate ? `Date de publication : ${source.publicationDate}` : null,
    source.url ? `URL : ${source.url}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const content = source.content.trim();

  // Sans contenu collé, le LLM n'a probablement pas accès à l'URL : la consigne
  // doit alors être de refuser plutôt que de combler de mémoire.
  const body = content
    ? `\n\nContenu de la source (fais foi) :\n"""\n${content}\n"""`
    : `\n\nLe contenu de la source n'est PAS fourni ici. Si tu n'as pas accès à l'URL
ci-dessus, ne génère aucune fiche : réponds uniquement « Je n'ai pas accès à la
source, merci de coller son contenu. »`;

  return `${meta || "(source non renseignée)"}${body}`;
}

export function buildCardPrompt(input: PromptInput): string {
  const { source, taxonomies } = input;
  const countRule = input.cardCount.trim()
    ? `Produis ${input.cardCount.trim()}.`
    : "Choisis toi-même le nombre de fiches, selon le nombre d'idées distinctes que porte la source.";

  return `# Rôle

Tu es rédacteur pédagogique pour PharmaPocket, une application de microlearning en
pharmacologie destinée aux pharmaciens et préparateurs francophones. Tu produis des
« fiches » (cartes) courtes, exactes et immédiatement actionnables au comptoir.

Ta sortie est **uniquement** un tableau JSON valide : pas de texte avant, pas de bloc
de code markdown. Les seules remarques admises (catégories proposées, ambiguïté de la
source) se placent APRÈS le JSON, précédées de la ligne \`--- REMARQUES ---\`.

# Principe éditorial

Une fiche = **une seule idée**. Si la source contient plusieurs règles indépendantes
(ex : prescripteur, délai, test de grossesse, carnet), produis **plusieurs fiches
détails** + éventuellement **une fiche récap** qui les relie, plutôt qu'une fiche dense.

${countRule}

La lecture se fait en deux niveaux :

- **Niveau 1 (la carte)** : titre-question, réponse express, points clés, « à retenir ».
  Lisible en quelques secondes.
- **Niveau 2 (déplié)** : le développement long (\`answer_detail\`) puis au maximum
  3 blocs structurés (\`see_more\`), lus seulement si l'utilisateur veut approfondir.

# Règles de contenu

1. **Titre** : une vraie question, telle qu'elle se pose au comptoir. Ex : « Quand
   contrôler la kaliémie après instauration d'un IEC ? ». Pas de titre-étiquette
   (« Kaliémie et IEC »). 255 caractères max.
2. **Réponse express** (\`answer_express\`, obligatoire) : **une phrase construite**,
   jamais une liste à puces. Environ 350 caractères. Elle répond *complètement* à la
   question du titre : lue seule, elle suffit. Mets en \`<b>\` les éléments décisifs —
   chiffres, âges, doses, délais, seuils (ex : \`<b>7 à 14 jours</b>\`).
   HTML autorisé : \`<p> <b> <strong> <i> <em> <ul> <ol> <li> <a href>\`. Rien d'autre.
3. **Points clés** (\`key_points\`, 0 à 5) : phrases nominales courtes, 90 caractères
   max, qui **complètent** la réponse express au lieu de la répéter.
4. **Développement** (\`answer_detail\`, fortement recommandé) : le texte long de la
   fiche, 2 à 5 courts paragraphes \`<p>\`. **Règle impérative : chaque point clé doit
   y être développé et explicité.** Un point clé qui n'est repris nulle part dans
   \`answer_detail\` est une information orpheline — soit tu le développes, soit tu le
   supprimes. Tu peux y ajouter le contexte, les exceptions et les cas limites que la
   source documente. Reste factuel et sourcé.
5. **À retenir** (\`takeaway\`, optionnel) : une phrase de synthèse, ~140 caractères,
   l'idée à garder une semaine plus tard.
6. **Voir plus** (\`see_more\`, 0 à 3 blocs) : uniquement pour de l'information
   *structurée* (mécanisme, listes d'indications, surveillance…). N'y remets pas en
   prose ce que dit déjà \`answer_detail\`. Ne crée jamais un type de bloc absent de la
   liste du format.
7. **Sources** (\`sources\`, 1 à 5, obligatoire) : uniquement celle(s) fournie(s)
   ci-dessous. Reprends intitulé, éditeur et date tels quels.
8. **Questions** (\`questions\`, 0 à 3) : QCM ou vrai/faux portant sur le point
   *décisif* de la fiche. Pour un QCM, la **bonne réponse est toujours en première
   position** (l'application mélange les propositions) et les 3 distracteurs doivent
   être plausibles.
9. **Tags** (0 à 6) : mots-clés transversaux en minuscules, sans accent. Le
   vocabulaire déjà utilisé est listé plus bas : **réutilise-le en priorité, à
   l'identique**. N'invente un tag que si aucun existant ne recouvre l'idée — un
   quasi-doublon (\`iec\` / \`inhibiteur-ec\`) casse le filtrage par facettes.

# Catégories

Les catégories existantes sont listées plus bas. Règles :

- Quand une catégorie existante convient, **recopie son slug à l'identique**.
- \`categories_theme\` est obligatoire (au moins une).
- **Si aucune catégorie existante ne convient, tu dois en proposer une nouvelle** :
  écris alors son **nom complet en français** (« Insuffisance rénale chronique »),
  pas un slug inventé. Elle me sera présentée pour validation avant création.
- Propose une nouvelle catégorie quand elle apporte un axe de recherche réel, pas
  pour un cas isolé. Liste tes propositions et leur justification (une ligne chacune)
  après la balise \`--- REMARQUES ---\`.

# Règles d'exactitude — non négociables

- **N'écris rien qui ne soit pas dans la source fournie.** Pas de complément « de
  culture générale », pas d'ordre de grandeur reconstitué de mémoire.
- Si la source ne permet pas de répondre complètement à la question, **réduis la
  portée du titre** pour qu'il corresponde à ce que la source établit vraiment.
- Chiffres, doses, délais et seuils sont recopiés de la source, jamais arrondis.
- Si la règle a une date d'application, mets-la dans la fiche.
- Pas de conseil personnalisé au patient, pas de posologie hors source, pas de
  mention commerciale.
- En cas de doute entre deux lectures de la source, choisis la formulation la plus
  prudente et signale l'ambiguïté après \`--- REMARQUES ---\`.

# Fiches récap et détails

- Fiche \`detail\` : **une** règle, une décision, un point actionnable.
- Fiche \`recap\` : vue d'ensemble d'un sujet ; \`recap_points\` liste les points,
  chacun pointant vers le \`slug\` d'une fiche détail du même lot.
- Dans le tableau, **place les fiches \`detail\` avant la fiche \`recap\`**.
- Quand plusieurs fiches forment un sujet, donne-leur le même objet \`subject\`.
- Une fiche isolée est de type \`standard\`.

# Format de sortie

Un tableau JSON de cartes. Chaque carte :

{
  "title": "string, obligatoire, question, <= 255 car.",
  "slug": "string, optionnel (dérivé du titre par défaut)",
  "card_type": "standard | recap | detail (défaut: standard)",
  "answer_express": "string HTML, obligatoire, ~350 car., phrase construite",
  "answer_detail": "string HTML, 2 à 5 <p>, développe chaque point clé",
  "key_points": ["string <= 90 car.", "… 5 max"],
  "takeaway": "string HTML, ~140 car.",
  "see_more": [
    { "type": "detail", "value": "<p>HTML structuré</p>" },
    { "type": "mechanism_3_steps", "value": { "target": "<=120", "action": "<=180", "consequence": "<=180" } },
    { "type": "indications", "value": ["<=120 car.", "1 à 8 items"] },
    { "type": "adverse_effects", "value": ["<=120 car.", "1 à 8 items"] },
    { "type": "warnings", "value": ["<=140 car.", "1 à 8 items"] },
    { "type": "interactions", "value": ["<=140 car.", "1 à 8 items"] },
    { "type": "monitoring", "value": { "what": "<=140", "why": "<=200" } },
    { "type": "final_summary", "value": "une phrase, <= 220 car." }
  ],
  "sources": [
    {
      "source": {
        "name": "titre du document",
        "kind": "press | institutional | book | article | thesis | lab_information | other",
        "url": "https://…",
        "publisher": "HAS, ANSM, éditeur…",
        "author": "",
        "publication_date": "AAAA-MM-JJ"
      },
      "note": "citation courte ou contexte (optionnel)",
      "page": "page/chapitre (optionnel)"
    }
  ],
  "links": [{ "title": "…", "url": "https://…", "type": "", "source": "", "date": "AAAA-MM-JJ" }],
  "categories_theme": ["slug-existant-ou-Nom proposé"],
  "categories_maladies": [],
  "categories_medicament": [],
  "categories_pharmacologie": [],
  "tags": ["mot-cle"],
  "questions": [
    {
      "type": "qcm",
      "prompt": "<= 500 car.",
      "answers": ["BONNE RÉPONSE", "distracteur", "distracteur", "distracteur"],
      "explanation": "correction courte",
      "difficulty": 3
    },
    {
      "type": "true_false",
      "prompt": "<= 500 car.",
      "correct": "true",
      "explanation": "correction courte",
      "difficulty": 2
    }
  ],
  "recap_points": [{ "text": "<= 200 car.", "detail_card_slug": "slug-d-une-fiche-detail" }],
  "related_articles": ["slug-d-une-autre-fiche"],
  "subject": { "name": "Nom du sujet", "label": "libellé court de cette fiche dans le sujet" }
}

Contraintes bloquantes : \`see_more\` <= 3 blocs, \`sources\` >= 1 et <= 5, \`links\` <= 5,
\`key_points\` <= 5, \`categories_theme\` >= 1, un QCM a **exactement 4 propositions**.
N'ajoute aucun champ hors de cette liste.

# Exemple d'une fiche réussie

Voici le niveau de rédaction attendu — observe la phrase express construite et
mise en gras, chaque point clé développé dans \`answer_detail\`, et \`see_more\`
réservé à ce qui est réellement structuré :

[
  {
    "title": "Quel délai entre le test de grossesse et la délivrance d'isotrétinoïne ?",
    "card_type": "detail",
    "answer_express": "<p>La délivrance doit intervenir dans les <b>7 jours</b> suivant la prescription, elle-même conditionnée à un test de grossesse négatif.</p>",
    "key_points": [
      "Délai de 7 jours non prolongeable",
      "Test à refaire si le délai est dépassé"
    ],
    "answer_detail": "<p>Le délai de <b>7 jours</b> court à compter de la date de prescription : au-delà, l'ordonnance ne peut plus être exécutée pour ce médicament, même si le reste de l'ordonnance demeure valable.</p><p>Si le délai est dépassé, la patiente doit refaire un test de grossesse et obtenir une nouvelle prescription : le test initial n'est plus considéré comme contemporain de la délivrance.</p>",
    "takeaway": "<p>Au-delà de <b>7 jours</b>, la patiente repasse par la case prescription.</p>",
    "see_more": [
      {
        "type": "monitoring",
        "value": {
          "what": "Date de prescription portée sur l'ordonnance",
          "why": "C'est elle qui fait courir le délai de 7 jours, pas la date du test"
        }
      }
    ],
    "categories_theme": ["dispensation"],
    "categories_medicament": ["retinoides"],
    "tags": ["isotretinoine", "grossesse"],
    "sources": [
      {
        "source": {
          "name": "Isotrétinoïne orale : conditions de prescription et de délivrance",
          "kind": "institutional",
          "publisher": "ANSM",
          "url": "https://ansm.sante.fr/exemple",
          "publication_date": "2024-01-15"
        }
      }
    ],
    "questions": [
      {
        "type": "qcm",
        "prompt": "Quel est le délai maximal entre prescription et délivrance d'isotrétinoïne chez une femme en âge de procréer ?",
        "answers": ["7 jours", "24 heures", "1 mois", "3 mois"],
        "explanation": "Au-delà de 7 jours, la prescription n'est plus valable pour ce médicament.",
        "difficulty": 2
      }
    ],
    "subject": { "name": "Délivrance isotrétinoïne", "label": "Délai de délivrance" }
  }
]

Cet exemple est une illustration de forme : n'en reprends **aucun contenu** si ta
source parle d'autre chose.

# Auto-vérification avant de répondre

- [ ] Chaque affirmation est-elle littéralement soutenue par la source fournie ?
- [ ] La réponse express répond-elle seule à la question du titre ?
- [ ] Est-ce bien une phrase construite (aucune puce) ?
- [ ] **Chaque point clé est-il développé dans \`answer_detail\` ?**
- [ ] Chaque fiche ne porte-t-elle qu'une seule idée ?
- [ ] Les slugs de catégories existantes sont-ils copiés à l'identique ?
- [ ] Le JSON est-il valide et sans champ inventé ?
- [ ] Les bonnes réponses des QCM sont-elles en première position ?

# CATÉGORIES EXISTANTES

${taxonomySection("categories_theme (obligatoire)", taxonomies.theme)}

${taxonomySection("categories_maladies", taxonomies.maladies)}

${taxonomySection("categories_medicament", taxonomies.medicament)}

${taxonomySection("categories_pharmacologie", taxonomies.pharmacologie)}

# TAGS EXISTANTS

${
  input.tags.length
    ? input.tags.join(", ")
    : "(aucun tag pour le moment — choisis des mots-clés simples et réutilisables)"
}

# SOURCE

${sourceSection(source)}

# INFORMATION À FAIRE PASSER

${input.information.trim() || "(non précisée : dégage toi-même les idées importantes de la source)"}
`;
}
