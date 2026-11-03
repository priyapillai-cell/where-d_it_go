import { getLocales } from 'expo-localization';
import { I18n } from 'i18n-js';

import type { LanguagePreference } from '@/domain/types';

import { en, type Translations } from './en';

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : Join<K, Paths<T[K]>>;
}[keyof T & string];

export type TranslationKey = Paths<Translations>;
export type TranslationParams = Record<string, string | number>;

const SUPPORTED_LANGUAGES = ['en'] as const;
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const i18n = new I18n({ en } satisfies Record<SupportedLanguage, Translations>);
i18n.enableFallback = true;
i18n.defaultLocale = 'en';
i18n.missingBehavior = 'guess';

let formattingLocale = 'en-US';

function deviceLocale(): { tag: string; language: string; currency: string | null } {
  try {
    const [primary] = getLocales();
    if (primary) {
      return {
        tag: primary.languageTag,
        language: primary.languageCode ?? 'en',
        currency: primary.currencyCode ?? null,
      };
    }
  } catch {
    // Fall through to defaults when the native module is unavailable.
  }
  return { tag: 'en-US', language: 'en', currency: null };
}

/** Applies the language preference. Formatting always follows the device region. */
export function applyLanguage(preference: LanguagePreference): void {
  const device = deviceLocale();
  formattingLocale = device.tag;
  const requested = preference === 'system' ? device.language : preference;
  i18n.locale = (SUPPORTED_LANGUAGES as readonly string[]).includes(requested) ? requested : 'en';
}

export function t(key: TranslationKey, params?: TranslationParams): string {
  return i18n.t(key, params);
}

/** BCP-47 tag used for Intl number/date formatting (e.g. "en-IN"). */
export function getFormattingLocale(): string {
  return formattingLocale;
}

export function deviceCurrency(): string | null {
  return deviceLocale().currency;
}

applyLanguage('system');
