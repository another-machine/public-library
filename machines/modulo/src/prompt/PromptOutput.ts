import { DestinationInfo } from "../destinations/Destination";

export class PromptOutput extends HTMLElement {
  private breadcrumbs: HTMLSpanElement;
  private pre: HTMLPreElement;
  private previousContent: string = "";

  public initialize() {
    this.innerHTML = `
      <span></span>
      <pre></pre>
    `;
    this.breadcrumbs = this.querySelector("span")!;
    this.pre = this.querySelector("pre")!;
  }

  public update(info: DestinationInfo) {
    const content = info.content();
    this.pre.innerHTML = this.previousContent
      ? this.highlightDiff(this.previousContent, content)
      : content;
    this.previousContent = content;
  }

  public updateBreadcrumbs(path: string) {
    this.breadcrumbs.innerHTML = path;
  }

  private highlightDiff(
    oldStr: string,
    newStr: string,
    maxChanges: number = 10
  ): string {
    // Early return if strings are too different in length
    if (Math.abs(oldStr.length - newStr.length) > 20) {
      return newStr;
    }

    // Helper function to identify if character is alphanumeric
    const isAlphanumeric = (char: string): boolean => {
      return /[a-zA-Z0-9]/.test(char);
    };

    // Helper function to find differences in alphanumeric sequences within a line
    const findLineChanges = (
      line1: string,
      line2: string,
      lineStartPos: number
    ): Array<{ start: number; end: number }> => {
      const diffs: Array<{ start: number; end: number }> = [];
      let currentDiff: { start: number; end: number } | null = null;
      let inAlphanumericSequence = false;

      for (let i = 0; i < Math.max(line1.length, line2.length); i++) {
        const char1 = line1[i] || "";
        const char2 = line2[i] || "";
        const isCurrentAlphanumeric =
          isAlphanumeric(char1) || isAlphanumeric(char2);

        if (!isCurrentAlphanumeric) {
          if (currentDiff) {
            diffs.push(currentDiff);
            currentDiff = null;
          }
          inAlphanumericSequence = false;
          continue;
        }

        inAlphanumericSequence = true;
        if (char1 !== char2) {
          if (!currentDiff) {
            currentDiff = {
              start: lineStartPos + i,
              end: lineStartPos + i,
            };
          }
          currentDiff.end = lineStartPos + i;
        } else if (currentDiff) {
          diffs.push(currentDiff);
          currentDiff = null;
        }
      }

      if (currentDiff) {
        diffs.push(currentDiff);
      }

      return diffs;
    };

    // Split strings into lines
    const oldLines = oldStr.split("\n");
    const newLines = newStr.split("\n");

    // Find all differences line by line
    const differences: Array<{ start: number; end: number }> = [];
    let currentPosition = 0;
    let totalChangeCount = 0;

    // Process each line
    for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
      const oldLine = oldLines[i] || "";
      const newLine = newLines[i] || "";

      // Find differences in this line
      const lineDiffs = findLineChanges(oldLine, newLine, currentPosition);

      // Update total change count and check threshold
      totalChangeCount += lineDiffs.length;
      if (totalChangeCount > maxChanges) {
        return newStr;
      }

      differences.push(...lineDiffs);
      // Update position to include this line and the newline character
      currentPosition += newLine.length + 1; // +1 for the newline character
    }

    // If no differences found, return the new string as is
    if (differences.length === 0) {
      return newStr;
    }

    // Sort differences by start position to ensure correct ordering
    differences.sort((a, b) => a.start - b.start);

    // Build the result string with all diffs wrapped in spans
    let result = "";
    let lastEnd = 0;

    differences.forEach((diff) => {
      result += newStr.slice(lastEnd, diff.start);
      const string = newStr.slice(diff.start, diff.end + 1);
      result += `<strong data-highlight="${string}">${string}</strong>`;
      lastEnd = diff.end + 1;
    });

    // Add any remaining unchanged text after the last diff
    if (lastEnd < newStr.length) {
      result += newStr.slice(lastEnd);
    }

    return result;
  }
}
