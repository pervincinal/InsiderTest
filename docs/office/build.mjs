// Renders docs/office/office.json into docs/office/tower-clash-ofisi.html (the "Tower Clash Ofisi" artifact).
// Usage: node docs/office/build.mjs   — then the Producer publishes the HTML with the Artifact tool
// to https://claude.ai/artifact/EyscHjSMPLm1J2R94ozuV8 (pass `url`; the file path alone would make a new artifact).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(dir, 'office.json'), 'utf8'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const board = `<h2>${esc(data.board.title)}</h2>\n` + data.board.stats.map((x) => `      <div class="stat"><b>${esc(x.b)}</b><span>${esc(x.s)}</span></div>`).join('\n');
const json = (v) => JSON.stringify(v).replace(/<\/script/gi, '<\\/script');
let html = readFileSync(join(dir, 'template.html'), 'utf8');
for (const [token, value] of [['__BOARD__', board], ['__FOOTER__', data.board.footer], ['__TEAM__', json(data.team)], ['__BACKLOG__', json(data.backlog)]]) {
  if (!html.includes(token)) throw new Error(`template token ${token} missing`);
  html = html.replace(token, () => value);
}
const out = join(dir, 'tower-clash-ofisi.html');
writeFileSync(out, html);
console.log(`office: ${out} (${(html.length / 1024).toFixed(1)} kB, ${data.team.length} desks, ${data.backlog.reduce((n, g) => n + g.items.length, 0)} backlog items)`);
