// Monde simulé sous le plugin, partagé par tests/mod.test.ts (journal) et tests/todos.test.ts :
// git, store, réglages, UI, commandes, prompts, fichiers et réponses des outils.
// Les hooks `on` du test sont SOUS le plugin : ils tiennent lieu de moteur.

import { mock } from 'claude-code/testing'
import type { On } from 'claude-code'

export const ROOT = '/work/mon-app'
export const SHA_A = 'a'.repeat(40)
export const SHA_B = 'b'.repeat(40)
export const SHA_C = 'c'.repeat(40)
export const ADD_ENTRY = 'mcp__plugin_ideation_ideation__journal_add_entry'
export const TODO_ADD = 'mcp__plugin_ideation_ideation__todo_add'
export const TODO_UPDATE = 'mcp__plugin_ideation_ideation__todo_update'
export const TODO_COMPLETE = 'mcp__plugin_ideation_ideation__todo_complete'
export const DOC_ADD = 'mcp__plugin_ideation_ideation__doc_add'
export const DOC_UPDATE = 'mcp__plugin_ideation_ideation__doc_update'
export const PROJECT_UPDATE = 'mcp__plugin_ideation_ideation__project_update'
export const JOURNAL_UPDATE = 'mcp__plugin_ideation_ideation__journal_update_entry'
export const PROJECT_CREATE = 'mcp__plugin_ideation_ideation__project_create'
export const EXPENSE_ADD = 'mcp__plugin_ideation_ideation__expense_add'
export const LINK_DELETE = 'mcp__plugin_ideation_ideation__link_delete'
export const TODO_DELETE = 'mcp__plugin_ideation_ideation__todo_delete'
export const JOURNAL_DELETE = 'mcp__plugin_ideation_ideation__journal_delete_entry'
export const ANALYSIS_RUN = 'mcp__plugin_ideation_ideation__analysis_run'
export const FEEKO_ASK = 'mcp__plugin_ideation_ideation__feeko_ask'
export const MEMBER_INVITE = 'mcp__plugin_ideation_ideation__member_invite'
export const ROADMAP_SET = 'mcp__plugin_ideation_ideation__roadmap_set'
export const MILESTONE_UPDATE = 'mcp__plugin_ideation_ideation__milestone_update'
export const ME = 'moi@exemple.fr'
export const TEAMMATE = 'coequipier@exemple.fr'

export type Commit = { line: string; by: string }

export type FakeGit = {
  /** null = le dossier n'est pas un dépôt git. */
  root: string | null
  /** Dossier git commun aux worktrees (défaut `<root>/.git`). */
  common?: string
  head: string | null
  /** Lignes de base qui sont des ancêtres de HEAD. */
  ancestors: string[]
  /** Commits de <base>..HEAD (premier parent, hors merges), avec leur committer. */
  commits: Commit[]
  /** git config user.email (null = non configuré). */
  email: string | null
  /** git < 2.31 : --path-format inconnu. */
  old?: boolean
  /** git refuse de se lancer (absent du PATH…). */
  broken?: boolean
  /**
   * Historique linéaire (du plus ancien au plus récent) pour `merge-base --is-ancestor` ;
   * défaut `[...ancestors, head]`.
   */
  history?: string[]
  /** SHA inconnus du dépôt : `merge-base` répond 128 « Not a valid commit name ». */
  missing?: string[]
  /** Réponse forcée de `merge-base` : délai dépassé, ou code + stderr. */
  mergeBase?: 'timeout' | { exitCode: number; stderr: string }
}

