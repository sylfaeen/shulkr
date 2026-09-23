const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);

function unwrap(node) {
  while (
    node &&
    (node.type === 'TSAsExpression' ||
      node.type === 'TSTypeAssertion' ||
      node.type === 'TSNonNullExpression' ||
      node.type === 'TSSatisfiesExpression')
  ) {
    node = node.expression;
  }
  return node;
}

function getCallExpressionName(node) {
  node = unwrap(node);
  if (!node || node.type !== 'CallExpression') return null;
  const callee = node.callee;
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && callee.property?.type === 'Identifier') return callee.property.name;
  return null;
}

function classify(node) {
  if (node.type === 'EmptyStatement') return 'skip';

  if (node.type === 'VariableDeclaration') {
    const idName = node.declarations[0]?.id?.type === 'Identifier' ? node.declarations[0].id.name : null;
    if (idName?.startsWith('handle')) return 'handlers';
    return 'bindings';
  }

  if (node.type === 'ExpressionStatement') {
    const callName = getCallExpressionName(node.expression);
    if (callName) {
      if (EFFECT_HOOKS.has(callName)) return 'effects';
      if (/^use[A-Z]/.test(callName)) return 'side-effect-hook';
    }
    return 'expression';
  }

  if (node.type === 'IfStatement') {
    const consequent = node.consequent;
    if (consequent?.type === 'ReturnStatement') return 'guard';
    if (
      consequent?.type === 'BlockStatement' &&
      consequent.body.length === 1 &&
      consequent.body[0].type === 'ReturnStatement'
    ) {
      return 'guard';
    }
    return 'control-flow';
  }

  if (node.type === 'ReturnStatement') return 'return';

  if (node.type === 'FunctionDeclaration') {
    if (node.id?.name?.startsWith('handle')) return 'handlers';
    return 'helper';
  }

  return 'other';
}

function isComponentOrHook(node) {
  let name = null;
  if (node.type === 'FunctionDeclaration') {
    name = node.id?.name;
  } else if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression') {
    const parent = node.parent;
    if (parent?.type === 'VariableDeclarator') {
      name = parent.id?.type === 'Identifier' ? parent.id.name : null;
    } else if (parent?.type === 'AssignmentExpression') {
      const left = parent.left;
      if (left?.type === 'Identifier') name = left.name;
      else if (left?.type === 'MemberExpression' && left.property?.type === 'Identifier') name = left.property.name;
    } else if (parent?.type === 'Property' && parent.key?.type === 'Identifier') {
      name = parent.key.name;
    }
  }
  if (!name) return false;
  return /^[A-Z]/.test(name) || /^use[A-Z]/.test(name);
}

function hasBlankLineBefore(curNode, prevNode, sourceCode) {
  const commentsBefore = sourceCode.getCommentsBefore(curNode);
  const startNode = commentsBefore.length > 0 ? commentsBefore[0] : curNode;
  return startNode.loc.start.line - prevNode.loc.end.line >= 2;
}

export default {
  meta: {
    type: 'layout',
    docs: {
      description:
        'Require a blank line between groups of statements with different concerns in React components and custom hooks (canonical phase order).',
    },
    fixable: 'whitespace',
    schema: [],
    messages: {
      missingBlank: "Expected blank line between '{{prevPhase}}' group and '{{currPhase}}' group.",
      unexpectedBlank: "Unexpected blank line within '{{group}}' group; single-line statements of the same concern stay contiguous.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();

    function checkBody(body) {
      for (let i = 1; i < body.length; i++) {
        const prev = body[i - 1];
        const curr = body[i];

        const prevPhase = classify(prev);
        const currPhase = classify(curr);

        if (prevPhase === 'skip' || currPhase === 'skip') continue;

        const prevMulti = prev.loc.start.line !== prev.loc.end.line;
        const currMulti = curr.loc.start.line !== curr.loc.end.line;
        if (prevMulti || currMulti) continue;

        const sameGroup = prevPhase === currPhase;
        const blankBefore = hasBlankLineBefore(curr, prev, sourceCode);

        if (!sameGroup && !blankBefore) {
          context.report({
            node: curr,
            messageId: 'missingBlank',
            data: { prevPhase: prevPhase, currPhase: currPhase },
            fix(fixer) {
              const insertPos = prev.range[1];
              return fixer.insertTextAfterRange([insertPos, insertPos], '\n');
            },
          });
          continue;
        }

        if (sameGroup && blankBefore) {
          const commentsBefore = sourceCode.getCommentsBefore(curr);
          const startNode = commentsBefore.length > 0 ? commentsBefore[0] : curr;
          const prevEndLine = prev.loc.end.line;
          const startLine = startNode.loc.start.line;
          if (startLine - prevEndLine < 2) continue;

          const startIndex = startNode.range[0];
          const lineStart = sourceCode.text.lastIndexOf('\n', startIndex - 1) + 1;
          const indent = sourceCode.text.slice(lineStart, startIndex);

          context.report({
            node: curr,
            messageId: 'unexpectedBlank',
            data: { group: prevPhase },
            fix(fixer) {
              const removeFrom = prev.range[1];
              const removeTo = lineStart + indent.length;
              return fixer.replaceTextRange([removeFrom, removeTo], '\n' + indent);
            },
          });
        }
      }
    }

    function visitFunction(node) {
      if (!isComponentOrHook(node)) return;
      if (!node.body || node.body.type !== 'BlockStatement') return;
      checkBody(node.body.body);
    }

    return {
      FunctionDeclaration: visitFunction,
      FunctionExpression: visitFunction,
      ArrowFunctionExpression: visitFunction,
    };
  },
};
