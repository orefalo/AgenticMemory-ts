/**
 * Simple tokenization function
 * @param text Text to tokenize
 * @returns Array of tokens
 */
export function simpleTokenize(text: string): string[] {
  return text.toLowerCase()
    .replace(/\./g, ' ')
    .replace(/,/g, ' ')
    .replace(/!/g, ' ')
    .replace(/\?/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 0);
}
