import { Container, Input, SelectList, Text, type SelectItem, getEditorKeybindings } from '@mariozechner/pi-tui';
import { PROVIDERS, type Model } from '../utils/model.js';
import type { ApprovalDecision } from '../agent/types.js';
import type { SessionSummary } from '../session/types.js';
import { selectListTheme, theme } from '../theme.js';
import { formatRelativeTime } from '../utils/time.js';

class VimSelectList extends SelectList {
  handleInput(keyData: string): void {
    if (keyData === 'j') {
      super.handleInput('\u001b[B');
      return;
    }
    if (keyData === 'k') {
      super.handleInput('\u001b[A');
      return;
    }
    super.handleInput(keyData);
  }
}

class EmptyModelSelector extends Container {
  private readonly onCancel: () => void;

  constructor(providerId: string, onCancel: () => void) {
    super();
    this.onCancel = onCancel;
    this.addChild(new Text(theme.muted('No models available.'), 0, 0));
    if (providerId === 'ollama') {
      this.addChild(
        new Text(theme.muted('Make sure Ollama is running and you have models downloaded.'), 0, 0),
      );
    }
    this.addChild(new Text(theme.muted('esc to go back'), 0, 0));
  }

  handleInput(keyData: string): void {
    const kb = getEditorKeybindings();
    if (kb.matches(keyData, 'selectCancel')) {
      this.onCancel();
    }
  }
}

export function createProviderSelector(
  currentProvider: string | undefined,
  onSelect: (providerId: string | null) => void,
) {
  const items: SelectItem[] = PROVIDERS.map((provider, index) => ({
    value: provider.providerId,
    label: `${index + 1}. ${provider.displayName}${currentProvider === provider.providerId ? ' ✓' : ''}`,
  }));
  const list = new VimSelectList(items, 8, selectListTheme);
  list.onSelect = (item) => onSelect(item.value);
  list.onCancel = () => onSelect(null);
  return list;
}

export function createModelSelector(
  models: Model[],
  currentModel: string | undefined,
  onSelect: (modelId: string | null) => void,
  providerId?: string,
) {
  if (models.length === 0) {
    return new EmptyModelSelector(providerId ?? '', () => onSelect(null));
  }
  const items: SelectItem[] = models.map((model, index) => ({
    value: model.id,
    label: `${index + 1}. ${model.displayName}${currentModel === model.id ? ' ✓' : ''}`,
  }));
  const list = new VimSelectList(items, 10, selectListTheme);
  list.onSelect = (item) => onSelect(item.value);
  list.onCancel = () => onSelect(null);
  return list;
}

export function createApprovalSelector(onSelect: (decision: ApprovalDecision) => void) {
  const items: SelectItem[] = [
    { value: 'allow-once', label: '1. Yes' },
    { value: 'allow-session', label: '2. Yes, allow all edits this session' },
    { value: 'deny', label: '3. No' },
  ];
  const list = new VimSelectList(items, 5, selectListTheme);
  list.onSelect = (item) => onSelect(item.value as ApprovalDecision);
  list.onCancel = () => onSelect('deny');
  return list;
}

export function createApiKeyConfirmSelector(onConfirm: (wantsToSet: boolean) => void) {
  const items: SelectItem[] = [
    { value: 'yes', label: '1. Yes' },
    { value: 'no', label: '2. No' },
  ];
  const list = new VimSelectList(items, 4, selectListTheme);
  list.onSelect = (item) => onConfirm(item.value === 'yes');
  list.onCancel = () => onConfirm(false);
  return list;
}

export class ApiKeyInputComponent {
  private readonly input = new Input();
  private readonly masked: boolean;
  onSubmit?: (apiKey: string | null) => void;
  onCancel?: () => void;

  constructor(masked = false) {
    this.masked = masked;
  }

  invalidate() {
    this.input.invalidate();
  }

  render(width: number): string[] {
    const lines = this.input.render(Math.max(10, width - 4));
    const raw = lines[0] ?? '';
    const display = this.masked
      ? `${'*'.repeat(this.input.getValue().length)}${this.input.getValue().length === 0 ? '█' : ''}`
      : raw;
    return [
      `${theme.primary('> ')}${display}`,
      theme.muted('Enter to confirm · Esc to cancel'),
    ];
  }

