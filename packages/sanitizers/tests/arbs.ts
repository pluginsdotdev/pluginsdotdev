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

const idArb = fc
  .stringOf(fc.ascii().filter((s) => /[\w-]/.test(s)))
  .filter((s) => !!s.length && /^[a-z_][a-z0-9_-]*/i.test(s));

const classSelectorArb = idArb.map((s) => `.${s}`);

const elSelectorArb = idArb;

const specialSelectorArb = fc.constantFrom(":host", ":host-context()", ":root");

const cssCombinatorArb = fc.constantFrom(", ", " > ", " ", " + ", " ~ ");

const combinatorSelectorArb = fc
  .array(
    fc.tuple(
      fc.oneof(classSelectorArb, elSelectorArb, specialSelectorArb),
      cssCombinatorArb
    ),
    { minLength: 1, maxLength: 5 }
  )
  .map((items: Array<[string, string]>) =>
    items.reduce(
      (sel, [s, c], i) =>
        i === items.length - 1 ? `${sel}${s}` : `${sel}${s}${c}`,
      ""
    )
  );

const cssPropertyArb = fc.constantFrom(
  "color",
  "background",
  "border",
  "padding",
  "margin"
);

const cssValueArb = fc.oneof(
  fc.nat(),
  fc
    .stringOf(fc.ascii().filter((s) => /[\w%]/.test(s)))
    .filter((s) => s.indexOf(";") < 0)
);

const cssStyleArb = fc
  .tuple(cssPropertyArb, cssValueArb)
  .map(([prop, val]: [string, string | number]) => `${prop}: ${val};`);

const cssStyleBodyArb = fc
  .array(cssStyleArb, { minLength: 1, maxLength: 5 })
  .map((rules: Array<string>) => `{${rules.join("\n")}}`);

export const cssSelectorArb = fc.oneof(
  classSelectorArb,
  elSelectorArb,
  combinatorSelectorArb,
  specialSelectorArb
);

export const cssStyleRuleArb = fc
  .tuple(cssSelectorArb, cssStyleBodyArb)
  .map(([sel, body]: [string, string]) => `${sel} ${body}`);

const rawConditionArb = fc.constantFrom("screen", "print");

const ruleConditionArb = fc
  .tuple(cssStyleArb, fc.boolean())
  .map(
    ([style, not]: [string, boolean]) =>
      `${not ? "not(" : ""}${style.replace(/;$/, "")}${not ? ")" : ""}`
  );

const conditionArb = fc.oneof(rawConditionArb, ruleConditionArb);

const ruleCombinatorArg = fc.constantFrom(" or ", " and ");

export const cssConditionArb = fc
  .array(fc.tuple(conditionArb, ruleCombinatorArg), {
    minLength: 1,
    maxLength: 5,
  })
  .map((items: Array<[string, string]>) =>
    items.reduce(
      (fullCond, [cond, combinator], i) =>
        `${fullCond}${cond}${i === items.length - 1 ? "" : combinator}`,
      ""
    )
  );

// filter out /* because it's a comment
export const cssNamespaceURIArb = fc.webUrl().filter((s) => !/[\/][*]/.test(s));

export const cssNamespacePrefixArb = idArb;
