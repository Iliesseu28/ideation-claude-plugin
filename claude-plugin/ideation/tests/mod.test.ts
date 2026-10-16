// Tests du mod « ideation » : journal de bord (claude plugin test claude-plugin/ideation).
// Le monde sous le plugin (git, store, UI, fichiers) est simulé par tests/world.ts.

import { describe, expect, test } from 'claude-code/testing'

import {
  ADD_ENTRY,
  BASE_A,
  BASH_RESULT,
  COMPOSE,
  LINKED,
  OPTS,
  PENDING,
  ROOT,
  SHA_A,
  SHA_B,
  SHA_C,
  START,
  TEAMMATE,
  UNLINKED_A,
  ME,
  stop,
  world,
} from './world'

describe('session.start', () => {
  test('initialise la ligne de base à HEAD et enregistre /journal et /todo', OPTS, async ($, on) => {
    const w = world(on, { git: { head: SHA_B } })
    await $.session.start(START)
    expect(w.store.get(`base:${ROOT}`)).toBe(SHA_B)
    expect(w.commands).toEqual(['journal', 'todo', 'projet'])
    // Dépôt pas encore relié : aucun statut.
    expect(w.statuses).toEqual([])
  })

  test('garde une ligne de base existante et affiche les commits en attente', OPTS, async ($, on) => {
    const w = world(on, { git: PENDING, store: BASE_A })
    await $.session.start(START)
    expect(w.store.get(`base:${ROOT}`)).toBe(SHA_A)
    expect(w.statuses).toEqual(['📓 2 commits à journaliser'])
  })

  test('hors dépôt git : rien en store, la session démarre', OPTS, async ($, on) => {
    const w = world(on, { git: { root: null } })
    expect(await $.session.start(START)).toEqual({ cwd: ROOT })
    expect([...w.store.keys()]).toEqual([])
    expect(w.commands).toEqual(['journal', 'todo', 'projet'])
  })

  test('dépôt sans aucun commit : pas de ligne de base', OPTS, async ($, on) => {
    const w = world(on, { git: { head: null } })
    await $.session.start(START)
    expect(w.store.has(`base:${ROOT}`)).toBe(false)
  })
})

