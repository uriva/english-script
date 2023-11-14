import { assertEquals } from "https://deno.land/std@0.174.0/testing/asserts.ts";
import { makeFunction } from "./index.ts";
import { waitAllWrites } from "https://deno.land/x/rmmbr@0.0.19/client/src/index.ts";

Deno.test("basic", async () => {
  const f = await makeFunction({
    description: "determine if prime",
    testCases: [
      [1, false], // By definition
      [2, true],
      [4, false],
    ],
  });
  await waitAllWrites();
  assertEquals([53, 44].map(f), [true, false]);
});

Deno.test("complex", async () => {
  const f = await makeFunction({
    description: "determine if a word is a stop word",
    testCases: [
      ["building", false],
      ["is", true],
      ["growth", false],
      ["that", true],
    ],
  });
  await waitAllWrites();
  assertEquals(["this", "tree"].map(f), [true, false]);
});

Deno.test("composite output / input", async () => {
  const f = await makeFunction({
    description: "sort object low to high by the `age` attribute",
    testCases: [
      [
        [
          { name: "uri", age: 9 },
          { name: "dani", age: 5 },
          { name: "john", age: 18 },
        ],
        [
          { name: "dani", age: 5 },
          { name: "uri", age: 9 },
          { name: "john", age: 18 },
        ],
      ],
    ],
  });
  await waitAllWrites();
  assertEquals(
    f([
      { name: "john", age: 99 },
      { name: "sam", age: 511 },
      { name: "ronnie", age: 2 },
    ]),
    [
      { name: "ronnie", age: 2 },
      { name: "john", age: 99 },
      { name: "sam", age: 511 },
    ],
  );
});
