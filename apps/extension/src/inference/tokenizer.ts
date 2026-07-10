import type { PromptMessage } from './prompt'

/**
 * Minimal structural view of a Transformers.js tokenizer — enough for token accounting and
 * chunking, without depending on the exact exported class name. The model's own tokenizer is
 * used (via `generator.tokenizer`), so counts match exactly and this generalizes to any future
 * model in the planned model selector.
 */
export interface Tokenizer {
  encode(text: string, options?: { add_special_tokens?: boolean }): number[]
  apply_chat_template(
    messages: PromptMessage[],
    options?: { tokenize?: false; add_generation_prompt?: boolean }
  ): string
}

/** Count tokens in a raw string (no added special tokens). */
export function countTokens(tokenizer: Tokenizer, text: string): number {
  return tokenizer.encode(text, { add_special_tokens: false }).length
}

/** Count the input tokens a chat prompt actually costs, including the model's chat template. */
export function countPromptTokens(
  tokenizer: Tokenizer,
  messages: PromptMessage[]
): number {
  const templated = tokenizer.apply_chat_template(messages, {
    tokenize: false,
    add_generation_prompt: true
  })
  return countTokens(tokenizer, templated)
}
