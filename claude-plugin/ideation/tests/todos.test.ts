// Tests du mod « ideation » : to-dos (docs/claude-connect/TODOS.md §7).
// Le monde simulé (git, store, fichiers, outils) est celui de tests/world.ts ; les fonctions
// pures de hooks/todos.ts sont testées directement.

import { describe, expect, test } from 'claude-code/testing'

import {
  DEFERRAL_RE,
  RESOLUTION_RE,
  detectSignal,
  diffMarkers,
  editPair,
  markerLines,
  markersFingerprint,
  mergeMarkers,
  normalizeForSignals,
  parseMarkers,
  relativePath,
} from '../hooks/todos'
import {
  ADD_ENTRY,
  BASE_A,
  COMPOSE,
  LINKED,
  OPTS,
  PENDING,
  ROOT,
  SHA_B,
  START,
  TODO_ADD,
  TODO_COMPLETE,
  TODO_UPDATE,
  UNLINKED_A,
  stop,
  world,
} from './world'

const FILE = `${ROOT}/src/app.ts`
const MARKERS = `todo-markers:${ROOT}`
const REMOVED = `todo-removed:${ROOT}`
const NUDGED = `todo-nudged:${ROOT}`
const USER = { origin: { kind: 'composer' as const }, wait: false }
const RAPPEL = { options: { api_token: 'idn_test', auto_todos: 'rappel' } }
const OFF = { options: { api_token: 'idn_test', auto_todos: 'off' } }
const JOURNAL_OFF = { options: { api_token: 'idn_test', auto_journal: 'off' } }
const RAPPEL_JOURNAL_OFF = { options: { api_token: 'idn_test', auto_todos: 'rappel', auto_journal: 'off' } }
const JOURNAL_RAPPEL = { options: { api_token: 'idn_test', auto_journal: 'rappel' } }
const MARKER = '// TODO: gérer le mode hors ligne'
const STORED = [{ path: 'src/app.ts', line: 3, text: MARKER }]

const normalized = (text: string) => normalizeForSignals(text)

describe('regex des messages (FR + EN)', () => {
  test('reports repérés', OPTS, async () => {
    for (const text of [
      'On verra ça plus tard',
      "Pour l'instant on laisse ça comme ça",
      'Laisse ça de côté',
      'on verra ça après',
      'note-le quelque part',
      "N’oublie pas de mettre à jour la doc",
      'Il faudra gérer les remboursements',
      'reste à faire : le mode sombre',
      'Ajoute une todo pour le paiement',
      'la prochaine fois, regarde le cache',
      "Let's do that later",
      'Remind me to rotate the key',
      "don't forget the migration",
      "For now, let's leave it",
      'put it on the backlog',
    ]) {
      expect(DEFERRAL_RE.test(normalized(text))).toBe(true)
    }
  })

  test('résolutions repérées', OPTS, async () => {
    for (const text of [
      "C'est réglé !",
      "c’est corrigé",
      "C'est bon pour le paiement",
      'Ça marche maintenant',
      "J'ai corrigé le bug du panier",
      'Le bug est résolu',
      "plus besoin de l'export CSV",
      "It's fixed",
      'works now, thanks',
      'I fixed it',
      "I've finished the export",
    ]) {
      expect(RESOLUTION_RE.test(normalized(text))).toBe(true)
    }
  })

  test('rien dans un message ordinaire', OPTS, async () => {
    for (const text of [
      'Ajoute un bouton pour exporter en PDF',
      'Pourquoi ce test échoue ?',
      'Translate this file into English',
      'Le plateau est latéral',
    ]) {
      expect(detectSignal(text)).toBe(null)
    }
  })

  test('les TODO collés dans du code ne comptent pas, les commandes slash non plus', OPTS, async () => {
    expect(detectSignal('Regarde :\n```ts\n// TODO: plus tard\n```')).toBe(null)
    expect(detectSignal('Que fait `todo_list` ?')).toBe(null)
    expect(detectSignal('/todo plus tard')).toBe(null)
  })

  test('report et résolution dans le même message', OPTS, async () => {
    expect(detectSignal("C'est réglé ; le reste, plus tard")).toEqual({ deferral: true, resolution: true })
  })
})

