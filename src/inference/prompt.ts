/**
 * Prompt for the summarizer. Two distinct uses of XML here:
 *  - INPUT structure: the prompt we send is organized with Anthropic-style semantic sections
 *    (<task-context>, <rules>, <examples>, <output-formatting>) so the model understands intent.
 *  - OUTPUT schema: the model emits <title>/<result>/<points>, which parse.ts reads.
 *
 * The tags the model fills contain NO instructional text — the "how" lives in <rules> and the
 * worked <examples>. This is what stops the 1B model from echoing slot-descriptions as content.
 *
 * Input is truncated to a conservative character budget: a memory/speed bound for a small
 * in-browser model, NOT a hard context limit. Tune MAX_INPUT_CHARS against real latency.
 */

/** ~4 chars/token heuristic; leaves room for the prompt + worked example + output. */
export const MAX_INPUT_CHARS = 12_000

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
  '<title>Florbex: a local CLI for batch-renaming photos by date</title>',
  '<result>Florbex renames image files in bulk using their EXIF capture date and a template ' +
    'you define. It runs entirely on your machine so photos are never uploaded, and a new ' +
    'dry-run mode previews changes before applying them.</result>',
  '<points>',
  '<point><heading>Date-based batch renaming</heading><detail>Florbex groups image files by ' +
    'their EXIF capture date and renames them with a template you define.</detail></point>',
  '<point><heading>Local and private</heading><detail>It reads metadata locally and never ' +
    'uploads your photos.</detail></point>',
  '</points>'
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
  '- Identify between 3 and 5 of the most important points, drawn only from the article.',
  '- Respond in the same language as the article.',
  '- Produce the output exactly once. No conclusion, no "final thoughts", no repetition.',
  '- Output only the result tags below, with nothing before or after them.',
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
  'Respond with exactly this structure and nothing else:',
  '<title></title>',
  '<result></result>',
  '<points>',
  '<point><heading></heading><detail></detail></point>',
  '</points>',
  'Include between 3 and 5 <point> entries. <title> is a real, descriptive article title.',
  '<result> is a 2-4 sentence TL;DR.',
  '</output-formatting>'
].join('\n')

/** Truncate article text to the input budget. Returns the text and whether it was cut. */
export function truncateArticle(text: string): {
  text: string
  truncated: boolean
} {
  const trimmed = text.trim()
  if (trimmed.length <= MAX_INPUT_CHARS)
    return { text: trimmed, truncated: false }
  return { text: trimmed.slice(0, MAX_INPUT_CHARS), truncated: true }
}

/** Build the chat messages for a single, stateless summarization run. */
export function buildMessages(articleText: string): PromptMessage[] {
  const user = [
    '<background-data>',
    'Summarize ONLY the article below, following the rules and output format. The example was a',
    'different fictional article — do not reuse its title, names (e.g. "Florbex"), or content.',
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
