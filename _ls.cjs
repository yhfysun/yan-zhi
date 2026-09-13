const fs = require('fs');
const t = fs.readFileSync('C:/Users/Administrator/Desktop/github/yan-zhi-master/apps/server/src/plugins/skins.ts', 'utf8');
// 匹配 manifest 里的 id: 'skin-xxx' 以及 name
const ids = [...t.matchAll(/id:\s*'(skin-[a-z0-9-]+)'/g)].map(m => m[1]);
const names = [...t.matchAll(/name:\s*'([^']+)',\s*\n\s*version:/g)].map(m => m[1]);
console.log('皮肤数:', ids.length);
ids.forEach((id, i) => console.log(i + '.', id, '|', names[i] || '?'));
