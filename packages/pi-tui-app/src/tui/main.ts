/**
 * TUI Main Entry
 *
 * 对标 Loucode FullscreenLayout.tsx
 * 基于 pi-tui Container 的 TUI 主入口模块
 * 使用差分渲染引擎
 */

import {
  TuiMainScreen,
  Container,
  Box,
  Text,
  ProcessTerminal,
  matchesKey,
  Key,
  type Component,
  type OverlayHandle,
  type TUI,
} from '@earendil-works/pi-tui';

// InputListener result type (from pi-tui)
type InputListenerResult = {
  consume?: boolean;
  data?: string;
} | undefined;

import { Editor } from './components/editor';
import { ChatLog } from './components/chat-log';
import { ToolEventDisplay } from './components/tool-event';

// ============================================================================
// Types
// ============================================================================

export interface TUIOptions {
  /** 宽度 */
  width?: number;
  /** 高度 */
  height?: number;
  /** 标题 */
  title?: string;
  /** 底部提示 */
  hints?: string[];
}

export interface TUIRenderer {
  /** 渲染整个界面 */
  render: () => string[];
  /** 处理输入 */
  handleInput: (data: string) => void;
  /** 销毁 */
  destroy: () => void;
}

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: Required<TUIOptions> = {
  width: 120,
  height: 40,
  title: 'UpUp - AI Agent',
  hints: ['Enter: Send', 'Ctrl+C: Interrupt', '/: Skills', 'Esc: Cancel'],
};

// ============================================================================
// Theme Colors
// ============================================================================

const THEME_BG = (str: string) => `\x1b[1;34m${str}\x1b[0m`;
const THEME_BORDER = (str: string) => `\x1b[1;36m${str}\x1b[0m`;
const THEME_HINT = (str: string) => `\x1b[0;90m${str}\x1b[0m`;

// ============================================================================
// TUI Main - 基于 pi-tui Container
// ============================================================================

export class TUIMain {
  private options: Required<TUIOptions>;
  private tui: TUI | null = null;
  private rootContainer: Container | null = null;
  private components: Map<string, Component> = new Map();
  private overlayHandle: OverlayHandle | null = null;
  private mode: 'normal' | 'insert' | 'select' | 'confirm' = 'normal';
  private terminal: ProcessTerminal | null = null;
  private inputUnsubscribe: (() => void) | null = null;