export type Setup = {
  git?: Partial<FakeGit>
  store?: Record<string, unknown>
  /** Opération du store qui échoue. */
  storeFails?: 'get' | 'set'
  /** Réponse des autres hooks Stop (sous le plugin). */
  stop?: { block?: string }
  /**
   * Réponse du serveur MCP à journal_add_entry : `ok` (created:true), `taken` (clé déjà prise,
   * created:false, en structuredContent), `blocks` (created:false dans un bloc texte JSON seulement).
   */
  addEntry?: 'ok' | 'error' | 'taken' | 'blocks'
  /** Réponse de l'outil Bash. */
  bash?: boolean
  /** Sections du prompt système avant le plugin. */
  compose?: boolean
  /** Réglages par source (`project` = .claude/settings.json, `local` = settings.local.json). */
  settings?: Partial<Record<'user' | 'project' | 'local', Record<string, unknown>>>
  /** Fichiers lisibles par `$.fs.read` (chemin absolu → contenu) ; Write, Edit et MultiEdit les mettent à jour. */
  files?: Record<string, string>
  /** `$.fs.read` échoue alors que le fichier existe (trop gros, droits…). */
  fsFails?: boolean
  /** Outils Edit / MultiEdit / Write simulés : `ok`, ou `error` (l'outil a échoué). */
  edits?: 'ok' | 'error'
  /** Réponses des outils MCP de to-do (voir TODO_ANSWERS). */
  todo?: Partial<Record<'add' | 'update' | 'complete', TodoAnswer>>
  /** Réponses des outils « projet » (doc_add, doc_update, project_update, journal_update_entry). */
  project?: Partial<Record<'doc_add' | 'doc_update' | 'project' | 'journal_update', TodoAnswer>>
  /**
   * Réponses directes (1.4.0) : nom d'outil → réponse brute (structuredContent), ou 'error'.
   * Ex. { [PROJECT_CREATE]: { created: true, project: { id: 'prj_new', title: 'Miam' } } }.
   */
  raw?: Record<string, Record<string, unknown> | 'error'>
}

/**
 * Réponse simulée d'un outil de to-do : `ok` (created/changed:true, titre du serveur en
 * structuredContent), `noop` (created/changed:false), `error` (isError), `deny` (refusé).
 */
export type TodoAnswer = 'ok' | 'noop' | 'error' | 'deny'

export type World = {
  git: FakeGit
  store: Map<string, unknown>
  statuses: (string | undefined)[]
  toasts: string[]
  commands: string[]
  /** Outils locaux déclarés par le plugin ($.tool.register). */
  tools: string[]
  submitted: string[]
  /** Contexte joint à chaque prompt soumis (même ordre que `submitted`). */
  contexts: (readonly string[] | undefined)[]
  /** Fichiers simulés (après les Write). */
  files: Map<string, string>
  clock: ReturnType<typeof mock.clock>
}

export const ok = (stdout: string) => ({
  value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})
const fail = (exitCode: number) => ({
  value: { exitCode, stdout: '', stderr: 'fatal', isStdoutTruncated: false, isStderrTruncated: false },
})
export const BASH_RESULT = { stdout: '[main bbbbbbb] feat', stderr: '', interrupted: false }

/**
 * Installe le monde simulé sous le plugin : git, store, UI, commandes, prompts,
 * et les autres hooks éventuels. À appeler AVANT le premier appel à `$`.
 */
