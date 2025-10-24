const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'node_modules', 'monaco-editor', 'min', 'vs');
const dest = path.join(__dirname, '..', 'public', 'vs');

function copyDir(s, d) {
  if (!fs.existsSync(s)) return;
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  for (const item of fs.readdirSync(s)) {
    const sPath = path.join(s, item);
    const dPath = path.join(d, item);
    const stat = fs.statSync(sPath);
    if (stat.isDirectory()) copyDir(sPath, dPath);
    else fs.copyFileSync(sPath, dPath);
  }
}

console.log('copying monaco from', src, 'to', dest);
copyDir(src, dest);
console.log('monaco copy complete');
