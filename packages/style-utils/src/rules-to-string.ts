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
} from "./types";

const styleToString = (style: Style): string =>
  Object.keys(style)
    .map((prop) => `  ${prop}: ${style[prop]}`)
    .join("\n");

const styleRuleToString = ({ selector, style }: StyleRule): string => {
  return `${selector} {
    ${styleToString(style)}
  }`;
};

const conditionRuleToString = (
  atId: string,
  { condition, rules }: ConditionRule
): string => {
  return `@${atId} ${condition} {
    ${rulesToString(rules)}
  }`;
};

const supportsRuleToString = (rule: SupportsRule): string =>
  conditionRuleToString("supports", rule);

const pageRuleToString = ({ selector, style }: PageRule): string => {
  return `@page ${selector} {
    ${styleToString(style)}
  }`;
};

const namespaceRuleToString = ({
  namespaceURI,
  prefix,
}: NamespaceRule): string => {
  return `@namespace ${prefix} url(${namespaceURI})`;
};

const mediaRuleToString = (rule: MediaRule): string =>
  conditionRuleToString("media", rule);

const keyframesStylesToString = (frames: FramesStyles): string =>
  Object.keys(frames)
    .map(
      (frameName) =>
        `${frameName} {
      ${styleToString(frames[frameName])}
    }`
    )
    .join("\n");

const keyframesRuleToString = ({ name, frames }: KeyframesRule): string =>
  `@keyframes ${name} {
    ${keyframesStylesToString(frames)}
  }`;

const fontRuleToString = ({ style }: FontRule): string =>
  `@font-face {
    ${styleToString(style)}
  }`;

const importRuleToString = ({ media, rules }: ImportRule): string =>
  media && media.length
    ? mediaRuleToString({
        type: "media",
        condition: `(${media.join(", ")})`,
        rules,
      })
    : rulesToString(rules);

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

export const stylesheetRulesToString = ({ rules }: StyleSheetRules): string =>
  rulesToString(rules);
