/**
 * Text from the referral agent that may be stored and shown: Nova wraps its private reasoning in
 * <thinking> tags, which is never kept (design: no raw reasoning stored). Pure TypeScript.
 * Requirements: 12.8
 */
const MAX_UPDATE = 300;

/**
 * Drops every <thinking> block (any case, with attributes), an unclosed block to the end, and
 * anything before a stray closing tag; then cuts the rest to one short update.
 */
export function operationalText(text: string): string {
  let rest = text.replace(/<thinking\b[^>]*>[\s\S]*?(<\/thinking\s*>|$)/gi, ' ');
  const strayClose = rest.search(/<\/thinking\s*>/i);
  if (strayClose >= 0) rest = rest.slice(strayClose).replace(/^<\/thinking\s*>/i, ' ');
  return rest.replace(/<\/?thinking\b[^>]*>/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_UPDATE);
}
