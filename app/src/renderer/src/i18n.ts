import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import enCommon from './locales/en/common.json'
import zhCommon from './locales/zh/common.json'
import enSettings from './locales/en/settings.json'
import zhSettings from './locales/zh/settings.json'
import enInvestment from './locales/en/investment.json'
import zhInvestment from './locales/zh/investment.json'

void i18n.use(initReactI18next).init({
  resources: {
    en: { common: enCommon, settings: enSettings, investment: enInvestment },
    zh: { common: zhCommon, settings: zhSettings, investment: zhInvestment }
  },
  lng: 'zh',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  defaultNS: 'common',
  ns: ['common', 'settings', 'investment']
})

export default i18n
