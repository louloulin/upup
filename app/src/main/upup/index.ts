/**
 * UpUp 引擎主进程入口（barrel）。
 *
 * 导出：
 *   - upupSdkHost: UpClient 单例（start/stop/restart 生命周期）
 *   - registerUpupIpcHandlers: 注册 7 个 ipcMain.handle 通道
 *   - setMainWindow: 主进程在 createWindow 后注入 BrowserWindow 用于推送 'upup:stream' 事件
 */
export { upupSdkHost } from './sdk-host'
export { registerUpupIpcHandlers, setMainWindow } from './ipc'