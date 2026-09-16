/** Short, sortable-ish ids. No dependency, no ceremony. */
let counter = 0;

export function makeId(prefix: string): string {
  counter = (counter + 1) % 1e6;
  const stamp = Date.now().toString(36);
  const seq = counter.toString(36).padStart(4, '0');
  const rand = Math.floor(Math.random() * 1296).toString(36).padStart(2, '0');
  return `${prefix}_${stamp}${seq}${rand}`;
}