describe('marqueurs (fonctions pures)', () => {
  test('ne compte que les marqueurs en commentaire', OPTS, async () => {
    const text = [
      'const a = 1 // TODO: vrai marqueur',
      '# FIXME gérer Windows',
      '/* HACK contournement */',
      ' * TODO dans un JSDoc',
      '<!-- XXX à revoir -->',
      '-- TODO index manquant',
      'Il reste un TODO dans la doc',
      'const key = "sk-XXX"',
      'todo_list()',
      'url = "https://exemple.fr/TODO"',
    ].join('\n')
    expect(markerLines(text)).toEqual([
      'const a = 1 // TODO: vrai marqueur',
      '# FIXME gérer Windows',
      '/* HACK contournement */',
      '* TODO dans un JSDoc',
      '<!-- XXX à revoir -->',
      '-- TODO index manquant',
    ])
  })

  test('caractères invisibles retirés, ligne coupée à 160', OPTS, async () => {
    const [line] = markerLines(`// TODO: a\u200bb\u202e ${'x'.repeat(300)}`)
    expect(line?.startsWith('// TODO: ab x')).toBe(true)
    expect(line?.length).toBe(160)
  })

  test('diff : ajoutés et retirés', OPTS, async () => {
    expect(diffMarkers('// TODO: a\n// TODO: b', '// TODO: b\n// FIXME: c')).toEqual({
      added: ['// FIXME: c'],
      removed: ['// TODO: a'],
    })
    expect(diffMarkers('// TODO: a', '// TODO: a\n// TODO: a')).toEqual({ added: ['// TODO: a'], removed: [] })
    expect(diffMarkers('x', 'y')).toEqual({ added: [], removed: [] })
  })

  test('chemins : relatifs sous la racine seulement', OPTS, async () => {
    expect(relativePath(ROOT, FILE)).toBe('src/app.ts')
    expect(relativePath(ROOT, '/work/autre/src/app.ts')).toBe(null)
    expect(relativePath(ROOT, '/work/mon-app-2/x.ts')).toBe(null)
    expect(relativePath(ROOT, `${ROOT}/../x.ts`)).toBe(null)
    expect(relativePath(ROOT, `${ROOT}/.git/config`)).toBe(null)
    expect(relativePath(ROOT, `${ROOT}/node_modules/a/b.js`)).toBe(null)
    expect(relativePath(ROOT, 'src/app.ts')).toBe(null)
    expect(relativePath('C:/Projets/App', 'c:\\Projets\\App\\src\\a.ts')).toBe('src/a.ts')
  })

  test('chemins : ≤ 240 caractères (limite serveur de code_refs[].path)', OPTS, async () => {
    const at = (n: number) => `src/${'d'.repeat(n - 7)}.ts`
    expect(relativePath(ROOT, `${ROOT}/${at(240)}`)).toBe(at(240))
    expect(relativePath(ROOT, `${ROOT}/${at(241)}`)).toBe(null)
    const [stored] = parseMarkers([{ path: 'p'.repeat(300), text: '// TODO x' }])
    expect(stored?.path.length).toBe(240)
  })

  test('editPair : rejoue l’édition sur le fichier d’avant, sinon compare les fragments', OPTS, async () => {
    const input = { old_string: 'TODO: a', new_string: 'fait' }
    expect(editPair('Edit', input, '// TODO: a\nb')).toEqual({ before: '// TODO: a\nb', after: '// fait\nb' })
    expect(editPair('Edit', input, null)).toEqual({ before: 'TODO: a', after: 'fait' })
    expect(editPair('Edit', input, 'autre chose')).toEqual({ before: 'TODO: a', after: 'fait' })
    expect(editPair('Edit', { ...input, replace_all: true }, '// TODO: a\n# TODO: a')).toEqual({
      before: '// TODO: a\n# TODO: a',
      after: '// fait\n# fait',
    })
    expect(diffMarkers('// TODO: a\nb', '// fait\nb')).toEqual({ added: [], removed: ['// TODO: a'] })
  })

  test('fusion : dédoublonnée, plafonnée à 20, ajout puis retrait = rien', OPTS, async () => {
    const m = (i: number) => ({ path: 'a.ts', text: `// TODO ${i}` })
    const many = mergeMarkers({ added: [], removed: [] }, Array.from({ length: 25 }, (_, i) => m(i)), [])
    expect(many.added.length).toBe(20)
    expect(many.added[0]?.text).toBe('// TODO 5')
    const again = mergeMarkers(many, [m(24)], [])
    expect(again.added.length).toBe(20)
    expect(again.added.filter(x => x.text === '// TODO 24').length).toBe(1)
    const cancelled = mergeMarkers({ added: [m(1)], removed: [] }, [], [m(1)])
    expect(cancelled).toEqual({ added: [], removed: [] })
    const restored = mergeMarkers({ added: [], removed: [m(2)] }, [m(2)], [])
    expect(restored).toEqual({ added: [], removed: [] })
  })

  test('empreinte stable quel que soit l’ordre', OPTS, async () => {
    const a = { path: 'a.ts', text: '// TODO a' }
    const b = { path: 'b.ts', line: 4, text: '// TODO b' }
    expect(markersFingerprint({ added: [a, b], removed: [] })).toBe(markersFingerprint({ added: [b, a], removed: [] }))
    expect(markersFingerprint({ added: [a], removed: [] })).not.toBe(markersFingerprint({ added: [], removed: [a] }))
  })
})

