const [major, minor, patch] = process.versions.node.split('.').map(Number);
const supported =
  major > 22 ||
  (major === 22 && minor >= 12) ||
  (major === 20 && minor >= 19);

if (!supported) {
  console.error(`\nRECEH DEX requires Node.js 20.19+ or 22.12+.\nCurrent Node.js: ${process.versions.node}\nPlease upgrade Node.js, then run: npm install\n`);
  process.exit(1);
}

console.log(`RECEH DEX environment OK — Node.js ${process.versions.node}`);
