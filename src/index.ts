import { blue, yellow } from "https://deno.land/std@0.123.0/fmt/colors.ts";
import { functionBody, isPureFunction } from "./purity.ts";

import { cache } from "https://deno.land/x/rmmbr@0.0.19/client/src/index.ts";
import { equal } from "https://deno.land/std@0.174.0/testing/asserts.ts";
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

After the description there are test cases, go over each one and make sure your code works for them. They might imply more requirements.

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
    const result = equal(actual, expected);
    return result
      ? null
      : `\`${JSON.stringify(input)}\` -> \`${
        JSON.stringify(actual)
      }\` instead of \`${JSON.stringify(expected)}\``;
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

const historyToLog = (messages: opanai.ChatCompletionMessageParam[]) =>
  messages.map(({ role, content }) =>
    (role === "user" ? blue : yellow)(role) + "\n" + content
  ).join(
    "\n\n",
  );

const extractCode = (input: string): string => {
  const match = /```(?:\w+)?\s*([\s\S]+?)\s*```/g.exec(input);
  return (match !== null) ? (match[1]) : input;
};

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
    const code = extractCode(response.content!);
    if (!isPureFunction(code)) {
      messages.push({
        role: "user",
        "content": "the code you wrote has a side effect",
      });
      continue;
    }
    const f = Function("x", functionBody(code)) as (
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
    "Failed generating code. History:\n\n" + historyToLog(messages),
  );
};

export const makeFunctionWithKey =
  (apiKey: string) =>
  <Input, Output>(options: Omit<Options<Input, Output>, "apiKey">) =>
    makeFunction({ ...options, apiKey });
