import type {
  Style,
  ConditionRule,
  StyleRule,
  SupportsRule,
  PageRule,
  NamespaceRule,
  MediaRule,
  FramesStyles,
  KeyframesRule,
  FontRule,
  ImportRule,
  Rule,
  StyleSheetRules,
} from "./types";

export type Sanitized<T> = T & {
  _sanitized: true;
};

export type ObjSanitized<T extends Record<string, any>> = {
  [P in keyof T]: Sanitized<T[P]>;
};

type PropSanitizer<T> = (input: T) => Sanitized<T>;

type Sanitizer<T extends Record<string, any>> = {
  [P in keyof T]: PropSanitizer<T[P]>;
};

const sanitize = <T extends Record<string, any>>(
  sanitizer: Sanitizer<T>,
  input: T
): ObjSanitized<T> =>
  Object.keys(input).reduce(
    (res, key) => ({
      ...res,
      [key]: sanitizer[key](input[key]),
    }),
    {} as Partial<ObjSanitized<T>>
  ) as ObjSanitized<T>;

export const sanitizing = <T, R>(
  sanitizer: Sanitizer<T>,
  f: (input: ObjSanitized<T>) => R
): ((input: T) => R) => (input: T) => f(sanitize(sanitizer, input));

const sanitizerError = (msg: string, value: any) => {
  console.error("Sanitizer error: ", { msg, value });
  throw new Error(`Sanitizer error [${msg}]`);
};

const containsComment = (s: string): boolean => /[\][*]/.test(s);

export const conditionSanitizer: PropSanitizer<string> = (condition: string) =>
  /^[()\s\w*:\-]*$/.test(condition) && !containsComment(condition)
    ? (condition as Sanitized<string>)
    : sanitizerError("invalid condition", condition);

export const selectorSanitizer: PropSanitizer<string> = (selector: string) =>
  /^[()\s\w,:+>.*#"\[\]~\-=]+$/.test(selector) && !containsComment(selector)
    ? (selector as Sanitized<string>)
    : sanitizerError("invalid selector", selector);

export const styleSanitizer: PropSanitizer<Style> = (style: Style) =>
  // TODO
  (style as any) as Sanitized<Style>;

export const namespaceURISanitizer: PropSanitizer<string> = (
  namespaceURI: string
) =>
  /^[\w()._~:/?#\[\]@!$&'*+,;%=\-]+$/.test(namespaceURI) &&
  !containsComment(namespaceURI)
    ? (namespaceURI as Sanitized<string>)
    : sanitizerError("invalid namespace uri", namespaceURI);

export const identifierSanitizer: PropSanitizer<string> = (id: string) =>
  /^[\w\-]+$/.test(id)
    ? (id as Sanitized<string>)
    : sanitizerError("invalid identifier", id);

export const mediaSanitizer: PropSanitizer<string> = (media: string) =>
  /^[()\s\w*:\-]*$/.test(media) && !containsComment(media)
    ? (media as Sanitized<string>)
    : sanitizerError("invalid media query", media);

export const percentageSanitizer: PropSanitizer<string> = (pct: string) =>
  /^\d+[%]$|^0$/.test(pct)
    ? (pct as Sanitized<string>)
    : sanitizerError("expected percentage", pct);

export const rulesSanitizer: PropSanitizer<Array<Rule>> = (
  rules: Array<Rule>
) =>
  // each sub-rule will be sanitized when it is processed.
  rules as Sanitized<Array<Rule>>;

export const conditionRuleSanitizer: Sanitizer<ConditionRule> = {
  condition: conditionSanitizer,
  rules: rulesSanitizer,
};

export const supportsRuleSanitizer: Sanitizer<SupportsRule> = {
  ...conditionRuleSanitizer,
  type: (type: "supports") => type as Sanitized<"supports">,
};

export const pageRuleSanitizer: Sanitizer<PageRule> = {
  selector: selectorSanitizer,
  style: styleSanitizer,
  type: (type: "page") => type as Sanitized<"page">,
};

export const namespaceRuleSanitizer: Sanitizer<NamespaceRule> = {
  namespaceURI: namespaceURISanitizer,
  prefix: identifierSanitizer,
  type: (type: "namespace") => type as Sanitized<"namespace">,
};

export const mediaRuleSanitizer: Sanitizer<MediaRule> = {
  ...conditionRuleSanitizer,
  type: (type: "media") => type as Sanitized<"media">,
};

export const keyframesRuleSanitizer: Sanitizer<KeyframesRule> = {
  name: identifierSanitizer,
  // each frame style will be sanitized when processed
  frames: (frames: FramesStyles): Sanitized<FramesStyles> =>
    Object.keys(frames).reduce(
      (sanitizedFrames, frameName) => ({
        ...sanitizedFrames,
        [percentageSanitizer(frameName)]: styleSanitizer(frames[frameName]),
      }),
      {} as Sanitized<FramesStyles>
    ),
  type: (type: "keyframes") => type as Sanitized<"keyframes">,
};

// the only way to get a Sanitized<FramesStyles> is by sanitizing all
// keys and values (see keyframesRuleSanitizer).
export const keyframesStylesSanitizer = (
  frames: Sanitized<FramesStyles>
): ObjSanitized<FramesStyles> => (frames as any) as ObjSanitized<FramesStyles>;

export const fontRuleSanitizer: Sanitizer<FontRule> = {
  style: styleSanitizer,
  type: (type: "font-face") => type as Sanitized<"font-face">,
};

export const importRuleSanitizer: Sanitizer<ImportRule> = {
  media: (medias: Array<string>): Sanitized<Array<string>> =>
    medias.map(mediaSanitizer) as Sanitized<Array<Sanitized<string>>>,
  rules: rulesSanitizer,
  type: (type: "import") => type as Sanitized<"import">,
};

export const styleRuleSanitizer: Sanitizer<StyleRule> = {
  selector: selectorSanitizer,
  style: styleSanitizer,
  type: (type: "style") => type as Sanitized<"style">,
};
