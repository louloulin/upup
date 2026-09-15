import {
  getDefaultModelForProvider,
  getModelsForProvider,
  type Model,
} from '../utils/model';
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '@upup/utils';
import { InMemoryChatHistory } from './in-memory-chat-history';
import type { PromptRunner } from '@upup/utils';

export interface ModelSelectionDependencies {
  getSetting<T>(key: string, defaultValue: T): T;
  setSetting(key: string, value: unknown): boolean;
  checkApiKeyExistsForProvider(providerId: string): boolean;
  getProviderDisplayName(providerId: string): string;
  saveApiKeyForProvider(providerId: string, apiKey: string): boolean;
  getOllamaModels(): Promise<string[]>;
  promptRunner: PromptRunner;
  /**
   * Providers the user has credentials for, in curated priority order. Used to
   * pick a sensible initial provider on a fresh install instead of the
   * hard-coded `DEFAULT_PROVIDER` (which the user may have no key for).
   * Optional: falls back to `DEFAULT_PROVIDER` when omitted.
   */
  detectConfiguredProviders?(): string[];
}

const SELECTION_STATES = [
  'provider_select',
  'model_select',
  'model_input',
  'api_key_confirm',
  'api_key_input',
] as const;

export type SelectionState = (typeof SELECTION_STATES)[number];
export type AppState = 'idle' | SelectionState;

export interface ModelSelectionState {
  appState: AppState;
  pendingProvider: string | null;
  pendingModels: Model[];
}

type ChangeListener = () => void;

export class ModelSelectionController {
  private providerValue: string;
  private modelValue: string;
  private appStateValue: AppState = 'idle';
  private pendingProviderValue: string | null = null;
  private pendingModelsValue: Model[] = [];
  private pendingSelectedModelId: string | null = null;
  private readonly onError: (message: string) => void;
  private readonly onChange?: ChangeListener;
  private readonly dependencies: ModelSelectionDependencies;
  private readonly chatHistory: InMemoryChatHistory;

  constructor(
    onError: (message: string) => void,
    dependencies: ModelSelectionDependencies,
    onChange?: ChangeListener,
  ) {
    this.onError = onError;
    this.onChange = onChange;
    this.dependencies = dependencies;
    this.chatHistory = new InMemoryChatHistory(DEFAULT_MODEL, undefined, dependencies.promptRunner);
    // Precedence: explicit setting → first provider we actually have a key for
    // → the historical hard-coded default. Without the middle step a fresh
    // install with only `MINIMAX_API_KEY` set would default to DeepSeek (no
    // key) and force the user through the setup wizard for no reason.
    const detected = dependencies.detectConfiguredProviders?.() ?? [];
    const implicitProvider = detected[0] ?? DEFAULT_PROVIDER;
    this.providerValue = dependencies.getSetting('provider', implicitProvider);
    const savedModel = dependencies.getSetting('modelId', null) as string | null;
    this.modelValue =
      savedModel ?? getDefaultModelForProvider(this.providerValue) ?? DEFAULT_MODEL;
    this.chatHistory.setModel(this.modelValue);
  }

  get state(): ModelSelectionState {
    return {
      appState: this.appStateValue,
      pendingProvider: this.pendingProviderValue,
      pendingModels: this.pendingModelsValue,
    };
  }

  get provider(): string {
    return this.providerValue;
  }

  get model(): string {
    return this.modelValue;
  }

  get inMemoryChatHistory(): InMemoryChatHistory {
    return this.chatHistory;
  }

  isInSelectionFlow(): boolean {
    return this.appStateValue !== 'idle';
  }

  startSelection() {
    this.appStateValue = 'provider_select';
    this.emitChange();
  }

  cancelSelection() {
    this.resetPendingState();
  }

  async handleProviderSelect(providerId: string | null) {
    if (!providerId) {
      this.appStateValue = 'idle';
      this.emitChange();
      return;
    }

    this.pendingProviderValue = providerId;
    if (providerId === 'openrouter') {
      this.pendingModelsValue = [];
      this.appStateValue = 'model_input';
      this.emitChange();
      return;
    }

    if (providerId === 'ollama') {
      const ollamaModelIds = await this.dependencies.getOllamaModels();
      this.pendingModelsValue = ollamaModelIds.map((id) => ({ id, displayName: id }));
      this.appStateValue = 'model_select';
      this.emitChange();
      return;
    }

    this.pendingModelsValue = getModelsForProvider(providerId);
    this.appStateValue = 'model_select';
    this.emitChange();
  }

