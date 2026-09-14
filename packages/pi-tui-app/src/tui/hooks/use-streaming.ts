/**
 * useStreaming Hook
 *
 * 对标 Loucode streaming text handling
 * 处理 AI 响应的流式文本渲染
 */

import { useStoreSubscription } from './use-store.js';

/**
 * 流式文本状态
 */
export interface StreamingState {
  /** 当前累积的文本 */
  text: string;
  /** 是否正在流式输出 */
  isStreaming: boolean;
  /** 当前行的文本 */
  currentLine: string;
  /** 已完成的行 */
  completedLines: string[];
}

/**
 * Streaming Hook 配置
 */
export interface UseStreamingOptions {
  /** 初始文本 */
  initialText?: string;
  /** 字符延迟 (用于模拟打字效果) */
  charDelay?: number;
  /** 行延迟 */
  lineDelay?: number;
}

/**
 * Streaming Hook 返回类型
 */
export interface UseStreamingResult {
  /** 当前状态 */
  state: StreamingState;
  /** 追加文本 */
  appendText: (text: string) => void;
  /** 完成流式输出 */
  complete: () => void;
  /** 重置状态 */
  reset: () => void;
  /** 直接设置文本 (不触发流式) */
  setText: (text: string) => void;
}

/**
 * 创建 Streaming State Store
 */
function createStreamingStore(initial: StreamingState) {
  let state = { ...initial };
  const listeners = new Set<() => void>();

  return {
    getState: () => state,
    setState: (updater: (prev: StreamingState) => StreamingState) => {
      state = updater(state);
      listeners.forEach(fn => fn());
    },
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/**
 * useStreaming Hook
 *
 * 处理流式文本的累积和渲染
 *
 * @example
 * ```typescript
 * const { state, appendText, complete, reset } = useStreaming();
 *
 * // 模拟 AI 流式输出
 * appendText("Hello");
 * appendText(" World");
 * complete();
 * ```
 */
export function useStreaming(
  options: UseStreamingOptions = {},
): UseStreamingResult {
  const initialState: StreamingState = {
    text: options.initialText || '',
    isStreaming: false,
    currentLine: '',
    completedLines: [],
  };

  const store = createStreamingStore(initialState);
  const { state, unsubscribe } = useStoreSubscription(store);

  const appendText = (text: string): void => {
    store.setState(prev => {
      const newText = prev.text + text;
      const lines = newText.split('\n');
      const completedLines = lines.slice(0, -1);
      const currentLine = lines[lines.length - 1] || '';

      return {
        ...prev,
        text: newText,
        isStreaming: true,
        currentLine,
        completedLines,
      };
    });
  };

  const complete = (): void => {
    store.setState(prev => ({
      ...prev,
      isStreaming: false,
    }));
  };

  const reset = (): void => {
    store.setState(() => ({
      text: '',
      isStreaming: false,
      currentLine: '',
      completedLines: [],
    }));
  };

  const setText = (text: string): void => {
    const lines = text.split('\n');
    const completedLines = lines.slice(0, -1);
    const currentLine = lines[lines.length - 1] || '';

    store.setState(() => ({
      text,
      isStreaming: false,
      currentLine,
      completedLines,
    }));
  };

  return {
    state,
    appendText,
    complete,
    reset,
    setText,
  };
}

/**
 * useTypingEffect Hook
 *
 * 模拟打字机效果的 Hook
 */
export interface UseTypingEffectOptions {
  /** 每个字符延迟 (ms) */
  charDelay?: number;
  /** 是否自动完成 */
  autoComplete?: boolean;
  /** 完成回调 */
  onComplete?: () => void;
}

export interface UseTypingEffectResult {
  /** 当前显示的文本 */
  displayText: string;
  /** 是否正在打字 */
  isTyping: boolean;
  /** 开始打字 */
  start: (text: string) => void;
  /** 停止打字 */
  stop: () => void;
  /** 重置 */
  reset: () => void;
}

/**
 * useTypingEffect Hook
 *
 * 模拟打字机效果逐字显示文本
 */
export function useTypingEffect(
  options: UseTypingEffectOptions = {},
): UseTypingEffectResult {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let currentIndex = 0;
  let fullText = '';
  let isTyping = false;

  const charDelay = options.charDelay || 20;

  const tick = (): void => {
    if (currentIndex < fullText.length) {
      currentIndex++;
      isTyping = true;
      timeoutId = setTimeout(tick, charDelay);
    } else {
      isTyping = false;
      options.onComplete?.();
    }
  };

  const start = (text: string): void => {
    stop();
    fullText = text;
    currentIndex = 0;
    isTyping = true;
    tick();
  };

  const stop = (): void => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    isTyping = false;
  };

  const reset = (): void => {
    stop();
    fullText = '';
    currentIndex = 0;
  };

  return {
    get displayText() {
      return fullText.slice(0, currentIndex);
    },
    get isTyping() {
      return isTyping;
    },
    start,
    stop,
    reset,
  };
}
