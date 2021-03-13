import { base64 } from "rfc4648";
import { memoized } from "./memoize-promise";

export interface ExposedComponent {
  type: string;
  attrs: (props?: Record<string, any>) => Record<string, any>;
  el: (props: Record<string, any>) => HTMLElement;
}

export type ExposedComponents = Record<string, ExposedComponent>;

export type GroupId = string;

export type Role = "admin" | "member";

export type Groups = Record<GroupId, Role>;

export interface BrowserData {
  pluginId: string;
  hostId: string;
  userId: string;
  groups: Groups;
  hostOrigin: string;
  exposedComponentsList: Array<keyof ExposedComponents>;
  allowedDomains: Array<string>;
}

const { parse } = JSON;
const {
  crypto: { subtle: subtleCrypto },
  TextDecoder,
  fetch,
} = window;

const getCookies = (): Record<string, string> =>
  (document.cookie || "").split(";").reduce((res, c) => {
    const [key, val] = c.trim().split("=").map(decodeURIComponent);
    return {
      ...res,
      [key]: val,
    };
  }, {} as Record<string, string>);

const b64ToTypedArray = (b64: string) =>
  base64.parse(b64.replace(/[-]/g, "+").replace(/_/g, "/"), { loose: true });

const b64ToUtf8 = (b64: string) =>
  new TextDecoder("utf-8").decode(b64ToTypedArray(b64));

type VerificationOpts = {
  algorithms?: Array<"RS256">;
  issuer?: string;
  audience?: string;
};

type KeyCallback = (error: Error | null, key?: CryptoKey) => void;

type JWTHeader = object & { kid: string };

type GetKey = (header: JWTHeader, callback: KeyCallback) => void;

type Claims = {
  sub: string;
  iss: string;
  aud: string;
  iat: string;
  exp: string;
};

type VerifyCallback = (error: Error | null, claims?: Claims) => void;

const verifyJwt = (
  jwt: string,
  getKey: GetKey,
  verificationOpts: VerificationOpts,
  cb: VerifyCallback
) => {
  const decoder = new TextDecoder("utf-8");
  const [headerB64, claimsB64, sig] = jwt.split(".");
  const header = parse(b64ToUtf8(headerB64));
  const claims = parse(b64ToUtf8(claimsB64));

  getKey(header, (err, key) => {
    if (err || !key) {
      return cb(err);
    }

    return subtleCrypto
      .verify(
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        key,
        new TextEncoder().encode(`${headerB64}.${claimsB64}`),
        b64ToTypedArray(sig)
      )
      .then((verified) => {
        if (
          verificationOpts.algorithms &&
          verificationOpts.algorithms.indexOf(header.alg) < 0
        ) {
          throw new Error("Bad algorithm");
        }

        if (
          verificationOpts.audience &&
          verificationOpts.audience !== claims.aud
        ) {
          throw new Error("Bad audience");
        }

        if (verificationOpts.issuer && verificationOpts.issuer !== claims.iss) {
          throw new Error("Bad issuer");
        }

        const now = Math.floor(Date.now() / 1000);
        if (claims.iat > now) {
          throw new Error("Bad iat");
        }

        if (claims.nbf > now) {
          throw new Error("Bad nbf");
        }

        if (claims.exp < now) {
          throw new Error("Bad exp");
        }

        return claims;
      })
      .then(
        (claims) => {
          cb(null, claims);
        },
        (err) => {
          cb(err);
        }
      );
  });
};

export const browserData = memoized(
  async (): Promise<BrowserData> => {
    const result = await fetch("/.well-known/jwks.json");
    const jwks = (await result.json()) as {
      keys: Array<JsonWebKey & { kid: string }>;
    };

    const getKey = (header: JWTHeader, cb: KeyCallback) => {
      const key = jwks.keys.find((k) => k.kid === header.kid);
      if (!key) {
        return cb(new Error("Bad key id"));
      }

      if (key.kty !== "RSA") {
        return cb(new Error("Bad key type"));
      }

      subtleCrypto
        .importKey(
          "jwk",
          key,
          { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
          false,
          ["verify"]
        )
        .then((key) => {
          cb(null, key);
        })
        .then(null, (err) => {
          cb(err);
        });
    };

    const { hostId, sub, groups } = await new Promise((resolve, reject) => {
      const onLoaded = () => {
        const hostId = document.body.getAttribute("data-host-id")!;
        const cookieName = `${hostId}--jwt`;
        const jwtString = getCookies()[cookieName];
        if (!jwtString) {
          throw new Error("No JWT found in cookies");
        }

        verifyJwt(
          jwtString,
          getKey,
          {
            algorithms: ["RS256"],
            audience: document.location.host,
          },
          (err, decoded) => {
            if (err) {
              return reject(err);
            }

            resolve({ ...decoded, hostId } as {
              hostId: string;
              sub: string;
              groups: Groups;
            });
          }
        );
      };

      if (document.readyState === "complete") {
        onLoaded();
      } else {
        document.addEventListener("DOMContentLoaded", onLoaded);
      }
    });

    return {
      hostId,
      pluginId: document.body.getAttribute("data-plugin-id")!,
      userId: sub,
      groups,
      hostOrigin: document.body.getAttribute("data-host-origin")!,
      allowedDomains: parse(
        document.body.getAttribute("data-allowed-domains")!
      ) as Array<string>,
      exposedComponentsList: parse(
        document.body.getAttribute("data-exposed-components")!
      ) as Array<keyof ExposedComponents>,
    };
  }
);
