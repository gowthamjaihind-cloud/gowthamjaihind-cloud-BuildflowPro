import { describe, it, expect } from "vitest";
// Plain ESM with no type declarations; it is a checker, not a library.
import { checkBrand, findRetired } from "./brand.test.mjs";

/**
 * Wire the marketing brand check into `npm test`.
 *
 * The check itself lives in brand.test.mjs so it can also be run on its own
 * while iterating on a render. This file exists so it runs on every commit
 * rather than when someone remembers -- which is the actual failure here: the
 * films were rendered in the retired palette for as long as marketing/ had no
 * test that CI would run.
 */
describe("marketing brand", () => {
  it("matches the product's tokens in src/index.css", () => {
    expect(checkBrand()).toEqual([]);
  });

  it("carries no retired brand value in any renderer", () => {
    expect(findRetired()).toEqual([]);
  });
});
