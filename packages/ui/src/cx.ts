/** Tiny classnames joiner — filters out falsy values. Keeps primitives dependency-free. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
