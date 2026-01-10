# Canevas UX – App Microlearning Pharma (inspirée Feedly)

## Vision
Créer une expérience **mobile-first** de microlearning en pharmacologie (et thèmes voisins) inspirée des meilleures conventions de lecture (type Feedly), avec :
- **Découverte** rapide de micro-contenus
- **Collection** personnelle de cartes
- **Révision espacée** (SRS) façon MosaLingua
- **Quiz** (QCM) pour la performance et la motivation
- À terme : **badges**, recommandations, actu

---

## Principes UX (garde-fous)
- **1 carte = 1 idée** (microlearning)
- **Action principale unique** en lecture : ⭐ Sauvegarder
- **Reprise instantanée** (reprendre le dernier deck/carte)
- **États UX** pensés dès le début (vide, offline, loading, erreur)
- **Différenciation visuelle** (inspiration ≠ copie pixel perfect)
- **Accessibilité** (typo confortable, contraste, mode sombre)
- **Le sens ne dépend jamais uniquement de la couleur** (couleur + icône/texte)

---

## Navigation (MVP)
### Bottom tabs (4)
1. **Dose du jour** (ex-Today)
2. **Bibliothèque**
3. **Mes cartes**
4. **Quiz**

### Header commun
- Titre
- 🔍 recherche globale (contextuelle)
- ⚙️ préférences / filtres

### Drawer (option MVP, style Feedly)
- Thèmes + compteurs « à revoir »
- Packs (collections éditoriales)
- Offline (plus tard)

---

## Noms (choisis)
- Onglet type Today : **Dose du jour**
- Onglet Explore : **Bibliothèque**

---

## Écrans MVP (10)

### 1) Dose du jour (feed quotidien)
**But :** donner une session immédiate.
- Sections : Reprendre • À revoir • Nouveautés • (Recommandé plus tard)
- Actions : ouvrir Reader • démarrer révision
- États : compte neuf • loading • erreur • offline

### 2) Bibliothèque (recherche + navigation par thèmes)
**But :** trouver vite un sujet.
- Barre de recherche
- **Chips de filtres (raccourcis permanents)** en haut (scroll horizontal) : Médicaments • Maladies • Interactions • EI/CI • Mécanismes • (etc.)
  - Chips **sticky** (restent visibles au scroll) si ça ne surcharge pas
  - État clair : actif/inactif + bouton « Réinitialiser »
- Thèmes (2 niveaux max)
- Packs (collections)
- États : pas de résultat + suggestions

### 3) Résultats de recherche
- Liste type Feedly : titre-question, tag, durée/difficulté
- Filtres chips : Médicaments / Maladies / Interactions / EI-CI / Mécanismes

### 4) Liste de cartes (thème / sous-thème)
- Titre + compteur + bouton « Démarrer deck »

### 5) Page Pack (collection éditoriale)
- Description + niveau + durée estimée
- CTA : Démarrer (deck)

### 6) Reader / Flashcard (plein écran, swipe)
**But :** permettre une consultation rapide en affichant **titre + réponse courte** immédiatement (mode info), tout en gardant un accès clair au contenu long + sources.

**UI**
- Header minimal (icônes sobres) : Aa • ⭐ • ✓ • ⋯
- Header de contexte : 2 icônes monochromes (domaine + type), tap → libellé
- Corps :
  - **Titre-question**
  - **Réponse courte visible par défaut** (2–4 lignes)
  - Indicateur « contenu long disponible » (voir ci-dessous)
  - (Option) Illustration / schéma
- Footer : progression (12/50)

**Gestes**
- Swipe ← → : carte précédente / suivante
- Tap sur indicateur ou zone dédiée : ouvre le **contenu long**

**Indicateur “réponse longue” (recommandé)**
- Un seul symbole discret, au choix :
  - chevron « ˅ » / « … »
  - libellé court : « Plus » (optionnel)
  - icône “document”/“liste”
- En mode monochrome, privilégier **chevron + fade** en bas du bloc réponse courte.

**Images (illustration / schéma) – gestion recommandée**
Objectif : ajouter du visuel sans casser la lecture rapide ni le swipe.
- **Règle d’or :** l’image ne doit pas rendre la carte scrollable en mode swipe.

**Sur la carte (mode rapide)**
- Par défaut : **pas d’image pleine**.
- Option 1 (sobre) : **icône monochrome “image dispo”** (ex : pictogramme photo) si une image existe.
- Option 2 (si ça reste léger) : **miniature discrète** (thumbnail) *sans augmenter* la hauteur de la carte.
- Tap sur l’icône/miniature → ouvre l’image en plein écran.

**Dans le détail (contenu long)**
- Afficher l’image (ou schéma) en **grand**, **zoomable** (pinch-to-zoom mobile / clic desktop).
- Ajouter une **légende courte** (1–2 lignes) si utile.
- Ajouter **crédit/source** si l’image n’est pas créée en interne.

**Sources & droits (images)**
- Éviter de reprendre des schémas de manuels sans autorisation.
- Favoriser : schémas maison, pictos, ressources sous licence compatible.
- Si image externe : conserver référence + lien dans la section Sources.

