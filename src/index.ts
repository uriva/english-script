import { cache } from "https://deno.land/x/rmmbr@0.0.19/client/src/index.ts";
import { equal } from "https://deno.land/std@0.174.0/testing/asserts.ts";
import { isPureFunction } from "./purity.ts";
import { default as opanai } from "npm:openai@4.17.5";

const cachedOpenAI = (apiKey: string) =>
  cache({ cacheId: "createChatCompletion" })(
    (x) =>
      new opanai.OpenAI({ apiKey }).chat
        .completions
        .create(x),
  );

const nextMessage =
  (apiKey: string) => (messages: opanai.ChatCompletionMessageParam[]) =>
    cachedOpenAI(apiKey)({
      model: "gpt-4",
      messages,
    }).then(({ choices }) => choices[0].message);

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

// deno-lint-ignore no-explicit-any
const runTestCases = <F extends (input: any) => any>(
  f: F,
) =>
(
  [input, expected]: TestCase<Parameters<F>[0], ReturnType<F>>,
) => {
  const actual = f(input);
  const result = equal(actual, expected);
  if (result) return null;
  const failure = `generated function failed test \`${
    JSON.stringify(
      input,
    )
  }\` -> \`${JSON.stringify(actual)}\` instead of \`${
    JSON.stringify(
      expected,
    )
  }\``;
  console.error(failure);
  return failure;
};

type Options<Input, Output> = {
  apiKey: string;
  description: string;
  testCases: TestCase<Input, Output>[];
  iterations: number;
};

const cleanSurroundingQuotes = (code: string) =>
  code.trim().startsWith("```")
    ? code.trim().replace(/^```javascript/, "").replace(/```$/, "")
    : code;

export const makeFunction = async <Input, Output>({
  apiKey,
  description,
  testCases,
  iterations,
}: Options<Input, Output>): Promise<(input: Input) => Output> => {
  const messages: opanai.ChatCompletionMessageParam[] = [{
    role: "user",
    content: getPrompt(description, testCases),
  }];
  while (iterations) {
    iterations--;
    const response = await nextMessage(apiKey)(messages);
    messages.push({ role: response.role, content: response.content! });
    const code = cleanSurroundingQuotes(response.content!);
    if (!isPureFunction(code)) {
      messages.push({
        role: "user",
        "content": "the code you wrote has a side effect",
      });
      continue;
    }
    const f = Function("x", code.slice(14, code.length - 1)) as (
      input: Input,
    ) => Output;
    const failures = testCases.map(runTestCases(f)).filter((x: string | null) =>
      x
    );
    if (!failures.length) return f;
    messages.push({
      role: "user",
      content: "The code you wrote fails the following test cases:\n\n" +
        failures.join("\n\n"),
    });
  }
  throw new Error(
    `failed generating code. history: ${JSON.stringify(messages)}`,
  );
};

export const makeFunctionWithKey =
  (apiKey: string) =>
  <Input, Output>(options: Omit<Options<Input, Output>, "apiKey">) =>
    makeFunction({ ...options, apiKey });