describe('classic.Stop (auto)', () => {
  test('aucun commit nouveau : pas de relance', OPTS, async ($, on) => {
    world(on, { git: { head: SHA_B }, store: { ...LINKED, [`base:${ROOT}`]: SHA_B } })
    expect(await $.classic.Stop(stop())).toEqual({})
  })

  test('commits non journalisés : relance une seule fois par HEAD', OPTS, async ($, on) => {
    const w = world(on, { git: PENDING, store: BASE_A })
    const first = await $.classic.Stop(stop())
    expect(first.block).toContain('2 commits de toi pas encore dans le Journal de bord')
    expect(first.block).toContain(SHA_A)
    expect(first.block).toContain('bbbbbbb feat: paiement par carte')
    expect(first.block).toContain('ideation:journal-de-bord')
    expect(w.store.get(`nudged:${ROOT}`)).toBe(SHA_B)

    expect(await $.classic.Stop(stop())).toEqual({})

    w.git.head = SHA_C
    w.git.commits.push({ line: 'ddddddd fix: arrondi', by: ME })
    const third = await $.classic.Stop(stop())
    expect(third.block).toContain('3 commits')
  })

  test('stop_hook_active : jamais de relance (anti-boucle)', OPTS, async ($, on) => {
    const w = world(on, { git: PENDING, store: BASE_A })
    expect(await $.classic.Stop(stop(true))).toEqual({})
    expect(w.store.has(`nudged:${ROOT}`)).toBe(false)
  })

  test('ligne de base qui n’est plus un ancêtre (rebase) : remise à HEAD, pas de relance', OPTS, async ($, on) => {
    const w = world(on, { git: { ...PENDING, ancestors: [] }, store: BASE_A })
    expect(await $.classic.Stop(stop())).toEqual({})
    expect(w.store.get(`base:${ROOT}`)).toBe(SHA_B)
  })

  test('ligne de base inconnue du dépôt (code 128, objet absent) : remise à HEAD', OPTS, async ($, on) => {
    const w = world(on, { git: { ...PENDING, missing: [SHA_A] }, store: BASE_A })
    expect(await $.classic.Stop(stop())).toEqual({})
    expect(w.store.get(`base:${ROOT}`)).toBe(SHA_B)
  })

  test('merge-base en délai dépassé : rien ne bouge (ni store, ni statut, ni relance)', OPTS, async ($, on) => {
    const w = world(on, { git: { ...PENDING, mergeBase: 'timeout' }, store: BASE_A, bash: true })
    await $.session.start(START)
    await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })
    expect(await $.classic.Stop(stop())).toEqual({})
    expect(w.store.get(`base:${ROOT}`)).toBe(SHA_A)
    expect(w.store.has(`nudged:${ROOT}`)).toBe(false)
    expect(w.statuses).toEqual([])
  })

  test('merge-base code 128 sans objet inconnu (verrou, dépôt illisible) : rien ne bouge', OPTS, async ($, on) => {
    const stderr = 'fatal: not a git repository (or any of the parent directories): .git\n'
    const w = world(on, { git: { ...PENDING, mergeBase: { exitCode: 128, stderr } }, store: BASE_A })
    expect(await $.classic.Stop(stop())).toEqual({})
    expect(w.store.get(`base:${ROOT}`)).toBe(SHA_A)
    expect(w.store.has(`nudged:${ROOT}`)).toBe(false)
  })

  test('merge-base autre code (129) : rien ne bouge', OPTS, async ($, on) => {
    const w = world(on, { git: { ...PENDING, mergeBase: { exitCode: 129, stderr: 'usage: git merge-base' } }, store: BASE_A })
    await $.session.start(START)
    expect(w.store.get(`base:${ROOT}`)).toBe(SHA_A)
    expect(w.statuses).toEqual([])
  })

  test('ligne de base illisible : remise à HEAD, pas de relance', OPTS, async ($, on) => {
    const w = world(on, { git: PENDING, store: { ...LINKED, [`base:${ROOT}`]: 'pas-un-sha' } })
    expect(await $.classic.Stop(stop())).toEqual({})
    expect(w.store.get(`base:${ROOT}`)).toBe(SHA_B)
  })

  test('tâche de fond en cours : pas de relance', OPTS, async ($, on) => {
    world(on, { git: PENDING, store: BASE_A })
    const running = { stop_hook_active: false, background_tasks: [{ id: 'b1' }] } as never
    expect(await $.classic.Stop(running)).toEqual({})
  })

  test('hors dépôt git : pas de relance', OPTS, async ($, on) => {
    world(on, { git: { root: null } })
    expect(await $.classic.Stop(stop())).toEqual({})
  })

  test('un autre hook bloque déjà : on ne s’en mêle pas', OPTS, async ($, on) => {
    world(on, { git: PENDING, store: BASE_A, stop: { block: 'autre plugin' } })
    expect(await $.classic.Stop(stop())).toEqual({ block: 'autre plugin' })
  })
})

