/**
 * Tests for the report-tidy dedupe helper.
 *
 * Background: in the live case, product cards' "Talking points"
 * frequently duplicate the "Advice" line and repeat the same bullet
 * twice. The report should de-duplicate them and hide the section
 * entirely when nothing useful is left.
 */
import { describe, it, expect } from "vitest";
import { dedupeTalkingPoints, isStandardProductChecks, isStandardProductSafetyNet } from "./case-report-tidy";

describe("dedupeTalkingPoints", () => {
  it("returns the original list when there is no advice line to compare against", () => {
    const out = dedupeTalkingPoints(null, ["Take with food", "Avoid alcohol"]);
    expect(out).toEqual(["Take with food", "Avoid alcohol"]);
  });

  it("DROPS a talking point that exactly matches the advice line (case-insensitive)", () => {
    const out = dedupeTalkingPoints(
      "Consider B12 as a pharmacist-reviewed option.",
      [
        "Consider B12 as a pharmacist-reviewed option.",
        "Take with breakfast",
      ],
    );
    expect(out).toEqual(["Take with breakfast"]);
  });

  it("DROPS a talking point that contains the advice line (and the advice line is > 8 chars)", () => {
    const out = dedupeTalkingPoints(
      "Consider B12 as a pharmacist-reviewed option",
      [
        "Consider B12 as a pharmacist-reviewed option for low energy",
        "Take with breakfast",
      ],
    );
    // The talking point wraps the advice line — that's a duplication
    expect(out).toEqual(["Take with breakfast"]);
  });

  it("does NOT drop a short advice line by accident (length guard)", () => {
    // 8-char threshold prevents "Take it" from eating "Take it with food"
    const out = dedupeTalkingPoints("Take it", ["Take it with food"]);
    expect(out).toEqual(["Take it with food"]);
  });

  it("DEDUPES repeated points (case-insensitive)", () => {
    const out = dedupeTalkingPoints(null, [
      "Take with food",
      "take with food",
      "Avoid alcohol",
      "Avoid alcohol",
    ]);
    expect(out).toEqual(["Take with food", "Avoid alcohol"]);
  });

  it("HIDES the section when dedupe leaves nothing (returns empty array)", () => {
    const out = dedupeTalkingPoints(
      "Consider B12 as a pharmacist-reviewed option.",
      ["Consider B12 as a pharmacist-reviewed option."],
    );
    expect(out).toEqual([]);
  });

  it("trims whitespace and skips empty strings", () => {
    const out = dedupeTalkingPoints(null, [
      "  Take with food  ",
      "",
      "   ",
      "Avoid alcohol",
    ]);
    expect(out).toEqual(["Take with food", "Avoid alcohol"]);
  });

  it("handles an empty input list", () => {
    const out = dedupeTalkingPoints("anything", []);
    expect(out).toEqual([]);
  });
});
