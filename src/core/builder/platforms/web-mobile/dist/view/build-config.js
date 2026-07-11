// src/core/builder/platforms/web-mobile/src/view/build-config.tsx
import { useEffect, useMemo, useState } from "react";
import { Checkbox, TypedField } from "@pink/ui-kit";
import { jsx, jsxs } from "react/jsx-runtime";
var ROW = { padding: "2px 16px 6px 0px" };
var STACK = { display: "grid", gap: 8 };
var INLINE = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
var INFO = {
  paddingTop: 3,
  fontSize: 11,
  lineHeight: "16px",
  color: "var(--vscode-descriptionForeground)"
};
var WARN = {
  paddingTop: 3,
  fontSize: 11,
  lineHeight: "16px",
  color: "var(--vscode-editorWarning-foreground, var(--vscode-descriptionForeground))"
};
var LINK = {
  color: "var(--vscode-textLink-foreground)",
  textDecoration: "none",
  wordBreak: "break-all"
};
var QR_CODE = {
  width: 180,
  height: 180,
  objectFit: "contain",
  border: "1px solid var(--vscode-panel-border, rgba(127,127,127,.35))",
  background: "#fff"
};
function translate(bundle, key) {
  let cur = bundle;
  for (const seg of key.split(".")) {
    if (cur && typeof cur === "object" && seg in cur) {
      cur = cur[seg];
    } else {
      return key;
    }
  }
  return typeof cur === "string" ? cur : key;
}
function boolValue(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}
function stringValue(value) {
  return typeof value === "string" ? value : value === void 0 || value === null ? "" : String(value);
}
function WebMobileBuildView({ value, onChange, bridge, commonValue }) {
  const [bundle, setBundle] = useState({});
  const [previewInfo, setPreviewInfo] = useState({
    previewUrl: "",
    qrcodeSrc: "",
    webGPUTips: "",
    webGPULink: ""
  });
  const [loadingPreview, setLoadingPreview] = useState(false);
  const useWebGPU = boolValue(value.useWebGPU);
  const outputName = stringValue(commonValue?.outputName) || "web-mobile";
  const buildPath = stringValue(commonValue?.buildPath) || "project://build";
  const t = (key) => translate(bundle, key);
  const previewRequest = useMemo(() => ({ buildPath, outputName, useWebGPU }), [buildPath, outputName, useWebGPU]);
  useEffect(() => {
    if (!bridge) {
      return;
    }
    let cancelled = false;
    bridge.invoke("getI18nBundle").then((data) => {
      if (!cancelled) {
        setBundle(data ?? {});
      }
    }).catch(() => {
    });
    return () => {
      cancelled = true;
    };
  }, [bridge]);
  useEffect(() => {
    if (!bridge) {
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
    bridge.invoke("getPreviewInfo", previewRequest).then((info) => {
      if (!cancelled) {
        setPreviewInfo(info ?? {
          previewUrl: "",
          qrcodeSrc: "",
          webGPUTips: "",
          webGPULink: ""
        });
      }
    }).catch(() => {
      if (!cancelled) {
        setPreviewInfo({
          previewUrl: "",
          qrcodeSrc: "",
          webGPUTips: "",
          webGPULink: ""
        });
      }
    }).finally(() => {
      if (!cancelled) {
        setLoadingPreview(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bridge, previewRequest]);
  return /* @__PURE__ */ jsxs("div", { style: { width: "100%", minWidth: 0, boxSizing: "border-box" }, children: [
    /* @__PURE__ */ jsx("div", { style: ROW, children: /* @__PURE__ */ jsx(TypedField, { label: "WEBGPU", tooltip: t("tips.webgpu"), children: /* @__PURE__ */ jsx(Checkbox, { checked: useWebGPU, onCheckedChange: (checked) => onChange(["useWebGPU"], !!checked) }) }) }),
    /* @__PURE__ */ jsx("div", { style: ROW, children: /* @__PURE__ */ jsx(TypedField, { label: t("options.preview_qrcode"), children: /* @__PURE__ */ jsx("div", { style: STACK, children: previewInfo.webGPUTips ? /* @__PURE__ */ jsxs("div", { style: WARN, children: [
      previewInfo.webGPUTips,
      " ",
      previewInfo.webGPULink && /* @__PURE__ */ jsx("a", { href: previewInfo.webGPULink, style: LINK, children: previewInfo.webGPULink })
    ] }) : previewInfo.qrcodeSrc ? /* @__PURE__ */ jsx("img", { alt: "", src: previewInfo.qrcodeSrc, style: QR_CODE }) : /* @__PURE__ */ jsx("div", { style: INFO, children: loadingPreview ? "Loading..." : "Preview server is not available." }) }) }) }),
    /* @__PURE__ */ jsx("div", { style: ROW, children: /* @__PURE__ */ jsx(TypedField, { label: t("options.preview_url"), children: /* @__PURE__ */ jsx("div", { style: INLINE, children: previewInfo.previewUrl ? /* @__PURE__ */ jsx("a", { href: previewInfo.previewUrl, style: LINK, children: previewInfo.previewUrl }) : /* @__PURE__ */ jsx("span", { style: INFO, children: loadingPreview ? "Loading..." : "Preview server is not available." }) }) }) })
  ] });
}
export {
  WebMobileBuildView as default
};
