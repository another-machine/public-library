// Helper function for weighted selection from an array
export function weightedSelect<T>(items: T[], selector: () => number): T {
  // Basic implementation - just select randomly
  // In a more advanced version, you could implement weighted probabilities
  return items[Math.floor(selector() * items.length)];
}
