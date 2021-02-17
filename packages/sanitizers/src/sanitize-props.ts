import { murmur2 } from "murmurhash-js";
import * as attrs from "./attrs";
import { domainFromUrl, resolveUrl } from "./domain-utils";
import { getValidStyle } from "./css-utils";
import {
  isValidDataAttr,
  isValidAriaAttr,
  fixWhitespace,
  isAllowedUri,
  isScriptOrData,
} from "./regex-utils";

import type { AllowedStyleValues } from "./css-utils";

type HostId = string;

const reactAttrs = new Set(["className", "key"]);
const allowedAttrs = new Set(
  attrs.html
    .concat(attrs.svg)
    .concat(attrs.mathMl)
    .concat(attrs.xml)
    .concat(Array.from(reactAttrs).map((a) => a.toLowerCase()))
);

const uriSafeAttrs = new Set([
  "alt",
  "class",
  "for",
  "id",
  "label",
  "name",
  "pattern",
  "placeholder",
  "summary",
  "title",
  "value",
  "style",
  "xmlns",
]);

const dataUriTags = new Set([
  "audio",
  "video",
  "img",
  "source",
  "image",
  "track",
]);

const dataUriAttrs = new Set(["src", "xlink:href", "href"]);

const anyDomainSafeAttrs = new Set(["xlink:href", "href"]);

const isEventHandler = (prop: string, value: any) =>
  /^on.*/.test(prop) && typeof value === "function";

const generateSafePrefix = () =>
  `__pluginsdotdev__${Math.floor(Math.random() * 10e10)}_`;

let _safePrefix: null | string = null;

/**
 * We prevent DOM Clobbering attacks by requiring that every id or name
 * is prefixed with a safe prefix that we control, ensuring that it can't
 * overwrite anything on the window.
 **/
export const safePrefix = (pluginPoint: string, pluginDomain: string) => {
  const hash = murmur2(`${pluginPoint}!${pluginDomain}`);
  if (_safePrefix) {
    return `${_safePrefix}${hash}__`;
  }
  _safePrefix = generateSafePrefix();
  return `${_safePrefix}${hash}__`;
};

// TODO: pull this into a shared library
const handleError = (msg: object) => {
  if (process.env.NODE_ENV !== "production") {
    console.error(msg);
    return;
  }

  // TODO: log error remotely
};

const unsafeProps = new Set<string>([
  "dangerouslySetInnerHTML",
  "is",
  "action",
]);

type Validator = (
  hostId: HostId,
  pluginPoint: string,
  pluginDomain: string,
  value: any,
  prop: string
) => null | { msg: string; prop: string; hostId: HostId; pluginDomain: string };

/**
 * Handles DOM Clobbering.
 * https://github.com/cure53/DOMPurify/blob/main/src/purify.js#L654
 **/
const requireSafePrefix: Validator = (
  hostId,
  pluginPoint,
  pluginDomain,
  value,
  prop
) => {
  const strValue = "" + value;
  if (!strValue.startsWith(safePrefix(pluginPoint, pluginDomain))) {
    return {
      msg: "Plugin attempted to use unsanitized id or name",
      prop,
      hostId,
      pluginDomain,
    };
  }

  return null;
};

/**
 * Validator to run for a given property
 **/
const validatorByProp: Record<string, Validator> = {
  id: requireSafePrefix,
  name: requireSafePrefix,
};

const isValidReactAttribute = (prop: string, value: any) =>
  isEventHandler(prop, value) || reactAttrs.has(prop);

const getValidAttributeValue = (
  pluginDomain: string,
  pluginUrl: string,
  allowedStyleValues: AllowedStyleValues,
  tagName: string,
  prop: string,
  value: any
): any | null => {
  // adapted from https://github.com/cure53/DOMPurify/blob/main/src/purify.js#L757

  const lcTag = tagName.toLowerCase();
  const lcProp = prop.toLowerCase();

  if (prop === "style") {
    // this is in addition to dompurify
    return getValidStyle(pluginDomain, pluginUrl, allowedStyleValues, value);
  } else if (isValidDataAttr(lcProp)) {
    return value;
  } else if (isValidAriaAttr(lcProp)) {
    return value;
  } else if (!allowedAttrs.has(lcProp)) {
    // DOMPurify returns false here but we add react exclusions
    return isValidReactAttribute(prop, value) ? value : null;
  } else if (uriSafeAttrs.has(lcProp)) {
    return value;
  } else if (isAllowedUri(value)) {
    // DOMPurify returns true here but we check domains
    if (!dataUriAttrs.has(lcProp)) {
      // skip domain check
      return value;
    }

    if (anyDomainSafeAttrs.has(lcProp)) {
      // some attrs can have any domain
      return value;
    }

    const url = resolveUrl(pluginUrl, value);
    const domain = domainFromUrl(url);
    return domain === pluginDomain ? url : null;
  } else if (
    dataUriAttrs.has(lcProp) &&
    value.indexOf("data:") === 0 &&
    dataUriTags.has(lcTag)
  ) {
    return value;
    // we intentionally skip the unknown protocols check
  } else if (!value) {
    return value;
  }

  // DOMPurify returns false here but we add react exclusions
  return isValidReactAttribute(prop, value) ? value : null;
};

type RequiredPropsForTag = Record<string, Record<string, any>>;

/**
 * Parameter for sanitizeProps
 **/
export interface SanitizePropsParams {
  hostId: HostId;
  pluginPoint: string;
  pluginDomain: string;
  pluginUrl: string;
  tagName: string;
  /**
   * Map from lower-case style property to an array of permissible values
   * for it.
   * If a value is provided for a property, we perform the default style
   * sanitization and then only allow values from the array.
   * If no value is provided for a property, only the default style
   * sanitization is applied.
   **/
  allowedStyleValues?: AllowedStyleValues;
  /**
   * If provided, any lower-case tag in the key set will automatically have
   * the provided properties and values applied.
   **/
  requiredPropsForTag?: RequiredPropsForTag;
  props: Record<string, any>;
}

/**
 * Sanitize properties we intend to add to html elements.
 *
 * Follow the pattern of
 * https://github.com/cure53/DOMPurify/blob/main/src/purify.js#L743
 **/
export const sanitizeProps = ({
  hostId,
  pluginPoint,
  pluginDomain,
  pluginUrl,
  tagName,
  allowedStyleValues,
  requiredPropsForTag,
  props,
}: SanitizePropsParams) => {
  const sanitizedProps = Object.keys(props).reduce((ps, prop) => {
    const value = props[prop];

    if (unsafeProps.has(prop)) {
      handleError({
        msg: "Plugin attempted to set unsafe prop",
        prop,
        hostId,
        pluginDomain,
      });
      return ps;
    }

    const validator = validatorByProp[prop];
    if (validator) {
      const error = validator(hostId, pluginPoint, pluginDomain, value, prop);
      if (error) {
        handleError(error);
        return ps;
      }
    }

    const validAttributeValue = getValidAttributeValue(
      pluginDomain,
      pluginUrl,
      allowedStyleValues ?? ({} as AllowedStyleValues),
      tagName,
      prop,
      value
    );
    if (validAttributeValue === null) {
      return ps;
    }

    ps[prop] = validAttributeValue;
    return ps;
  }, {} as Record<string, any>);

  if (requiredPropsForTag) {
    const reqProps = requiredPropsForTag[tagName.toLowerCase()];
    if (reqProps) {
      return {
        ...sanitizedProps,
        ...reqProps,
      };
    }
  }

  return sanitizedProps;
};
