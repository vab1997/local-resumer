/**
 * Prompt for the summarizer.
 *  - INPUT structure: the prompt we send is organized with Anthropic-style semantic XML sections
 *    (<task-context>, <rules>, <examples>, <output-formatting>) so the model understands intent.
 *  - OUTPUT schema: Markdown — `# title`, a TL;DR paragraph, then a `- **heading** — detail`
 *    bullet list — which parse.ts reads. Markdown (v8, replacing the earlier XML schema) keeps
 *    the cloud streaming view clean and renders directly.
 *
 * The "how" lives in <rules> and the worked <examples>, not in the output slots. This is what
 * stops small models from echoing slot-descriptions as content.
 *
 * The number of key points is NOT fixed in the system prompt — each call (single-pass vs reduce)
 * states its own count in the user message, so long articles can produce a richer summary.
 */

export interface PromptMessage {
  role: 'system' | 'user'
  content: string
}

/**
 * The one-shot worked example. It is deliberately short, in an unrelated sub-domain, and seeded
 * with a unique made-up token ("Florbex") so example content-bleed is detectable: if "Florbex"
 * ever shows up in a real summary, the model copied the example instead of the article.
 */
const EXAMPLE_ARTICLE =
  'Florbex is a command-line tool for batch-renaming image files. It groups files by their ' +
  'EXIF capture date and applies a naming template you define. Because it reads metadata ' +
  'locally, it never uploads your photos. The latest release adds a dry-run mode that previews ' +
  'the changes before writing them.'

const EXAMPLE_RESPONSE = [
  '# Florbex: a local CLI for batch-renaming photos by date',
  '',
  'Florbex renames image files in bulk using their EXIF capture date and a template ' +
    'you define. It runs entirely on your machine so photos are never uploaded, and a new ' +
    'dry-run mode previews changes before applying them.',
  '',
  '- **Date-based batch renaming** — Florbex groups image files by ' +
    'their EXIF capture date and renames them with a template you define.',
  '- **Local and private** — It reads metadata locally and never ' +
    'uploads your photos.'
].join('\n')

const SYSTEM_PROMPT = [
  '<task-context>',
  'You are an assistant that summarizes technical articles about AI and software development.',
  '</task-context>',
  '',
  '<tone-context>',
  'Be faithful, concise, and neutral. Summarize in your own words.',
  '</tone-context>',
  '',
  '<rules>',
  '- Never invent information: no tools, frameworks, libraries, or facts the article does not mention.',
  "- Never alter the article's claims, definitions, or directions (e.g. which option is faster).",
  '- Identify the most important points, drawn only from the article (the request says how many).',
  '- Respond in the same language as the article.',
  '- Produce the output exactly once. No conclusion, no "final thoughts", no repetition.',
  '- Output only the Markdown structure below, with nothing before or after it.',
  '- The <examples> section is ONLY a format guide for a different, fictional article. Never ' +
    'reuse its wording, names (such as "Florbex"), or topic. Summarize only the user\'s article.',
  '</rules>',
  '',
  '<examples>',
  'Here is one example of a correct response.',
  '<example>',
  '<article>',
  EXAMPLE_ARTICLE,
  '</article>',
  EXAMPLE_RESPONSE,
  '</example>',
  '</examples>',
  '',
  '<output-formatting>',
  'Respond in Markdown with exactly this structure and nothing else:',
  '# <article title>',
  '',
  '<TL;DR paragraph>',
  '',
  '- **<point heading>** — <point detail>',
  '',
  'The first line is a level-1 heading with a real, descriptive article title. Then one',
  'paragraph with a 2-4 sentence TL;DR. Then a bullet list with the number of points asked',
  'for in the request; each bullet is exactly "- **heading** — detail". Output nothing after',
  'the last bullet.',
  '</output-formatting>'
].join('\n')

/** Build the chat messages for a single, stateless summarization run (short articles). */
export function buildMessages(articleText: string): PromptMessage[] {
  const user = [
    '<background-data>',
    'Summarize ONLY the article below, following the rules and output format. The example was a',
    'different fictional article — do not reuse its title, names (e.g. "Florbex"), or content.',
    'Provide 3 to 5 key points, each with a 1-2 sentence explanation.',
    '<article>',
    articleText,
    '</article>',
    '</background-data>'
  ].join('\n')

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user }
  ]
}

/**
 * Lean MAP system prompt (no worked example): ~44 tokens vs the ~500-token full prompt. The map
 * step emits freeform notes, not the output schema, so the example is unnecessary overhead
 * repeated per chunk. Reserving the full prompt for reduce cuts thousands of repeated tokens on
 * long articles.
 */
const MAP_SYSTEM = [
  'You extract the key facts from ONE excerpt of a longer technical article.',
  '- Use only facts present in this excerpt; never invent.',
  "- Keep the article's claims and directions intact.",
  '- Respond in the same language as the text.',
  '- Output 4-8 short bullet lines (each starting with "- "), and nothing else.'
].join('\n')

/** Map step: extract compact faithful notes from one chunk. */
export function buildMapMessages(
  chunk: string,
  meta: { index: number; total: number }
): PromptMessage[] {
  const user = [
    `This is part ${meta.index} of ${meta.total} of a longer article. Extract its key points as bullet lines.`,
    '',
    chunk
  ].join('\n')

  return [
    { role: 'system', content: MAP_SYSTEM },
    { role: 'user', content: user }
  ]
}

/**
 * Reduce step: synthesize the per-chunk notes into the final structured summary. Reuses the full
 * SYSTEM_PROMPT (rules + Markdown schema + example), since this is the pass that actually emits
 * the structured output.
 */
export function buildReduceMessages(
  notes: string,
  minPoints: number,
  maxPoints: number
): PromptMessage[] {
  const user = [
    '<background-data>',
    'Below are notes extracted, in order, from a longer article. Synthesize ONE final summary from',
    'them, following the rules and output format. The example was a different fictional article — do',
    'not reuse its title, names (e.g. "Florbex"), or content.',
    `Provide between ${minPoints} and ${maxPoints} key points. Cover ALL the distinct important`,
    'ideas in the notes — never merge two distinct ideas into one point. But do not pad with weak',
    "or repeated points. Each point's detail is 1-3 sentences.",
    '<notes>',
    notes,
    '</notes>',
    '</background-data>'
  ].join('\n')

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user }
  ]
}