describe('prompt.submit : indice sur le message de l’utilisateur', () => {
  test('report : un contexte « Signal Idéation », texte intact', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED })
    const r = await $.prompt.submit({ text: 'On verra le mode sombre plus tard', ...USER })
    expect(w.submitted).toEqual(['On verra le mode sombre plus tard'])
    expect(r.text).toBe('On verra le mode sombre plus tard')
    expect(w.contexts[0]?.length).toBe(1)
    expect(w.contexts[0]?.[0]).toContain('Signal Idéation :')
    expect(w.contexts[0]?.[0]).toContain('todo_add')
    expect(w.contexts[0]?.[0]).toContain('ideation:todos')
  })

  test('résolution : indice vers todo_complete', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED })
    await $.prompt.submit({ text: "J'ai corrigé, ça marche maintenant", ...USER })
    expect(w.contexts[0]?.[0]).toContain('todo_complete')
    expect(w.contexts[0]?.[0]).not.toContain('todo_add')
  })

  test('les deux : un seul bloc', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED })
    await $.prompt.submit({ text: "C'est réglé. Le reste, plus tard.", ...USER })
    expect(w.contexts[0]?.length).toBe(1)
    expect(w.contexts[0]?.[0]).toContain('todo_add')
    expect(w.contexts[0]?.[0]).toContain('todo_complete')
  })

  test('message envoyé par Remote Control : indice aussi', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED })
    await $.prompt.submit({ text: 'remind me later', origin: { kind: 'bridge' }, wait: false })
    expect(w.contexts[0]?.length).toBe(1)
  })

  test('contexte déjà présent : gardé, l’indice s’ajoute à la suite', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED })
    await $.prompt.submit({ text: 'plus tard', context: ['autre plugin'], ...USER })
    expect(w.contexts[0]?.[0]).toBe('autre plugin')
    expect(w.contexts[0]?.length).toBe(2)
  })

  test('au plus un indice par message', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED })
    await $.prompt.submit({ text: 'plus tard', context: ['Signal Idéation : déjà là'], ...USER })
    expect(w.contexts[0]).toEqual(['Signal Idéation : déjà là'])
  })

  test('sans signal : rien', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED })
    await $.prompt.submit({ text: 'Ajoute un bouton Exporter', ...USER })
    expect(w.contexts).toEqual([undefined])
  })

  test('prompt d’un plugin (même asUser), d’un pair, d’une notification : rien', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED })
    for (const origin of [
      { kind: 'plugin' as const, name: 'autre', asUser: true as const },
      { kind: 'peer' as const },
      { kind: 'task-notification' as const },
      { kind: 'scheduled-trigger' as const },
    ]) {
      await $.prompt.submit({ text: 'plus tard, fixed', origin, wait: false })
    }
    expect(w.contexts).toEqual([undefined, undefined, undefined, undefined])
  })

  test('dépôt non relié : rien', OPTS, async ($, on) => {
    const w = world(on, { store: UNLINKED_A })
    await $.prompt.submit({ text: 'plus tard', ...USER })
    expect(w.contexts).toEqual([undefined])
  })

  test('auto_todos = off : rien', OFF, async ($, on) => {
    const w = world(on, { store: LINKED })
    await $.prompt.submit({ text: 'plus tard', ...USER })
    expect(w.contexts).toEqual([undefined])
  })

  test('store en panne : le message passe tel quel', OPTS, async ($, on) => {
    const w = world(on, { storeFails: 'get' })
    const r = await $.prompt.submit({ text: 'plus tard', ...USER })
    expect(r.text).toBe('plus tard')
    expect(w.submitted).toEqual(['plus tard'])
  })
})

