import { g as getDefaultExportFromCjs } from "./index-BpvutWXK.js";
import { r as requireReactDom } from "./index-CnVeNpEK.js";
function _mergeNamespaces(n, m) {
  for (var i = 0; i < m.length; i++) {
    const e = m[i];
    if (typeof e !== "string" && !Array.isArray(e)) {
      for (const k in e) {
        if (k !== "default" && !(k in n)) {
          const d = Object.getOwnPropertyDescriptor(e, k);
          if (d) {
            Object.defineProperty(n, k, d.get ? d : {
              enumerable: true,
              get: () => e[k]
            });
          }
        }
      }
    }
  }
  return Object.freeze(Object.defineProperty(n, Symbol.toStringTag, { value: "Module" }));
}
var client$2 = {};
var hasRequiredClient;
function requireClient() {
  if (hasRequiredClient) return client$2;
  hasRequiredClient = 1;
  var m = requireReactDom();
  {
    client$2.createRoot = m.createRoot;
    client$2.hydrateRoot = m.hydrateRoot;
  }
  return client$2;
}
var clientExports = requireClient();
const client = /* @__PURE__ */ getDefaultExportFromCjs(clientExports);
const client$1 = /* @__PURE__ */ _mergeNamespaces({
  __proto__: null,
  default: client
}, [clientExports]);
export {
  client$1 as c
};
