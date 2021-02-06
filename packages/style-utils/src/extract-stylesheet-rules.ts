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

const { map, reduce } = Array.prototype;

const convertStyle = (cssStyle: CSSStyleDeclaration): Style =>
  reduce.call<
    CSSStyleDeclaration,
    [(style: Style, styleName: string) => Style, Style],
    Style
  >(
    cssStyle,
    (style: Style, styleName: string): Style => ({
      ...style,
      [styleName]: cssStyle.getPropertyValue(styleName),
    }),
    {} as Style
  ) as Style;

const convertSupportsRule = (cssRule: CSSSupportsRule): SupportsRule => ({
  type: "supports",
  condition: cssRule.conditionText,
  rules: map.call(cssRule.cssRules, convertRule) as Array<Rule>,
});

const convertPageRule = (cssRule: CSSPageRule): PageRule => ({
  type: "page",
  selector: cssRule.selectorText,
  style: convertStyle(cssRule.style),
});

const convertNamespaceRule = (cssRule: CSSNamespaceRule): NamespaceRule => ({
  type: "namespace",
  namespaceURI: cssRule.namespaceURI,
  prefix: cssRule.prefix,
});

const convertMediaRule = (cssRule: CSSMediaRule): MediaRule => ({
  type: "media",
  condition: cssRule.conditionText,
  rules: map
    .call<CSSRuleList, [(cssRule: CSSRule) => Rule | null], Array<Rule | null>>(
      cssRule.cssRules,
      convertRule
    )
    .filter(ruleFilter),
});

const convertKeyframesRule = (cssRule: CSSKeyframesRule): KeyframesRule => ({
  type: "keyframes",
  name: cssRule.name,
  frames: reduce.call<
    CSSRuleList,
    [
      (frames: FramesStyles, rule: CSSKeyframeRule) => FramesStyles,
      FramesStyles
    ],
    FramesStyles
  >(
    cssRule.cssRules,
    (frames: FramesStyles, rule: CSSKeyframeRule): FramesStyles => ({
      ...frames,
      [rule.keyText]: convertStyle(rule.style),
    }),
    {} as FramesStyles
  ),
});

const convertFontFaceRule = (cssRule: CSSFontFaceRule): FontRule => ({
  type: "font-face",
  style: convertStyle(cssRule.style),
});

const convertImportRule = (cssRule: CSSImportRule): ImportRule => ({
  type: "import",
  media: map.call<MediaList, [(m: string) => string], Array<string>>(
    cssRule.media,
    (m) => m
  ),
  rules: map
    .call<CSSRuleList, [typeof convertRule], Array<Rule | null>>(
      cssRule.styleSheet.cssRules,
      convertRule
    )
    .filter(ruleFilter),
});

const convertStyleRule = (cssRule: CSSStyleRule): StyleRule => ({
  type: "style",
  selector: cssRule.selectorText,
  style: convertStyle(cssRule.style),
});

const convertRule = (cssRule: CSSRule): Rule | null => {
  if (cssRule instanceof CSSSupportsRule) {
    return convertSupportsRule(cssRule);
  } else if (cssRule instanceof CSSPageRule) {
    return convertPageRule(cssRule);
  } else if (cssRule instanceof CSSNamespaceRule) {
    return convertNamespaceRule(cssRule);
  } else if (cssRule instanceof CSSKeyframesRule) {
    return convertKeyframesRule(cssRule);
  } else if (cssRule instanceof CSSFontFaceRule) {
    return convertFontFaceRule(cssRule);
  } else if (cssRule instanceof CSSImportRule) {
    return convertImportRule(cssRule);
  } else if (cssRule instanceof CSSStyleRule) {
    return convertStyleRule(cssRule);
  }

  return null;
};

const ruleFilter = (rule: Rule | null): rule is Rule => !!rule;

export const extractStylesheetRules = (
  stylesheet: CSSStyleSheet | null
): StyleSheetRules => {
  if (!stylesheet) {
    return {
      rules: [],
    };
  }

  return {
    rules: Array.prototype.map
      .call<CSSRuleList, [(rule: CSSRule) => Rule | null], Array<Rule | null>>(
        stylesheet.cssRules,
        convertRule
      )
      .filter(ruleFilter),
  };
};
