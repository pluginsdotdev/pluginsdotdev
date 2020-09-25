import type { HostId } from "@pluginsdotdev/bridge";

const handleError = (msg: object) => {
  if (process.env.NODE_ENV !== "production") {
    console.error(msg);
    return;
  }

  // TODO: log error remotely
};

const unsafeProps = new Set<string>(["dangerouslySetInnerHTML"]);

export const sanitizeProps = (
  hostId: HostId,
  pluginUrl: string,
  props: Record<string, any>
) => {
  return Object.keys(props).reduce((ps, prop) => {
    const value = props[prop];

    if (unsafeProps.has(prop)) {
      handleError({
        msg: "Plugin attempted to set unsafe prop",
        prop: prop,
        hostId,
        pluginUrl,
      });
      return ps;
    }
    ps[prop] = value;
    return ps;
  }, {} as Record<string, any>);
};
