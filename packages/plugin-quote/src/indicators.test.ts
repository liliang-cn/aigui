import { describe, expect, it } from "vitest"
import { bollinger, change, ema, macd, parseIndicator, rsi, sma, type Bar } from "./indicators"

const bar = (close: number, date = "2026-01-01"): Bar => ({ date, open: close, high: close, low: close, close })
const series = (closes: number[]): Bar[] =>
  closes.map((c, i) => bar(c, `2026-01-${String(i + 1).padStart(2, "0")}`))

describe("sma", () => {
  it("averages the last n closes and leaves the warm-up empty", () => {
    const line = sma(series([1, 2, 3, 4, 5]), 3)
    expect(line).toEqual([null, null, 2, 3, 4])
  })
  it("has no value at all when there is less history than the period", () => {
    expect(sma(series([1, 2]), 5)).toEqual([null, null])
  })
})

describe("ema", () => {
  it("seeds on the simple average of the first period, as every terminal does", () => {
    // Seeded on the first close alone the line starts with a visible hook.
    const line = ema([1, 2, 3, 4, 5], 3)
    expect(line[0]).toBeNull()
    expect(line[1]).toBeNull()
    expect(line[2]).toBeCloseTo(2)
    expect(line[3]).toBeCloseTo(3)
  })
  it("weights recent values more than a simple average does", () => {
    const closes = [10, 10, 10, 10, 20]
    const e = ema(closes, 4).at(-1) as number
    const s = sma(series(closes), 4).at(-1) as number
    expect(e).toBeGreaterThan(s)
  })
})

describe("macd", () => {
  it("lines up DIF, DEA and a histogram of twice their gap", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 4) * 5 + i * 0.2)
    const { dif, dea, histogram } = macd(series(closes))
    const last = closes.length - 1
    expect(dif[last]).not.toBeNull()
    expect(dea[last]).not.toBeNull()
    // The doubling is a convention; leaving it out halves the bars against every other chart.
    expect(histogram[last] as number).toBeCloseTo(2 * ((dif[last] as number) - (dea[last] as number)), 9)
  })
  it("has nothing to show before the slow average exists", () => {
    const { dif } = macd(series([1, 2, 3]))
    expect(dif.every((v) => v === null)).toBe(true)
  })
})

describe("rsi", () => {
  it("is 100 when every day rises", () => {
    expect(rsi(series(Array.from({ length: 30 }, (_, i) => 100 + i)), 14).at(-1)).toBeCloseTo(100)
  })
  it("sits at 50 when gains and losses balance", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + (i % 2 === 0 ? 0 : 1))
    const value = rsi(series(closes), 14).at(-1) as number
    expect(value).toBeGreaterThan(40)
    expect(value).toBeLessThan(60)
  })
  it("stays between 0 and 100 whatever the series does", () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i) * 30)
    for (const value of rsi(series(closes), 14)) {
      if (value === null) continue
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(100)
    }
  })
})

describe("bollinger", () => {
  it("puts the bands two standard deviations either side of the middle", () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i) * 3)
    const { middle, upper, lower } = bollinger(series(closes), 20, 2)
    const i = closes.length - 1
    expect((upper[i] as number) - (middle[i] as number)).toBeCloseTo((middle[i] as number) - (lower[i] as number), 9)
    expect(upper[i] as number).toBeGreaterThan(middle[i] as number)
  })
  it("collapses to the average when nothing moves", () => {
    const { upper, lower, middle } = bollinger(series(new Array(30).fill(100)), 20, 2)
    const i = 29
    expect(upper[i]).toBeCloseTo(100)
    expect(lower[i]).toBeCloseTo(100)
    expect(middle[i]).toBeCloseTo(100)
  })
})

describe("change", () => {
  it("measures first close to last", () => {
    expect(change(series([100, 110]))).toEqual({ absolute: 10, percent: 10 })
  })
})

describe("parseIndicator", () => {
  it("reads the period out of the name", () => {
    expect(parseIndicator("ma20")).toEqual({ kind: "ma", period: 20 })
    expect(parseIndicator("rsi14")).toEqual({ kind: "rsi", period: 14 })
    expect(parseIndicator("macd")).toEqual({ kind: "macd" })
  })
  it("refuses anything it does not compute", () => {
    for (const name of ["ma", "sma20", "ichimoku", "ma20x", ""]) expect(parseIndicator(name), name).toBeUndefined()
  })
})
