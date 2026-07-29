import { describe, expect, it } from "vitest"
import { availableLocales, DEFAULT_LOCALE, resolveMessages, translate, translator } from "./i18n"
import type { MessageBundle } from "./i18n"

const bundle: MessageBundle = {
  en: { copy: "Copy", download: "Download" },
  "zh-CN": { copy: "复制", download: "下载" },
  // Deliberately partial: a translation that only covers some strings.
  de: { copy: "Kopieren" },
}

describe("resolveMessages", () => {
  it("defaults to English", () => {
    expect(resolveMessages(bundle)).toEqual(bundle.en)
    expect(DEFAULT_LOCALE).toBe("en")
  })

  it("returns an exact locale match", () => {
    expect(resolveMessages(bundle, "zh-CN").copy).toBe("复制")
  })

  it("falls back to the base language for an untranslated region", () => {
    const withLanguage: MessageBundle = { en: { a: "a" }, zh: { a: "啊" } }
    expect(resolveMessages(withLanguage, "zh-TW").a).toBe("啊")
  })

  it("falls back to English for an unknown locale", () => {
    expect(resolveMessages(bundle, "ja").copy).toBe("Copy")
  })

  it("fills the gaps of a partial translation with English", () => {
    // A half-finished translation must degrade to English, never to a blank label.
    const de = resolveMessages(bundle, "de")
    expect(de.copy).toBe("Kopieren")
    expect(de.download).toBe("Download")
  })
})

describe("translate", () => {
  it("looks up a single string", () => {
    expect(translate(bundle, "zh-CN", "download")).toBe("下载")
  })

  it("returns the key itself when nothing defines it", () => {
    // Better a visible key than an empty button.
    expect(translate(bundle, "zh-CN", "missing")).toBe("missing")
  })
})

describe("translator", () => {
  it("binds a bundle and locale once", () => {
    const t = translator(bundle, "zh-CN")
    expect(t("copy")).toBe("复制")
    expect(t("download")).toBe("下载")
    expect(t("nope")).toBe("nope")
  })

  it("is English without a locale", () => {
    expect(translator(bundle)("copy")).toBe("Copy")
  })
})

describe("availableLocales", () => {
  it("lists what the bundle carries", () => {
    expect(availableLocales(bundle).sort()).toEqual(["de", "en", "zh-CN"])
  })
})