**Contenu long**
- Recommandation UX : ouvrir le long en **tiroir (bottom sheet) plein écran** qui recouvre la carte.
  - Tant que le tiroir est ouvert : **swipe horizontal verrouillé** (on évite de changer de carte par erreur).
  - Le tiroir est **plein écran** et **scrollable verticalement** (lecture confortable).
  - Fermeture : **swipe down** + bouton **✕**.
  - Au retour : on revient sur **la même carte**, au **même point** (progression inchangée).
- Variante desktop : panneau latéral ou page détail.

**Conflits de gestes (swipe vs scroll/zoom) – garde-fous**
- Sur la carte (mode rapide) : éviter tout contenu scrollable ; réponse courte limitée (2–4 lignes) + ellipsis.
- Dans le tiroir (mode long) : autoriser le scroll vertical, désactiver le swipe horizontal.
- Seuil de swipe : n’accepter le swipe que si le geste est **majoritairement horizontal** (prévenir les faux positifs).
- Pendant un pinch-to-zoom sur une image : **désactiver la navigation** (swipe) jusqu’à fin du geste.

**Sources (gestion)**
- Toujours un accès visible via ⋯ ou une icône source.
- Dans le détail (tiroir plein écran), afficher un bloc **Crédibilité** en haut ou juste après la réponse longue :
  - **Dernière vérification** (date) – très visible
  - (Option) **Dernière mise à jour** (date) si contenu modifié
  - (Option) **Référentiel principal** (ex : RCP, HAS, ESC, ANSM…)
- Afficher ensuite les sources (liste) :
  - titre de la source
  - type (guideline, RCP, étude, revue…)
  - lien + date (si dispo)
- Ajouter un bouton « Copier la référence » (option)

**Hygiène éditoriale (fiabilité dans le temps)**
- Si `dernière vérification` trop ancienne (ex : > 12 mois) : afficher un **indicateur discret** « À revalider » et/ou réduire la mise en avant algorithmique.
- Prévoir un workflow back-office : statut (brouillon/relu), reviewer (option), historique.

**États**
- Carte sans contenu long : pas d’indicateur
- Carte sans source : badge discret « source à ajouter » (admin) ou rien côté utilisateur
- Offline : liens sources désactivés (mais références visibles)

### 7) Mes cartes (collection)
- Recherche + filtres + segments : Tout / À revoir / Maîtrisées
- Chaque item peut afficher **titre + réponse courte** (1–2 lignes) pour un scan rapide
- CTA : Démarrer révision (si dues)

### 8) Session Révision (SRS)
- Voir question → révéler réponse → auto-évaluation :
  - Je sais • Moyen • À revoir
- **Algo MVP recommandé : Leitner** (niveaux/boîtes + intervalles fixes)

### 9) Quiz (hub)
- Modes :
  - **Quiz rapide** (10 questions)
  - **Focus erreurs** (10 questions)
- Source : Mes cartes / Thème / Pack
- Options : chrono on/off (MVP: on)

**Focus erreurs – objectif**
- Générer des quiz uniquement à partir des cartes :
  - où l’utilisateur a déjà échoué en quiz, et/ou
  - marquées comme **Difficiles / À revoir** côté SRS.

**Règles MVP (simples)**
- Pool = `wrong_in_quiz > 0` **OU** `srs_flag_difficult = true` (ou niveau bas + revue récente difficile)
- Priorité :
  1) cartes avec erreurs récentes
  2) cartes avec erreurs répétées
  3) cartes “difficiles” SRS
- Fallback si pool insuffisant : basculer vers « À revoir » (SRS) puis « Quiz rapide ».

### 10) Quiz session + résultats
- QCM + chrono + progression
- Résultats : score + temps + record perso
- Actions post-quiz (recommandé) :
  - **Rejouer en Focus erreurs** (quiz immédiat basé sur les erreurs)
  - **Envoyer mes erreurs en À revoir** (alimente le SRS)
  - (Option) **Revoir mes erreurs** en deck (Reader)


- Actions sobres en haut : Aa • ⭐ • ✓ • ⋯
- Recto : question + 2–3 puces
- Verso : explication + “À retenir” + sources
- Gestes : swipe (nav) • tap (flip)

### 7) Mes cartes (collection)
- Recherche + filtres + segments : Tout / À revoir / Maîtrisées
- CTA : Démarrer révision (si dues)

### 8) Session Révision (SRS)
- Voir question → révéler réponse → auto-évaluation :
  - Je sais • Moyen • À revoir
- **Algo MVP recommandé : Leitner** (niveaux/boîtes + intervalles fixes)

### 9) Quiz (hub)
- Quiz rapide 10 questions
- Source : Mes cartes / Thème / Pack
- Options : chrono on/off (MVP: on)

### 10) Quiz session + résultats
- QCM + chrono + progression
- Résultats : score + temps + record perso
- Bouton : « Revoir mes erreurs » → ajoute en À revoir / deck erreurs

---

## Révision espacée (SRS) – décision MVP
### Option MVP : Leitner
- Niveaux 1→5
- Intervalles fixes (exemple à affiner) :
  - Box1: 1j • Box2: 3j • Box3: 7j • Box4: 14j • Box5: 30j
