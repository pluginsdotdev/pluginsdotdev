import { getUnescapedCssValue } from "@pluginsdotdev/sanitizers";

import type {
  Style,
  FramesStyles,
  Rule,
  StyleSheetRules,
} from "@pluginsdotdev/style-types";

export type VarBindings = Record<string, string>;

const extractVarsFromStyle = (style: Style): VarBindings =>
  Object.keys(style).reduce((bindings, prop) => {
    const expr = getUnescapedCssValue(style[prop]);
    const match = /^\s*var\s*\(\s*([^,]+)\s*,\s*(.*)\s*\)\s*$/.exec(expr);
    if (!match) {
      return bindings;
    }

    const [_, varName, val] = match;
    return {
      ...bindings,
      [varName]: val,
    };
  }, {});

const extractVarsFromKeyframes = (frames: FramesStyles): VarBindings =>
  Object.keys(frames).reduce(
    (bindings, frame) => ({
      ...bindings,
      ...extractVarsFromStyle(frames[frame]),
    }),
    {} as VarBindings
  );

const extractVarsFromRule = (rule: Rule): VarBindings => {
  switch (rule.type) {
    case "style":
      return extractVarsFromStyle(rule.style);
    case "supports":
      return extractVarsFromRules(rule.rules);
    case "page":
      return extractVarsFromStyle(rule.style);
    case "namespace":
      return {};
    case "media":
      return extractVarsFromRules(rule.rules);
    case "keyframes":
      return extractVarsFromKeyframes(rule.frames);
    case "font-face":
      return extractVarsFromStyle(rule.style);
    case "import":
      return extractVarsFromRules(rule.rules);
  }
};

const extractVarsFromRules = (rules: Array<Rule>): VarBindings =>
  rules.reduce(
    (vars, rule) => ({
      ...vars,
      ...extractVarsFromRule(rule),
    }),
    {} as VarBindings
  );

export const extractStyleVariables = ({
  rules,
}: StyleSheetRules): VarBindings => extractVarsFromRules(rules);
