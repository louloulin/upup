/**
 * Theme utilities for commands
 *
 * Re-exports from main app theme for TUI components.
 * This is a copy of the main theme for standalone package use.
 */

import chalk from 'chalk'

const fg = (color: string) => (text: string) => chalk.hex(color)(text)
const bg = (color: string) => (text: string) => chalk.bgHex(color)(text)

export const theme = {
  primary: fg('#258bff'),
  primaryLight: fg('#a5cfff'),
  success: fg('#00cc00'),
  error: fg('#ff3333'),
  warning: fg('#ffcc00'),
  muted: fg('#a6a6a6'),
  mutedDark: fg('#303030'),
  accent: fg('cyan'),
  white: fg('#ffffff'),
  info: fg('#6CB6FF'),
  queryBg: bg('#3D3D3D'),
  border: fg('#303030'),
  dim: (text: string) => chalk.dim(text),
  bold: (text: string) => chalk.bold(text),
}

export const editorTheme = {
  primaryColor: '#258bff',
  selectedColor: '#3D3D3D',
  cursorColor: '#ffffff',
  backgroundColor: '#1e1e1e',
  textColor: '#cccccc',
}

export const selectListTheme = {
  primaryColor: '#258bff',
  selectedColor: '#3D3D3D',
}