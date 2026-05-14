import { Container, Spacer, Text } from '@mariozechner/pi-tui';
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
    const fullText = welcomeText + versionText;
    const padding = Math.floor((INTRO_WIDTH - fullText.length - 2) / 2);
    const trailing = INTRO_WIDTH - fullText.length - padding - 2;

    this.addChild(new Spacer(1));
    this.addChild(new Text(theme.primary('═'.repeat(INTRO_WIDTH)), 0, 0));
    this.addChild(
      new Text(
        theme.primary(
          `║${' '.repeat(padding)}${theme.bold(welcomeText)}${theme.muted(versionText)}${' '.repeat(
            trailing,
          )}║`,
        ),
        0,
        0,
      ),
    );
    this.addChild(new Text(theme.primary('═'.repeat(INTRO_WIDTH)), 0, 0));
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
