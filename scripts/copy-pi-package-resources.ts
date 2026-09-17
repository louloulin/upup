import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const outputRoot = resolve(process.argv[2] ?? 'dist');
for (const packageName of ['pi-finance-sdk', 'pi-market-data', 'pi-investment-analysis', 'pi-risk', 'pi-portfolio', 'pi-backtest', 'pi-platform', 'pi-research', 'pi-browser', 'pi-config', 'pi-cache', 'pi-notify', 'pi-investment-workflow', 'pi-management', 'pi-technical', 'pi-corporate-actions', 'pi-quant']) {
  const sourceRoot = resolve('packages', packageName);
  const targetRoot = join(outputRoot, packageName);
  rmSync(targetRoot, { recursive: true, force: true });
  mkdirSync(targetRoot, { recursive: true });
  cpSync(join(sourceRoot, 'package.json'), join(targetRoot, 'package.json'));
  // Every directory listed here must also appear in the package's
  // `package.json#files` array, and vice versa: `sops/` is the built-in SOP
  // payload that `@upup/pi-investment-workflow` resolves at runtime, and
  // omitting it left the shipped binary reporting an empty SOP catalog
  // while `bun run src/index.tsx` (which reads the workspace tree) stayed green.
  for (const resource of ['extensions', 'skills', 'prompts', 'workflows', 'policies', 'evals', 'sops', 'src']) {
    if (!existsSync(join(sourceRoot, resource))) continue;
    cpSync(join(sourceRoot, resource), join(targetRoot, resource), {
      recursive: true,
      filter: (source) => !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(source),
    });
  }
  console.log(`Copied Pi package resources to ${targetRoot}`);
}

// The compiled Bun binary resolves its built-in Pi TUI themes relative to
// the executable directory as `<dist>/theme/dark.json` + `light.json`. The
// tsx / dev path resolves them via
// `node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme`
// at runtime, so this copy is only needed for the binary release artifact.
const builtInThemesDir = resolve('node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme');
if (existsSync(builtInThemesDir)) {
  const themeOut = join(outputRoot, 'theme');
  mkdirSync(themeOut, { recursive: true });
  for (const name of ['dark.json', 'light.json']) {
    const src = join(builtInThemesDir, name);
    if (existsSync(src)) cpSync(src, join(themeOut, name));
  }
  console.log(`Copied Pi built-in themes to ${themeOut}`);
}
