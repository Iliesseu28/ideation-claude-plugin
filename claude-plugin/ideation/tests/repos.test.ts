// Tests du plugin 1.6.0 : plusieurs dépôts par session, fichier `.ideation.json`
// (docs/claude-connect/AUTOMATIQUE.md §1 et §5). Monde simulé commun : tests/world.ts.

import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import {
  addTouched,
  commitDirs,
  gitCalls,
  linkFileContent,
  multiNudgeText,
  parseLinkFile,
  resolveDir,
  touchedRoots,
} from '../hooks/repos'
import {
  ADD_ENTRY,
  BASE_A,
  BASH_RESULT,
  COMPOSE,
  HOME,
  LINKED,
  ME,
  OPTS,
  PENDING,
  ROOT,
  SESSION,
  SHA_B,
  SHA_C,
  type World,
  stop,
  world,
} from './world'

const OTHER = '/work/autre-app'
const THIRD = `${HOME}/site`
const LINK = 'mcp__ideation__link_project'

/**
 * Bash simulé : un `git commit` ajoute un commit (HEAD = C) au dépôt dont la racine (ou sa forme
 * `~/…`) apparaît dans la commande, sinon au dépôt courant.
 */
function committing(on: On, w: World): void {
  on('tool.call', { tool: 'Bash' }, async ($, e) => {
    const command = String(e.command)
    const named = [...w.repos.values()].find(
      g => g.root !== null && (command.includes(g.root) || (g.root.startsWith(`${HOME}/`) && command.includes(`~${g.root.slice(HOME.length)}`))),
    )
    const g = named ?? w.git
    if (command.includes('commit') && g.head) {
      g.ancestors = [...g.ancestors, g.head]
      g.head = SHA_C
      g.commits.push({ line: `ccccccc feat: travail dans ${g.root}`, by: ME })
    }
    return { result: BASH_RESULT }
  })
}

describe('commande Bash → dépôt visé', () => {
  test('git -C avec un chemin entre guillemets', () => {
    expect(commitDirs('git -C "/a b/c" commit -m x')).toEqual(['/a b/c'])
  })

  test('cd <dir> && … && git commit', () => {
    expect(commitDirs('cd /x && git add . && git commit -m y')).toEqual(['/x'])
  })

  test('cd ~/p; git commit : le ~ est résolu avec HOME', () => {
    expect(commitDirs('cd ~/p; git commit')).toEqual(['~/p'])
    expect(resolveDir('/w', '/home/moi', '~/p')).toBe('/home/moi/p')
    expect(resolveDir('/w', undefined, '~/p')).toBeNull()
    expect(commitDirs('cd $HOME/p && git commit -m x')).toEqual(['~/p'])
  })

  test('commande sans commit : rien', () => {
    expect(commitDirs('npm test && git status')).toEqual([])
    expect(commitDirs('git log --oneline -5')).toEqual([])
  })

  test('« git commit » cité dans une chaîne ne compte pas', () => {
    expect(commitDirs('echo "git commit"')).toEqual([])
    expect(commitDirs("printf 'cd /x && git commit'")).toEqual([])
    expect(commitDirs('git log --grep "commit"')).toEqual([])
  })

  test('dossier courant, options globales, redirections, sous-shell', () => {
    expect(commitDirs('git add -A && git commit -m "feat: paiement" 2>&1 | tail -3')).toEqual([''])
    expect(commitDirs('GIT_EDITOR=true git -c user.name=x --no-pager commit --amend')).toEqual([''])
    expect(commitDirs('(cd /y && git commit -m z) && git commit -m w')).toEqual(['/y', ''])
    expect(commitDirs('cd /x && git -C sous commit -m a')).toEqual(['/x/sous'])
    expect(commitDirs('cd "$DIR" && git commit -m a')).toEqual([''])
    expect(gitCalls('git -C /r pull && git -C /r commit -m x').map(c => c.sub)).toEqual(['pull', 'commit'])
  })

  test('chemins relatifs et ..', () => {
    expect(resolveDir('/w/a', HOME, '')).toBe('/w/a')
    expect(resolveDir('/w/a', HOME, '../b/./c')).toBe('/w/b/c')
    expect(resolveDir('/w/a', HOME, '/abs/x/')).toBe('/abs/x')
  })
})