  handleInput(keyData: string): void {
    const kb = getEditorKeybindings();
    if (kb.matches(keyData, 'submit')) {
      this.onSubmit?.(this.input.getValue().trim() || null);
      return;
    }
    if (kb.matches(keyData, 'selectCancel')) {
      this.onCancel?.();
      return;
    }
    this.input.handleInput(keyData);
  }

  getValue(): string {
    return this.input.getValue();
  }
}

// ============================================================================
// Session Selectors
// ============================================================================

function formatSessionLabel(session: SessionSummary): string {
  const title = session.customTitle || session.firstPrompt?.slice(0, 50) || 'Untitled';
  const timeAgo = formatRelativeTime(session.modified);
  const tag = session.tag ? ` #${session.tag}` : '';
  const msgs = `(${session.messageCount})`;
  return `${title}${tag} ${theme.muted(`[${timeAgo}] ${msgs}`)}`;
}

export function createSessionSelector(
  sessions: SessionSummary[],
  onSelect: (sessionId: string) => void,
  onCancel: () => void,
) {
  if (sessions.length === 0) {
    // Create a custom class that handles escape key to exit
    class EmptySessionSelector extends Container {
      readonly cancelCallback: () => void;
      constructor(cancel: () => void) {
        super();
        this.cancelCallback = cancel;
        this.addChild(new Text(theme.muted('No sessions found.'), 0, 0));
        this.addChild(new Text(theme.muted('Start a conversation to create your first session.'), 0, 0));
      }
      handleInput(keyData: string): void {
        const kb = getEditorKeybindings();
        if (kb.matches(keyData, 'selectCancel')) {
          this.cancelCallback();
        }
      }
    }
    return new EmptySessionSelector(onCancel);
  }

  const items: SelectItem[] = sessions.map(session => ({
    value: session.id,
    label: formatSessionLabel(session),
  }));

  const list = new VimSelectList(items, Math.min(12, sessions.length), selectListTheme);
  list.onSelect = (item) => onSelect(item.value);
  list.onCancel = () => onCancel();
  return list;
}

export function createSessionDeleteConfirmSelector(
  sessionTitle: string,
  onConfirm: () => void,
  onCancel: () => void,
) {
  const items: SelectItem[] = [
    { value: 'yes', label: `1. Yes, delete "${sessionTitle}"` },
    { value: 'no', label: '2. Cancel' },
  ];
  const list = new VimSelectList(items, 4, selectListTheme);
  list.onSelect = (item) => {
    if (item.value === 'yes') onConfirm();
    else onCancel();
  };
  list.onCancel = () => onCancel();
  return list;
}

export class SessionRenameInputComponent {
  private readonly input = new Input();
  onSubmit?: (title: string | null) => void;
  onCancel?: () => void;

  invalidate() {
    this.input.invalidate();
  }

  render(width: number): string[] {
    const lines = this.input.render(Math.max(10, width - 4));
    const raw = lines[0] ?? '';
    return [
      `${theme.primary('> ')}${raw}`,
      theme.muted('Enter to confirm · Esc to cancel'),
    ];
  }

  handleInput(keyData: string): void {
    const kb = getEditorKeybindings();
    if (kb.matches(keyData, 'submit')) {
      this.onSubmit?.(this.input.getValue().trim() || null);
      return;
    }
    if (kb.matches(keyData, 'selectCancel')) {
      this.onCancel?.();
      return;
    }
    this.input.handleInput(keyData);
  }
}

export class SessionTagInputComponent {
  private readonly input = new Input();
  onSubmit?: (tag: string | null) => void;
  onCancel?: () => void;

  invalidate() {
    this.input.invalidate();
  }

  render(width: number): string[] {
    const lines = this.input.render(Math.max(10, width - 4));
    const raw = lines[0] ?? '';
    return [
      `${theme.primary('> ')}${raw}`,
      theme.muted('Enter to confirm · Esc to clear tag · Empty to skip'),
    ];
  }

  handleInput(keyData: string): void {
    const kb = getEditorKeybindings();
    if (kb.matches(keyData, 'submit')) {
      this.onSubmit?.(this.input.getValue().trim() || null);
      return;
    }
    if (kb.matches(keyData, 'selectCancel')) {
      this.onCancel?.();
      return;
    }
    this.input.handleInput(keyData);
  }
}