describe('tool.call Edit / MultiEdit / Write : marqueurs', () => {
  const after = `import x from 'y'\n\n${MARKER}\nexport {}`
  const before = `import x from 'y'\n\nexport {}`

  test('Edit qui ajoute un TODO : mémorisé avec chemin et ligne, résultat intact', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED, edits: 'ok', files: { [FILE]: before } })
    const r = await $.tool.call({ tool: 'Edit', file_path: FILE, old_string: 'export {}', new_string: `${MARKER}\nexport {}` })
    expect(r.result).toEqual({ filePath: FILE })
    expect(r.context).toBe(undefined)
    expect(w.store.get(MARKERS)).toEqual(STORED)
    expect(w.store.has(REMOVED)).toBe(false)
    expect(w.toasts).toEqual([])
  })

  test('fragment partiel : la ligne entière est gardée', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED, edits: 'ok', files: { [FILE]: `a\nconst n = 1` } })
    await $.tool.call({ tool: 'Edit', file_path: FILE, old_string: 'const n = 1', new_string: 'const n = 1 // TODO: borne max' })
    expect(w.store.get(MARKERS)).toEqual([{ path: 'src/app.ts', line: 2, text: 'const n = 1 // TODO: borne max' }])
  })

  test('Edit qui retire un TODO : mémorisé comme retiré', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED, edits: 'ok', files: { [FILE]: `${MARKER}\nexport {}` } })
    await $.tool.call({ tool: 'Edit', file_path: FILE, old_string: `${MARKER}\nexport {}`, new_string: 'export {}' })
    expect(w.store.get(REMOVED)).toEqual([{ path: 'src/app.ts', text: MARKER }])
    expect(w.store.has(MARKERS)).toBe(false)
  })

  test('TODO ajouté puis retiré pendant le travail : oublié', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED, edits: 'ok', files: { [FILE]: before } })
    await $.tool.call({ tool: 'Edit', file_path: FILE, old_string: 'export {}', new_string: `${MARKER}\nexport {}` })
    await $.tool.call({ tool: 'Edit', file_path: FILE, old_string: `${MARKER}\n`, new_string: '' })
    expect(w.store.has(MARKERS)).toBe(false)
    expect(w.store.has(REMOVED)).toBe(false)
  })

  test('fragment sans l’ouverture du commentaire : retrait et ajout repérés sur la ligne entière', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED, edits: 'ok', files: { [FILE]: 'a\n  // TODO: persister le panier\nb' } })
    await $.tool.call({ tool: 'Edit', file_path: FILE, old_string: 'TODO: persister le panier', new_string: 'Persiste le panier' })
    expect(w.store.get(REMOVED)).toEqual([{ path: 'src/app.ts', text: '// TODO: persister le panier' }])
    expect(w.store.has(MARKERS)).toBe(false)
    // Ajout écrit après un `// ` déjà présent : la ligne entière, avec son numéro.
    await $.tool.call({ tool: 'Edit', file_path: FILE, old_string: 'Persiste le panier', new_string: 'FIXME: vider le cache' })
    expect(w.store.get(MARKERS)).toEqual([{ path: 'src/app.ts', line: 2, text: '// FIXME: vider le cache' }])
  })

  test('marqueur vidé (« // » laissé seul) : retiré ; MultiEdit rejoué dans l’ordre', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED, edits: 'ok', files: { [FILE]: '# HACK: délai fixe\nx = 1' } })
    await $.tool.call({
      tool: 'MultiEdit',
      file_path: FILE,
      edits: [
        { old_string: 'HACK: délai fixe', new_string: 'étape' },
        { old_string: 'étape', new_string: '' },
      ],
    } as never)
    expect(w.store.get(REMOVED)).toEqual([{ path: 'src/app.ts', text: '# HACK: délai fixe' }])
  })

  test('Edit sur un fichier illisible : seuls les fragments sont comparés', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED, edits: 'ok', fsFails: true, files: { [FILE]: 'x' } })
    await $.tool.call({ tool: 'Edit', file_path: FILE, old_string: 'x', new_string: MARKER })
    expect(w.store.get(MARKERS)).toEqual([{ path: 'src/app.ts', text: MARKER }])
  })

  test('Write d’un nouveau fichier : comparé à un fichier vide', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED, edits: 'ok' })
    await $.tool.call({ tool: 'Write', file_path: FILE, content: after })
    expect(w.store.get(MARKERS)).toEqual(STORED)
  })

  test('Write qui réécrit un fichier : comparé au contenu précédent', OPTS, async ($, on) => {
    const before = `# FIXME: chemin Windows\n${MARKER}\n`
    const w = world(on, { store: LINKED, edits: 'ok', files: { [FILE]: before } })
    await $.tool.call({ tool: 'Write', file_path: FILE, content: `${MARKER}\nok\n// HACK: délai fixe` })
    expect(w.store.get(MARKERS)).toEqual([{ path: 'src/app.ts', line: 3, text: '// HACK: délai fixe' }])
    expect(w.store.get(REMOVED)).toEqual([{ path: 'src/app.ts', text: '# FIXME: chemin Windows' }])
  })

  test('Write sur un fichier existant illisible : on s’abstient', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED, edits: 'ok', fsFails: true, files: { [FILE]: MARKER } })
    const r = await $.tool.call({ tool: 'Write', file_path: FILE, content: '// TODO: autre' })
    expect(r.result).toEqual({ filePath: FILE })
    expect(w.store.has(MARKERS)).toBe(false)
    expect(w.store.has(REMOVED)).toBe(false)
  })

  test('MultiEdit : toutes les modifications comparées', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED, edits: 'ok', files: { [FILE]: `${before}\n// XXX vieux contournement` } })
    await $.tool.call({
      tool: 'MultiEdit',
      file_path: FILE,
      edits: [
        { old_string: 'export {}', new_string: `${MARKER}\nexport {}` },
        { old_string: '// XXX vieux contournement', new_string: '' },
      ],
    } as never)
    expect(w.store.get(MARKERS)).toEqual(STORED)
    expect(w.store.get(REMOVED)).toEqual([{ path: 'src/app.ts', text: '// XXX vieux contournement' }])
  })

  test('mots « TODO » hors commentaire : rien', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED, edits: 'ok' })
    await $.tool.call({ tool: 'Write', file_path: `${ROOT}/README.md`, content: 'Il reste un TODO.\nVoir todo_list.' })
    expect(w.store.has(MARKERS)).toBe(false)
  })

  test('mêmes marqueurs deux fois : un seul ; plafond de 20', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED, edits: 'ok' })
    await $.tool.call({ tool: 'Write', file_path: FILE, content: after })
    await $.tool.call({ tool: 'Write', file_path: `${ROOT}/src/b.ts`, content: '' })
    const many = Array.from({ length: 25 }, (_, i) => `// TODO tâche ${i}`).join('\n')
    await $.tool.call({ tool: 'Write', file_path: `${ROOT}/src/c.ts`, content: many })
    const stored = w.store.get(MARKERS) as { text: string }[]
    expect(stored.length).toBe(20)
    expect(stored.at(-1)?.text).toBe('// TODO tâche 24')
  })

  test('outil en erreur : rien de mémorisé, erreur rendue telle quelle', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED, edits: 'error' })
    const r = await $.tool.call({ tool: 'Edit', file_path: FILE, old_string: 'a', new_string: MARKER })
    expect(r.isError).toBe(true)
    expect(w.store.has(MARKERS)).toBe(false)
  })

  test('dépôt non relié : rien', OPTS, async ($, on) => {
    const w = world(on, { store: UNLINKED_A, edits: 'ok' })
    await $.tool.call({ tool: 'Write', file_path: FILE, content: after })
    expect(w.store.has(MARKERS)).toBe(false)
  })

  test('fichier hors du dépôt : rien', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED, edits: 'ok' })
    await $.tool.call({ tool: 'Write', file_path: '/tmp/notes.ts', content: after })
    expect(w.store.has(MARKERS)).toBe(false)
  })

  test('auto_todos = off : rien', OFF, async ($, on) => {
    const w = world(on, { store: LINKED, edits: 'ok' })
    await $.tool.call({ tool: 'Write', file_path: FILE, content: after })
    expect(w.store.has(MARKERS)).toBe(false)
  })

  test('store en panne : le résultat de l’outil est rendu tel quel', OPTS, async ($, on) => {
    world(on, { store: LINKED, edits: 'ok', storeFails: 'set' })
    const r = await $.tool.call({ tool: 'Write', file_path: FILE, content: after })
    expect(r.result).toEqual({ filePath: FILE })
  })
})

