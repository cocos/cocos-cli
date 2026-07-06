// src/view/build-config.tsx
import { useEffect, useMemo, useState } from "react";
import { Checkbox, FilePicker, TypedField } from "@pink/ui-kit";
import { jsx, jsxs } from "react/jsx-runtime";
var APP_ABIS = ["armeabi-v7a", "arm64-v8a", "x86", "x86_64"];
var MAX_ASPECT_RATIO_OPTIONS = [
  { label: "2.4 (12:5)", value: "2.4" },
  { label: "1.77 (16:9)", value: "16:9" },
  { label: "1.6 (16:10)", value: "16:10" },
  { label: "1.33 (4:3)", value: "4:3" }
];
var DEFAULTS = {
  packageName: "com.cocos.game",
  resizeableActivity: true,
  maxAspectRatio: "2.4",
  orientation: {
    portrait: false,
    upsideDown: false,
    landscapeRight: true,
    landscapeLeft: true
  },
  apiLevel: 35,
  appABIs: ["arm64-v8a"],
  useDebugKeystore: true,
  keystorePath: "",
  keystorePassword: "",
  keystoreAlias: "",
  keystoreAliasPassword: "",
  appBundle: true,
  androidInstant: false,
  googleBilling: true,
  playGames: true,
  inputSDK: false,
  isSoFileCompressed: false,
  remoteUrl: "",
  renderBackEnd: {
    vulkan: false,
    gles3: true,
    gles2: true
  },
  swappy: false,
  adpf: true,
  customIcon: "default"
};
var ROW = { padding: "2px 16px 6px 20px" };
var STACK = { display: "grid", gap: 6 };
var INLINE = { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" };
var SUB_ROW = { paddingLeft: 18, display: "grid", gap: 4 };
var INPUT = {
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  height: 26,
  padding: "0 8px",
  border: "1px solid var(--vscode-input-border, transparent)",
  color: "var(--vscode-input-foreground)",
  background: "var(--vscode-input-background)",
  outline: "none"
};
var SELECT = { ...INPUT, padding: "0 6px" };
var BUTTON = {
  height: 26,
  padding: "0 10px",
  border: "1px solid var(--vscode-button-border, transparent)",
  color: "var(--vscode-button-foreground)",
  background: "var(--vscode-button-background)",
  cursor: "pointer"
};
var BUTTON_SECONDARY = {
  ...BUTTON,
  color: "var(--vscode-button-secondaryForeground, var(--vscode-button-foreground))",
  background: "var(--vscode-button-secondaryBackground, var(--vscode-button-background))"
};
var ERROR = {
  paddingTop: 3,
  fontSize: 11,
  lineHeight: "16px",
  color: "var(--vscode-errorForeground, #f14c4c)"
};
var INFO = {
  paddingTop: 3,
  fontSize: 11,
  lineHeight: "16px",
  color: "var(--vscode-descriptionForeground)"
};
var ICON_PREVIEW = {
  width: 84,
  height: 84,
  objectFit: "contain",
  border: "1px solid var(--vscode-panel-border, rgba(127,127,127,.35))",
  background: "var(--vscode-editor-background)"
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
function formatMessage(text, sub) {
  if (!sub) {
    return text;
  }
  return text.replace(/\{(\w+)\}/g, (match, key) => key in sub ? String(sub[key]) : match);
}
function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function stringValue(value) {
  return typeof value === "string" ? value : value === void 0 || value === null ? "" : String(value);
}
function boolValue(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}
function numberValue(value, fallback) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function appABIsValue(value) {
  if (!Array.isArray(value)) {
    return ["arm64-v8a"];
  }
  return value.filter((item) => APP_ABIS.includes(item));
}
function parseAspectRatio(value) {
  if (!value) {
    return 0;
  }
  const fraction = value.match(/^(\d+):(\d+)$/);
  if (fraction) {
    return Number.parseInt(fraction[1], 10) / Number.parseInt(fraction[2], 10);
  }
  const formatted = value.match(/^\s*(\d+(?:\.\d+)?)\s*(?:\(\s*(\d+)\s*:\s*(\d+)\s*\))?\s*$/);
  if (formatted?.[2] && formatted?.[3]) {
    return Number.parseInt(formatted[2], 10) / Number.parseInt(formatted[3], 10);
  }
  return Number.parseFloat(value);
}
function normalizeAspectRatio(value) {
  const text = value.trim();
  const fraction = text.match(/^(\d+):(\d+)$/);
  if (fraction) {
    return `${fraction[1]}:${fraction[2]}`;
  }
  const formatted = text.match(/^(\d+(?:\.\d+)?)\s*(?:\(\s*(\d+)\s*:\s*(\d+)\s*\))?$/);
  if (formatted?.[2] && formatted?.[3]) {
    return `${formatted[2]}:${formatted[3]}`;
  }
  return formatted?.[1] || text;
}
function formatCustomAspectRatio(value) {
  const fraction = value.match(/^(\d+):(\d+)$/);
  if (fraction) {
    const width = Number.parseInt(fraction[1], 10);
    const height = Number.parseInt(fraction[2], 10);
    return `${(width / height).toFixed(2)} (${width}:${height})`;
  }
  return value;
}
function maxAspectRatioSelection(value) {
  const current = parseAspectRatio(value);
  const predefined = MAX_ASPECT_RATIO_OPTIONS.find((option) => parseAspectRatio(option.value) === current);
  return predefined?.value || "custom";
}
function fileImageSrc(filePath) {
  if (!filePath) {
    return "";
  }
  const [rawPath, query] = filePath.split("?");
  const normalized = rawPath.replace(/\\/g, "/");
  const src = normalized.startsWith("file:///") ? normalized : `file:///${normalized.replace(/^\/+/, "")}`;
  return query ? `${encodeURI(src)}?${query}` : encodeURI(src);
}
function extractFilePickerPath(value) {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return extractFilePickerPath(value[0]);
  }
  if (typeof value === "object") {
    const data = value;
    const target = data.target;
    if (target) {
      return extractFilePickerPath(target.value ?? target.files);
    }
    for (const key of ["path", "fsPath", "filePath", "value"]) {
      const path = extractFilePickerPath(data[key]);
      if (path) {
        return path;
      }
    }
  }
  return "";
}
function TextField({
  label,
  tooltip,
  value,
  disabled,
  password,
  placeholder,
  error,
  onChange
}) {
  return /* @__PURE__ */ jsxs("div", { style: ROW, children: [
    /* @__PURE__ */ jsx(TypedField, { label, tooltip, children: /* @__PURE__ */ jsx(
      "input",
      {
        style: INPUT,
        type: password ? "password" : "text",
        value: stringValue(value),
        disabled,
        placeholder,
        onChange: (event) => onChange(event.target.value)
      }
    ) }),
    error && /* @__PURE__ */ jsx("div", { style: ERROR, children: error })
  ] });
}
function CheckboxLine({
  checked,
  disabled,
  label,
  tooltip,
  onChange
}) {
  return /* @__PURE__ */ jsxs("label", { style: { ...INLINE, minHeight: 22 }, title: tooltip, children: [
    /* @__PURE__ */ jsx(Checkbox, { checked, disabled, onCheckedChange: (next) => onChange(!!next) }),
    label && /* @__PURE__ */ jsx("span", { children: label })
  ] });
}
function GooglePlayBuildView({ value, onChange, bridge, commonValue }) {
  const [bundle, setBundle] = useState({});
  const [apiLevels, setApiLevels] = useState([]);
  const [iconDisplay, setIconDisplay] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [outputName, setOutputName] = useState("default");
  const [maxAspectRatioMode, setMaxAspectRatioMode] = useState("");
  const [customMaxAspectRatio, setCustomMaxAspectRatio] = useState("");
  const [customError, setCustomError] = useState("");
  const t = (key, sub) => formatMessage(translate(bundle, key), sub);
  const current = useMemo(() => ({ ...DEFAULTS, ...value }), [value]);
  const renderBackEnd = { ...DEFAULTS.renderBackEnd, ...objectValue(current.renderBackEnd) };
  const orientation = { ...DEFAULTS.orientation, ...objectValue(current.orientation) };
  const appABIs = appABIsValue(current.appABIs);
  const resizeableActivity = boolValue(current.resizeableActivity, true);
  const androidInstant = boolValue(current.androidInstant);
  const useDebugKeystore = boolValue(current.useDebugKeystore, true);
  const maxAspectRatio = stringValue(current.maxAspectRatio);
  const inferredMaxAspectRatioMode = maxAspectRatioSelection(maxAspectRatio);
  const selectedMaxAspectRatioMode = maxAspectRatioMode || inferredMaxAspectRatioMode;
  const set = (key, next) => onChange([key], next);
  const setRenderBackEnd = (key, next) => {
    const nextValue = { ...renderBackEnd, [key]: next };
    onChange(["renderBackEnd"], nextValue);
  };
  const setOrientation = (key, next) => {
    const nextValue = { ...orientation, [key]: next };
    onChange(["orientation"], nextValue);
  };
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
    bridge.invoke("getAndroidAPILevels").then((levels) => {
      if (!cancelled) {
        setApiLevels(Array.isArray(levels) ? levels : []);
      }
    }).catch(() => {
      if (!cancelled) {
        setApiLevels([]);
      }
    });
    bridge.invoke("getBuildConfig").then((config) => {
      if (cancelled || !config) {
        return;
      }
      const paths = objectValue(config.paths);
      const resolvedProjectPath = stringValue(config.projectRoot) || stringValue(paths.projectRoot) || stringValue(config.projectPath);
      setProjectPath(resolvedProjectPath);
      setOutputName(stringValue(config.outputName) || "default");
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
    bridge.invoke("getDisplayCustomIcon", current.customIcon === "custom" ? "custom" : "default", outputName, projectPath).then((display) => setIconDisplay(display || "")).catch(() => setIconDisplay(""));
  }, [bridge, current.customIcon, outputName, projectPath]);
  useEffect(() => {
    if (inferredMaxAspectRatioMode === "custom") {
      setMaxAspectRatioMode("custom");
      setCustomMaxAspectRatio(formatCustomAspectRatio(maxAspectRatio));
    } else if (maxAspectRatioMode !== "custom") {
      setMaxAspectRatioMode(inferredMaxAspectRatioMode);
    }
  }, [inferredMaxAspectRatioMode, maxAspectRatio, maxAspectRatioMode]);
  useEffect(() => {
    for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
      if (!(key in value)) {
        onChange([key], defaultValue);
      }
    }
  }, []);
  const errors = useMemo(() => {
    const next = {};
    const packageName = stringValue(current.packageName);
    if (!packageName) {
      next.packageName = t("tips.not_empty");
    } else if (!/^[a-zA-Z]\w*(\.[a-zA-Z]\w*)+$/.test(packageName)) {
      next.packageName = t("tips.package_name_error");
    }
    if (!appABIs.length) {
      next.appABIs = t("tips.at_least_one");
    }
    if (!Object.values(renderBackEnd).some(Boolean)) {
      next.renderBackEnd = t("tips.at_least_one");
    }
    if (!Object.values(orientation).some(Boolean)) {
      next.orientation = t("tips.at_least_one");
    }
    const apiLevel = numberValue(current.apiLevel, 0);
    if (!apiLevels.length) {
      next.apiLevel = t("tips.apilevel_empty");
    } else if (androidInstant && apiLevel < 23) {
      next.apiLevel = `${t("tips.when_enable_instant")}${t("tips.apilevel_limit", { version: "23" })}`;
    } else if (String(commonValue?.JobSystem || "") === "tbb" && apiLevel < 21) {
      next.apiLevel = `${t("tips.when_enable_tbb")}${t("tips.apilevel_limit", { version: "21" })}`;
    } else if (apiLevel < 19) {
      next.apiLevel = t("tips.apilevel_limit", { version: "19" });
    }
    if (!resizeableActivity) {
      const normalized = normalizeAspectRatio(maxAspectRatio);
      const ratio = parseAspectRatio(normalized);
      if (!normalized) {
        next.maxAspectRatio = t("tips.mar_empty");
      } else if (!Number.isFinite(ratio)) {
        next.maxAspectRatio = t("tips.mar_format");
      } else if (ratio < 1.33) {
        next.maxAspectRatio = t("tips.mar_bad_value");
      }
    }
    if (!useDebugKeystore) {
      if (!stringValue(current.keystorePath)) {
        next.keystorePath = t("KEYSTORE.error.keystore_path_empty");
      }
      for (const key of ["keystorePassword", "keystoreAlias", "keystoreAliasPassword"]) {
        if (!stringValue(current[key])) {
          next[key] = t("tips.not_empty");
        }
      }
    }
    if (androidInstant) {
      const remoteUrl = stringValue(current.remoteUrl);
      if (remoteUrl && !remoteUrl.startsWith("http")) {
        next.remoteUrl = "remoteUrl should start with http";
      }
    }
    return next;
  }, [apiLevels.length, androidInstant, appABIs, bundle, commonValue?.JobSystem, current, maxAspectRatio, orientation, renderBackEnd, resizeableActivity, t, useDebugKeystore]);
  const toggleAbi = (abi, checked) => {
    const next = checked ? [...appABIs, abi] : appABIs.filter((item) => item !== abi);
    set("appABIs", Array.from(new Set(next)));
  };
  const setUseDebugKeystore = (checked) => {
    set("useDebugKeystore", checked);
    if (checked) {
      set("keystorePath", "");
      set("keystorePassword", "");
      set("keystoreAlias", "");
      set("keystoreAliasPassword", "");
    }
  };
  const applyCustomIcon = async (value2) => {
    const source = extractFilePickerPath(value2);
    if (!source) {
      return;
    }
    setCustomError("");
    if (!projectPath) {
      setCustomError("Can not resolve project path.");
      return;
    }
    const display = await bridge?.invoke("saveCustomIcon", source, outputName, projectPath).catch((error) => {
      setCustomError(error instanceof Error ? error.message : String(error));
      return "";
    });
    if (display) {
      set("customIcon", "custom");
      setIconDisplay(display);
    }
  };
  const changeMaxAspectRatio = (next) => {
    if (next === "custom") {
      setMaxAspectRatioMode("custom");
      set("maxAspectRatio", normalizeAspectRatio(customMaxAspectRatio));
      return;
    }
    setMaxAspectRatioMode(next);
    set("maxAspectRatio", next);
  };
  const commitCustomMaxAspectRatio = (next) => {
    setCustomMaxAspectRatio(next);
    set("maxAspectRatio", normalizeAspectRatio(next));
  };
  return /* @__PURE__ */ jsxs("div", { style: { width: "100%", minWidth: 0, boxSizing: "border-box" }, children: [
    /* @__PURE__ */ jsxs("div", { style: ROW, children: [
      /* @__PURE__ */ jsx(TypedField, { label: t("options.render_back_end"), children: /* @__PURE__ */ jsxs("div", { style: STACK, children: [
        /* @__PURE__ */ jsx(
          CheckboxLine,
          {
            checked: !!renderBackEnd.vulkan,
            tooltip: t("tips.vukan_limit"),
            label: "Vulkan",
            onChange: (checked) => setRenderBackEnd("vulkan", checked)
          }
        ),
        /* @__PURE__ */ jsx(
          CheckboxLine,
          {
            checked: !!renderBackEnd.gles3,
            label: "GLES 2/3",
            onChange: (checked) => {
              onChange(["renderBackEnd"], checked ? { ...renderBackEnd, gles3: true } : { ...renderBackEnd, gles2: false, gles3: false });
            }
          }
        ),
        !!renderBackEnd.gles3 && /* @__PURE__ */ jsxs("div", { style: SUB_ROW, children: [
          /* @__PURE__ */ jsx(CheckboxLine, { checked: true, disabled: true, label: "GLES3", onChange: () => {
          } }),
          /* @__PURE__ */ jsx(CheckboxLine, { checked: !!renderBackEnd.gles2, label: "GLES2", onChange: (checked) => setRenderBackEnd("gles2", checked) })
        ] })
      ] }) }),
      errors.renderBackEnd && /* @__PURE__ */ jsx("div", { style: ERROR, children: errors.renderBackEnd })
    ] }),
    /* @__PURE__ */ jsx(
      TextField,
      {
        label: t("options.package_name"),
        value: current.packageName,
        placeholder: t("options.package_name_hint"),
        error: errors.packageName,
        onChange: (next) => set("packageName", next)
      }
    ),
    /* @__PURE__ */ jsxs("div", { style: ROW, children: [
      /* @__PURE__ */ jsx(TypedField, { label: t("custom_icon.title"), tooltip: t("custom_icon.tooltip"), children: /* @__PURE__ */ jsxs("div", { style: STACK, children: [
        /* @__PURE__ */ jsx(CheckboxLine, { checked: current.customIcon !== "custom", label: t("custom_icon.default"), onChange: () => set("customIcon", "default") }),
        /* @__PURE__ */ jsx(CheckboxLine, { checked: current.customIcon === "custom", label: t("custom_icon.custom"), onChange: () => set("customIcon", "custom") }),
        /* @__PURE__ */ jsxs("div", { style: INLINE, children: [
          current.customIcon === "custom" && /* @__PURE__ */ jsx(
            FilePicker,
            {
              value: "",
              filters: { Images: ["png"] },
              placeholder: t("custom_icon.btnSelectImage")
            }
          ),
          iconDisplay && /* @__PURE__ */ jsx("img", { style: ICON_PREVIEW, src: fileImageSrc(iconDisplay) })
        ] })
      ] }) }),
      customError && /* @__PURE__ */ jsx("div", { style: ERROR, children: customError })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: ROW, children: [
      /* @__PURE__ */ jsx(TypedField, { label: "Target API Level", children: /* @__PURE__ */ jsxs("div", { style: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8 }, children: [
        /* @__PURE__ */ jsx(
          "select",
          {
            style: SELECT,
            value: String(numberValue(current.apiLevel, apiLevels[0] || 35)),
            onChange: (event) => set("apiLevel", Number.parseInt(event.target.value, 10)),
            children: (apiLevels.length ? apiLevels : [numberValue(current.apiLevel, 35)]).map((level) => /* @__PURE__ */ jsxs("option", { value: level, children: [
              "android-",
              level
            ] }, level))
          }
        ),
        /* @__PURE__ */ jsx("button", { style: BUTTON_SECONDARY, type: "button", onClick: () => void bridge?.invoke("openProgramSettings"), children: "Set Android SDK" })
      ] }) }),
      errors.apiLevel && /* @__PURE__ */ jsx("div", { style: ERROR, children: errors.apiLevel })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: ROW, children: [
      /* @__PURE__ */ jsx(TypedField, { label: "APP ABI", tooltip: t("options.appABIs_tips"), children: /* @__PURE__ */ jsx("div", { style: STACK, children: APP_ABIS.map((abi) => /* @__PURE__ */ jsx(CheckboxLine, { checked: appABIs.includes(abi), label: abi, onChange: (checked) => toggleAbi(abi, checked) }, abi)) }) }),
      errors.appABIs && /* @__PURE__ */ jsx("div", { style: ERROR, children: errors.appABIs })
    ] }),
    /* @__PURE__ */ jsx("div", { style: ROW, children: /* @__PURE__ */ jsx(TypedField, { label: t("KEYSTORE.use_debug_keystore"), children: /* @__PURE__ */ jsx(Checkbox, { checked: useDebugKeystore, onCheckedChange: (checked) => setUseDebugKeystore(!!checked) }) }) }),
    /* @__PURE__ */ jsx("div", { style: ROW, children: /* @__PURE__ */ jsx(TypedField, { label: t("KEYSTORE.keystore_path"), children: /* @__PURE__ */ jsx(
      FilePicker,
      {
        disabled: useDebugKeystore,
        value: current.keystorePath,
        buttonText: t("KEYSTORE.keystore_path"),
        onChange: (next) => set("keystorePath", next)
      }
    ) }) }),
    /* @__PURE__ */ jsx(TextField, { label: t("KEYSTORE.keystore_password"), password: true, disabled: useDebugKeystore, value: current.keystorePassword, error: errors.keystorePassword, onChange: (next) => set("keystorePassword", next) }),
    /* @__PURE__ */ jsx(TextField, { label: t("KEYSTORE.keystore_alias"), disabled: useDebugKeystore, value: current.keystoreAlias, error: errors.keystoreAlias, onChange: (next) => set("keystoreAlias", next) }),
    /* @__PURE__ */ jsx(TextField, { label: t("KEYSTORE.keystore_alias_password"), password: true, disabled: useDebugKeystore, value: current.keystoreAliasPassword, error: errors.keystoreAliasPassword, onChange: (next) => set("keystoreAliasPassword", next) }),
    /* @__PURE__ */ jsx("div", { style: ROW, children: /* @__PURE__ */ jsx(TypedField, { label: t("options.resizeable_activity"), tooltip: t("tips.resizeable_activity"), children: /* @__PURE__ */ jsx(Checkbox, { checked: resizeableActivity, onCheckedChange: (checked) => set("resizeableActivity", !!checked) }) }) }),
    /* @__PURE__ */ jsxs("div", { style: ROW, children: [
      /* @__PURE__ */ jsx(TypedField, { label: t("options.max_aspect_ratio"), children: /* @__PURE__ */ jsxs("div", { style: STACK, children: [
        /* @__PURE__ */ jsxs(
          "select",
          {
            style: SELECT,
            disabled: resizeableActivity,
            value: selectedMaxAspectRatioMode,
            onChange: (event) => changeMaxAspectRatio(event.target.value),
            children: [
              MAX_ASPECT_RATIO_OPTIONS.map((option) => /* @__PURE__ */ jsx("option", { value: option.value, children: option.label }, option.value)),
              /* @__PURE__ */ jsx("option", { value: "custom", children: t("options.customOption") })
            ]
          }
        ),
        selectedMaxAspectRatioMode === "custom" && /* @__PURE__ */ jsx(
          "input",
          {
            style: INPUT,
            disabled: resizeableActivity,
            value: customMaxAspectRatio,
            placeholder: t("placeholders.max_aspect_ratio"),
            onChange: (event) => commitCustomMaxAspectRatio(event.target.value)
          }
        )
      ] }) }),
      errors.maxAspectRatio && /* @__PURE__ */ jsx("div", { style: ERROR, children: errors.maxAspectRatio })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: ROW, children: [
      /* @__PURE__ */ jsx(TypedField, { label: t("options.screen_orientation"), children: /* @__PURE__ */ jsxs("div", { style: STACK, children: [
        /* @__PURE__ */ jsx(CheckboxLine, { checked: !!orientation.portrait, label: t("options.portrait"), tooltip: t("tips.orientation_portrait"), onChange: (checked) => setOrientation("portrait", checked) }),
        /* @__PURE__ */ jsx(CheckboxLine, { checked: !!orientation.landscapeLeft, label: t("options.landscape_left"), tooltip: t("tips.orientation_landscape_left"), onChange: (checked) => setOrientation("landscapeLeft", checked) }),
        /* @__PURE__ */ jsx(CheckboxLine, { checked: !!orientation.landscapeRight, label: t("options.landscape_right"), tooltip: t("tips.orientation_landscape_right"), onChange: (checked) => setOrientation("landscapeRight", checked) }),
        /* @__PURE__ */ jsx(CheckboxLine, { checked: !!orientation.upsideDown, label: t("options.upsideDown"), onChange: (checked) => setOrientation("upsideDown", checked) })
      ] }) }),
      errors.orientation && /* @__PURE__ */ jsx("div", { style: ERROR, children: errors.orientation })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: ROW, children: [
      /* @__PURE__ */ jsx(TypedField, { label: "Google Play Instant", tooltip: t("tips.google_play_instant"), children: /* @__PURE__ */ jsx(Checkbox, { checked: androidInstant, onCheckedChange: (checked) => set("androidInstant", !!checked) }) }),
      androidInstant && /* @__PURE__ */ jsxs("div", { style: INFO, children: [
        t("tips.when_enable_instant"),
        t("tips.apilevel_limit", { version: "23" })
      ] })
    ] }),
    androidInstant && /* @__PURE__ */ jsx(
      TextField,
      {
        label: t("options.intent_filter"),
        value: current.remoteUrl,
        placeholder: "https://www.cocos.com/assets",
        error: errors.remoteUrl,
        onChange: (next) => set("remoteUrl", next)
      }
    ),
    /* @__PURE__ */ jsx("div", { style: ROW, children: /* @__PURE__ */ jsx(TypedField, { label: "Built in Play Billing", tooltip: t("tips.google_play_billing"), children: /* @__PURE__ */ jsx(Checkbox, { checked: boolValue(current.googleBilling, true), onCheckedChange: (checked) => set("googleBilling", !!checked) }) }) }),
    /* @__PURE__ */ jsx("div", { style: ROW, children: /* @__PURE__ */ jsx(TypedField, { label: "Input SDK", tooltip: t("tips.input_sdk"), children: /* @__PURE__ */ jsx(Checkbox, { checked: boolValue(current.inputSDK), onCheckedChange: (checked) => set("inputSDK", !!checked) }) }) }),
    /* @__PURE__ */ jsx("div", { style: ROW, children: /* @__PURE__ */ jsx(TypedField, { label: "Compress .so files", tooltip: t("tips.compress_so_files"), children: /* @__PURE__ */ jsx(Checkbox, { checked: boolValue(current.isSoFileCompressed), onCheckedChange: (checked) => set("isSoFileCompressed", !!checked) }) }) })
  ] });
}
export {
  GooglePlayBuildView as default
};
