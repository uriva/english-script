import * as esprima from "npm:esprima";

const { parseScript } = esprima;

type ASTNode = {
  name: string;
  type: string;
  object: ASTNode;
  expression: {
    name: string;
    type: string;
    callee: ASTNode;
    left: ASTNode;
  };
};

const hasNetworkAccess = ({ type, expression }: ASTNode) =>
  type === "ExpressionStatement" &&
  expression.type === "CallExpression" &&
  ["fetch", "XMLHttpRequest", "WebSocket"].includes(expression.callee.name);

const hasOsApiAccess = ({ type, expression }: ASTNode) =>
  type === "ExpressionStatement" &&
  expression.type === "CallExpression" &&
  ["require", "process", "fs", "child_process"].includes(
    expression.callee.name,
  );

const hasConsoleAccess = ({ type, expression }: ASTNode) =>
  type === "ExpressionStatement" &&
  expression.type === "CallExpression" &&
  expression.callee.type === "MemberExpression" &&
  expression.callee.object.name === "console";

const hasSideEffects = ({ type, expression }: ASTNode) =>
  type === "ExpressionStatement" &&
  expression.type !== "CallExpression" &&
  expression.type !== "Identifier" &&
  expression.type !== "Literal";

const hasVariableAccess = ({ type, expression }: ASTNode) =>
  type === "ExpressionStatement" &&
  expression.type === "Identifier" &&
  !["undefined", "null"].includes(expression.name);

const hasInputModification = (ast: ReturnType<typeof parseScript>) =>
  ast.body.some(
    ({ type, expression }: ASTNode) =>
      type === "ExpressionStatement" &&
      expression.type === "AssignmentExpression" &&
      expression.left.type === "Identifier" &&
      ast.params.some(
        ({ name }: { name: string }) => name === expression.left.name,
      ),
  );

const localEffects = [
  hasNetworkAccess,
  hasOsApiAccess,
  hasConsoleAccess,
  hasSideEffects,
  hasVariableAccess,
];

export const isPureFunction = (code: string) => {
  try {
    const ast = parseScript(code);
    return !(
      ast.body.some((node: ASTNode) =>
        localEffects.some((hasEffect) => hasEffect(node))
      ) || hasInputModification(ast)
    );
  } catch (e) {
    console.error(e);
    console.error(code);
    throw e;
  }
};

export const functionBody = (code: string) => {
  const match = /function\s*\w*\s*\([^)]*\)\s*{([^]*)}/.exec(code);
  if (match?.[1]) return match[1].trim();
  throw new Error();
};
