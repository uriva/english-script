import OpenAI, { default as opanai } from "npm:openai@4.17.5";
import {
  assertEquals,
  equal,
} from "https://deno.land/std@0.174.0/testing/asserts.ts";
import {
  blue,
  green,
  yellow,
} from "https://deno.land/std@0.123.0/fmt/colors.ts";
import { functionBody, isPureFunction } from "./purity.ts";

import { cache } from "https://deno.land/x/rmmbr@0.0.19/client/src/index.ts";

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

const prefix = `Write a javascript function as described below.

It must be called \`f\`, it must be unary and the variable should be called \`x\`.

No side effects or dependencies are allowed, so no \`console.log\` for example.

After the description there are test cases, they might imply more requirements.

Think step by step and make sure your function is wrapped in backticks.

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
  try {
    const actual = f(input);
    try {
      assertEquals(actual, expected);
      return null;
    } catch (e) {
      return `input: ${JSON.stringify(input)}\n\n${e.message}`;
    }
  } catch (e) {
    return `Threw an exception for input ${
      JSON.stringify(input)
    }. Here's the stack trace: ${e}`;
  }
};

type Options<Input, Output> = {
  apiKey: string;
  description: string;
  testCases: TestCase<Input, Output>[];
  iterations: number;
};

const roleToColor: Record<string, (s: string) => string> = {
  "user": blue,
  "system": green,
  "assistant": yellow,
};

const historyToLog = (
  { role, content }: opanai.ChatCompletionMessageParam,
) => roleToColor[role](role) + "\n" + content;

const extractCode = (input: string): string | undefined => {
  const match = /```(?:\w+)?\s*([\s\S]+?)\s*```/g.exec(input);
  return match?.[1];
};

const iteration = async <Input, Output>(
  n: number,
  opts: Options<Input, Output>,
  message: opanai.ChatCompletionMessageParam,
): Promise<(input: Input) => Output> => {
  console.log(historyToLog(message));
  if (!n) throw new Error("Failed generating code");
  const response = await nextMessage(opts.apiKey)([
    message,
  ]);
  console.log(historyToLog(response));
  const code = extractCode(response.content!);
  if (!code) {
    return iteration(n - 1, opts, {
      role: "system",
      content: `no code wrapped in backticks was found: ${response.content}`,
    });
  }
  if (!isPureFunction(code)) {
    return iteration(n - 1, opts, {
      role: "system",
      content:
        `the code you wrote has a side effect ${response.content}, extract just the function without side effects, in backticks`,
    });
  }
  try {
    const f = Function("x", functionBody(code)) as (input: Input) => Output;
    const failures = opts.testCases.map(runTestCases(f)).filter((
      x: string | null,
    ) => x);
    if (!failures.length) return f;
    return iteration(n - 1, opts, {
      role: "system",
      content:
        `Help me fix this function:\n\n${code}\n\nfor the following test cases:\n\n${
          failures.join("\n\n")
        }`,
    });
  } catch (e) {
    console.error(e, code, functionBody(code));
    throw new Error("code does not compile");
  }
};

export const makeFunction = <Input, Output>(
  opts: Options<Input, Output>,
) =>
  iteration(opts.iterations, opts, {
    role: "user",
    content: getPrompt(opts.description, opts.testCases),
  });

export const makeFunctionWithKey =
  (apiKey: string) =>
  <Input, Output>(options: Omit<Options<Input, Output>, "apiKey">) =>
    makeFunction({ ...options, apiKey });
