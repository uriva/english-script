import {
  Configuration,
  CreateChatCompletionRequest,
  CreateChatCompletionResponseChoicesInner,
  OpenAIApi,
} from "npm:openai";
import { JSONValue, cache } from "./cache.ts";

import { config } from "https://deno.land/x/dotenv/mod.ts";
import { isPureFunction } from "./purity.ts";
import jsonStableStringify from "npm:json-stable-stringify";

const openai = new OpenAIApi(
  new Configuration({
    apiKey: config().openai_key,
  }),
);

const cachedOpenAI = await cache({
  key: jsonStableStringify,
  name: "createChatCompletion",
  f: (x: CreateChatCompletionRequest) =>
    openai.createChatCompletion(x).then((x) => x.data),
});

const doPrompt = (prompt: string) =>
  cachedOpenAI({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: prompt }],
  }).then(
    ({
      choices,
    }: {
      choices: Array<CreateChatCompletionResponseChoicesInner>;
    }) => choices[0].message?.content || "",
  );

const maxPromptLength = 2400;

const testCaseToString = ([input, output]: TestCase) => `input: ${input}
output: ${output}`;

const prefix = `Write a javascript function as dscribed below.
It must be called \`f\`, it must be unary and the variable should be called \`x\`.
No side effects or dependencies are allowed.
Remove all whitespace from your answer, so it must start with \`function f(x){\` and must end with \`}\`.
Your answer must be code that compiles only, no other text is allowed.
After the description there are test cases, go over each one and make sure your code works for them.

Here is the function description:\n`;
const getPrompt = (description: string, testCases: TestCase[]) => {
  let prompt = prefix + description;
  if (prompt.length > maxPromptLength) throw "too long";
  for (const testCase of testCases) {
    const newPrompt = prompt + "\n\n" + testCaseToString(testCase);
    if (newPrompt.length > maxPromptLength) return prompt;
    prompt = newPrompt;
  }
  return prompt;
};

type TestCase = [JSONValue, JSONValue];
type Unary = (input: JSONValue) => JSONValue;
const runTestCases = (f: Unary, testCases: TestCase[]) =>
  testCases.every(([input, expected]: TestCase) => {
    const actual = f(input);
    const result = actual === expected;
    if (!result)
      console.error(
        `generated function failed test \`${input}\` -> \`${actual}\` instead of \`${expected}\``,
      );
    return result;
  });

type Options = {
  description: string;
  testCases: TestCase[];
};

export const makeFunction = async ({
  description,
  testCases,
}: Options): Promise<Unary> => {
  const code = await doPrompt(getPrompt(description, testCases));
  if (!isPureFunction(code)) throw "impure code detected";
  const f = Function("x", code.slice(14, code.length - 1)) as Unary;
  if (!runTestCases(f, testCases)) throw "failed tests";
  return f;
};
