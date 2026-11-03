/** Returns a copy of `ids` with `id` swapped one step up (-1) or down (+1); unchanged at the edges. */
export function moveInList(ids: readonly string[], id: string, direction: -1 | 1): string[] {
  const next = [...ids];
  const index = next.indexOf(id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target] as string, next[index] as string];
  return next;
}
