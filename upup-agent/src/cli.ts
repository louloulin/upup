/**
 * upup-agent - CLI 入口
 * 启动 stdio server
 */

import { StdioServer } from './server.js'

// 启动服务
const server = new StdioServer()
server.start()
