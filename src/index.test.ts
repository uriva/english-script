import { assertEquals } from "https://deno.land/std@0.174.0/testing/asserts.ts";
import { makeFunction } from "./index.ts";

Deno.test("basic", async () => {
  const f = await makeFunction({
    description: "determine if prime",
    testCases: [
      [1, false], // By definition
      [2, true],
      [4, false],
    ],
  });
  assertEquals([53, 44].map(f), [true, false]);
});

Deno.test("complex", async () => {
  const f = await makeFunction({
    description: "is stop word",
    testCases: [
      ["building", false],
      ["is", true],
      ["growth", false],
    ],
  });
  assertEquals(["that", "tree"].map(f), [true, false]);
});
