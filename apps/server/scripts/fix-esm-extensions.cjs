const fs = require('fs');
const path = require('path');

const serverDistDir = path.resolve(__dirname, '..', 'dist');

const importPattern =
  /(?<prefix>(?:^|\n)\s*(?:import|export)[^"']*?from\s*|import\s*|export\s+)(?<quote>["'])(?<specifier>\.{1,2}\/[^"']+)\k<quote>/g;

const dynamicImportPattern =
  /(?<prefix>import\s*\(\s*)(?<quote>["'])(?<specifier>\.{1,2}\/[^"']+)\k<quote>(?<suffix>\s*\))/g;

function hasJsLikeExtension(specifier) {
  return /\.(?:[cm]?js|json|node)$/i.test(specifier);
}

function resolveCompiledSpecifier(currentFile, specifier) {
  if (hasJsLikeExtension(specifier)) return specifier;

  const base = path.resolve(path.dirname(currentFile), specifier);

  // 目录导入：源码里写的是 './tool'，实际入口是 './tool/index.js'。
  if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
    const index = path.join(base, 'index.js');
    if (fs.existsSync(index)) {
      return `${specifier}/index.js`;
    }
  }

  // 文件导入：源码里写的是 './types/index'，编译后应指向 './types/index.js'。
  if (fs.existsSync(`${base}.js`)) {
    return `${specifier}.js`;
  }

  return specifier;
}

function rewriteFile(filePath) {
  const before = fs.readFileSync(filePath, 'utf8');
  const afterStatic = before.replace(importPattern, (match, prefix, quote, specifier) => {
    const fixed = resolveCompiledSpecifier(filePath, specifier);
    return `${prefix}${quote}${fixed}${quote}`;
  });
  const after = afterStatic.replace(
    dynamicImportPattern,
    (match, prefix, quote, specifier, suffix) => {
      const fixed = resolveCompiledSpecifier(filePath, specifier);
      return `${prefix}${quote}${fixed}${quote}${suffix}`;
    },
  );

  if (after !== before) {
    fs.writeFileSync(filePath, after, 'utf8');
    console.log(`[fix-esm-extensions] ${path.relative(serverDistDir, filePath)}`);
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      rewriteFile(full);
    }
  }
}

walk(serverDistDir);
