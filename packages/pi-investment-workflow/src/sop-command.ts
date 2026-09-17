/**
 * `/sop` — inspect the SOP catalog without running an investment workflow.
 *
 * Sub-commands:
 *   /sop list                 list every discoverable SOP (built-in + user)
 *   /sop show <id>            print one SOP's phase graph and parallel groups
 *   /sop sources              print which directory each SOP came from
 *   /sop check                validate every SOP against the agent catalog
 *   /sop agents               list built-in + user-defined agent specs
 *   /sop install <source>     download/copy a SOP into ~/.upup/sops
 *   /sop uninstall <id>       remove an installed SOP from ~/.upup/sops
 *   /sop new <id>             scaffold a new methodology in ~/.upup/sops
 *
 * Running a SOP still goes through `/invest --sop <id> <TICKER>` because that
 * is where the Pi session factory is wired in.
 */
import { INVESTMENT_PROFILES } from './agent-spec';
import { loadSops, loadUserAgentSpecs, mergeAgentCatalog, resolveUpUpHomeRoot } from './sop-loader';
import {
  displaySopPath,
  installSops,
  installedSopPath,
  scaffoldSop,
  sopInstallTargets,
  uninstallSop,
  type SopInstallResult,
  type SopInstallScope,
} from './sop-install';
import { SopValidationError, validateSopSpec, type SopSpec } from './sop-spec';

function agentCatalog(): { readonly ids: ReadonlySet<string>; readonly users: readonly string[] } {
  const userAgents = loadUserAgentSpecs();
  const merged = mergeAgentCatalog(Object.values(INVESTMENT_PROFILES), userAgents.agents);
  return { ids: new Set(merged.map((a) => a.id)), users: userAgents.agents.map((a) => a.id) };
}