  constructor(options: TUIOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 初始化 TUI (使用 pi-tui)
   */
  async init(): Promise<void> {
    // 创建终端
    this.terminal = new ProcessTerminal();

    // 创建 TUI 实例 (pi-tui 差分渲染引擎)
    const tui = this.tui = new TuiMainScreen(this.terminal);

    // 创建根容器
    this.rootContainer = new Container();

    // 构建界面结构
    this.buildLayout();

    // 添加到 TUI
    tui.addChild(this.rootContainer);

    // 注册键盘输入监听
    this.inputUnsubscribe = tui.addInputListener((data): InputListenerResult => {
      return this.handleInputListener(data);
    });
  }

  /**
   * 处理输入监听器
   */
  private handleInputListener(data: string): InputListenerResult {
    // 浮层优先处理
    if (this.overlayHandle && this.overlayHandle.isFocused()) {
      return undefined; // 让浮层处理
    }

    // 全局快捷键
    if (matchesKey(data, Key.ctrl('c'))) {
      console.log('Interrupt');
      return { consume: true };
    }

    if (matchesKey(data, Key.escape)) {
      this.hideOverlay();
      this.setMode('normal');
      return { consume: true };
    }

    // 根据模式处理
    switch (this.mode) {
      case 'insert':
        this.handleInsertMode(data);
        break;
      case 'select':
        this.handleSelectMode(data);
        break;
      case 'confirm':
        this.handleConfirmMode(data);
        break;
      default:
        this.handleNormalMode(data);
    }

    return undefined;
  }

  /**
   * 构建布局 (使用 pi-tui Box 组件)
   */
  private buildLayout(): void {
    if (!this.rootContainer) return;

    // 1. 标题栏 (Box + Text)
    const header = this.createHeader();
    this.rootContainer.addChild(header);

    // 2. 聊天区域 (Box + ChatLog)
    const chatArea = this.createChatArea();
    this.rootContainer.addChild(chatArea);

    // 3. 工具事件区域
    const toolArea = this.createToolArea();
    this.rootContainer.addChild(toolArea);

    // 4. 编辑器 (pi-tui Editor)
    const editor = this.createEditor();
    this.rootContainer.addChild(editor);

    // 5. 提示栏
    const hintBar = this.createHintBar();
    this.rootContainer.addChild(hintBar);
  }

  /**
   * 创建标题栏
   */
  private createHeader(): Box {
    const box = new Box(2, 1, THEME_BG);
    const titleText = new Text(this.options.title, 0, 0);
    box.addChild(titleText);
    return box;
  }

  /**
   * 创建聊天区域
   */
  private createChatArea(): Box {
    const chatLog = new ChatLog({
      messages: [],
      maxMessages: 100,
      showTimestamp: true,
      userName: 'You',
      assistantName: 'Assistant',
    });

    this.components.set('chatLog', chatLog);

    // 创建带边框的 Box
    const box = new Box(2, 1, undefined);
    box.addChild(chatLog);

    return box;
  }

  /**
   * 创建工具事件区域
   */
  private createToolArea(): Box {
    const toolEvent = new ToolEventDisplay({
      events: [],
      maxEvents: 10,
      showDetails: true,
    });

    this.components.set('toolEvent', toolEvent);

    const box = new Box(2, 1, undefined);
    box.addChild(toolEvent);

    return box;
  }

  /**
   * 创建编辑器 (pi-tui Editor)
   */
  private createEditor(): Editor {
    const editor = new Editor(this.tui!, {
      onSubmit: (text) => {
        console.log('Submit:', text);
      },
      onChange: (text) => {
        console.log('Change:', text);
      },
    });

    this.components.set('editor', editor);

    return editor;
  }

  /**
   * 创建提示栏
   */
  private createHintBar(): Box {
    const hintsText = this.options.hints.join(' | ');
    const hintsTextComponent = new Text(hintsText, 2, 1);
    const box = new Box(0, 0, undefined);
    box.addChild(hintsTextComponent);
    return box;
  }

  /**
   * 显示浮层 (使用 pi-tui showOverlay)
   */
  showOverlay(component: Component): void {
    if (!this.tui) return;

    this.overlayHandle = this.tui.showOverlay(component, {
      anchor: 'center',
      width: 70,
      maxHeight: '80%',
    });
  }

  /**
   * 隐藏浮层
   */
  hideOverlay(): void {
    if (this.overlayHandle) {
      this.overlayHandle.hide();
      this.overlayHandle = null;
    }
  }

  /**
   * 设置焦点
   */
  setFocus(componentName: string): void {
    const component = this.components.get(componentName);
    if (component && this.tui) {
      this.tui.setFocus(component);
    }
  }

  /**
   * 设置模式
   */
  setMode(mode: 'normal' | 'insert' | 'select' | 'confirm'): void {
    this.mode = mode;
  }

  /**
   * 获取当前模式
   */
  getMode(): string {
    return this.mode;
  }

  /**
   * 处理输入 (由监听器调用)
   */
  handleInput(data: string): void {
    // 由 handleInputListener 委托处理
  }

  /**
   * 普通模式处理
   */
  private handleNormalMode(data: string): void {
    // 传递给编辑器
    const editor = this.components.get('editor') as Editor;
    if (editor) {
      editor.handleInput(data);
    }
  }

  /**
   * 插入模式处理
   */
  private handleInsertMode(data: string): void {
    const editor = this.components.get('editor') as Editor;
    if (editor) {
      editor.handleInput(data);
    }
  }

  /**
   * 选择模式处理
   */
  private handleSelectMode(data: string): void {
    const chatLog = this.components.get('chatLog') as ChatLog;
    if (chatLog) {
      chatLog.handleInput?.(data);
    }
  }

  /**
   * 确认模式处理
   */
  private handleConfirmMode(data: string): void {
    // 确认逻辑
  }

  /**
   * 获取组件
   */
  getComponent(name: string): Component | undefined {
    return this.components.get(name);
  }

  /**
   * 获取尺寸
   */
  getSize(): { width: number; height: number } {
    return {
      width: this.options.width,
      height: this.options.height,
    };
  }

  /**
   * 启动 TUI (pi-tui 渲染循环)
   */
  start(): void {
    if (this.tui) {
      this.tui.start();
    }
  }

  /**
   * 停止 TUI
   */
  stop(): void {
    if (this.tui) {
      this.tui.stop();
    }
  }

  /**
   * 请求重新渲染
   */
  requestRender(): void {
    if (this.tui) {
      this.tui.requestRender();
    }
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.stop();

    // 取消输入监听
    if (this.inputUnsubscribe) {
      this.inputUnsubscribe();
      this.inputUnsubscribe = null;
    }

    this.components.clear();
    this.overlayHandle = null;
    this.tui = null;
    this.rootContainer = null;
    this.terminal = null;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let instance: TUIMain | null = null;

/**
 * 获取 TUIMain 单例
 */
export function getTUIMain(): TUIMain {
  if (!instance) {
    instance = new TUIMain();
  }
  return instance;
}

/**
 * 创建 TUIMain 实例
 */
export function createTUIMain(options?: TUIOptions): TUIMain {
  if (instance) {
    instance.destroy();
  }
  instance = new TUIMain(options);
  return instance;
}

/**
 * 销毁 TUIMain 实例
 */
export function destroyTUIMain(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * 启动 TUI
 */
export async function startTUI(options?: TUIOptions): Promise<TUIMain> {
  const tui = createTUIMain(options);
  await tui.init();
  return tui;
}

/**
 * 停止 TUI
 */
export function stopTUI(): void {
  destroyTUIMain();
}