describe('classic.Stop : une seule relance combinée', () => {
  test('relance du journal enrichie : to-dos fermées par ces commits + marqueurs, marqueurs vidés', OPTS, async ($, on) => {
    const w = world(on, { git: PENDING, store: { ...BASE_A, [MARKERS]: STORED } })
    const r = await $.classic.Stop(stop())
    expect(r.block).toContain('2 commits de toi pas encore dans le Journal de bord')
    expect(r.block).toContain('vérifie aussi si ces commits ferment une to-do ouverte')
    expect(r.block).toContain('todo_complete')
    expect(r.block).toContain(`src/app.ts:3 — « ${MARKER} »`)
    expect(r.block).toContain('origin "code"')
    expect(w.store.has(MARKERS)).toBe(false)
    expect(w.store.get(`nudged:${ROOT}`)).toBe(SHA_B)
  })

  test('relance du journal sans marqueur : rappel to-do seul', OPTS, async ($, on) => {
    world(on, { git: PENDING, store: BASE_A })
    const r = await $.classic.Stop(stop())
    expect(r.block).toContain('ferment une to-do ouverte')
    expect(r.block).not.toContain('Marqueurs')
  })

  test('auto_todos = off : relance du journal inchangée, marqueurs intacts', OFF, async ($, on) => {
    const w = world(on, { git: PENDING, store: { ...BASE_A, [MARKERS]: STORED } })
    const r = await $.classic.Stop(stop())
    expect(r.block).toContain('2 commits de toi')
    expect(r.block).not.toContain('to-do')
    expect(r.block).not.toContain('TODO')
    expect(w.store.get(MARKERS)).toEqual(STORED)
  })

  test('auto_todos = off sans commit : aucune relance', OFF, async ($, on) => {
    world(on, { store: { ...LINKED, [MARKERS]: STORED } })
    expect(await $.classic.Stop(stop())).toEqual({})
  })

  test('marqueurs sans commit : relance to-do seule, une fois par ensemble de marqueurs', OPTS, async ($, on) => {
    const w = world(on, { store: { ...LINKED, [MARKERS]: STORED, [REMOVED]: [{ path: 'b.ts', text: '# FIXME x' }] } })
    const r = await $.classic.Stop(stop())
    expect(r.block).toContain('[Idéation] 2 marqueurs TODO/FIXME')
    expect(r.block).toContain(`ajouté · src/app.ts:3 — « ${MARKER} »`)
    expect(r.block).toContain('retiré · b.ts — « # FIXME x »')
    expect(r.block).toContain('ideation:todos')
    expect(r.block).toContain('RÉPÈTE-la mot pour mot')
    expect(r.block).not.toContain('Journal de bord')
    expect(w.store.has(MARKERS)).toBe(false)
    expect(w.store.has(REMOVED)).toBe(false)
    expect(typeof w.store.get(NUDGED)).toBe('string')
    // Mêmes marqueurs remis (Claude ne les a pas traités) : pas de seconde relance.
    w.store.set(MARKERS, STORED)
    w.store.set(REMOVED, [{ path: 'b.ts', text: '# FIXME x' }])
    expect(await $.classic.Stop(stop())).toEqual({})
    // Un nouveau marqueur : nouvel ensemble, nouvelle relance.
    w.store.set(MARKERS, [...STORED, { path: 'c.ts', text: '// TODO y' }])
    expect((await $.classic.Stop(stop())).block).toContain('c.ts')
  })

  test('plus de 8 marqueurs : liste coupée', OPTS, async ($, on) => {
    const many = Array.from({ length: 11 }, (_, i) => ({ path: 'a.ts', text: `// TODO ${i}` }))
    world(on, { store: { ...LINKED, [MARKERS]: many } })
    const r = await $.classic.Stop(stop())
    expect(r.block).toContain('… et 3 autre(s)')
    expect(r.block).not.toContain('// TODO 8')
  })

  test('auto_journal = off : la relance to-do part quand même', JOURNAL_OFF, async ($, on) => {
    world(on, { git: PENDING, store: { ...BASE_A, [MARKERS]: STORED } })
    const r = await $.classic.Stop(stop())
    expect(r.block).toContain('[Idéation] 1 marqueur TODO/FIXME')
    expect(r.block).not.toContain('Journal de bord')
  })

  test('auto_journal = rappel : toast du journal ET relance to-do', JOURNAL_RAPPEL, async ($, on) => {
    const w = world(on, { git: PENDING, store: { ...BASE_A, [MARKERS]: STORED } })
    const r = await $.classic.Stop(stop())
    expect(w.toasts[0]).toContain('pas encore dans le Journal de bord')
    expect(r.block).toContain('[Idéation] 1 marqueur')
  })

  test('auto_todos = rappel : statut + toast, marqueurs gardés pour /todo, une seule fois', RAPPEL, async ($, on) => {
    const w = world(on, { store: { ...LINKED, [MARKERS]: STORED } })
    expect(await $.classic.Stop(stop())).toEqual({})
    expect(w.toasts).toEqual(['☑️ 1 marqueur TODO à trier — tape /todo pour que Claude les range dans Idéation.'])
    expect(w.statuses).toEqual(['☑️ 1 TODO à trier'])
    expect(w.store.get(MARKERS)).toEqual(STORED)
    expect(await $.classic.Stop(stop())).toEqual({})
    expect(w.toasts.length).toBe(1)
  })

  test('auto_todos = rappel : le statut du journal porte aussi les TODO', RAPPEL, async ($, on) => {
    const w = world(on, { git: PENDING, store: { ...BASE_A, [MARKERS]: STORED } })
    await $.session.start(START)
    expect(w.statuses).toEqual(['📓 2 commits à journaliser · ☑️ 1 TODO à trier'])
  })

  test('auto_todos = rappel avec relance du journal : addendum, marqueurs vidés', RAPPEL, async ($, on) => {
    const w = world(on, { git: PENDING, store: { ...BASE_A, [MARKERS]: STORED } })
    const r = await $.classic.Stop(stop())
    expect(r.block).toContain('ferment une to-do ouverte')
    expect(w.store.has(MARKERS)).toBe(false)
    // Le statut ne garde pas « ☑️ 1 TODO à trier » une fois les marqueurs confiés à Claude.
    expect(w.statuses).toEqual(['📓 2 commits à journaliser'])
  })

  test('auto_todos = rappel, journal coupé : statut TODO au démarrage, vidé par /todo', RAPPEL_JOURNAL_OFF, async ($, on) => {
    const w = world(on, { store: { ...LINKED, [MARKERS]: STORED } })
    await $.session.start(START)
    expect(w.statuses).toEqual(['☑️ 1 TODO à trier'])
    await $.command.run({ command: 'todo', args: '' } as never)
    expect(w.statuses).toEqual(['☑️ 1 TODO à trier', undefined])
  })

  test('auto_todos = rappel : /todo efface le « ☑️ N TODO à trier » du statut du journal', RAPPEL, async ($, on) => {
    const w = world(on, { git: PENDING, store: { ...BASE_A, [MARKERS]: STORED } })
    await $.session.start(START)
    await $.command.run({ command: 'todo', args: '' } as never)
    expect(w.statuses).toEqual(['📓 2 commits à journaliser · ☑️ 1 TODO à trier', '📓 2 commits à journaliser'])
  })

  test('auto_todos = rappel, journal coupé : une entrée écrite garde les TODO au statut', RAPPEL_JOURNAL_OFF, async ($, on) => {
    const w = world(on, { store: { ...LINKED, [MARKERS]: STORED }, addEntry: 'ok' })
    await $.tool.call({ tool: ADD_ENTRY, title: 'x', commits: [] } as never)
    expect(w.statuses).toEqual(['☑️ 1 TODO à trier'])
  })

  test('journal coupé, auto_todos ≠ rappel : aucun statut au démarrage', JOURNAL_OFF, async ($, on) => {
    const w = world(on, { store: { ...LINKED, [MARKERS]: STORED } })
    await $.session.start(START)
    expect(w.statuses).toEqual([])
  })

  test('gardes anti-boucle : stop_hook_active, tâche de fond, autre hook qui bloque', OPTS, async ($, on) => {
    const w = world(on, { store: { ...LINKED, [MARKERS]: STORED } })
    expect(await $.classic.Stop(stop(true))).toEqual({})
    const running = { stop_hook_active: false, background_tasks: [{ id: 'b1' }] } as never
    expect(await $.classic.Stop(running)).toEqual({})
    expect(w.store.get(MARKERS)).toEqual(STORED)
    expect(w.store.has(NUDGED)).toBe(false)
  })

  test('un autre hook bloque déjà : on ne s’en mêle pas', OPTS, async ($, on) => {
    world(on, { store: { ...LINKED, [MARKERS]: STORED }, stop: { block: 'autre plugin' } })
    expect(await $.classic.Stop(stop())).toEqual({ block: 'autre plugin' })
  })

  test('dépôt non relié : jamais de relance to-do', OPTS, async ($, on) => {
    world(on, { store: { [MARKERS]: STORED } })
    expect(await $.classic.Stop(stop())).toEqual({})
  })

  test('ni commit ni marqueur : rien', OPTS, async ($, on) => {
    world(on, { store: LINKED })
    expect(await $.classic.Stop(stop())).toEqual({})
  })

  test('marqueurs illisibles en store : ignorés', OPTS, async ($, on) => {
    world(on, { store: { ...LINKED, [MARKERS]: 'corrompu', [REMOVED]: [{ path: 1 }] } })
    expect(await $.classic.Stop(stop())).toEqual({})
  })
})