describe('.ideation.json', () => {
  test('absent, invalide ou project_id vide : null', () => {
    expect(parseLinkFile(undefined)).toBeNull()
    expect(parseLinkFile(null)).toBeNull()
    expect(parseLinkFile('{ pas du json')).toBeNull()
    expect(parseLinkFile('[]')).toBeNull()
    expect(parseLinkFile('{ "schema_version": 1, "project_id": "", "title": "X" }')).toBeNull()
    expect(parseLinkFile('{ "schema_version": 1, "project_id": "a/b", "title": "X" }')).toBeNull()
  })

  test('valide : id et titre nettoyé', () => {
    expect(parseLinkFile('{ "schema_version": 1, "project_id": "prj_42", "title": "Miam « voisin »" }')).toEqual({
      id: 'prj_42',
      title: 'Miam voisin',
    })
  })

  test('lit le `file.content` de repo_link (serveur : JSON indenté, saut de ligne final)', () => {
    const server = `${JSON.stringify({ schema_version: 1, project_id: 'AbC123xyz', title: 'Mon appli' }, null, 2)}\n`
    expect(parseLinkFile(server)).toEqual({ id: 'AbC123xyz', title: 'Mon appli' })
    expect(linkFileContent({ id: 'AbC123xyz', title: 'Mon appli' })).toBe(server)
  })

  test('contenu exact du contrat', () => {
    expect(linkFileContent({ id: 'prj_42', title: 'Miam' })).toBe(
      '{\n  "schema_version": 1,\n  "project_id": "prj_42",\n  "title": "Miam"\n}\n',
    )
  })

  test('dépôts touchés : par session, 20 sessions au plus', () => {
    let map: unknown = undefined
    for (let i = 0; i < 25; i++) map = addTouched(map, `s${i}`, ['/r'], i)
    map = addTouched(map, 's24', ['/q', '/r', 'relatif'], 99)
    expect(Object.keys(map as object)).toHaveLength(20)
    expect(touchedRoots(map, 's24')).toEqual(['/r', '/q'])
    expect(touchedRoots(map, 's0')).toEqual([])
  })
})

