import { DEFAULT_MODEL_ID, getModelSpec } from './models'

/** The default model id. Models are now user-selectable (see `models.ts`); this is the fallback
 *  used when no preference is saved. Escalated from 1B → 3B (1B was below the quality floor:
 *  missing titles, degenerate loops, example-bleed). */
export const MODEL_ID = DEFAULT_MODEL_ID

/** Human-friendly default model name (the raw id stays as subtext). */
export const MODEL_LABEL = getModelSpec(DEFAULT_MODEL_ID).label

/** A clean article extracted from a page, bound to the tab/url it came from. */
export interface Article {
  /** The tab the article was extracted from (pins a summary to its source). */
  tabId: number
  /** The page URL at extraction time. */
  url: string
  /** Readability's article title (page-level, not the model's title). */
  title: string
  /** Clean article body text fed to the model. */
  textContent: string
  /** Whether textContent was truncated to fit the model input budget. */
  truncated: boolean
}

/** One key point of an article: a short heading and its explanation. */
export interface SummaryPoint {
  heading: string
  detail: string
}

/** Parsed summary the model produced for an article. */
export interface Summary {
  /** Model-generated title (the leading `#` Markdown heading), or a fallback. */
  title: string
  /** Model-generated TL;DR (the paragraph after the title), or a fallback. */
  tldr: string
  /** Key points (the `- **heading** — detail` bullets). Best-effort; may be empty. */
  points: SummaryPoint[]
  /** Raw model output, always kept so nothing is lost on a parse miss. */
  raw: string
  /** False when the model broke the expected Markdown format and we fell back to raw. */
  parsedOk: boolean
}
