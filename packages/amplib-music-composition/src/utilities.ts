export function weightedSelect<T>(items: T[], selector: () => number): T {
  // TODO: implement weighted probabilities
  return items[Math.floor(selector() * items.length)];
}