describe('relance multi-dépôts', () => {
  test('session hors dépôt qui commite ailleurs (non relié) : relance règle 1, une fois par HEAD', OPTS, async ($, on) => {
    const w = world(on, { git: { root: null }, cwd: '/home/moi/Racine', repos: { [OTHER]: {} } })
    committing(on, w)
    await $.session.start({ cwd: '/home/moi/Racine', surface: null, isInteractive: true })
    const r = await $.tool.call({ tool: 'Bash', command: `git -C ${OTHER} add -A && git -C ${OTHER} commit -m feat` })
    expect(r.result).toEqual(BASH_RESULT)
    // Ligne de base fixée AVANT le commit : le nouveau commit compte.
    expect(w.store.get(`base:${OTHER}`)).toBe(SHA_B)
    expect(touchedRoots(w.store.get('touched-repos'), SESSION)).toEqual([OTHER])
    // Dépôt non relié : la ligne d'état n'annonce rien tant qu'il n'est pas relié.
    expect(w.statuses.filter(Boolean)).toEqual([])

    const block = (await $.classic.Stop(stop())).block ?? ''
    for (const word of [`## Dépôt ${OTHER} (relié à aucun projet Idéation)`, 'projects_list', 'repo_link', 'project_suggest', 'gh_command', 'link_project', 'deux projets sont plausibles', 'SANS le raconter', 'ccccccc feat']) {
      expect(block).toContain(word)
    }
    expect(w.store.get(`nudged:${OTHER}`)).toBe(SHA_C)
    expect(await $.classic.Stop(stop())).toEqual({})
  })

  test('un relié (dépôt courant) + un relié par .ideation.json : UN bloc, chaque project_id, ligne d’état cumulée', OPTS, async ($, on) => {
    const w = world(on, {
      git: PENDING,
      store: BASE_A,
      repos: { [OTHER]: {} },
      files: { [`${OTHER}/.ideation.json`]: '{ "schema_version": 1, "project_id": "prj_y", "title": "Autre app" }\n' },
    })
    committing(on, w)
    await $.tool.call({ tool: 'Bash', command: `cd ${OTHER} && git commit -m y` })
    expect(w.statuses.at(-1)).toBe('📓 3 commits à journaliser (2 dépôts)')
    const block = (await $.classic.Stop(stop())).block ?? ''
    expect(block).toContain('2 dépôts')
    expect(block).toContain(`## Dépôt ${ROOT} (relié, projet pas encore choisi)`)
    expect(block).toContain(`## Dépôt ${OTHER} (projet « Autre app », project_id: 'prj_y')`)
    expect(block).toContain("journal_add_entry` (project_id: 'prj_y'")
    expect(block.split('[Idéation]')).toHaveLength(2)
  })

  test('un relié + un non relié : le non relié reçoit la règle 1, le relié son project_id', OPTS, async ($, on) => {
    const w = world(on, {
      git: { root: null },
      cwd: HOME,
      repos: { [OTHER]: {}, [THIRD]: {} },
      store: { [`project:${OTHER}/.git`]: { id: 'prj_o', title: 'Autre' } },
    })
    committing(on, w)
    await $.tool.call({ tool: 'Bash', command: `git -C ${OTHER} commit -m a` })
    // Deuxième dépôt, sous HOME, commité par `cd ~/…;` (le ~ est résolu avec $HOME).
    await $.tool.call({ tool: 'Bash', command: 'cd ~/site; git commit -m b' })
    const block = (await $.classic.Stop(stop())).block ?? ''
    expect(block).toContain(`## Dépôt ${OTHER} (projet « Autre », project_id: 'prj_o')`)
    expect(block).toContain(`## Dépôt ${THIRD} (relié à aucun projet Idéation)`)
    expect(touchedRoots(w.store.get('touched-repos'), SESSION)).toEqual([OTHER, THIRD])
  })

  test('dépôt délié (/journal --delier) : jamais relancé, même avec .ideation.json', OPTS, async ($, on) => {
    const w = world(on, {
      git: { root: null },
      repos: { [OTHER]: {} },
      files: { [`${OTHER}/.ideation.json`]: '{ "schema_version": 1, "project_id": "prj_y", "title": "Y" }' },
      store: { [`optout:${OTHER}/.git`]: true },
    })
    committing(on, w)
    await $.tool.call({ tool: 'Bash', command: `git -C ${OTHER} commit -m a` })
    expect(await $.classic.Stop(stop())).toEqual({})
  })

  test('auto_journal = rappel : un dépôt non relié ne déclenche rien', { options: { api_token: 'idn_test', auto_journal: 'rappel' } }, async ($, on) => {
    const w = world(on, { git: { root: null }, repos: { [OTHER]: {} } })
    committing(on, w)
    await $.tool.call({ tool: 'Bash', command: `git -C ${OTHER} commit -m a` })
    expect(await $.classic.Stop(stop())).toEqual({})
    expect(w.toasts).toEqual([])
  })

  test('entrée du journal pour l’autre dépôt : SA ligne de base avance, le dépôt courant n’est pas relié', OPTS, async ($, on) => {
    const w = world(on, { git: PENDING, repos: { [OTHER]: {} }, addEntry: 'ok' })
    committing(on, w)
    await $.tool.call({ tool: 'Bash', command: `git -C ${OTHER} commit -m a` })
    await $.tool.call({ tool: ADD_ENTRY, tool_use_id: 'e1', title: 'x', project_id: 'prj_o', commits: [{ sha: SHA_C }] } as never)
    expect(w.store.get(`base:${OTHER}`)).toBe(SHA_C)
    expect(w.store.get(`linked:${OTHER}/.git`)).toBe(true)
    expect(w.store.get(`project:${OTHER}/.git`)).toEqual({ id: 'prj_o', title: '' })
    expect(w.store.has(`linked:${ROOT}/.git`)).toBe(false)
    expect(await $.classic.Stop(stop())).toEqual({})
  })
})

