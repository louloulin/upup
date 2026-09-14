/**
 * UpdatableSelectList - 可更新的 SelectList 包装器
 *
 * 对标 pi-tui 的 SelectList，但支持在创建后动态更新选项
 *
 * 当 pi-tui 的 SelectList 需要更新选项时，我们重新创建一个新的 SelectList 实例
 */

import type { Component, SelectItem, SelectListTheme } from '@earendil-works/pi-tui';
import { SelectList } from '@earendil-works/pi-tui';

// ============================================================================
// Types
// ============================================================================

export interface UpdatableSelectListProps {
  /** 最大可见项数 */
  maxVisible: number;
  /** 主题配置 */
  theme?: SelectListTheme;
  /** 是否启用搜索 */
  searchable?: boolean;
  /** 搜索框占位符 */
  searchPlaceholder?: string;
}

// ============================================================================
// UpdatableSelectList
// ============================================================================

export class UpdatableSelectList implements Component {
  private _items: SelectItem[] = [];
  private _filteredItems: SelectItem[] = [];
  private _selectedIndex = 0;
  private _selectList: SelectList;
  private _maxVisible: number;
  private _theme: SelectListTheme;
  private _searchable: boolean;
  private _searchPlaceholder: string;
  private _searchText: string = '';

  constructor(items: SelectItem[], props: UpdatableSelectListProps) {
    this._items = items;
    this._filteredItems = items;
    this._maxVisible = props.maxVisible;
    this._searchable = props.searchable ?? true;
    this._searchPlaceholder = props.searchPlaceholder || 'Search...';
    // 使用提供的 theme 或默认空对象，类型断言处理
    this._theme = props.theme || { selectedPrefix: (t: string) => t, selectedText: (t: string) => t, description: (t: string) => t, scrollInfo: (t: string) => t, noMatch: (t: string) => t };
    this._selectList = new SelectList(items, props.maxVisible, this._theme);
  }

  // ============================================================================
  // Item Management
  // ============================================================================

  /**
   * 更新选项列表
   *
   * 重新创建内部 SelectList 实例
   */
  setItems(items: SelectItem[]): void {
    this._items = items;
    this._filteredItems = this._searchText ? this._filterItems(items) : items;
    this._selectedIndex = 0;
    this._selectList = new SelectList(this._filteredItems, this._maxVisible, this._theme);
  }

  /**
   * 获取当前选中的项
   */
  getSelectedItem(): SelectItem | null {
    if (this._filteredItems.length === 0) return null;
    return this._filteredItems[this._selectedIndex] ?? null;
  }

  /**
   * 获取选中项的索引
   */
  getSelectedIndex(): number {
    return this._selectedIndex;
  }

  /**
   * 设置选中项索引
   */
  setSelectedIndex(index: number): void {
    this._selectedIndex = Math.max(0, Math.min(index, this._filteredItems.length - 1));
    this._selectList = new SelectList(this._filteredItems, this._maxVisible, this._theme);
  }

  /**
   * 获取所有选项
   */
  getItems(): SelectItem[] {
    return this._items;
  }

  /**
   * 获取过滤后的选项
   */
  getFilteredItems(): SelectItem[] {
    return this._filteredItems;
  }

  // ============================================================================
  // Search
  // ============================================================================

  /**
   * 设置搜索文本
   */
  setSearchText(text: string): void {
    this._searchText = text;
    this._filteredItems = text ? this._filterItems(this._items) : this._items;
    this._selectedIndex = 0;
    this._selectList = new SelectList(this._filteredItems, this._maxVisible, this._theme);
  }

  /**
   * 获取搜索文本
   */
  getSearchText(): string {
    return this._searchText;
  }

  /**
   * 清除搜索
   */
  clearSearch(): void {
    this.setSearchText('');
  }

  /**
   * 过滤选项
   */
  private _filterItems(items: SelectItem[]): SelectItem[] {
    const lower = this._searchText.toLowerCase();
    return items.filter((item) => {
      const label = typeof item === 'string' ? item : (item as { label?: string }).label || '';
      // 尝试访问 searchText（如果存在）
      const searchText = typeof item === 'string' ? '' : ((item as { searchText?: string }).searchText || '');
      return label.toLowerCase().includes(lower) || searchText.toLowerCase().includes(lower);
    });
  }

