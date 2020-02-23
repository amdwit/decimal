import { abs, divide, e, RoundMethod } from '../bigint/bigint'
import selfReplacing from '../selfReplacing'

export type DecimalJson = string

export class Decimal {
  public static readonly ZERO: Decimal = new Decimal(BigInt(0))
  public static readonly ONE: Decimal = new Decimal(BigInt(1))
  private static readonly cache: Map<string, Decimal> = new Map()
  private static cacheHits: Map<string, Decimal> = new Map()

  public readonly exponent: number
  public readonly significand: bigint

  private constructor(significand: bigint, exponent: number = 0) {
    if (significand === BigInt(0) && Decimal.ZERO) {
      throw new Error('only one ZERO allowed')
    }
    if (!Number.isInteger(exponent)) {
      throw new Error('exponent must be integer')
    }
    this.significand = significand
    this.exponent = exponent
  }

  private static equalizeExponents(
    _a: Decimal,
    _b: Decimal
  ): { a: bigint; b: bigint; exponent: number } {
    let a = _a.significand
    let b = _b.significand
    if (_a.exponent < _b.exponent) {
      b = e(b, _b.exponent - _a.exponent)
    } else if (_a.exponent > _b.exponent) {
      a = e(a, _a.exponent - _b.exponent)
    }
    return {
      a,
      b,
      exponent: Math.min(_a.exponent, _b.exponent)
    }
  }

  private static addToCache(decimal: Decimal, key: string) {
    return
    // if (!(Decimal.cache.size % 1e3)) {
    //   console.log('Decimal.cache.size', Decimal.cache.size, ', Decimal.cacheHits.size', Decimal.cacheHits.size)
    // }
    if (Decimal.cache.size === 2 ** 16) {
      // console.log('cleaning up: Decimal.cacheHits.size', Decimal.cacheHits.size)
      for (const [key, rational] of Decimal.cacheHits) {
        Decimal.cache.delete(key)
        Decimal.cache.set(key, rational)
      }
      Decimal.cacheHits.clear()
      let length = 2 ** 12
      const keysIterator = Decimal.cache.keys()
      while (length--) {
        const key = keysIterator.next().value
        Decimal.cache.delete(key)
      }
    }
    Decimal.cache.set(key, decimal)
  }

  private static getFromCache(key: string): Decimal | null {
    const rational = Decimal.cache.get(key)
    if (rational) {
      Decimal.cacheHits.set(key, rational)
      return rational
    } else {
      return null
    }
  }

  public static fromJson(numberString: DecimalJson): Decimal {
    let decimal = Decimal.getFromCache(numberString)
    if (!decimal) {
      const [significand, exponent] = numberString.split('e')
      decimal = Decimal.create(
        BigInt(significand),
        exponent ? Number(exponent) : 0
      )
      Decimal.addToCache(decimal, numberString)
    }
    return decimal
  }

  public static fromString(numberString: string): Decimal {
    let decimal = Decimal.getFromCache(numberString)
    if (!decimal) {
      const [_, integer, decimals, exponentString] = numberString.match(
        /^(-?\d+)(?:\.(\d+))?(?:(?:e|E)(-?\d+))?$/
      )!
      const significandString = `${integer}${decimals || ''}`
      const exponent = decimals ? -decimals.length : 0
      decimal = this.create(
        BigInt(significandString),
        exponent + Number(exponentString || 0)
      )
      Decimal.addToCache(decimal, numberString)
    }
    return decimal
  }

  public static fromBigInt(significand: bigint, exponent: number): Decimal {
    return Decimal.create(significand, exponent)
  }

  public static min(...rationals: Decimal[]): Decimal {
    return rationals.reduce((result, rational) =>
      result.lt(rational) ? result : rational
    )
  }

  public static max(...rationals: Decimal[]): Decimal {
    return rationals.reduce((result, rational) =>
      result.gt(rational) ? result : rational
    )
  }

  public static sum(...rationals: Decimal[]): Decimal {
    return rationals.reduce(
      (result, rational) => result.add(rational),
      Decimal.ZERO
    )
  }

  public static median(...rationals: Decimal[]): Decimal {
    if (rationals.length) {
      const sorted = rationals.sort((a: Decimal, b: Decimal) => a.cmp(b))
      const half = sorted.length >> 1
      return sorted.length & 1
        ? sorted[half]
        : sorted[half - 1].add(sorted[half]).mul(D(0.5))
    } else {
      throw new Error('empty arguments list')
    }
  }