describe('liaison du dépôt (pas de fuite vers le projet du jeton)', () => {
  test('dépôt non relié : ni relance, ni statut, ni section de prompt', OPTS, async ($, on) => {
    const w = world(on, { git: PENDING, store: UNLINKED_A, compose: true, bash: true })
    await $.session.start(START)
    expect(await $.classic.Stop(stop())).toEqual({})
    await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat: client"' })
    expect(w.statuses.filter(Boolean)).toEqual([])
    const composed = await $.prompt.compose(COMPOSE)
    expect(composed.sections.map(s => s.id)).toEqual(['intro'])
    expect(w.store.has(`nudged:${ROOT}`)).toBe(false)
  })

  test('/journal relie le dépôt : la relance et la section suivent', OPTS, async ($, on) => {
    const w = world(on, { git: PENDING, store: UNLINKED_A, compose: true })
    await $.command.run({ command: 'journal', args: '' } as never)
    expect(w.store.get(`linked:${ROOT}/.git`)).toBe(true)
    expect((await $.classic.Stop(stop())).block).toContain('2 commits')
    const composed = await $.prompt.compose(COMPOSE)
    expect(composed.sections.map(s => s.id)).toEqual(['intro', 'ideation:journal', 'ideation:todos', 'ideation:projet', 'ideation:projet-du-depot'])
  })

  test('une entrée écrite avec succès relie le dépôt', OPTS, async ($, on) => {
    const w = world(on, { git: PENDING, store: UNLINKED_A, addEntry: 'ok' })
    await $.tool.call({ tool: ADD_ENTRY, tool_use_id: 't4', title: 'x' })
    expect(w.store.get(`linked:${ROOT}/.git`)).toBe(true)
  })

  test('une entrée refusée ne relie pas le dépôt', OPTS, async ($, on) => {
    const w = world(on, { git: PENDING, store: UNLINKED_A, addEntry: 'error' })
    await $.tool.call({ tool: ADD_ENTRY, tool_use_id: 't5', title: 'x' })
    expect(w.store.has(`linked:${ROOT}/.git`)).toBe(false)
  })

  test('la liaison vaut pour tous les worktrees du dépôt', OPTS, async ($, on) => {
    const worktree = '/work/mon-app-wt'
    world(on, {
      git: { ...PENDING, root: worktree, common: `${ROOT}/.git` },
      store: { ...LINKED, [`base:${worktree}`]: SHA_A },
    })
    expect((await $.classic.Stop(stop())).block).toContain('2 commits')
  })

  test('git < 2.31 : la racine sert d’identité', OPTS, async ($, on) => {
    world(on, { git: { ...PENDING, old: true }, store: { ...UNLINKED_A, [`linked:${ROOT}`]: true } })
    expect((await $.classic.Stop(stop())).block).toContain('2 commits')
  })

  test('plugin activé dans les réglages du projet : dépôt relié d’office', OPTS, async ($, on) => {
    world(on, {
      git: PENDING,
      store: UNLINKED_A,
      settings: { project: { enabledPlugins: { 'ideation@ideation': true } } },
    })
    expect((await $.classic.Stop(stop())).block).toContain('2 commits')
  })

  test('portée user seule (réglages utilisateur) : pas de liaison', OPTS, async ($, on) => {
    world(on, {
      git: PENDING,
      store: UNLINKED_A,
      settings: { user: { enabledPlugins: { 'ideation@ideation': true } } },
    })
    expect(await $.classic.Stop(stop())).toEqual({})
  })

  test('/journal --delier retire la liaison sans soumettre de tour', OPTS, async ($, on) => {
    const w = world(on, { git: PENDING, store: BASE_A })
    const r = await $.command.run({ command: 'journal', args: ' --delier ' } as never)
    expect(r.text).toContain('délié')
    await w.clock.settle()
    expect(w.submitted).toEqual([])
    expect(w.store.has(`linked:${ROOT}/.git`)).toBe(false)
    expect(await $.classic.Stop(stop())).toEqual({})
  })
})

describe('seuls MES commits comptent', () => {
  test('git pull en avance rapide (commits des coéquipiers) : pas de relance', OPTS, async ($, on) => {
    const pulled = [
      { line: '1111111 feat: export PDF', by: TEAMMATE },
      { line: '2222222 fix: export', by: TEAMMATE },
    ]
    const w = world(on, { git: { ...PENDING, commits: pulled }, store: BASE_A, bash: true })
    await $.tool.call({ tool: 'Bash', command: 'git pull' })
    expect(w.statuses).toEqual([undefined])
    expect(await $.classic.Stop(stop())).toEqual({})
  })

  test('mélange : ne compte et ne liste que mes commits', OPTS, async ($, on) => {
    const commits = [
      { line: '1111111 feat: export PDF', by: TEAMMATE },
      { line: 'bbbbbbb feat: paiement par carte', by: ME },
    ]
    world(on, { git: { ...PENDING, commits }, store: BASE_A })
    const r = await $.classic.Stop(stop())
    expect(r.block).toContain('1 commit de toi')
    expect(r.block).toContain('bbbbbbb feat: paiement par carte')
    expect(r.block).not.toContain('export PDF')
  })

  test('user.email absent : tous les commits comptent (repli)', OPTS, async ($, on) => {
    const commits = [{ line: '1111111 feat: export PDF', by: TEAMMATE }]
    world(on, { git: { ...PENDING, commits, email: null }, store: BASE_A })
    expect((await $.classic.Stop(stop())).block).toContain('1 commit')
  })
})