describe('tool.call todo_add / todo_update / todo_complete', () => {
  test('todo_add réussi : dépôt relié, toast avec le titre', OPTS, async ($, on) => {
    const w = world(on, { store: UNLINKED_A, todo: { add: 'ok' } })
    const r = await $.tool.call({ tool: TODO_ADD, tool_use_id: 't1', title: 'Ajouter le mode sombre' })
    expect((r.result as { structuredContent?: unknown }).structuredContent).toEqual({
      created: true,
      task: { id: 'td_x', title: 'Titre du serveur' },
      warnings: [],
    })
    expect(w.store.get(`linked:${ROOT}/.git`)).toBe(true)
    expect(w.toasts).toEqual(['☑️ To-do ajoutée : Titre du serveur'])
  })

  test('todo_add created:false : toast discret « rien n’a changé »', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED, todo: { add: 'noop' } })
    await $.tool.call({ tool: TODO_ADD, tool_use_id: 't2', title: 'x' })
    expect(w.toasts).toEqual(["☑️ To-do déjà notée : rien n'a changé"])
  })

  test('todo_update : « mise à jour », ou rien n’a changé', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED, todo: { update: 'ok' } })
    await $.tool.call({ tool: TODO_UPDATE, tool_use_id: 't3', task_id: 'td_x', note: 'précision' })
    expect(w.toasts).toEqual(['✏️ To-do mise à jour : Titre du serveur'])
  })

  test('todo_update changed:false', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED, todo: { update: 'noop' } })
    await $.tool.call({ tool: TODO_UPDATE, tool_use_id: 't4', task_id: 'td_x', priority: 'haute' })
    expect(w.toasts).toEqual(["✏️ To-do : rien n'a changé"])
  })

  test('todo_complete : terminée, ou close avec le motif', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED, todo: { complete: 'ok' } })
    await $.tool.call({ tool: TODO_COMPLETE, tool_use_id: 't5', task_id: 'td_x', summary: 'Fait et commité.' })
    await $.tool.call({ tool: TODO_COMPLETE, tool_use_id: 't6', task_id: 'td_x', resolution: 'obsolete', summary: 'Code supprimé.' })
    await $.tool.call({ tool: TODO_COMPLETE, tool_use_id: 't7', task_id: 'td_x', resolution: 'abandonnee', summary: 'Abandonné, accord.' })
    expect(w.toasts).toEqual([
      '✅ To-do terminée : Titre du serveur',
      '✅ To-do close (obsolète) : Titre du serveur',
      '✅ To-do abandonnée : Titre du serveur',
    ])
  })

  test('todo_complete changed:false : « déjà close »', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED, todo: { complete: 'noop' } })
    await $.tool.call({ tool: TODO_COMPLETE, tool_use_id: 't8', task_id: 'td_x', summary: 'Déjà faite.' })
    expect(w.toasts).toEqual(["✅ To-do déjà close : rien n'a changé"])
  })

  test('erreur ou refus : ni liaison, ni toast, résultat rendu tel quel', OPTS, async ($, on) => {
    const w = world(on, { store: UNLINKED_A, todo: { add: 'error', complete: 'deny' } })
    const r = await $.tool.call({ tool: TODO_ADD, tool_use_id: 't9', title: 'x' })
    expect(r.isError).toBe(true)
    await $.tool.call({ tool: TODO_COMPLETE, tool_use_id: 't10', task_id: 'td_x', summary: 'x' })
    expect(w.store.has(`linked:${ROOT}/.git`)).toBe(false)
    expect(w.toasts).toEqual([])
  })

  test('auto_todos = off : relie le dépôt mais aucun toast', OFF, async ($, on) => {
    const w = world(on, { store: UNLINKED_A, todo: { add: 'ok' } })
    await $.tool.call({ tool: TODO_ADD, tool_use_id: 't11', title: 'x' })
    expect(w.store.get(`linked:${ROOT}/.git`)).toBe(true)
    expect(w.toasts).toEqual([])
  })

  test('store en panne : le résultat est rendu tel quel', OPTS, async ($, on) => {
    world(on, { storeFails: 'set', todo: { add: 'ok' } })
    const r = await $.tool.call({ tool: TODO_ADD, tool_use_id: 't12', title: 'x' })
    expect(r.isError).toBe(undefined)
    expect((r.result as { structuredContent?: { created?: boolean } }).structuredContent?.created).toBe(true)
  })
})

