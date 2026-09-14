import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const outputRoot = resolve(process.argv[2] ?? 'dist');
for (const packageName of ['pi-finance-sdk', 'pi-market-data', 'pi-investment-analysis', 'pi-risk', 'pi-portfolio', 'pi-backtest', 'pi-platform', 'pi-research', 'pi-browser', 'pi-config', 'pi-cache', 'pi-notify', 'pi-investment-workflow', 'pi-management', 'pi-technical', 'pi-corporate-actions', 'pi-quant'] {
  const sourceRoot = resolve('packages', packageName);
  const targetRoot = join(outputRoot, packageName);
  rmSync(targetRoot, { recursive: true, force: true });
  mkdirSync(targetRoot, { recursive: true });
  cpSync(join(sourceRoot, 'package.json'), join(targetRoot, 'package.json'));
  for (const resource of ['extensions', 'skills', 'prompts', 'workflows', 'policies', 'evals', 'src']) {
    cpSync(join(sourceRoot, resource), join(targetRoot, resource), { recursive: true });
  }
  console.log(`Copied Pi package resources to ${targetRoot}`);
}