export function world(on: On, setup: Setup = {}): World {
  const w: World = {
    git: {
      root: ROOT,
      head: SHA_B,
      ancestors: [],
      email: ME,
      ...setup.git,
      // Copie : un test qui ajoute un commit ne touche pas les constantes partagées.
      commits: [...(setup.git?.commits ?? [])],
    },
    store: new Map(Object.entries(setup.store ?? {})),
    statuses: [],
    toasts: [],
    commands: [],
    tools: [],
    submitted: [],
    contexts: [],
    files: new Map(Object.entries(setup.files ?? {})),
    clock: mock.clock(on),
  }
  on('process.run', async ($, e) => {
    const g = w.git
    if (g.broken) return { deny: 'spawn git ENOENT' }
    const args = e.argv.slice(1).map(String)
    if (args[0] === 'rev-parse' && args.includes('--show-toplevel')) {
      if (args.includes('--path-format=absolute')) {
        if (g.old) return fail(129)
        return g.root ? ok(`${g.root}\n${g.common ?? `${g.root}/.git`}\n`) : fail(128)
      }
      return g.root ? ok(`${g.root}\n`) : fail(128)
    }
    if (args[0] === 'config') return g.email ? ok(`${g.email}\n`) : fail(1)
    if (!g.root) return fail(128)
    if (args[0] === 'rev-parse') return g.head ? ok(`${g.head}\n`) : fail(1)
    if (args[0] === 'merge-base') {
      if (g.mergeBase === 'timeout') return { deny: 'git: timed out after 5000 ms' }
      if (g.mergeBase) return { value: { ...fail(g.mergeBase.exitCode).value, stderr: g.mergeBase.stderr } }
      const [x, y] = [String(args[2]), String(args[3])]
      if (g.missing?.includes(x)) {
        return { value: { ...fail(128).value, stderr: `fatal: Not a valid commit name ${x}\n` } }
      }
      const chain = g.history ?? [...g.ancestors, ...(g.head ? [g.head] : [])]
      const [ix, iy] = [chain.indexOf(x), chain.indexOf(y)]
      return ix >= 0 && iy >= 0 && ix <= iy ? ok('') : fail(1)
    }
    // --committer=<email> (avec --fixed-strings) : seuls les commits de cette personne.
    const committer = args.find(a => a.startsWith('--committer='))
    if (committer && !args.includes('--fixed-strings')) return fail(128)
    const mine = committer ? g.commits.filter(c => committer === `--committer=<${c.by}>`) : g.commits
    if (args[0] === 'rev-list') return ok(`${mine.length}\n`)
    if (args[0] === 'log') return ok(mine.map(c => c.line).join('\n'))
    return fail(129)
  })
  on('settings.read', async ($, e) => ({
    value: (e.source && e.source !== 'flag' && e.source !== 'policy' ? setup.settings?.[e.source] : undefined) ?? {},
  }))
  on('store.get', async ($, e) => {
    if (setup.storeFails === 'get') return { deny: 'store corrompu' }
    return { value: w.store.get(e.key) }
  })
  on('store.set', async ($, e) => {
    if (setup.storeFails === 'set') return { deny: 'disque plein' }
    w.store.set(e.key, e.value)
    return { value: undefined }
  })
  on('store.delete', async ($, e) => {
    w.store.delete(e.key)
    return { value: undefined }
  })
  on('ui.status', async ($, e) => {
    w.statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', async ($, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('command.register', async ($, e) => {
    w.commands.push(e.name)
    return { value: { command: e.name } }
  })
  on('tool.register', async ($, e) => {
    w.tools.push(e.name)
    return { value: { tool: `mcp__ideation__${e.name}` } }
  })
  on('prompt.submit', async ($, e) => {
    w.submitted.push(e.text)
    w.contexts.push(e.context)
    return { text: e.text, ...(e.context ? { context: e.context } : {}) }
  })
  on('fs.read', async ($, e) => {
    const text = w.files.get(e.path)
    if (text === undefined) return { deny: `ENOENT: ${e.path}` }
    if (setup.fsFails) return { deny: 'EFBIG: file too large' }
    return { value: text }
  })
  on('fs.exists', async ($, e) => ({ value: w.files.has(e.path) }))
  on('session.start', async ($, e) => ({ cwd: e.cwd }))
  on('classic.Stop', async () => ({ ...setup.stop }))
  if (setup.addEntry) {
    const answers = {
      ok: { result: { id: 'dv_x', created: true } },
      taken: {
        result: {
          content: [{ type: 'text', text: 'Entrée dv_x déjà présente (rejeu sans doublon).' }],
          structuredContent: { id: 'dv_x', created: false, warnings: [] },
          isError: false,
        },
      },
      blocks: {
        result: [
          { type: 'text', text: 'Entrée dv_x déjà présente (rejeu sans doublon).' },
          { type: 'text', text: '{"id":"dv_x","created":false,"warnings":[]}' },
        ],
      },
      error: { isError: true as const, result: 'Entrée refusée', text: 'Entrée refusée' },
    }
    const answer = answers[setup.addEntry]
    on('tool.call', { tool: ADD_ENTRY }, async () => answer)
  }
  if (setup.bash) on('tool.call', { tool: 'Bash' }, async () => ({ result: BASH_RESULT }))
  if (setup.edits) {
    const answer = (file: string) =>
      setup.edits === 'error'
        ? { isError: true as const, result: 'String to replace not found', text: 'String to replace not found' }
        : { result: { filePath: file } }
    // Edit / MultiEdit appliquent leurs remplacements au fichier simulé quand il est connu.
    const apply = (file: string, edits: readonly Record<string, unknown>[]) => {
      let text = w.files.get(file)
      if (setup.edits !== 'ok' || text === undefined) return
      for (const edit of edits) {
        const [from, to] = [String(edit.old_string ?? ''), String(edit.new_string ?? '')]
        if (!from || !text.includes(from)) return
        text = edit.replace_all === true ? text.split(from).join(to) : text.replace(from, () => to)
      }
      w.files.set(file, text)
    }
    on('tool.call', { tool: 'Edit' }, async ($, e) => {
      apply(e.file_path, [e as unknown as Record<string, unknown>])
      return answer(e.file_path) as never
    })
    on('tool.call', { tool: /^MultiEdit$/ }, async ($, e) => {
      const input = e as unknown as { file_path?: unknown; edits?: Record<string, unknown>[] }
      apply(String(input.file_path), input.edits ?? [])
      return answer(String(input.file_path)) as never
    })
    on('tool.call', { tool: 'Write' }, async ($, e) => {
      if (setup.edits === 'ok') w.files.set(e.file_path, e.content)
      return answer(e.file_path) as never
    })
  }
  for (const [kind, name] of [
    ['add', TODO_ADD],
    ['update', TODO_UPDATE],
    ['complete', TODO_COMPLETE],
  ] as const) {
    const answer = setup.todo?.[kind]
    if (!answer) continue
    const flag = kind === 'add' ? 'created' : 'changed'
    const data = { [flag]: answer === 'ok', task: { id: 'td_x', title: 'Titre du serveur' }, warnings: [] }
    const answers = {
      ok: { result: { content: [{ type: 'text', text: 'Tâche td_x.' }], structuredContent: data, isError: false } },
      noop: { result: { content: [{ type: 'text', text: 'Rien à changer.' }], structuredContent: data, isError: false } },
      error: { isError: true as const, result: 'Tâche introuvable', text: 'Tâche introuvable' },
      deny: { deny: 'Refusé par la permission' },
    }
    on('tool.call', { tool: name }, async () => answers[answer])
  }
  for (const [kind, name] of [
    ['doc_add', DOC_ADD],
    ['doc_update', DOC_UPDATE],
    ['project', PROJECT_UPDATE],
    ['journal_update', JOURNAL_UPDATE],
  ] as const) {
    const answer = setup.project?.[kind]
    if (!answer) continue
    const flag = kind === 'doc_add' ? 'created' : 'changed'
    const data = { [flag]: answer === 'ok', document: { id: 'dc_x', name: 'Nom du serveur' }, warnings: [] }
    const answers = {
      ok: { result: { content: [{ type: 'text', text: 'Fait.' }], structuredContent: data, isError: false } },
      noop: { result: { content: [{ type: 'text', text: 'Rien à changer.' }], structuredContent: data, isError: false } },
      error: { isError: true as const, result: 'Document introuvable', text: 'Document introuvable' },
      deny: { deny: 'Refusé par la permission' },
    }
    on('tool.call', { tool: name }, async () => answers[answer])
  }
  for (const [name, data] of Object.entries(setup.raw ?? {})) {
    on('tool.call', { tool: name as typeof TODO_ADD }, async () =>
      data === 'error'
        ? { isError: true as const, result: 'Refusé', text: 'Refusé' }
        : { result: { content: [{ type: 'text', text: 'Fait.' }], structuredContent: data, isError: false } },
    )
  }
  if (setup.compose) {
    on('prompt.compose', async () => ({ sections: [{ id: 'intro', text: 'hi', scope: 'shared' as const }] }))
  }
  return w
}

export const OPTS = { options: { api_token: 'idn_test' } }
export const START = { cwd: ROOT, surface: null, isInteractive: true } as const
export const stop = (stopHookActive = false) => ({ stop_hook_active: stopHookActive }) as never
export const COMPOSE = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] }
/** Deux commits non journalisés depuis A (HEAD = B). */
export const PENDING: Partial<FakeGit> = {
  head: SHA_B,
  ancestors: [SHA_A],
  commits: [
    { line: 'bbbbbbb feat: paiement par carte', by: ME },
    { line: 'ccccccc test: paiement', by: ME },
  ],
}
export const LINKED = { [`linked:${ROOT}/.git`]: true }
/** Dépôt relié, ligne de base A. */
export const BASE_A = { ...LINKED, [`base:${ROOT}`]: SHA_A }
/** Même ligne de base, dépôt jamais relié (autre dépôt de l'utilisateur). */
export const UNLINKED_A = { [`base:${ROOT}`]: SHA_A }