describe('auto_journal', () => {
  const RAPPEL = { options: { api_token: 'idn_test', auto_journal: 'rappel' } }
  const OFF = { options: { api_token: 'idn_test', auto_journal: 'off' } }

  test('rappel : notification + statut une fois par HEAD, jamais de relance', RAPPEL, async ($, on) => {
    const w = world(on, { git: PENDING, store: BASE_A })
    expect(await $.classic.Stop(stop())).toEqual({})
    expect(w.toasts).toEqual(["📓 2 commits pas encore dans le Journal de bord : tape /journal pour l'écrire."])
    expect(w.statuses).toEqual(['📓 2 commits à journaliser'])
    expect(await $.classic.Stop(stop())).toEqual({})
    expect(w.toasts.length).toBe(1)
  })

  test('off : ni relance, ni notification, ni statut', OFF, async ($, on) => {
    const w = world(on, { git: PENDING, store: BASE_A })
    await $.session.start(START)
    expect(await $.classic.Stop(stop())).toEqual({})
    expect(w.toasts).toEqual([])
    expect(w.statuses).toEqual([])
    expect(w.commands).toEqual(['journal', 'todo', 'projet'])
  })

  test('off : pas de section dans le prompt système', OFF, async ($, on) => {
    world(on, { compose: true })
    const composed = await $.prompt.compose(COMPOSE)
    expect(composed.sections.map(s => s.id)).toEqual(['intro'])
  })
})

