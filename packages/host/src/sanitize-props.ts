import * as attrs from "./attrs";

import type { HostId } from "@pluginsdotdev/bridge";

// from https://github.com/cure53/DOMPurify/blob/main/src/regexp.js
const isValidDataAttr = (prop: string) =>
  /^data-[\-\w.\u00B7-\uFFFF]/i.test(prop);
const isValidAriaAttr = (prop: string) => /^aria-[\-\w]+$/i.test(prop);
const fixWhitespace = (value: string) =>
  value.replace(
    /[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g,
    ""
  );
const isAllowedUri = (value: string) =>
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i.test(
    fixWhitespace(value)
  );
const isScriptOrData = (value: string) =>
  /^(?:\w+script|data):/i.test(fixWhitespace(value));

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
export const safePrefix = () => {
  if (_safePrefix) {
    return _safePrefix;
  }
  _safePrefix = generateSafePrefix();
  return _safePrefix;
};

// TODO: pull this into a shared library
const handleError = (msg: object) => {
  if (process.env.NODE_ENV !== "production") {
    console.error(msg);
    return;
  }

  // TODO: log error remotely
};

const unsafeProps = new Set<string>(["dangerouslySetInnerHTML"]);

type Validator = (
  hostId: HostId,
  pluginUrl: string,
  value: any,
  prop: string
) => null | { msg: string; prop: string; hostId: HostId; pluginUrl: string };

/**
 * Handles DOM Clobbering.
 * https://github.com/cure53/DOMPurify/blob/main/src/purify.js#L654
 **/
const requireSafePrefix: Validator = (hostId, pluginUrl, value, prop) => {
  const strValue = "" + value;
  if (!strValue.startsWith(safePrefix())) {
    return {
      msg: "Plugin attempted to use unsanitized id or name",
      prop,
      hostId,
      pluginUrl,
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

const isValidAttribute = (tagName: string, prop: string, value: any) => {
  // adapted from https://github.com/cure53/DOMPurify/blob/main/src/purify.js#L757

  const lcTag = tagName.toLowerCase();
  const lcProp = prop.toLowerCase();

  if (isValidDataAttr(lcProp)) {
    return true;
  } else if (isValidAriaAttr(lcProp)) {
    return true;
  } else if (!allowedAttrs.has(lcProp)) {
    // DOMPurify returns false here but we add react exclusions
    return isValidReactAttribute(prop, value);
  } else if (uriSafeAttrs.has(lcProp)) {
    return true;
  } else if (isAllowedUri(value)) {
    // TODO: check domain
    return true;
  } else if (
    dataUriAttrs.has(lcProp) &&
    value.indexOf("data:") === 0 &&
    dataUriTags.has(lcTag)
  ) {
    return true;
    // we intentionally skip the unknown protocols check
  } else if (!value) {
    return true;
  }

  // DOMPurify returns false here but we add react exclusions
  return isValidReactAttribute(prop, value);
};

/**
 * Sanitize properties we intend to add to html elements.
 *
 * Follow the pattern of
 * https://github.com/cure53/DOMPurify/blob/main/src/purify.js#L743
 **/
export const sanitizeProps = (
  hostId: HostId,
  pluginUrl: string,
  tagName: string,
  props: Record<string, any>
) => {
  return Object.keys(props).reduce((ps, prop) => {
    const value = props[prop];

    if (unsafeProps.has(prop)) {
      handleError({
        msg: "Plugin attempted to set unsafe prop",
        prop,
        hostId,
        pluginUrl,
      });
      return ps;
    }

    const validator = validatorByProp[prop];
    if (validator) {
      const error = validator(hostId, pluginUrl, value, prop);
      if (error) {
        handleError(error);
        return ps;
      }
    }

    if (!isValidAttribute(tagName, prop, value)) {
      return ps;
    }

    ps[prop] = value;
    return ps;
  }, {} as Record<string, any>);
};