function renderList(): string {
  const { sops, sources, warnings } = loadSops();
  const { ids } = agentCatalog();
  const lines = ['', '═══════════════════════════════════════', '  SOP Catalog', '═══════════════════════════════════════', ''];
  if (sops.length === 0) lines.push('  (无 SOP)');
  for (const sop of sops) {
    let status = '✓';
    try {
      validateSopSpec(sop, ids);
    } catch (error) {
      status = error instanceof SopValidationError ? `✗ ${error.issues.length} issue(s)` : '✗ invalid';
    }
    const source = sources.get(sop.id) === 'builtin' ? 'builtin' : 'user';
    const groups = sop.parallelGroups?.length ? `  +${sop.parallelGroups.length} parallel` : '';
    lines.push(`  ${status} ${sop.id.padEnd(18)} [${source}]  ${sop.phases.length} phases${groups}`);
  }
  lines.push('');
  lines.push('  💡 /sop show <id> 详情 · /sop install <source> 安装 · /sop new <id> 新建 · /invest --sop <id> <TICKER> 运行');
  if (warnings.length) {
    lines.push('');
    lines.push('  ⚠ 加载警告:');
    for (const warning of warnings) lines.push(`      ${warning}`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderShow(sop: SopSpec): string {
  const lines = [
    '',
    '═══════════════════════════════════════',
    `  SOP: ${sop.name}`,
    `  id=${sop.id}  v${sop.version}  market=${sop.market ?? 'any'}${sop.tags?.length ? `  tags=${sop.tags.join(',')}` : ''}`,
    '═══════════════════════════════════════',
    '',
    `  ${sop.description.trim().split('\n').join('\n  ')}`,
    '',
    '  Phases:',
  ];
  for (const [i, phase] of sop.phases.entries()) {
    const deps = phase.requires?.length ? `  ← ${phase.requires.join(', ')}` : '';
    lines.push(`    ${i + 1}. ${phase.id.padEnd(14)} agent=${phase.agent}${deps}`);
    lines.push(`       ${phase.intent.trim().split('\n')[0]}`);
  }
  if (sop.parallelGroups?.length) {
    lines.push('');
    lines.push('  Parallel groups:');
    for (const group of sop.parallelGroups) {
      lines.push(`    ${group.id}: [${group.agents.join(', ')}] → synthesizer=${group.synthesizer} (reduce=${group.reduce})`);
    }
  }
  if (sop.approval?.beforePhases?.length) {
    lines.push('');
    lines.push(`  Approval gates: ${sop.approval.beforePhases.join(', ')}`);
  }
  lines.push('');
  lines.push('  💡 /invest --sop ' + sop.id + ' <TICKER>');
  lines.push('');
  return lines.join('\n');
}

function renderSources(): string {
  const { sops, sources } = loadSops();
  const targets = sopInstallTargets();
  const lines = [
    '',
    '  SOP sources:',
    '',
    `    project  ${targets.projectDir}`,
    `    user     ${'$UPUP_HOME/sops → '}${resolveUpUpHomeRoot()}`,
    '',
  ];
  for (const sop of sops) {
    const source = sources.get(sop.id) ?? 'unknown';
    lines.push(`    ${sop.id.padEnd(18)} ${source === 'builtin' ? source : displaySopPath(source)}`);
  }
  lines.push('');
  return lines.join('\n');
}

interface ParsedInstallArgs {
  readonly sources: readonly string[];
  readonly scope: SopInstallScope;
  readonly force: boolean;
}

function parseInstallArgs(tokens: readonly string[]): ParsedInstallArgs {
  const sources: string[] = [];
  let scope: SopInstallScope = 'user';
  let force = false;
  for (const token of tokens) {
    if (token === '--project' || token === '--local') {
      scope = 'project';
      continue;
    }
    if (token === '--user' || token === '--global') {
      scope = 'user';
      continue;
    }
    if (token === '--force' || token === '-f') {
      force = true;
      continue;
    }
    sources.push(token);
  }
  return { sources, scope, force };
}

function renderInstallResult(result: SopInstallResult, scope: SopInstallScope): string {
  const lines = ['', `  目标目录 (${scope === 'project' ? 'project' : 'user'}): ${displaySopPath(result.targetDir)}`, ''];
  for (const record of result.installed) {
    lines.push(`  ✓ ${record.id.padEnd(18)} ← ${record.source} (${record.bytes} bytes)`);
  }
  for (const id of result.skipped) {
    lines.push(`  = ${id.padEnd(18)} 已存在，未覆盖（加 --force 覆盖）`);
  }
  if (result.installed.length === 0 && result.skipped.length === 0) lines.push('  (没有可安装的 SOP)');
  lines.push('');
  lines.push('  💡 /sop list 查看 · /invest --sop <id> <TICKER> 运行');
  lines.push('');
  return lines.join('\n');
}

async function handleInstall(tokens: readonly string[]): Promise<string> {
  const { sources, scope, force } = parseInstallArgs(tokens);
  if (sources.length === 0) {
    return [
      '',
      '  用法: /sop install <source> [--force] [--project]',
      '',
      '    <source> 可以是:',
      '      https://example.com/my-sop.yaml  远程 YAML',
      '      ./sops/local.yaml                本地文件',
      '      ./team-sops/                     本地目录（批量安装）',
      '      builtin:graham                   内置 SOP 落地到 ~/.upup/sops',
      '',
      `  默认安装到 ~/.upup/sops（实际根目录: ${resolveUpUpHomeRoot()}）`,
      '',
    ].join('\n');
  }
  const result = await installSops([...sources], { scope, force });
  return renderInstallResult(result, scope);
}

function handleUninstall(tokens: readonly string[]): string {
  const { sources, scope } = parseInstallArgs(tokens);
  const id = sources[0];
  if (!id) return '\n  用法: /sop uninstall <id> [--project]\n';
  const result = uninstallSop(id, { scope });
  const lines = ['', ''];
  if (result.removed) lines.push(`  ✓ 已删除 ${result.id}  (${displaySopPath(result.path)})`);
  else if (result.reason === 'invalid-id') lines.push(`  ✗ 非法 SOP id: ${id}`);
  else lines.push(`  ✗ 未安装: ${result.id}（${displaySopPath(result.path)} 不存在）`);
  lines.push('');
  return lines.join('\n');
}

function handleScaffold(tokens: readonly string[]): string {
  const { sources, scope, force } = parseInstallArgs(tokens);
  const id = sources[0];
  if (!id) return '\n  用法: /sop new <id> [--project]\n';
  const result = scaffoldSop(id, { scope, force });
  if (result.skipped.length > 0) {
    return `\n  = ${id} 已存在（${displaySopPath(installedSopPath(id, { scope }) ?? result.targetDir)}），加 --force 覆盖\n`;
  }
  const path = result.installed[0]?.path ?? result.targetDir;
  return [
    '',
    `  ✓ 已生成模板 ${id} → ${displaySopPath(path)}`,
    '',
    '  下一步: 编辑该文件的 phases / intent，然后 /invest --sop ' + id + ' <TICKER>',
    '',
  ].join('\n');
}

function renderCheck(): string {
  const { sops, warnings } = loadSops();
  const { ids } = agentCatalog();
  const failures: string[] = [];
  for (const sop of sops) {
    try {
      validateSopSpec(sop, ids);
    } catch (error) {
      failures.push(`${sop.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const lines = ['', `  SOP check — ${sops.length} discovered, ${failures.length} invalid`, ''];
  if (failures.length === 0) lines.push('  ✓ all SOPs validate against the current agent catalog');
  for (const failure of failures) lines.push(`  ✗ ${failure}`);
  if (warnings.length) {
    lines.push('');
    lines.push('  ⚠ 加载警告:');
    for (const warning of warnings) lines.push(`      ${warning}`);
  }
  lines.push('');
  return lines.join('\n');
}

function renderAgents(): string {
  const userAgents = loadUserAgentSpecs();
  const lines = ['', '  Agents:', ''];
  for (const spec of Object.values(INVESTMENT_PROFILES)) {
    lines.push(`    [builtin] ${spec.id.padEnd(20)} ${spec.name}`);
  }
  for (const spec of userAgents.agents) {
    lines.push(`    [user]    ${spec.id.padEnd(20)} ${spec.name}`);
  }
  if (userAgents.warnings.length) {
    lines.push('');
    lines.push('  ⚠ 加载警告:');
    for (const warning of userAgents.warnings) lines.push(`      ${warning}`);
  }
  lines.push('');
  lines.push('  💡 自定义 agent: ~/.upup/agents/*.json 或 <cwd>/.upup/agents/*.json');
  lines.push('');
  return lines.join('\n');
}

export async function runSopCommand(args: string): Promise<string> {
  const trimmed = (args ?? '').trim();
  const [sub, ...rest] = trimmed.split(/\s+/);
  try {
    return await dispatchSopCommand(sub ?? '', rest);
  } catch (error) {
    // `/sop` runs inside the TUI: fail as rendered text instead of throwing.
    return `\n  ✗ ${error instanceof Error ? error.message : String(error)}\n`;
  }
}

async function dispatchSopCommand(sub: string, rest: readonly string[]): Promise<string> {
  switch (sub) {
    case '':
    case 'list':
    case 'ls':
      return renderList();
    case 'show':
    case 'cat': {
      const id = rest[0];
      if (!id) return '\n  用法: /sop show <id>（/sop list 查看全部）\n';
      const { sops } = loadSops();
      const sop = sops.find((item) => item.id === id);
      if (!sop) return `\n  ✗ 未知 SOP: ${id}\n     可用: ${sops.map((item) => item.id).join(', ') || '(none)'}\n`;
      return renderShow(sop);
    }
    case 'sources':
    case 'where':
      return renderSources();
    case 'check':
    case 'validate':
      return renderCheck();
    case 'agents':
      return renderAgents();
    case 'install':
    case 'add':
      return handleInstall(rest);
    case 'uninstall':
    case 'remove':
    case 'rm':
      return handleUninstall(rest);
    case 'new':
    case 'scaffold':
      return handleScaffold(rest);
    case 'help':
    case '--help':
    case '-h':
    default:
      return [
        '',
        '  /sop — SOP 方法论浏览器',
        '',
        '  用法:',
        '    /sop list                列出所有 SOP（内置 + 用户自定义）',
        '    /sop show <id>           查看某个 SOP 的阶段图与并行组',
        '    /sop sources             查看每个 SOP 的来源路径',
        '    /sop check               校验所有 SOP 与 agent catalog 是否一致',
        '    /sop agents              列出内置 + 用户自定义 agent',
        '    /sop install <source>    下载/复制 SOP 到 ~/.upup/sops [--force] [--project]',
        '    /sop uninstall <id>      从 ~/.upup/sops 删除已安装的 SOP',
        '    /sop new <id>            在 ~/.upup/sops 生成新的方法论模板',
        '',
        '  运行 SOP: /invest --sop <id> <TICKER>',
        '  安装目录: $UPUP_HOME/sops（默认 ~/.upup/sops）或 <cwd>/.upup/sops (--project)',
        '  定义 SOP: ~/.upup/sops/*.yaml · <cwd>/.upup/sops/*.yaml · <cwd>/.upup/agents/*.json',
        '',
      ].join('\n');
  }
}