describe('/todo', () => {
  test('avec texte : soumet l’ajout (skill, todo_list puis todo_add) et relie le dépôt', OPTS, async ($, on) => {
    const w = world(on, { store: UNLINKED_A })
    const r = await $.command.run({ command: 'todo', args: '  gérer   les remboursements ' } as never)
    expect(r.text).toContain('ajoute la to-do')
    expect(w.store.get(`linked:${ROOT}/.git`)).toBe(true)
    await w.clock.settle()
    expect(w.submitted.length).toBe(1)
    expect(w.submitted[0]).toContain('ideation:todos')
    expect(w.submitted[0]).toContain('todo_list')
    expect(w.submitted[0]).toContain('todo_add')
    expect(w.submitted[0]).toContain('To-do : gérer les remboursements')
    // Le prompt du plugin ne reçoit pas d'indice (ce n'est pas un message de l'utilisateur).
    expect(w.contexts).toEqual([undefined])
  })

  test('sans texte : fait le point, cite et confie les marqueurs', OPTS, async ($, on) => {
    const w = world(on, { store: { ...LINKED, [MARKERS]: STORED } })
    const r = await $.command.run({ command: 'todo', args: '' } as never)
    expect(r.text).toContain('fait le point')
    await w.clock.settle()
    expect(w.submitted[0]).toContain('Fais le point des to-do Idéation')
    expect(w.submitted[0]).toContain('todo_complete')
    expect(w.submitted[0]).toContain(MARKER)
    expect(w.store.has(MARKERS)).toBe(false)
  })

  test('sans texte ni marqueur', OPTS, async ($, on) => {
    const w = world(on, { store: LINKED })
    await $.command.run({ command: 'todo', args: '   ' } as never)
    await w.clock.settle()
    expect(w.submitted[0]).toContain('Fais le point')
    expect(w.submitted[0]).not.toContain('Marqueurs')
  })

  test('hors dépôt git : la commande marche quand même', OPTS, async ($, on) => {
    const w = world(on, { git: { root: null } })
    await $.command.run({ command: 'todo', args: 'appeler le comptable' } as never)
    await w.clock.settle()
    expect(w.submitted[0]).toContain('appeler le comptable')
  })

  test('disponible même en off', OFF, async ($, on) => {
    const w = world(on, { store: LINKED })
    await $.command.run({ command: 'todo', args: 'x y z' } as never)
    await w.clock.settle()
    expect(w.submitted.length).toBe(1)
  })
})

