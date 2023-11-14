import { OpenAI } from "npm:openai@4.17.5";
import { cache } from "https://deno.land/x/rmmbr@0.0.19/client/src/index.ts";
import { equal } from "https://deno.land/std@0.174.0/testing/asserts.ts";
import { isPureFunction } from "./purity.ts";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

const cachedOpenAI = cache({ cacheId: "createChatCompletion" })(
  (x) => openai.chat.completions.create(x),
);

const doPrompt = (prompt: string) =>
  cachedOpenAI({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
  }).then(({ choices }) => choices[0].message?.content || "");

const maxPromptLength = 2400;

const testCaseToString = <Input, Output>([input, output]: TestCase<
  Input,
  Output
>) =>
  `input: ${JSON.stringify(input)}
output: ${JSON.stringify(output)}`;

const prefix = `Write a javascript function as dscribed below.

It must be called \`f\`, it must be unary and the variable should be called \`x\`.

No side effects or dependencies are allowed, so no \`console.log\` for example.
Your answer must start with \`function f(x){\` and must end with \`}\`, bceause it's a single function.

Your answer must javascript code that compiles, no other text is allowed. No need to list the test cases.

Please make the code as concise and as readable as you can, no repetitions.
After the description there are test cases, go over each one and make sure your code works for them.

Here is the function description:\n`;
const getPrompt = <Input, Output>(
  description: string,
  testCases: TestCase<Input, Output>[],
) => {
  let prompt = prefix + description;
  if (prompt.length > maxPromptLength) {
    throw new Error(`prompt is too long: ${description}`);
  }
  for (const testCase of testCases) {
    const newPrompt = prompt + "\n\n" + testCaseToString(testCase);
    if (newPrompt.length > maxPromptLength) return prompt;
    prompt = newPrompt;
  }
  return prompt;
};

export type JSONValue =
  | string
  | number
  | boolean
  | { [x: string]: JSONValue }
  | Array<JSONValue>;

type TestCase<Input, Output> = [Input, Output];

const runTestCases = <F extends (input: any) => any>(
  f: F,
  testCases: TestCase<Parameters<F>[0], ReturnType<F>>[],
) =>
  testCases.every(([input, expected]) => {
    const actual = f(input);
    const result = equal(actual, expected);
    if (!result) {
      console.error(
        `generated function failed test \`${
          JSON.stringify(
            input,
          )
        }\` -> \`${JSON.stringify(actual)}\` instead of \`${
          JSON.stringify(
            expected,
          )
        }\``,
      );
    }
    return result;
  });

type Options<Input, Output> = {
  description: string;
  testCases: TestCase<Input, Output>[];
};

const cleanSurroundingQuotes = (code: string) =>
  code.trim().startsWith("```")
    ? code.trim().replace(/^```javascript/, "").replace(/```$/, "")
    : code;

export const makeFunction = async <Input, Output>({
  description,
  testCases,
}: Options<Input, Output>): Promise<(input: Input) => Output> => {
  const code = cleanSurroundingQuotes(
    await doPrompt(getPrompt(description, testCases)),
  );
  if (!isPureFunction(code)) throw new Error(`impure code detected: ${code}`);
  const f = Function("x", code.slice(14, code.length - 1)) as (
    input: Input,
  ) => Output;
  if (!runTestCases(f, testCases)) throw new Error(`failed tests: ${code}`);
  return f;
};
