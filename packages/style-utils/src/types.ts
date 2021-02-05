export type Style = Record<string, string>;

export interface GroupingRule {
  rules: Array<Rule>;
}

export interface ConditionRule extends GroupingRule {
  condition: string;
}

export interface BaseStyleRule {
  selector: string;
  style: Style;
}

export type StyleRule = BaseStyleRule & {
  type: "style";
};

export type SupportsRule = ConditionRule & {
  type: "supports";
};

export type PageRule = BaseStyleRule & {
  type: "page";
  selector: string;
};

export type NamespaceRule = {
  type: "namespace";
  namespaceURI: string;
  prefix: string;
};

export type MediaRule = ConditionRule & {
  type: "media";
};

export type FramesStyles = Record<string, Style>;

export type KeyframesRule = {
  type: "keyframes";
  name: string;
  frames: FramesStyles;
};

export type FontRule = {
  type: "font-face";
  style: Style;
};

export type ImportRule = GroupingRule & {
  type: "import";
  media: Array<string>;
};

export type Rule =
  | StyleRule
  | SupportsRule
  | PageRule
  | NamespaceRule
  | MediaRule
  | KeyframesRule
  | FontRule
  | ImportRule;

export interface StyleSheetRules {
  rules: Array<Rule>;
}
