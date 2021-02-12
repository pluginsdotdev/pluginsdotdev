import fc from "fast-check";

const fromCharCodeWithBase = (base: number) => (v: number): string =>
  String.fromCharCode(base + v);

/**
 * any unicode space character
 **/
export const anySpaceArb = fc.mapToConstant(
  { num: 0x20, build: fromCharCodeWithBase(0) },
  { num: 1, build: fromCharCodeWithBase(0xa0) },
  { num: 1, build: fromCharCodeWithBase(0x1680) },
  { num: 0x29, build: fromCharCodeWithBase(0x2000) },
  { num: 1, build: fromCharCodeWithBase(0x205f) },
  { num: 1, build: fromCharCodeWithBase(0x3000) }
);

/**
 * a url path without the leading /
 **/
export const urlPathArb = fc
  .string()
  .filter((s) => !s.startsWith("/") && !/['"):]/.test(s))
  .map((s) => encodeURI(s));
