import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const dirs = [join(homedir(), '.agents/skills'), join(homedir(), '.codex/skills')];
for (const root of dirs) {
  if (!existsSync(root)) { console.log(`${root}: missing`); continue; }
  const t = performance.now();
  let skills = 0, bytes = 0, files = 0;
  for (const name of readdirSync(root)) {
    const md = join(root, name, 'SKILL.md');
    if (!existsSync(md)) continue;
    const buf = readFileSync(md); bytes += buf.length; files += 1; skills += 1;
  }
  console.log(`${root}: ${skills} skills, ${(bytes/1024).toFixed(0)}KB SKILL.md read in ${(performance.now()-t).toFixed(1)}ms`);
}