  private static create(significand: bigint, exponent: number): Decimal {
    if (significand) {
      const significandString = significand.toString()
      const key = `${significandString}e${exponent}`
      let decimal = Decimal.getFromCache(key)
      if (!decimal) {
        const index = significandString.search(/0*$/)
        const significand2 = BigInt(significandString.slice(0, index))
        const shift = significandString.length - index
        decimal = new Decimal(significand2, exponent + shift)
        Decimal.addToCache(decimal, key)
      }
      return decimal
    } else {
      return Decimal.ZERO
    }
  }

  @selfReplacing
  public get number(): number {
    return +this.string
  }

  @selfReplacing
  public get string(): string {
    let fraction = this.significand.toString()
    if (this.negative) {
      fraction = fraction.slice(1)
    }
    if (this.exponent > 0) {
      fraction = `${fraction}${'0'.repeat(this.exponent)}`
    } else if (this.exponent < 0) {
      if (-this.exponent >= fraction.length) {
        fraction = `0.${'0'.repeat(
          -this.exponent - fraction.length
        )}${fraction}`
      } else {
        const shift = fraction.length + this.exponent
        fraction = `${fraction.slice(0, shift)}.${fraction.slice(shift)}`
      }
    }
    const result = `${this.negative ? '-' : ''}${fraction}`
    return result
  }

  @selfReplacing
  public get scientific(): string {
    return `${this.significand}${this.exponent ? `e${this.exponent}` : ''}`
  }

  @selfReplacing
  public get magnitude(): string {
    const magnitude = this.significand.toString().length + this.exponent - 1
    return `${magnitude}m${this.significand}`
  }

  public [Symbol.toPrimitive](hint: string): string | number {
    if (hint === 'number') {
      console.error('no', hint)
    }
    return hint === 'number' ? this.number : this.string
  }

  @selfReplacing
  public get json(): DecimalJson {
    return this.scientific
  }

  public add(rational: Decimal): Decimal {
    const { a, b, exponent } = Decimal.equalizeExponents(this, rational)
    const significand = a + b
    return Decimal.create(significand, exponent)
  }

  public sub(rational: Decimal): Decimal {
    return this.add(rational.negated)
  }

  public mul(rational: Decimal): Decimal {
    return Decimal.create(
      this.significand * rational.significand,
      this.exponent + rational.exponent
    )
  }

  @selfReplacing
  public get negative(): boolean {
    return this.significand < 0
  }

  @selfReplacing
  public get negated(): Decimal {
    return Decimal.create(-this.significand, this.exponent)
  }

  @selfReplacing
  public get abs(): Decimal {
    return this.negative ? this.negated : this
  }

  public cmp(rational: Decimal): -1 | 0 | 1 {
    if (this.negative === rational.negative) {
      const { a, b } = Decimal.equalizeExponents(this, rational)
      return a < b ? -1 : a > b ? 1 : 0
    }
    return this.negative ? -1 : 1
  }

  public eq(rational: Decimal): boolean {
    return !this.cmp(rational)
  }

  public ne(rational: Decimal): boolean {
    return !!this.cmp(rational)
  }

  public lt(rational: Decimal): boolean {
    return this.cmp(rational) === -1
  }

  public le(rational: Decimal): boolean {
    return this.cmp(rational) !== 1
  }

  public gt(rational: Decimal): boolean {
    return this.cmp(rational) === 1
  }

  public ge(rational: Decimal): boolean {
    return this.cmp(rational) !== -1
  }

  public roundByDecimal(
    rational: Decimal,
    method: RoundMethod = 'toZero'
  ): Decimal {
    if (rational.negative) {
      throw new Error('not implemented')
    }
    const { a: raw, b: divider, exponent } = Decimal.equalizeExponents(
      this,
      rational
    )
    const division = divide(raw, divider, method)
    const significand = division * divider
    return Decimal.create(significand, exponent)
  }

  public roundToDecimals(
    decimal: number,
    method: RoundMethod = 'toZero'
  ): Decimal {
    return this.roundByDecimal(Decimal.fromBigInt(BigInt(1), -decimal), method)
  }

  public roundToSignificants(
    size: number,
    method: RoundMethod = 'toZero',
    ticksToBeAdded?: number | bigint
  ): Decimal {
    const digitSurplus = abs(this.significand).toString().length - size
    let significand = e(this.significand, -digitSurplus, method)
    significand = significand + BigInt(ticksToBeAdded || 0)
    const exponent = this.exponent + digitSurplus
    return Decimal.create(significand, exponent)
  }
}

export const D = (s: number): Decimal => {
  if (typeof s !== 'number') {
    throw new Error(`wrong type ${s}`)
  }
  return Decimal.fromString(s.toString())
}
