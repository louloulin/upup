import { Container, Spacer, Text } from '@earendil-works/pi-tui';
import { BorderBox } from './BorderBox.js';
import packageJson from '../../package.json';
import { getModelDisplayName } from '../utils/model.js';
import { theme } from '@upup/utils';
import { validateConfig, type ConfigValidationResult } from '../utils/config-validation.js';
import { t } from '@upup/i18n';

const INTRO_WIDTH = 50;

export type ConfigValidator = () => ConfigValidationResult;

export class IntroComponent extends Container {
  private readonly modelText: Text;
  private readonly configStatusText: Text;

  constructor(model: string, validate: ConfigValidator = validateConfig) {
    super();

    const welcomeText = t('intro.welcome');
    const versionText = ` v${packageJson.version}`;

    // Create header box using BorderBox component (double border)
    const headerBox = new BorderBox(
      [new Text(`${theme.bold(welcomeText)}${theme.muted(versionText)}`)],
      { style: 'double', paddingX: 2, paddingY: 0 }
    );

    this.addChild(new Spacer(1));
    this.addChild(headerBox);
    this.addChild(new Spacer(1));

    this.addChild(
      new Text(
        theme.bold(
          theme.primary(
            `
 ██╗   ██╗ ██████╗  ██╗   ██╗ ██████╗
 ██║   ██║ ██╔══██╗ ██║   ██║ ██╔══██╗
 ██║   ██║ ██████╔╝ ██║   ██║ ██████╔╝
 ╚██╗ ██╔╝ ██╔═══╝  ╚██╗ ██╔╝ ██╔═══╝
  ╚████╔╝  ██║       ╚████╔╝  ██║
   ╚═══╝   ╚═╝        ╚═══╝   ╚═╝`,
          ),
        ),
        0,
        0,
      ),
    );

    this.addChild(new Spacer(1));
    this.addChild(new Text(t('intro.subtitle'), 0, 0));
    this.modelText = new Text('', 0, 0);
    this.addChild(this.modelText);

    // P1-10: Config status indicator
    this.configStatusText = new Text('', 0, 0);
    this.addChild(this.configStatusText);

    this.setModel(model);
    this.updateConfigStatus(validate);
  }

  setModel(model: string) {
    this.modelText.setText(
      `${theme.muted('Model: ')}${theme.primary(getModelDisplayName(model))}`,
    );
  }

  // P1-10: Update config status based on validation
  updateConfigStatus(validate: ConfigValidator = validateConfig) {
    const validation = validate();

    if (validation.valid) {
      // All good
      this.configStatusText.setText('');
      return;
    }

    // Show config status message
    if (validation.missingApiKey) {
      const providerName = validation.provider || 'this provider';
      this.configStatusText.setText(
        theme.warning(`⚠ Missing API key for ${providerName}`),
      );
    } else if (validation.missingProvider || validation.missingModel) {
      this.configStatusText.setText(
        theme.error('⚠ Configuration incomplete - run /setup'),
      );
    }
  }
}
