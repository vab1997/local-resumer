/** The model executed locally in the browser. Escalated from 1B → 3B (1B was below the quality
 *  floor: missing titles, degenerate loops, example-bleed). Same family = drop-in chat template. */
export const MODEL_ID = 'onnx-community/Llama-3.2-3B-Instruct'

/** Human-friendly model name for the UI (the raw id stays as subtext). */
export const MODEL_LABEL = 'Llama 3.2 · 3B Instruct'

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
  /** Model-generated title (from <title>), or a fallback. */
  title: string
  /** Model-generated TL;DR (from <result>), or a fallback. */
  tldr: string
  /** Key points (from <points>), each a heading + explanation. Best-effort; may be empty. */
  points: SummaryPoint[]
  /** Raw model output, always kept so nothing is lost on a parse miss. */
  raw: string
  /** False when the model broke the expected XML format and we fell back to raw. */
  parsedOk: boolean
}
