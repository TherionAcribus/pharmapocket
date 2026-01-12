# Personnalisation de la couleur d’accent

## Résumé
- L’UI reste noir & blanc par défaut, mais l’utilisateur peut choisir une couleur d’accent appliquée aux boutons et éléments interactifs.
- La préférence est stockée côté client (`localStorage`, clé `pp_accent_color`) et appliquée via les variables CSS shadcn (`--primary`, `--ring`, `--sidebar-primary`, etc.).
- Le texte des boutons s’adapte automatiquement (choix clair/sombre) pour conserver le contraste.

## Parcours utilisateur
1. Ouvrir **Compte → Préférences** (`/account/preferences`).
2. Choisir une couleur via le sélecteur ou saisir un hex `#RRGGBB`.
3. L’aperçu met à jour immédiatement les boutons (persiste après reload).
4. Bouton **Réinitialiser** : supprime la préférence et revient au thème par défaut (noir/gris).

## Comportement technique
- Lecture/écriture de la préférence : `src/lib/accentColor.ts` (fonctions `getStoredAccentColor`, `setStoredAccentColor`, `clearStoredAccentColor`, `applyAccentColorToDocument`).
- Application globale : `AccentColorProvider` (`src/components/AccentColorProvider.tsx`) monté dans `src/app/layout.tsx`.
- La valeur est appliquée aux CSS vars du root. En l’absence de préférence, on revient aux valeurs par défaut définies dans `globals.css`.
- Le foreground (`--primary-foreground`) est calculé automatiquement selon la luminance pour préserver la lisibilité.

## Points à connaître
- Scope : cette préférence est purement locale (pas encore synchronisée serveur).
- Accessibilité : overlays utilisent `bg-foreground/50` au lieu de `bg-black/50` pour rester cohérents en clair/sombre.
- Pour rétablir la palette par défaut en code : appeler `applyAccentColorToDocument(null)` et `clearStoredAccentColor()`.

## Tests rapides
- Changer la couleur puis recharger la page : la couleur reste appliquée.
- Tester une couleur claire (ex. `#f5b700`) et une très sombre (ex. `#0a0a0a`) : le texte du bouton reste lisible.
- Utiliser « Réinitialiser » : retour au thème noir & blanc.