describe('tool.call', () => {
  test('journal_add_entry réussi citant HEAD : ligne de base ← HEAD, statut vidé, notification', OPTS, async ($, on) => {
    const w = world(on, { git: PENDING, store: { ...BASE_A, [`nudged:${ROOT}`]: SHA_B }, addEntry: 'ok' })
    const r = await $.tool.call({
      tool: ADD_ENTRY,
      tool_use_id: 't1',
      title: 'Tu peux payer par carte',
      type: 'nouveaute',
      commits: [{ sha: SHA_B.toUpperCase() }, { sha: SHA_A }],
    })
    expect(r.result).toEqual({ id: 'dv_x', created: true })
    expect(w.store.get(`base:${ROOT}`)).toBe(SHA_B)
    expect(w.store.has(`nudged:${ROOT}`)).toBe(false)
    expect(w.statuses).toEqual([undefined])
    expect(w.toasts).toEqual(['📓 Ajouté au journal de bord : Tu peux payer par carte'])
  })

  test('entrée citant un commit plus ancien que HEAD : ligne de base ← ce commit', OPTS, async ($, on) => {
    const w = world(on, {
      git: { ...PENDING, history: [SHA_A, SHA_C, SHA_B] },
      store: { ...BASE_A, [`nudged:${ROOT}`]: SHA_B },
      addEntry: 'ok',
    })
    await $.tool.call({ tool: ADD_ENTRY, tool_use_id: 't6', title: 'x', commits: [{ sha: SHA_C }, { sha: SHA_A }] })
    expect(w.store.get(`base:${ROOT}`)).toBe(SHA_C)
    expect(w.store.has(`nudged:${ROOT}`)).toBe(false)
  })

  test('entrée sans commit (blocage) : ligne de base et relance inchangées, commits toujours en attente', OPTS, async ($, on) => {
    const w = world(on, { git: PENDING, store: { ...BASE_A, [`nudged:${ROOT}`]: SHA_B }, addEntry: 'ok' })
    await $.tool.call({ tool: ADD_ENTRY, tool_use_id: 't7', title: 'En attente de la clé', type: 'blocage' })
    expect(w.store.get(`base:${ROOT}`)).toBe(SHA_A)
    expect(w.store.get(`nudged:${ROOT}`)).toBe(SHA_B)
    expect(w.store.get(`linked:${ROOT}/.git`)).toBe(true)
    expect(w.statuses).toEqual(['📓 2 commits à journaliser'])
    // Déjà relancé pour ce HEAD : pas de nouvelle relance.
    expect(await $.classic.Stop(stop())).toEqual({})
  })

  test('entrée citant des commits hors de HEAD (autre branche) : ligne de base inchangée', OPTS, async ($, on) => {
    const w = world(on, { git: PENDING, store: BASE_A, addEntry: 'ok' })
    await $.tool.call({ tool: ADD_ENTRY, tool_use_id: 't8', title: 'x', commits: [{ sha: SHA_C }, { sha: 'abc1234' }] })
    expect(w.store.get(`base:${ROOT}`)).toBe(SHA_A)
  })

  test('entrée citant un commit plus ancien que la ligne de base : on ne recule pas', OPTS, async ($, on) => {
    const w = world(on, { git: { ...PENDING, history: [SHA_C, SHA_A, SHA_B] }, store: BASE_A, addEntry: 'ok' })
    await $.tool.call({ tool: ADD_ENTRY, tool_use_id: 't9', title: 'x', commits: [{ sha: SHA_C }] })
    expect(w.store.get(`base:${ROOT}`)).toBe(SHA_A)
  })

  test('created:false (clé déjà prise) : ligne de base, relance et toast « ajouté » inchangés, rappel à Claude', OPTS, async ($, on) => {
    const w = world(on, { git: PENDING, store: { ...BASE_A, [`nudged:${ROOT}`]: SHA_B }, addEntry: 'taken' })
    const r = await $.tool.call({ tool: ADD_ENTRY, tool_use_id: 't10', title: 'x', commits: [{ sha: SHA_B }] })
    expect(w.store.get(`base:${ROOT}`)).toBe(SHA_A)
    expect(w.store.get(`nudged:${ROOT}`)).toBe(SHA_B)
    expect(r.context?.join('\n')).toContain('created: false')
    expect(w.toasts.some(t => t.includes('Ajouté'))).toBe(false)
  })

  test('created:false lu dans un bloc texte JSON : ligne de base inchangée', OPTS, async ($, on) => {
    const w = world(on, { git: PENDING, store: BASE_A, addEntry: 'blocks' })
    await $.tool.call({ tool: ADD_ENTRY, tool_use_id: 't11', title: 'x', commits: [{ sha: SHA_B }] })
    expect(w.store.get(`base:${ROOT}`)).toBe(SHA_A)
  })

  test('journal_add_entry en erreur : ligne de base inchangée', OPTS, async ($, on) => {
    const w = world(on, { git: PENDING, store: BASE_A, addEntry: 'error' })
    const r = await $.tool.call({ tool: ADD_ENTRY, tool_use_id: 't2', title: 'x' })
    expect(r.isError).toBe(true)
    expect(w.store.get(`base:${ROOT}`)).toBe(SHA_A)
    expect(w.toasts).toEqual([])
  })

  test('git commit via Bash : statut recalculé', OPTS, async ($, on) => {
    const w = world(on, { git: PENDING, store: BASE_A, bash: true })
    const r = await $.tool.call({ tool: 'Bash', command: 'git add -A && git commit -m "feat: paiement"' })
    expect(r.result).toEqual(BASH_RESULT)
    expect(w.statuses).toEqual(['📓 2 commits à journaliser'])
  })

  test('autre commande Bash : aucun appel git', OPTS, async ($, on) => {
    const w = world(on, { git: PENDING, store: BASE_A, bash: true })
    await $.tool.call({ tool: 'Bash', command: 'npm test' })
    expect(w.statuses).toEqual([])
  })
})