- Règles :
  - « Je sais » : +1 niveau
  - « Moyen » : stable (ou +0) selon tuning
  - « À revoir » : -1 niveau (ou retour box1)

### Plus tard
- SM-2 / modèles proches Anki

---

## Header de carte : repères visuels (recommandé)
Objectif : donner un **contexte immédiat** sans surcharger.

### Proposition (MVP)
- **Icônes uniquement** (monochromes) :
  - 1 icône **domaine/pathologie** (ex : diabète, cardio)
  - 1 icône **type de contenu** (mécanisme, EI, interaction, législation…)
- **Sans libellé** par défaut.
- **Tap sur une icône** → affiche le libellé (tooltip / toast / popover).
- Les **tags complets** restent accessibles via un détail (⋯ / panneau infos), mais **pas tous affichés** en permanence.
- **1 repère “domaine/pathologie”** (ex : Diabète, Cardio) sous forme de **petit pictogramme + libellé court**.
- **1 repère “type de contenu”** (ex : Mécanisme, EI, Interaction, Législation) sous forme d’**icône** (ou chip).
- Les **tags complets** restent accessibles via un détail (⋯ / panneau infos), mais **pas tous affichés** en permanence.

### Règles pour ne pas alourdir
- Maximum **2 éléments** visibles en header (domaine + type).
- Éviter les icônes trop “fantaisie” : privilégier un set simple (cohérent) et des libellés courts.
- Si manque de place : afficher **icônes seulement**, et révéler le libellé au tap/long-press.

### Couleur (si utilisée)
- Style prioritaire : **monochrome / sobre** (pas de code couleur systématique).
- Tolérance : un **seul accent** éventuel pour des états (ex : “sauvegardée” ⭐ remplie, ou “à revoir” via un petit indicateur), mais éviter les arcs-en-ciel.
- Toujours respecter contraste + mode sombre.

### Exemples
- 🩸 Diabète • ⚙️ Mécanisme
- ❤️ Cardio • ⚠️ Effets indésirables
- 🧬 Infectio • 🔁 Interaction
- 📜 Réglementation • ✅ Bon usage

---

## Modèle de contenu (carte)
- **Titre-question**
- **Réponse courte** (affichée dans la carte)
- **Détail** (réponse longue)
- **À retenir** (1 phrase)
- **Tags** (thèmes/facettes)
- **Sources** (références + liens)
- **Crédibilité** :
  - `verified_at` (**dernière vérification**)
  - `updated_at` (dernière mise à jour, si différent)
  - (Option) `review_status` (brouillon / relu / à revalider)
  - (Option) `reviewer` (initiales/role)
- (Option) Image / schéma (+ crédit/source)

---

## Modèle d’apprentissage (état utilisateur par carte) (état utilisateur par carte)
- saved (bool)
- srs_level (int)
- due_at (datetime)
- last_reviewed_at
- ease/score (option)
- stats : vues, erreurs quiz, etc.

---

## Gamification (à terme)
- XP + niveaux
- Badges : volume • maîtrise • régularité • thématiques
- Streak **doux** (joker/tolérance)
  - Phase 1 (simple) : tolérance de 1 jour (ex : 1 "joker" automatique / semaine)
  - Phase 2 : **tokens de sauvegarde** (nom à définir, ex : Joker / Pass / Capsule)
    - Gagnés par performance (ex : quiz parfait, objectifs hebdo)
    - Utilisables pour préserver la série en cas d’oubli d’un jour
    - Stock maximum recommandé : 2–3 tokens
    - UX sobre : pas d’alertes anxiogènes, usage proposé seulement au moment utile
- Classements : d’abord **records perso**, puis social plus tard

**Note produit** : le streak (et ses tokens) est planifié pour **plus tard** dans la vie de l’app.
- Principe UX : ne pas afficher le streak en permanence sur l’écran principal au début ; le placer plutôt dans **Profil/Badges** (sobriété).

---

## Desktop (phase 2)
- Split view : Liste à gauche / Reader à droite
- Raccourcis clavier : ← → (nav), S (save ⭐), espace (flip)

---

## Risques / pièges à éviter
- Trop de profondeur dans l’arborescence (2 niveaux max)
- Trop d’actions visibles sur la carte
- Cartes trop longues (éviter scroll dans Reader)
- Sauvegarde trop frictionnelle (ne pas demander un dossier à chaque ⭐)
- Compteurs anxiogènes (préférer “à revoir” plutôt que “en retard”)

---

## Préférences (à prévoir)
- **Gestion des erreurs de quiz** :
  - Option utilisateur : « Envoyer mes erreurs en À revoir » **immédiat** ou **planifié** (ex : demain / prochain créneau).
  - Comportement par défaut à définir (MVP), mais **modifiable dans les préférences**.

## Prochaines décisions
1. Nom final des onglets (Focus/Explorer/Mes cartes/Quiz)
2. Décider : Drawer dès MVP ou phase 2
3. Choisir intervalles Leitner (tuning)
4. Définir le style (design system) pour différencier de Feedly

