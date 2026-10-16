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

**Depuis 1.6.0, tout est automatique** : installé une fois en portée *user*, le plugin suit
tous les dépôts où Claude commite (même ouvert dans un dossier neutre qui commite ailleurs avec
`git -C` ou `cd … &&`). Chaque dépôt est relié à son projet par un fichier `.ideation.json` à sa
racine (commité, sans secret) ; un dépôt pas encore relié l'est par Claude, sans te déranger (il ne
te demande que si deux projets sont plausibles). Tu ne vois qu'une ligne d'état.

Le plugin contient :

| Pièce | Rôle |
|---|---|
| Serveur MCP `ideation` | Jusqu'à 42 outils, **selon les permissions de ta clé** (Claude ne voit que ceux que tu as autorisés) : `journal_get_context`, `journal_list_entries`, `journal_add_entry`, `todo_list`, `todo_add`, `todo_update`, `todo_complete`, `project_get_context`, `project_update`, `doc_list`, `doc_get`, `doc_add`, `doc_update`, `journal_update_entry`, `projects_list`, puis (1.4.0) `project_create`, `analysis_get`, `feeko_list`, `feeko_get`, `members_list`, `expense_list`, `expense_add`, `expense_update`, `expense_delete`, `link_list`, `link_add`, `link_update`, `link_delete`, `todo_delete`, `doc_delete`, `journal_delete_entry`, puis (1.5.0) `analysis_run`, `feeko_ask`, `member_invite`, `roadmap_get`, `roadmap_set`, `milestone_update`, `release_notes_draft`, puis (1.6.0) `repo_link`, `repo_unlink`, `project_suggest`, `calendar_url`. Les suppressions n'existent que si tu as coché « Supprimer ». |
| Skill `ideation:journal-de-bord` | Quand écrire, comment, avec quelles preuves (règles + exemples). |
| Skill `ideation:todos` | Quand noter, mettre à jour ou clore une to-do, et comment (champs, clés, preuves). |
| Skill `ideation:documents` | Quand un document mérite d'exister (barre haute), comment l'écrire, le compléter ou le corriger. |
| Skill `ideation:projet` | Lire tout le projet (`project_get_context`, analyses, tes conversations Feeko, équipe, dépenses, liens) et tenir sa fiche, ses dépenses et ses liens. |
| Skill `ideation:nouveau-projet` | Sur ta demande, créer un nouveau projet Idéation (`project_create`) pour un nouveau produit / dépôt, puis y relier le dépôt (`link_project`). |
| Skill `ideation:roadmap` (1.5.0) | Tenir la roadmap du projet (`roadmap_get`, `roadmap_set`, `milestone_update`) : étapes, statut, « Étape X sur N » ; une étape « faite » exige une preuve. |
| Skill `ideation:notes-de-version` (1.5.0) | Notes de version depuis le journal (`release_notes_draft`) : CHANGELOG Keep a Changelog et « Quoi de neuf » des stores (500 caractères au plus). |
| Mod (`hooks/mod.ts`) | (1.6.0) Lien d'un dépôt lu d'abord dans `.ideation.json` (puis dans le store : les liens d'avant restent valables) ; après chaque `git commit` lancé par Claude, le dépôt visé (`git -C <dir>`, `cd <dir> &&`, sinon le dossier courant) rejoint les dépôts suivis de la session ; en fin de tour, UNE relance couvre tous ces dépôts (reliés : journal et to-dos avec leur `project_id` ; non reliés : Claude les relie avec `repo_link` / `project_suggest`) ; l'outil local `link_project` écrit `.ideation.json`. Rappel en fin de tour s'il reste des commits non journalisés (les tiens seulement, pas ceux tirés d'un `git pull`), statut « 📓 N commits à journaliser », commande `/journal` (`/journal --ignorer` remet le compteur à zéro sans entrée). To-dos : repère en code les reports et les « c'est réglé » dans tes messages, les `TODO`/`FIXME` ajoutés ou retirés par Claude, et le lui rappelle, dans la **même** relance de fin de tour que le journal ; toasts « ☑️ To-do ajoutée » / « ✅ To-do terminée » ; commande `/todo [texte]`. Projet et documents : section de prompt `ideation:projet`, toasts « 📄 Document ajouté » / « 📓 Entrée du journal corrigée » / « 🗂️ Projet Idéation créé » / « 💶 Dépense ajoutée » / « 🔗 Lien ajouté » / « 🗑️ … supprimé(e) ». Projet du dépôt (clé de compte) : section de prompt `ideation:projet-du-depot` (le `project_id` à passer, ou comment le choisir), outil local `link_project`, commande `/projet [nom \| --delier]`. N'agit que dans un dépôt **relié** (`.ideation.json`, plugin activé en portée local/project, projet retenu, ou `/journal` / `/todo` tapé une fois dans le dépôt) ou dans un dépôt où Claude vient de commiter ; `/journal --delier` coupe tout automatisme dans un dépôt, sur ce poste. |

Le serveur MCP et la skill marchent seuls ; le mod est un bonus (sessions où les mods sont désactivés : rien ne casse).

## Installer

En une phrase, à ton agent : « set up Idéation : https://ideation-dd18f.web.app/llms.txt ».
Ou toi-même, dans un terminal (la clé `idn_…` se crée dans l'app : **Paramètres → Claude Code**,
affichée une seule fois, réservé Premium) :

```bash
curl -fsSL https://ideation-dd18f.web.app/install.sh | sh -s -- --token idn_…
```

Le script installe le plugin en portée **user** (tous tes dépôts), range la clé dans le trousseau
sans l'afficher (`claude plugin configure ideation@ideation --values-stdin`), branche aussi Cursor
et Codex s'ils sont là, puis vérifie la connexion. Relance une session Claude Code ensuite.
Rien à relier à la main : au premier commit dans un dépôt, Claude le relie à son projet
(`.ideation.json`). `/projet` affiche le projet relié, `/projet <nom>` en change.

À la main, dans Claude Code :

```
/plugin marketplace add Iliesseu28/ideation-claude-plugin
/plugin install ideation@ideation
```

Portée **user** recommandée. Colle la clé quand Claude Code la demande (champ **Clé de connexion
Idéation**). Vérifie avec `/mcp` : le serveur `plugin:ideation:ideation` doit être connecté.
Une installation d'avant (portée local ou project, clé déjà saisie) continue de marcher telle quelle.

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
  (il lit seulement `git` et `.ideation.json` en local, écrit `.ideation.json` quand Claude appelle
  `link_project`, et garde, par dépôt, deux SHA, un drapeau « relié » ou « délié », l'id et le titre
  du projet choisi, les lignes `TODO` récemment ajoutées ou retirées par Claude, et la liste des
  dépôts où chaque session a commité, dans le store du plugin).
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
fonctions pures, comme `hooks/project.ts` (section et toasts projet / documents). `hooks/repos.ts` (1.6.0, pur) : lecture d'une commande Bash (dépôt visé par `git commit`),
`.ideation.json`, dépôts touchés par session, relance multi-dépôts. Tests :
`tests/mod.test.ts` (journal), `tests/todos.test.ts` (to-dos), `tests/project.test.ts` (projet / documents / création / suppressions),
`tests/repos.test.ts` (1.6.0 : plusieurs dépôts, `.ideation.json`), monde simulé commun dans `tests/world.ts`. Contrats : `docs/claude-connect/PLUGIN.md` et `TODOS.md` §7.
