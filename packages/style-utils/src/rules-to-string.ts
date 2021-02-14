import type {
  Style,
  GroupingRule,
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

import { sanitizing, getStyleSanitizers } from "@pluginsdotdev/sanitizers";

import type {
  StyleSanitizerOptions,
  Sanitized,
  ObjSanitized,
} from "@pluginsdotdev/sanitizers";

export type StyleSheetRulesStringifier = (
  stylesheet: StyleSheetRules
) => string;

export const getStyleSheetRulesStringifier = (
  opts: StyleSanitizerOptions
): StyleSheetRulesStringifier => {
  const {
    styleRuleSanitizer,
    supportsRuleSanitizer,
    pageRuleSanitizer,
    namespaceRuleSanitizer,
    mediaRuleSanitizer,
    keyframesRuleSanitizer,
    keyframesStylesSanitizer,
    fontRuleSanitizer,
    importRuleSanitizer,
  } = getStyleSanitizers(opts);

  const styleToString = (style: Sanitized<Style>): string =>
    Object.keys(style)
      .map((prop) => `  ${prop}: ${style[prop]};`)
      .join("\n");

  const styleRuleToString = sanitizing(
    styleRuleSanitizer,
    ({ selector, style }: ObjSanitized<StyleRule>): string => {
      return `${selector} {\n${styleToString(style)}\n}`;
    }
  );

  const conditionRuleToString = (
    atId: string,
    { condition, rules }: ObjSanitized<ConditionRule>
  ): string => {
    return `@${atId} ${condition} {
      ${rulesToString(rules)}
    }`;
  };

  const supportsRuleToString = sanitizing(
    supportsRuleSanitizer,
    (rule: ObjSanitized<SupportsRule>): string =>
      conditionRuleToString("supports", rule)
  );

  const pageRuleToString = sanitizing(
    pageRuleSanitizer,
    ({ selector, style }: ObjSanitized<PageRule>): string => {
      return `@page ${selector} {
      ${styleToString(style)}
    }`;
    }
  );

  const namespaceRuleToString = sanitizing(
    namespaceRuleSanitizer,
    ({ namespaceURI, prefix }: ObjSanitized<NamespaceRule>): string => {
      return `@namespace ${prefix} url(${namespaceURI})`;
    }
  );

  const mediaRuleToString = sanitizing(
    mediaRuleSanitizer,
    (rule: ObjSanitized<MediaRule>): string =>
      conditionRuleToString("media", rule)
  );

  const keyframesStylesToString = (frames: Sanitized<FramesStyles>): string => {
    const sanitizedFrames = keyframesStylesSanitizer(frames);
    return Object.keys(sanitizedFrames)
      .map(
        (frameName) =>
          `${frameName} {
            ${styleToString(sanitizedFrames[frameName])}
          }`
      )
      .join("\n");
  };

  const keyframesRuleToString = sanitizing(
    keyframesRuleSanitizer,
    ({ name, frames }: ObjSanitized<KeyframesRule>): string =>
      `@keyframes ${name} {
      ${keyframesStylesToString(frames)}
    }`
  );

  const fontRuleToString = sanitizing(
    fontRuleSanitizer,
    ({ style }: ObjSanitized<FontRule>): string =>
      `@font-face {
      ${styleToString(style)}
    }`
  );

  const importRuleToString = sanitizing(
    importRuleSanitizer,
    ({ media, rules }: ObjSanitized<ImportRule>): string =>
      media && media.length
        ? mediaRuleToString({
            type: "media",
            condition: `(${media.join(", ")})`,
            rules,
          })
        : rulesToString(rules)
  );

  const ruleToString = (rule: Rule): string => {
    switch (rule.type) {
      case "style":
        return styleRuleToString(rule);
      case "supports":
        return supportsRuleToString(rule);
      case "page":
        return pageRuleToString(rule);
      case "namespace":
        return namespaceRuleToString(rule);
      case "media":
        return mediaRuleToString(rule);
      case "keyframes":
        return keyframesRuleToString(rule);
      case "font-face":
        return fontRuleToString(rule);
      case "import":
        return importRuleToString(rule);
    }
  };

  const rulesToString = (rules: Array<Rule>): string =>
    rules.map(ruleToString).join("\n");

  const stylesheetRulesToString = ({ rules }: StyleSheetRules): string =>
    rulesToString(rules);

  return stylesheetRulesToString;
};
