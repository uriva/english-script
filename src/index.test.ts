import { assertEquals } from "https://deno.land/std@0.174.0/testing/asserts.ts";
import { makeFunctionWithKey } from "./index.ts";
import { waitAllWrites } from "https://deno.land/x/rmmbr@0.0.19/client/src/index.ts";

const makeFunction = makeFunctionWithKey(Deno.env.get("OPENAI_API_KEY")!);

Deno.test("basic", async () => {
  const f = await makeFunction({
    iterations: 2,
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

Deno.test("composite output / input", async () => {
  const f = await makeFunction({
    iterations: 2,
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

// Deno.test("multi-iteration", async () => {
//   const cases: [string, string][] = [
//     ["hi there", "hi there"],
//     [
//       `Uri: hello
//     John: goodbye`,
//       `hello\ngoodbye`,
//     ],
//     [
//       `It's not fair! - Alex: Survival's not fair!`,
//       "It's not fair! Survival's not fair",
//     ],
//   ];
//   await makeFunction({
//     description:
//       "I have some text that contains a speaker and some text. the speaker may also appear mid text. I want to remove all the speaker strings. There might be a dash before the speaker name, remove it too",
//     testCases: cases,
//     iterations: 4,
//   });
// });
