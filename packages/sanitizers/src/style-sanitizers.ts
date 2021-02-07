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
} from "@pluginsdotdev/style-types";
import { getValidStyle, AllowedStyleValues } from "./css-utils";

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

export const getStyleSanitizers = (
  pluginDomain: string,
  pluginUrl: string,
  allowedStyleValues: AllowedStyleValues
) => {
  const containsComment = (s: string): boolean => /[\][*]/.test(s);

  const conditionSanitizer: PropSanitizer<string> = (condition: string) =>
    /^[()\s\w*:\-]*$/.test(condition) && !containsComment(condition)
      ? (condition as Sanitized<string>)
      : sanitizerError("invalid condition", condition);

  const selectorSanitizer: PropSanitizer<string> = (selector: string) =>
    /^[()\s\w,:+>.*#"\[\]~\-=]+$/.test(selector) && !containsComment(selector)
      ? (selector as Sanitized<string>)
      : sanitizerError("invalid selector", selector);

  const styleSanitizer: PropSanitizer<Style> = (style: Style) =>
    getValidStyle("", "", {}, style) as Sanitized<Style>;

  const namespaceURISanitizer: PropSanitizer<string> = (namespaceURI: string) =>
    /^[\w()._~:/?#\[\]@!$&'*+,;%=\-]+$/.test(namespaceURI) &&
    !containsComment(namespaceURI)
      ? (namespaceURI as Sanitized<string>)
      : sanitizerError("invalid namespace uri", namespaceURI);

  const identifierSanitizer: PropSanitizer<string> = (id: string) =>
    /^[\w\-]+$/.test(id)
      ? (id as Sanitized<string>)
      : sanitizerError("invalid identifier", id);

  const mediaSanitizer: PropSanitizer<string> = (media: string) =>
    /^[()\s\w*:\-]*$/.test(media) && !containsComment(media)
      ? (media as Sanitized<string>)
      : sanitizerError("invalid media query", media);

  const percentageSanitizer: PropSanitizer<string> = (pct: string) =>
    /^\d+[%]$|^0$/.test(pct)
      ? (pct as Sanitized<string>)
      : sanitizerError("expected percentage", pct);

  const rulesSanitizer: PropSanitizer<Array<Rule>> = (rules: Array<Rule>) =>
    // each sub-rule will be sanitized when it is processed.
    rules as Sanitized<Array<Rule>>;

  const conditionRuleSanitizer: Sanitizer<ConditionRule> = {
    condition: conditionSanitizer,
    rules: rulesSanitizer,
  };

  const supportsRuleSanitizer: Sanitizer<SupportsRule> = {
    ...conditionRuleSanitizer,
    type: (type: "supports") => type as Sanitized<"supports">,
  };

  const pageRuleSanitizer: Sanitizer<PageRule> = {
    selector: selectorSanitizer,
    style: styleSanitizer,
    type: (type: "page") => type as Sanitized<"page">,
  };

  const namespaceRuleSanitizer: Sanitizer<NamespaceRule> = {
    namespaceURI: namespaceURISanitizer,
    prefix: identifierSanitizer,
    type: (type: "namespace") => type as Sanitized<"namespace">,
  };

  const mediaRuleSanitizer: Sanitizer<MediaRule> = {
    ...conditionRuleSanitizer,
    type: (type: "media") => type as Sanitized<"media">,
  };

  const keyframesRuleSanitizer: Sanitizer<KeyframesRule> = {
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
  const keyframesStylesSanitizer = (
    frames: Sanitized<FramesStyles>
  ): ObjSanitized<FramesStyles> =>
    (frames as any) as ObjSanitized<FramesStyles>;

  const fontRuleSanitizer: Sanitizer<FontRule> = {
    style: styleSanitizer,
    type: (type: "font-face") => type as Sanitized<"font-face">,
  };

  const importRuleSanitizer: Sanitizer<ImportRule> = {
    media: (medias: Array<string>): Sanitized<Array<string>> =>
      medias.map(mediaSanitizer) as Sanitized<Array<Sanitized<string>>>,
    rules: rulesSanitizer,
    type: (type: "import") => type as Sanitized<"import">,
  };

  const styleRuleSanitizer: Sanitizer<StyleRule> = {
    selector: selectorSanitizer,
    style: styleSanitizer,
    type: (type: "style") => type as Sanitized<"style">,
  };

  return {
    supportsRuleSanitizer,
    pageRuleSanitizer,
    namespaceRuleSanitizer,
    mediaRuleSanitizer,
    keyframesRuleSanitizer,
    keyframesStylesSanitizer,
    fontRuleSanitizer,
    importRuleSanitizer,
    styleRuleSanitizer,
  };
};
