const ts = require('typescript');

/**
 * 提取 JS 模块真正会解析的裸包 specifier。
 *
 * 必须走 AST 而不是正则：学习课程内容里包含大量示例源码字符串，
 * 文本扫描会把 `import ... from 'react'`、`require('left-pad')` 误判为运行时依赖。
 */
function collectRuntimeSpecifiers(code, fileName = 'module.js') {
  const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const out = [];
  const add = (specifier) => {
    if (typeof specifier === 'string' && specifier) out.push(specifier);
  };

  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
    ) {
      add(node.moduleSpecifier.text);
    }

    if (ts.isCallExpression(node) && node.arguments.length) {
      const first = node.arguments[0];
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if ((isDynamicImport || isRequire) && ts.isStringLiteral(first)) add(first.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
  return out;
}

module.exports = { collectRuntimeSpecifiers };
