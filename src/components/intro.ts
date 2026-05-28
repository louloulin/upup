import { Container, Spacer, Text } from '@earendil-works/pi-tui';
import { BorderBox } from './BorderBox.js';
import packageJson from '../../package.json';
import { getModelDisplayName } from '../utils/model.js';
import { theme } from '../theme.js';
import { validateConfig } from '../utils/config-validation.js';

const INTRO_WIDTH = 50;

export class IntroComponent extends Container {
  private readonly modelText: Text;
  private readonly configStatusText: Text;

  constructor(model: string) {
    super();

    const welcomeText = 'Welcome to UpUp';
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
    this.addChild(new Text('Your AI assistant for deep financial research.', 0, 0));
    this.modelText = new Text('', 0, 0);
    this.addChild(this.modelText);

    // P1-10: Config status indicator
    this.configStatusText = new Text('', 0, 0);
    this.addChild(this.configStatusText);

    this.setModel(model);
    this.updateConfigStatus();
  }

  setModel(model: string) {
    this.modelText.setText(
      `${theme.muted('Model: ')}${theme.primary(getModelDisplayName(model))}`,
    );
  }

  // P1-10: Update config status based on validation
  updateConfigStatus() {
    const validation = validateConfig();

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
