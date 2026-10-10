# Plugin Claude Code « ideation »

Ton Claude (celui qui code ton app) tient ton projet
[Idéation](https://github.com/Iliesseu28/ideation_new) à jour tout seul :

- **Journal de bord** : quand il termine une vraie unité de travail (nouveauté, correction,
  décision, mise en ligne, blocage…), il y écrit une entrée lisible par tous, avec les preuves
  (commits, fichiers, tests).
- **To-dos** : il note dans la liste To-do du projet ce qui est remis à plus tard (« on verra ça
  plus tard », bug hors sujet, `TODO` laissé dans le code, suite d'une fonctionnalité), la tient à
  jour, et coche une tâche quand le travail qui la résout est commité — avec une preuve. Tu vois le
  badge « Claude » et l'historique de chaque tâche dans l'app, et tu gardes le dernier mot.
- **Documents** : il garde dans les Documents du projet le savoir durable que l'équipe relira
  (spécification, décision, guide d'installation, contrat d'API, compte rendu demandé) — jamais de
  code collé, de note triviale ou de doublon du journal. Il peut aussi corriger la formulation d'une
  entrée du journal et lire tout le projet (description, membres, dernière analyse, compteurs).
  Tout ce qu'il écrit reste modifiable par toi dans l'app.

Le plugin contient :

| Pièce | Rôle |
|---|---|
| Serveur MCP `ideation` | Jusqu'à 38 outils, **selon les permissions de ta clé** (Claude ne voit que ceux que tu as autorisés) : `journal_get_context`, `journal_list_entries`, `journal_add_entry`, `todo_list`, `todo_add`, `todo_update`, `todo_complete`, `project_get_context`, `project_update`, `doc_list`, `doc_get`, `doc_add`, `doc_update`, `journal_update_entry`, `projects_list`, puis (1.4.0) `project_create`, `analysis_get`, `feeko_list`, `feeko_get`, `members_list`, `expense_list`, `expense_add`, `expense_update`, `expense_delete`, `link_list`, `link_add`, `link_update`, `link_delete`, `todo_delete`, `doc_delete`, `journal_delete_entry`, puis (1.5.0) `analysis_run`, `feeko_ask`, `member_invite`, `roadmap_get`, `roadmap_set`, `milestone_update`, `release_notes_draft`. Les suppressions n'existent que si tu as coché « Supprimer ». |
| Skill `ideation:journal-de-bord` | Quand écrire, comment, avec quelles preuves (règles + exemples). |
| Skill `ideation:todos` | Quand noter, mettre à jour ou clore une to-do, et comment (champs, clés, preuves). |
| Skill `ideation:documents` | Quand un document mérite d'exister (barre haute), comment l'écrire, le compléter ou le corriger. |
| Skill `ideation:projet` | Lire tout le projet (`project_get_context`, analyses, tes conversations Feeko, équipe, dépenses, liens) et tenir sa fiche, ses dépenses et ses liens. |
| Skill `ideation:nouveau-projet` | Sur ta demande, créer un nouveau projet Idéation (`project_create`) pour un nouveau produit / dépôt, puis y relier le dépôt (`link_project`). |
| Skill `ideation:roadmap` (1.5.0) | Tenir la roadmap du projet (`roadmap_get`, `roadmap_set`, `milestone_update`) : étapes, statut, « Étape X sur N » ; une étape « faite » exige une preuve. |
| Skill `ideation:notes-de-version` (1.5.0) | Notes de version depuis le journal (`release_notes_draft`) : CHANGELOG Keep a Changelog et « Quoi de neuf » des stores (500 caractères au plus). |
| Mod (`hooks/mod.ts`) | Rappel en fin de tour s'il reste des commits non journalisés (les tiens seulement, pas ceux tirés d'un `git pull`), statut « 📓 N commits à journaliser », commande `/journal` (`/journal --ignorer` remet le compteur à zéro sans entrée). To-dos : repère en code les reports et les « c'est réglé » dans tes messages, les `TODO`/`FIXME` ajoutés ou retirés par Claude, et le lui rappelle — dans la **même** relance de fin de tour que le journal ; toasts « ☑️ To-do ajoutée » / « ✅ To-do terminée » ; commande `/todo [texte]`. Projet et documents : section de prompt `ideation:projet`, toasts « 📄 Document ajouté » / « 📓 Entrée du journal corrigée » / « 🗂️ Projet Idéation créé » / « 💶 Dépense ajoutée » / « 🔗 Lien ajouté » / « 🗑️ … supprimé(e) ». Projet du dépôt (clé de compte) : section de prompt `ideation:projet-du-depot` (le `project_id` à passer, ou comment le choisir), outil local `link_project`, commande `/projet [nom \| --delier]`. N'agit que dans un dépôt **relié** : plugin activé en portée local/project, projet retenu, ou `/journal` / `/todo` tapé une fois dans le dépôt (`/journal --delier` pour défaire). |

Le serveur MCP et la skill marchent seuls ; le mod est un bonus (sessions où les mods sont désactivés : rien ne casse).

## Installer

1. Dans l'app Idéation : **Paramètres → Claude Code** → crée ta **clé de compte** `idn_…` et copie-la (affichée une seule fois ; on parle aussi de « jeton »). Une seule clé pour **tous** tes projets. Réservé Premium. Une ancienne clé de projet (Projet → Journal → Connecter Claude) marche encore.
2. Dans Claude Code, **ouvert dans le dépôt de ton app** :

```
/plugin marketplace add iliesseu28/ideation_new
/plugin install ideation@ideation
```

   Portée **local** (ou **project**) recommandée : le plugin n'agit que dans les dépôts reliés.
   Au premier usage, Claude liste tes projets (`projects_list`), te demande lequel correspond à ce
   dépôt, puis le retient (`link_project`, en local). `/projet` affiche le projet relié,
   `/projet --delier` l'oublie, `/projet <nom>` demande à Claude de le relier.
3. Colle la clé quand Claude Code la demande (champ **Clé de connexion Idéation**). Vérifie avec `/mcp` : le serveur `plugin:ideation:ideation` doit être connecté.

Guide complet (dépannage, sessions cloud, Cursor…) : [`docs/claude-connect/INSTALLATION.md`](../../docs/claude-connect/INSTALLATION.md).

## Réglages (`userConfig`)

| Clé | Défaut | Rôle |
|---|---|---|
| `api_token` | — (obligatoire, **sensible**) | Clé de compte `idn_…` (Paramètres → Claude Code ; ancienne clé de projet acceptée). Rangée dans le trousseau du système, jamais dans `settings.json`. |
| `api_url` | `https://europe-west1-ideation-dd18f.cloudfunctions.net/ideationMcp` | À changer seulement pour un émulateur / staging. |
| `auto_journal` | `auto` | `auto` : Claude est relancé une fois en fin de tour s'il reste des commits non journalisés · `rappel` : statut + notification seulement · `off` : aucun automatisme (`/journal` reste disponible). |
| `auto_todos` | `auto` | `auto` : indices sur tes messages, relance en fin de tour pour les `TODO` laissés dans le code, rappel « ces commits ferment-ils une to-do ? » dans la relance du journal · `rappel` : statut + notification seulement · `off` : aucun automatisme (`/todo` reste disponible). Indépendant de `auto_journal`. |

`/todo gérer les remboursements` : Claude ajoute cette to-do (après avoir vérifié les doublons).
`/todo` seul : Claude fait le point — il ferme ce que le travail récent résout (preuves à l'appui)
et te propose ce qui manque.

Modifier : `/config` (lignes `ideation.*`) ou `claude plugin configure ideation`.

## Confidentialité

- La clé donne accès aux projets dont tu es membre, un projet à la fois (`project_id`, appartenance
  re-vérifiée à chaque appel), et seulement à ce que tu as coché en la créant (Paramètres → Claude Code :
  Lire / Modifier / Supprimer par famille — projets, analyses, tes conversations Feeko, membres, journal,
  to-dos, documents, dépenses, liens ; « Tout sélectionner » possible). Par défaut : tout lire et modifier,
  **aucune suppression**. Tu changes ces permissions ou révoques la clé à tout moment dans l'app.
  Claude ne supprime que si tu as coché « Supprimer » **et** que tu le lui demandes ; il ne supprime
  jamais un projet. Il ne réécrit ton travail (titre du projet, document ou entrée écrits par un
  humain) que si tu le lui demandes. Les conversations Feeko lisibles sont uniquement les tiennes.
- Rien n'est envoyé sans que Claude appelle un outil : le mod lui-même ne fait **aucun appel réseau**
  (il lit seulement `git` en local et garde, par dépôt, deux SHA, un drapeau « relié », l'id et le titre du projet choisi et les lignes
  `TODO` récemment ajoutées ou retirées par Claude dans le store du plugin).
- Claude n'écrit que des résumés et des preuves (SHA, chemins, résultats de tests) — jamais ton code.
  Le serveur refuse toute entrée qui contient un secret (clé d'API, jeton…).

## Développer

```bash
claude plugin validate --strict claude-plugin/ideation
claude plugin validate --strict .claude-plugin/marketplace.json
claude plugin test claude-plugin/ideation
npx tsc -p claude-plugin/ideation            # typage (déclarations posées par --plugin-dir ci-dessous)
claude --plugin-dir claude-plugin/ideation   # essai local, rechargé à chaud
```

Structure du mod : `hooks/mod.ts` porte **tous** les hooks et tout ce qui touche `$` (git, store,
réglages, UI) — le moteur ne suit `$` que dans le fichier du module, jamais à travers un import ;
`hooks/todos.ts` (regex, marqueurs, textes des relances) et `hooks/shared.ts` ne contiennent que des
fonctions pures, comme `hooks/project.ts` (section et toasts projet / documents). Tests :
`tests/mod.test.ts` (journal), `tests/todos.test.ts` (to-dos), `tests/project.test.ts` (projet / documents / création / suppressions), monde
simulé commun dans `tests/world.ts`. Contrats : `docs/claude-connect/PLUGIN.md` et `TODOS.md` §7.
