# UpUp Documentation | UpUp 文档

> Complete technical documentation for UpUp (涨涨) AI Agent

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-orange.svg)](https://bun.sh)

---

## 📚 Documentation Index | 文档索引

### Getting Started | 快速开始

| Document | Description |
|----------|-------------|
| [README.md](../README.md) | Project overview (English) |
| [README_CN.md](../README_CN.md) | 项目概览 (中文) |
| [INSTALLATION.md](installation.md) | Installation guide |
| [QUICKSTART.md](quickstart.md) | 5-minute quick start |

### Core Concepts | 核心概念

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](architecture.md) | System architecture |
| [PERMISSION.md](permission.md) | Permission system |
| [SESSION.md](session.md) | Session management |
| [SKILLS.md](skills.md) | Skills system |
| [PLUGINS.md](plugins.md) | Plugin system |
| [HOOKS.md](hooks.md) | Hook system |
| [COMPONENTS.md](components.md) | TUI components |
| [COMMANDS.md](commands.md) | Commands system |
| [MODEL.md](model.md) | Model system |

### Development | 开发

| Document | Description |
|----------|-------------|
| [DEVELOPMENT.md](development.md) | Development guide |
| [CONFIGURATION.md](configuration.md) | Configuration reference |
| [API.md](api.md) | API documentation |
| [DEBUGGING.md](debugging.md) | Debugging guide |

### Chinese Documentation | 中文文档

| Document | Description |
|----------|-------------|
| [ARCHITECTURE_CN.md](architecture-cn.md) | 系统架构 |
| [PERMISSION_CN.md](permission-cn.md) | 权限系统 |
| [SKILLS_CN.md](skills-cn.md) | 技能系统 |
| [API_CN.md](api-cn.md) | API 参考 |
| [PLUGINS_CN.md](plugins-cn.md) | 插件系统 |
| [SESSION_CN.md](session-cn.md) | 会话管理 |
| [DEVELOPMENT_CN.md](development-cn.md) | 开发指南 |
| [HOOKS_CN.md](hooks-cn.md) | 钩子系统 |
| [COMPONENTS_CN.md](components-cn.md) | TUI 组件 |
| [COMMANDS_CN.md](commands-cn.md) | 命令系统 |
| [MODEL_CN.md](model-cn.md) | 模型系统 |

---

## 🗂️ Project Structure | 项目结构

```
upup/
├── docs/                    # Documentation (20+ documents)
│   ├── README.md          # This index
│   ├── architecture.md    # Architecture
│   ├── permission.md     # Permission system
│   ├── skills.md         # Skills
│   ├── plugins.md        # Plugins
│   ├── session.md        # Session management
│   ├── hooks.md          # Hook system
│   ├── components.md     # TUI components
│   ├── commands.md       # Commands system
│   ├── model.md         # Model system
│   ├── development.md    # Development guide
│   ├── configuration.md  # Configuration
│   ├── api.md           # API reference
│   ├── debugging.md     # Debugging guide
│   └── *-cn.md          # Chinese versions
├── src/
│   ├── agent/            # Agent core
│   ├── tools/            # Tool system (64+)
│   ├── session/          # Session management
│   ├── components/      # TUI components
│   ├── skills/           # Skills loader
│   ├── hooks/            # Hook system
│   ├── commands/         # Commands system
│   ├── model/           # LLM integration
│   ├── plugins/          # Plugin system
│   └── cli.ts           # CLI entry
└── packages/
    ├── sdk/             # Plugin SDK
    ├── llm/             # LLM adapters
    └── memory/           # Memory system
```

---

## 🔗 Quick Links | 快速链接

- **GitHub**: https://github.com/virattt/upup
- **Issues**: https://github.com/virattt/upup/issues
- **Discussions**: https://github.com/virattt/upup/discussions

---

## 📖 Reading Guide | 阅读指南

### For Users | 用户指南

1. [QUICKSTART.md](quickstart.md) - Get started in 5 minutes
2. [CONFIGURATION.md](configuration.md) - Configure for your needs
3. [SKILLS.md](skills.md) - Learn available skills

### For Developers | 开发者指南

1. [ARCHITECTURE.md](architecture.md) - Understand the system
2. [DEVELOPMENT.md](development.md) - Set up development
3. [API.md](api.md) - API reference
4. [DEBUGGING.md](debugging.md) - Debugging tips

### For Contributors | 贡献者指南

1. [ARCHITECTURE.md](architecture.md) - System overview
2. [PLUGINS.md](plugins.md) - Plugin development
3. [SKILLS.md](skills.md) - Skill development

---

## 🌍 Language | 语言

This documentation is available in:
- [English](architecture.md)
- [中文](architecture-cn.md)

---

<p align="center">
  <strong>UpUp (涨涨)</strong> — Making Financial Research Smarter<br>
  让金融研究更智能
</p>
