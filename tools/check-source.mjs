import fs from 'node:fs';
import path from 'node:path';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';

const root = path.resolve(import.meta.dirname, '..');
const failures = [];
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
function logicalStatements(fn) {
  let count = 0;
  function visit(node) {
    if (node !== fn && ts.isFunctionLike(node)) return;
    if (ts.isStatement(node) && !ts.isBlock(node)) count++;
    ts.forEachChild(node, visit);
  }
  visit(fn);
  return count;
}
function checkCode(file) {
  const text = fs.readFileSync(file, 'utf8');
  const relative = path.relative(root, file);
  if (text.split('\n').length > 400) failures.push(`${relative}: exceeds 400 source lines`);
  if (/sk-[a-zA-Z0-9]{24,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}/.test(text)) {
    failures.push(`${relative}: potential secret; inspect before delivery`);
  }
  if (!/\.tsx?$/.test(file) || file.endsWith('.d.ts')) return;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isFunctionLike(node) && node.body && logicalStatements(node) > 50) {
      failures.push(`${relative}: function exceeds 50 logical statements`);
    }
    if (ts.isJsxText(node) && /[A-Za-z]/.test(node.text.trim())) {
      failures.push(`${relative}: inline authored content must move to the content model`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
function checkContent() {
  const text = fs.readFileSync(path.join(root, 'frontend/public/collaborative-whiteboard.model.json'), 'utf8');
  const model = JSON.parse(text);
  const stack = [];
  const tokens = text.match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g) ?? [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === '{') stack.push(new Set());
    else if (token === '[') stack.push(null);
    else if (token === '}' || token === ']') stack.pop();
    else if (token.startsWith('"') && tokens[index + 1] === ':') {
      const keys = stack.at(-1);
      const key = JSON.parse(token);
      if (keys?.has(key)) failures.push(`content model: duplicate key ${key}`);
      keys?.add(key);
    }
  }
  if (model.schemaVersion !== 1 || !model.locales[model.defaultLocale]) failures.push('Invalid content model metadata');
}
for (const directory of ['frontend/src', 'backend/src']) walk(path.join(root, directory)).forEach(checkCode);
checkContent();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    'Source size, logical statements, authored-content placement, duplicate JSON keys and secret patterns passed.',
  );
