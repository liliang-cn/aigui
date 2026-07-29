/**
 * Locale handling for both sides of a rendered answer: the strings a plugin draws on screen, and
 * the guidance a plugin gives the model.
 *
 * Locales are BCP-47 tags ("zh-CN", "pt-BR", "en"). English is the fallback and is always
 * complete, so a partial translation degrades to English strings rather than to blank UI.
 */

/** A locale tag, e.g. "en", "zh-CN". */
export type Locale = string

/** The strings of one locale, keyed by a stable id the plugin chooses. */
export type Messages = Record<string, string>

/** Every locale a plugin ships, keyed by tag. `en` is required as the fallback. */
export type MessageBundle = Record<Locale, Messages> & { en: Messages }

/** The default locale, used when a host does not say otherwise. */
export const DEFAULT_LOCALE = "en"

/**
 * Pick the messages for a locale: exact match, then the base language, then English.
 *
 * "zh-CN" therefore finds a "zh-CN" bundle, falls back to "zh", and finally to English — a host
 * asking for a regional variant nobody translated still gets the language.
 */
export function resolveMessages(bundle: MessageBundle, locale?: Locale): Messages {
  const en = bundle.en ?? {}
  if (!locale) return en
  const exact = bundle[locale]
  if (exact) return { ...en, ...exact }
  const base = locale.split("-")[0]
  const language = base && base !== locale ? bundle[base] : undefined
  return language ? { ...en, ...language } : en
}

/** Look up one string, falling back to English and finally to the key itself. */
export function translate(bundle: MessageBundle, locale: Locale | undefined, key: string): string {
  return resolveMessages(bundle, locale)[key] ?? key
}

/**
 * A lookup function bound to one bundle and locale.
 *
 * Plugins render many strings per node, so resolving the bundle once and closing over it keeps
 * the per-string cost to a map lookup.
 */
export function translator(bundle: MessageBundle, locale?: Locale): (key: string) => string {
  const messages = resolveMessages(bundle, locale)
  return (key) => messages[key] ?? key
}

/** The locales a bundle actually carries. */
export function availableLocales(bundle: MessageBundle): Locale[] {
  return Object.keys(bundle)
}