describe('link_project 1.6.0 : .ideation.json', () => {
  test('écrit le fichier du dépôt visé (repo_path), retient le lien, efface un opt-out', OPTS, async ($, on) => {
    const w = world(on, { git: { root: null }, repos: { [OTHER]: {} }, store: { [`optout:${OTHER}/.git`]: true } })
    const r = await $.tool.call({ tool: LINK, tool_use_id: 'l1', project_id: 'prj_42', title: 'Miam', repo_path: `${OTHER}/src` } as never)
    expect(r.isError).toBeUndefined()
    expect(w.files.get(`${OTHER}/.ideation.json`)).toBe('{\n  "schema_version": 1,\n  "project_id": "prj_42",\n  "title": "Miam"\n}\n')
    expect(w.store.get(`project:${OTHER}/.git`)).toEqual({ id: 'prj_42', title: 'Miam' })
    expect(w.store.has(`optout:${OTHER}/.git`)).toBe(false)
  })

  test('écriture impossible : lien gardé en store, contenu donné à Claude', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED, writeFails: true })
    const r = await $.tool.call({ tool: LINK, tool_use_id: 'l2', project_id: 'prj_42', title: 'Miam' } as never)
    expect(String(r.result)).toContain('NON écrit')
    expect(String(r.result)).toContain('"project_id": "prj_42"')
    expect(w.store.get(`project:${ROOT}/.git`)).toEqual({ id: 'prj_42', title: 'Miam' })
  })

  test('repo_path hors dépôt : erreur, rien en store', OPTS, async ($, on) => {
    const w = world(on)
    const r = await $.tool.call({ tool: LINK, tool_use_id: 'l3', project_id: 'prj_42', title: 'x', repo_path: '/nulle/part' } as never)
    expect(r.isError).toBe(true)
    expect([...w.store.keys()]).toEqual([])
  })

  test('.ideation.json prime sur le store ; un lien du store sans fichier reste valable', OPTS, async ($, on) => {
    const w = world(on, { compose: true, store: { [`project:${ROOT}/.git`]: { id: 'prj_old', title: 'Ancien' } } })
    const section = async () => (await $.prompt.compose(COMPOSE)).sections.find(s => s.id === 'ideation:projet-du-depot')?.text
    expect(await section()).toContain("project_id: 'prj_old'")
    w.files.set(`${ROOT}/.ideation.json`, '{ "schema_version": 1, "project_id": "prj_new", "title": "Nouveau" }')
    expect(await section()).toContain("project_id: 'prj_new'")
  })

  test('/projet --delier avec un fichier : explique que le fichier relie encore', OPTS, async ($, on) => {
    world(on, { files: { [`${ROOT}/.ideation.json`]: '{ "schema_version": 1, "project_id": "prj_f", "title": "F" }' } })
    expect((await $.command.run({ command: 'projet', args: '--delier' } as never)).text).toContain('.ideation.json')
  })

  test('relance d’un seul dépôt : texte multi-dépôts lisible', () => {
    const text = multiNudgeText([{ root: OTHER, link: null, linked: false, base: SHA_B, count: 1, mine: true, commits: ['ccccccc feat'] }])
    expect(text).toContain('1 dépôt avec des commits')
    expect(text).toContain(`git -C "${OTHER}" remote get-url origin`)
  })
})
