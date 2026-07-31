/**
 * Split a comma- or pipe-separated list into slot values.
 *
 *   parseSlotList("g1,g2,g2,g1,g3")  // ["g1","g2","g2","g1","g3"]
 *
 * There is no weight syntax, because there is no weight field. A slot is
 * wider because it appears more times, which means the written list already
 * looks like the wheel it describes.
 *
 * Empty entries are dropped rather than becoming empty slots, so a trailing
 * comma or a double comma in a hand-edited URL is harmless.
 */
export function parseSlotList(input: string): string[] {
  return input
    .split(/[,|]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