  // ============================================================================
  // Navigation
  // ============================================================================

  /**
   * 导航到下一个选项
   */
  navigateDown(): void {
    if (this._selectedIndex < this._filteredItems.length - 1) {
      this._selectedIndex++;
    }
  }

  /**
   * 导航到上一个选项
   */
  navigateUp(): void {
    if (this._selectedIndex > 0) {
      this._selectedIndex--;
    }
  }

  /**
   * 导航到第一个选项
   */
  navigateFirst(): void {
    this._selectedIndex = 0;
  }

  /**
   * 导航到最后 一个选项
   */
  navigateLast(): void {
    this._selectedIndex = Math.max(0, this._filteredItems.length - 1);
  }

  // ============================================================================
  // Component Interface
  // ============================================================================

  /**
   * 渲染组件
   */
  render(width: number): string[] {
    return this._selectList.render(width);
  }

  /**
   * 使组件无效（用于重新渲染）
   */
  invalidate(): void {
    // 重新创建 SelectList 以反映当前状态
    this._selectList = new SelectList(this._filteredItems, this._maxVisible, this._theme);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * 创建 UpdatableSelectList 实例
 */
export function createUpdatableSelectList(
  items: SelectItem[],
  props: UpdatableSelectListProps,
): UpdatableSelectList {
  return new UpdatableSelectList(items, props);
}

/**
 * 创建简单的 UpdatableSelectList（不可搜索）
 */
export function createSimpleSelectList(
  items: SelectItem[],
  maxVisible: number = 10,
  theme?: SelectListTheme,
): UpdatableSelectList {
  return new UpdatableSelectList(items, {
    maxVisible,
    theme,
    searchable: false,
  });
}

/**
 * 创建可搜索的 UpdatableSelectList
 */
export function createSearchableSelectList(
  items: SelectItem[],
  maxVisible: number = 10,
  searchPlaceholder?: string,
  theme?: SelectListTheme,
): UpdatableSelectList {
  return new UpdatableSelectList(items, {
    maxVisible,
    theme,
    searchable: true,
    searchPlaceholder,
  });
}

// ============================================================================
// Adapter for pi-tui SelectList
// ============================================================================

/**
 * 将 UpdatableSelectList 适配为 pi-tui SelectList 兼容接口
 *
 * 用于替换现有使用 SelectList 的代码
 */
export class SelectListAdapter implements Component {
  private _selectList: UpdatableSelectList;

  constructor(items: SelectItem[], props: UpdatableSelectListProps) {
    this._selectList = new UpdatableSelectList(items, props);
  }

  /**
   * 更新选项（兼容 pi-tui SelectList 接口）
   */
  // 注意：pi-tui SelectList 没有 setItems，所以我们保留这个方法名
  // 但实际上我们需要用不同的方式调用
  updateItems(items: SelectItem[]): void {
    this._selectList.setItems(items);
  }

  /**
   * 获取选中项（兼容 pi-tui SelectList 接口）
   */
  getSelected(): SelectItem | null {
    return this._selectList.getSelectedItem();
  }

  /**
   * 设置选中索引
   */
  setSelectedIndex(index: number): void {
    this._selectList.setSelectedIndex(index);
  }

  /**
   * 获取选中索引
   */
  getSelectedIndex(): number {
    return this._selectList.getSelectedIndex();
  }

  /**
   * 导航
   */
  navigate(direction: 'up' | 'down' | 'first' | 'last'): void {
    switch (direction) {
      case 'up':
        this._selectList.navigateUp();
        break;
      case 'down':
        this._selectList.navigateDown();
        break;
      case 'first':
        this._selectList.navigateFirst();
        break;
      case 'last':
        this._selectList.navigateLast();
        break;
    }
  }

  render(width: number): string[] {
    return this._selectList.render(width);
  }

  invalidate(): void {
    this._selectList.invalidate();
  }
}