describe('prompt.compose : section ideation:todos', () => {
  test('dépôt relié : section to-dos (scope session) après celle du journal', OPTS, async ($, on) => {
    world(on, { compose: true, store: LINKED })
    const composed = await $.prompt.compose(COMPOSE)
    expect(composed.sections.map(s => s.id)).toEqual(['intro', 'ideation:journal', 'ideation:todos', 'ideation:projet', 'ideation:projet-du-depot'])
    const section = composed.sections[2]
    expect(section?.scope).toBe('session')
    expect(section?.text).toContain('ideation:todos')
    expect(section?.text).toContain('todo_list')
    expect(section?.text).toContain('TaskCreate')
    expect(section?.text).toContain('DONNÉES')
    expect(section?.text).toContain('by_me: false')
  })

  test('auto_todos = off : section du journal seule', OFF, async ($, on) => {
    world(on, { compose: true, store: LINKED })
    const composed = await $.prompt.compose(COMPOSE)
    expect(composed.sections.map(s => s.id)).toEqual(['intro', 'ideation:journal', 'ideation:projet', 'ideation:projet-du-depot'])
  })

  test('auto_journal = off : section to-dos seule', JOURNAL_OFF, async ($, on) => {
    world(on, { compose: true, store: LINKED })
    const composed = await $.prompt.compose(COMPOSE)
    expect(composed.sections.map(s => s.id)).toEqual(['intro', 'ideation:todos', 'ideation:projet', 'ideation:projet-du-depot'])
  })

  test('dépôt non relié : aucune section', OPTS, async ($, on) => {
    world(on, { compose: true, store: UNLINKED_A })
    const composed = await $.prompt.compose(COMPOSE)
    expect(composed.sections.map(s => s.id)).toEqual(['intro'])
  })
})