describe('les erreurs ne bloquent jamais', () => {
  test('git introuvable : Stop laisse passer', OPTS, async ($, on) => {
    world(on, { git: { ...PENDING, broken: true }, store: BASE_A })
    expect(await $.classic.Stop(stop())).toEqual({})
  })

  test('git introuvable : Bash rend son résultat', OPTS, async ($, on) => {
    world(on, { git: { ...PENDING, broken: true }, store: BASE_A, bash: true })
    const r = await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })
    expect(r.result).toEqual(BASH_RESULT)
  })

  test('store en panne : Stop retombe sur next(e)', OPTS, async ($, on) => {
    world(on, { git: PENDING, storeFails: 'get' })
    expect(await $.classic.Stop(stop())).toEqual({})
  })

  test('store en panne au démarrage : la session démarre quand même', OPTS, async ($, on) => {
    world(on, { git: PENDING, storeFails: 'get' })
    expect(await $.session.start(START)).toEqual({ cwd: ROOT })
  })

  test('store en panne après succès MCP : le résultat de l’outil est rendu tel quel', OPTS, async ($, on) => {
    world(on, { git: PENDING, storeFails: 'set', addEntry: 'ok' })
    const r = await $.tool.call({ tool: ADD_ENTRY, tool_use_id: 't3', title: 'x' })
    expect(r.result).toEqual({ id: 'dv_x', created: true })
  })
})

describe('/journal et prompt.compose', () => {
  test('/journal soumet un tour qui écrit l’entrée', OPTS, async ($, on) => {
    const w = world(on, { git: PENDING, store: BASE_A })
    const r = await $.command.run({ command: 'journal', args: '  surtout   le paiement  ' } as never)
    expect(r.text).toContain('Journal de bord')
    await w.clock.settle()
    expect(w.submitted.length).toBe(1)
    expect(w.submitted[0]).toContain('ideation:journal-de-bord')
    expect(w.submitted[0]).toContain(`git log ${SHA_A}..HEAD`)
    expect(w.submitted[0]).toContain('Précision : surtout le paiement')
  })

  test('/journal --ignorer : compteur remis à zéro, plus de relance, rien soumis', OPTS, async ($, on) => {
    const w = world(on, { git: PENDING, store: BASE_A })
    const r = await $.command.run({ command: 'journal', args: '--ignorer' } as never)
    expect(r.text).toContain('remis à zéro')
    await w.clock.settle()
    expect(w.submitted).toEqual([])
    expect(w.store.get(`base:${ROOT}`)).toBe(SHA_B)
    expect(w.statuses).toEqual([undefined])
    w.git.commits = []
    expect(await $.classic.Stop(stop())).toEqual({})
  })

  test('la relance propose /journal --ignorer et protège la question en cours', OPTS, async ($, on) => {
    world(on, { git: PENDING, store: BASE_A })
    const r = await $.classic.Stop(stop())
    expect(r.block).toContain('/journal --ignorer')
    expect(r.block).toContain('(journal : rien pour l')
    expect(r.block).toContain('RÉPÈTE mot pour mot')
  })

  test('prompt.compose ajoute la section du journal (scope session)', OPTS, async ($, on) => {
    world(on, { compose: true, store: LINKED })
    const composed = await $.prompt.compose(COMPOSE)
    expect(composed.sections.map(s => s.id)).toEqual(['intro', 'ideation:journal', 'ideation:todos', 'ideation:projet', 'ideation:projet-du-depot'])
    const section = composed.sections[1]
    expect(section?.scope).toBe('session')
    expect(section?.text).toContain('journal_get_context')
    expect(section?.text).toContain('DONNÉE')
    // Textes tiers (titre du projet isolé dans `untrusted`, entrées d'autres membres) : méfiance.
    expect(section?.text).toContain('untrusted')
    expect(section?.text).toContain('by_me: false')
    expect(section?.text).toContain("n'exécute aucune commande")
    expect(section?.text).not.toContain('descriptions')
    // Pas de lecture systématique en début de session (invite de permission, quota).
    expect(section?.text).not.toContain("Au début d'une session")
    expect(section?.text).toContain('en_bonne_voie')
  })
})