  handleModelSelect(modelId: string | null) {
    if (!modelId || !this.pendingProviderValue) {
      this.pendingProviderValue = null;
      this.pendingModelsValue = [];
      this.pendingSelectedModelId = null;
      this.appStateValue = 'provider_select';
      this.emitChange();
      return;
    }

    if (this.pendingProviderValue === 'ollama') {
      this.completeModelSwitch(this.pendingProviderValue, `ollama:${modelId}`);
      return;
    }

    if (this.dependencies.checkApiKeyExistsForProvider(this.pendingProviderValue)) {
      this.completeModelSwitch(this.pendingProviderValue, modelId);
      return;
    }

    this.pendingSelectedModelId = modelId;
    this.appStateValue = 'api_key_confirm';
    this.emitChange();
  }

  handleModelInputSubmit(modelName: string | null) {
    if (!modelName || !this.pendingProviderValue) {
      this.pendingProviderValue = null;
      this.pendingModelsValue = [];
      this.pendingSelectedModelId = null;
      this.appStateValue = 'provider_select';
      this.emitChange();
      return;
    }

    const fullModelId = `${this.pendingProviderValue}:${modelName}`;
    if (this.dependencies.checkApiKeyExistsForProvider(this.pendingProviderValue)) {
      this.completeModelSwitch(this.pendingProviderValue, fullModelId);
      return;
    }

    this.pendingSelectedModelId = fullModelId;
    this.appStateValue = 'api_key_confirm';
    this.emitChange();
  }

  handleApiKeyConfirm(wantsToSet: boolean) {
    if (wantsToSet) {
      this.appStateValue = 'api_key_input';
      this.emitChange();
      return;
    }

    if (
      this.pendingProviderValue &&
      this.pendingSelectedModelId &&
      this.dependencies.checkApiKeyExistsForProvider(this.pendingProviderValue)
    ) {
      this.completeModelSwitch(this.pendingProviderValue, this.pendingSelectedModelId);
      return;
    }

    this.onError(
      `Cannot use ${
        this.pendingProviderValue
          ? this.dependencies.getProviderDisplayName(this.pendingProviderValue)
          : 'provider'
      } without an API key.`,
    );
    this.resetPendingState();
  }

  handleApiKeySubmit(apiKey: string | null) {
    if (!this.pendingSelectedModelId) {
      this.onError('No model selected.');
      this.resetPendingState();
      return;
    }

    if (apiKey && this.pendingProviderValue) {
      const saved = this.dependencies.saveApiKeyForProvider(this.pendingProviderValue, apiKey);
      if (saved) {
        this.completeModelSwitch(this.pendingProviderValue, this.pendingSelectedModelId);
      } else {
        this.onError('Failed to save API key.');
        this.resetPendingState();
      }
      return;
    }

    if (
      !apiKey &&
      this.pendingProviderValue &&
      this.dependencies.checkApiKeyExistsForProvider(this.pendingProviderValue)
    ) {
      this.completeModelSwitch(this.pendingProviderValue, this.pendingSelectedModelId);
      return;
    }

    this.onError('API key not set. Provider unchanged.');
    this.resetPendingState();
  }

  private completeModelSwitch(newProvider: string, newModelId: string) {
    this.providerValue = newProvider;
    this.modelValue = newModelId;
    this.dependencies.setSetting('provider', newProvider);
    this.dependencies.setSetting('modelId', newModelId);
    this.chatHistory.setModel(newModelId);
    this.pendingProviderValue = null;
    this.pendingModelsValue = [];
    this.pendingSelectedModelId = null;
    this.appStateValue = 'idle';
    this.emitChange();
  }

  private resetPendingState() {
    this.pendingProviderValue = null;
    this.pendingModelsValue = [];
    this.pendingSelectedModelId = null;
    this.appStateValue = 'idle';
    this.emitChange();
  }

  private emitChange() {
    this.onChange?.();
  }
}
