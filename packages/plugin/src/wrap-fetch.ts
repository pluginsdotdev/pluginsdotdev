import { browserData } from "./browser-data";
import { urlAllowed } from "./url-allowed";

const { Request, URL, fetch } = window;

export const wrapFetch = () => {
  if (fetch) {
    window.fetch = (resource, init) => {
      const anyResource = resource as any;
      const url: string =
        anyResource instanceof Request
          ? anyResource.url
          : anyResource instanceof URL
          ? anyResource.href
          : (anyResource as string);

      if (urlAllowed([], url)) {
        // short circuit to avoid infinite recursion for browser data
        return fetch(resource, init);
      }

      return browserData().then(({ allowedDomains }) => {
        if (!urlAllowed(allowedDomains, url)) {
          throw new Error("Attempted to access blocked domain");
        }

        return fetch(resource, init);
      });
    };
  }
};
