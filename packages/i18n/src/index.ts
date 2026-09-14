/**
 * i18n public surface (P3.a.4)
 *
 * Thin re-export module. Lets call sites `import { t, getLocale, type Locale } from '../i18n/index.js'`
 * without knowing the internal file layout.
 */

export {
  DEFAULT_LOCALE,
  STRINGS,
  SUPPORTED_LOCALES,
  entries,
  t,
  type Locale,
  type StringKey,
} from './strings.js';
