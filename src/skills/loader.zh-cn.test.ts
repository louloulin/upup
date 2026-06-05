/**
 * Skill description.zh-CN loading + lint sanity (P3.a.2 / P3.a.5)
 *
 * 守护点:
 *   - parseSkillFile 正确把 `description.zh-CN` 解析到 descriptionZhCn
 *   - 多行 YAML 字面量(|)也能解析
 *   - 50 个内置 SKILL.md 全部含 zh-CN (与 scripts/lint-skill-locale.sh 互为冗余,
 *     在 Node 测试环境也能跑, 不依赖 shell)
 */

import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseSkillFile } from './loader.js';

const SKILLS_DIR = join(import.meta.dir, '..', '..', 'src', 'skills');

function* walkSkills(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      yield* walkSkills(full);
    } else if (entry === 'SKILL.md') {
      yield full;
    }
  }
}

describe('Skill description.zh-CN loading (P3.a.2)', () => {
  test('parses single-line description.zh-CN', () => {
    const skill = parseSkillFile(
      `---
name: test
description: english desc
description.zh-CN: 中文描述
---

# body
`,
      '/tmp/test.md',
      'builtin',
    );
    expect(skill.description).toBe('english desc');
    expect(skill.descriptionZhCn).toBe('中文描述');
  });

  test('parses multi-line literal-block description.zh-CN (YAML `|`)', () => {
    const skill = parseSkillFile(
      `---
name: test
description: |
  multi
  line english
description.zh-CN: |
  多行
  中文
---

# body
`,
      '/tmp/test.md',
      'builtin',
    );
    expect(skill.description).toContain('multi');
    expect(skill.descriptionZhCn).toContain('多行');
  });

  test('descriptionZhCn is undefined when frontmatter lacks the key', () => {
    const skill = parseSkillFile(
      `---
name: test
description: english only
---

# body
`,
      '/tmp/test.md',
      'builtin',
    );
    expect(skill.descriptionZhCn).toBeUndefined();
  });
});

describe('Lint — every built-in SKILL.md has description.zh-CN (P3.a.2)', () => {
  // 与 scripts/lint-skill-locale.sh 互为冗余, 保证在 Windows / 不带 shell
  // 的 CI runner 上也能 fail。
  test('src/skills/**/SKILL.md all contain description.zh-CN frontmatter field', () => {
    const files = [...walkSkills(SKILLS_DIR)];
    expect(files.length).toBeGreaterThan(30); // sanity: 至少 30 个
    const missing: string[] = [];
    for (const f of files) {
      const text = require('node:fs').readFileSync(f, 'utf8') as string;
      if (!/^description\.zh-CN:/m.test(text)) {
        missing.push(f);
      }
    }
    expect(missing, `missing zh-CN: ${missing.join(', ')}`).toEqual([]);
  });

  test('每个 description.zh-CN 含中文字符 (避免误用 EN 翻译)', () => {
    const cnCharRe = /[\u4e00-\u9fff]/;
    const files = [...walkSkills(SKILLS_DIR)];
    const badOnes: string[] = [];
    for (const f of files) {
      const text = require('node:fs').readFileSync(f, 'utf8') as string;
      const m = text.match(/^description\.zh-CN:\s*\|?\s*\n((?:.+\n)*?)(?=^\S|\Z)/m);
      if (!m) continue;
      // Strip leading whitespace from each line
      const value = m[1].split('\n').map(l => l.trim()).join(' ');
      if (!cnCharRe.test(value)) {
        badOnes.push(`${f}: ${value.slice(0, 40)}`);
      }
    }
    expect(badOnes, `non-Chinese values: ${badOnes.join('; ')}`).toEqual([]);
  });
});
