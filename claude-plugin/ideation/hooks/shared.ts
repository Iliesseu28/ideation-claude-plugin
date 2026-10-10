// Outils PURS communs au mod « ideation » : journal de bord et to-dos.
// Contrats : docs/claude-connect/PLUGIN.md §3 et docs/claude-connect/TODOS.md §7.
// Aucune fonction ici ne reçoit `$` : le moteur ne suit `$` que dans le fichier du module
// (mod.ts), jamais à travers un import. Git, store, réglages et UI restent donc dans mod.ts.

export type Mode = 'auto' | 'rappel' | 'off'

/** Préfixe des outils MCP tels que Claude les voit : mcp__plugin_<plugin>_<serveur>__<outil>. */
export const MCP_PREFIX = 'mcp__plugin_ideation_ideation__'

/** SHA complet : SHA-1 (40 hex) ou SHA-256 (64 hex). */
export const FULL_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/

export type Repo = {
  /** Racine du working tree courant (propre à chaque worktree). */
  root: string
  /** Identité du dépôt, commune à tous ses worktrees (dossier git commun) : clé de la liaison. */
  id: string
  /** SHA de HEAD, ou null tant que le dépôt n'a aucun commit. */
  head: string | null
}

export const linkedKey = (id: string) => `linked:${id}`

/** Réglage `auto_journal` / `auto_todos` : toute valeur inconnue vaut `auto` (le défaut). */
export function readMode(value: unknown): Mode {
  return value === 'rappel' || value === 'off' ? value : 'auto'
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? 's' : ''}`
}

/** Le résultat d'un outil MCP tel que `next(e)` le rend (champ `result` et texte lu par le modèle). */
export type ToolRan = { result?: unknown; text?: string }

/**
 * Drapeau booléen (`created`, `changed`) de la réponse d'un outil MCP : `true`, `false`, ou
 * `undefined` si la réponse ne le dit pas (forme inconnue). Lu dans le résultat, son
 * `structuredContent`, ses blocs texte JSON, puis le texte lu par le modèle.
 */
export function readFlag(ran: ToolRan, flag: 'created' | 'changed'): boolean | undefined {
  const pick = (value: unknown): boolean | undefined => {
    if (typeof value !== 'object' || value === null) return undefined
    const found = (value as Record<string, unknown>)[flag]
    return typeof found === 'boolean' ? found : undefined
  }
  const pattern = new RegExp(`"${flag}"\\s*:\\s*(true|false)\\b`)
  const fromText = (text: unknown): boolean | undefined => {
    if (typeof text !== 'string') return undefined
    const match = pattern.exec(text)
    return match ? match[1] === 'true' : undefined
  }
  const result = ran.result
  const direct = pick(result) ?? pick(structured(result))
  if (direct !== undefined) return direct
  const blocks = Array.isArray(result)
    ? result
    : typeof result === 'object' && result !== null && Array.isArray((result as { content?: unknown }).content)
      ? ((result as { content: unknown[] }).content)
      : []
  for (const block of blocks) {
    const found = fromText(typeof block === 'object' && block !== null ? (block as { text?: unknown }).text : block)
    if (found !== undefined) return found
  }
  return fromText(result) ?? fromText(ran.text)
}

/** `structuredContent` d'un résultat MCP (undefined s'il n'en a pas). */
export function structured(result: unknown): unknown {
  if (typeof result !== 'object' || result === null) return undefined
  return (result as { structuredContent?: unknown }).structuredContent
}
