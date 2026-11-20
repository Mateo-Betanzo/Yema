import { formatARS, formatNumber } from "@/logic/currency";

describe("formatARS formats an amount (RF-7)", () => {
  test.each([
    [10500, "$10.500"],
    [0, "$0"],
    [1234567, "$1.234.567"],
    [7, "$7"],
    [999, "$999"],
    [1000, "$1.000"],
    [100000, "$100.000"],
    [10000000, "$10.000.000"],
    [Number.MAX_SAFE_INTEGER, "$9.007.199.254.740.991"],
  ])("%d → %s", (amount, expected) => {
    expect(formatARS(amount)).toBe(expected);
  });

  test("negative zero is shown as $0", () => {
    expect(formatARS(-0)).toBe("$0");
  });

  test("always uses a dot for thousands and no decimals, whatever the process locale", () => {
    expect(formatARS(1234)).toBe("$1.234");
    expect(formatARS(1234)).not.toMatch(/[,\s]/);
  });
});

describe("formatARS rejects anything that is not an amount (RF-8)", () => {
  test.each([
    ["a decimal", 10.5],
    ["a tiny decimal", 0.1],
    ["a negative amount", -1],
    ["a negative decimal", -10.5],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
    ["more than the largest safe integer", Number.MAX_SAFE_INTEGER + 1],
    ["null", null],
    ["undefined", undefined],
    ["text", "10500"],
    ["an empty string", ""],
    ["an object", {}],
    ["a bigint", BigInt(10)],
  ])("throws a RangeError for %s", (_label, value) => {
    expect(() => formatARS(value as unknown as number)).toThrow(RangeError);
  });

  test("does not round or change the sign instead of throwing", () => {
    expect(() => formatARS(10.4)).toThrow();
    expect(() => formatARS(-500)).toThrow();
  });
});

describe("formatNumber writes a whole number with a dot for thousands (spec 003)", () => {
  test.each([
    [0, "0"],
    [999, "999"],
    [1000, "1.000"],
    [36000, "36.000"],
    [1234567, "1.234.567"],
  ])("%d → %s", (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });

  test("rejects what formatARS rejects", () => {
    expect(() => formatNumber(-1)).toThrow(RangeError);
    expect(() => formatNumber(1.5)).toThrow(RangeError);
  });
});
