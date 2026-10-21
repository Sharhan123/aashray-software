import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

describe('Express 4 async route coverage', () => {
  it('wraps every inline async handler registered on a router', () => {
    const directory = fileURLToPath(new URL('.', import.meta.url));
    const unwrapped: string[] = [];
    let wrapped = 0;
    for (const name of readdirSync(directory).filter((name) => name.endsWith('Routes.ts'))) {
      const file = ts.createSourceFile(name, readFileSync(new URL(name, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.expression.getText(file) === 'router') {
          for (const arg of node.arguments) {
            if ((ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) && arg.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) unwrapped.push(name);
            if (ts.isCallExpression(arg) && arg.expression.getText(file) === 'asyncHandler') wrapped++;
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    expect(unwrapped).toEqual([]);
    expect(wrapped).toBeGreaterThan(0);
  });
});
