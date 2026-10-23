/**
 * A small structural equality for draft values (plain objects, arrays, primitives). Owner: B4.
 * `node:util` is not available in the browser bundle, so the draft models use this instead.
 * `undefined`-valued keys count as absent, as in JSON.
 */
export function isDeepStrictEqualLike(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => isDeepStrictEqualLike(item, b[index]));
  }
  const left = Object.entries(a as Record<string, unknown>).filter(([, value]) => value !== undefined);
  const right = Object.entries(b as Record<string, unknown>).filter(([, value]) => value !== undefined);
  if (left.length !== right.length) return false;
  const other = b as Record<string, unknown>;
  return left.every(([key, value]) => Object.prototype.hasOwnProperty.call(other, key) && isDeepStrictEqualLike(value, other[key]));
}
