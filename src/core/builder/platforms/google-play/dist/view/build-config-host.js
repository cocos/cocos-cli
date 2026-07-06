"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/view/build-config-host.ts
var build_config_host_exports = {};
__export(build_config_host_exports, {
  activate: () => activate
});
module.exports = __toCommonJS(build_config_host_exports);
var fs = __toESM(require("node:fs"));
var path = __toESM(require("node:path"));
var ICON_DPI_LIST = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192
};
function currentLang() {
  let locale = "en";
  try {
    const cfg = process.env.VSCODE_NLS_CONFIG;
    if (cfg) {
      locale = JSON.parse(cfg).locale || locale;
    }
  } catch {
  }
  return locale.toLowerCase().startsWith("zh") ? "zh" : "en";
}
var cache;
function loadBundle() {
  const lang = currentLang();
  if (cache?.lang === lang) {
    return cache.bundle;
  }
  let bundle = {};
  try {
    const file = path.join(__dirname, "..", "..", "i18n", `${lang}.js`);
    delete require.cache[require.resolve(file)];
    bundle = require(file) ?? {};
  } catch {
    bundle = {};
  }
  cache = { lang, bundle };
  return bundle;
}
function lookup(bundle, key) {
  let cur = bundle;
  for (const seg of key.split(".")) {
    if (cur && typeof cur === "object" && seg in cur) {
      cur = cur[seg];
    } else {
      return void 0;
    }
  }
  return typeof cur === "string" ? cur : void 0;
}
function substitute(text, sub) {
  if (!sub) {
    return text;
  }
  return text.replace(/%?\{(\w+)\}/g, (match, key) => key in sub ? String(sub[key]) : match);
}
function existsDir(filePath) {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}
function findSdkPath() {
  const envSdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (envSdk && existsDir(envSdk)) {
    return envSdk;
  }
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    const defaultSdkPath = path.join(process.env.LOCALAPPDATA, "Android", "Sdk");
    if (existsDir(defaultSdkPath)) {
      return defaultSdkPath;
    }
  }
  if (process.platform === "darwin" && process.env.HOME) {
    const defaultSdkPath = path.join(process.env.HOME, "Library", "Android", "sdk");
    if (existsDir(defaultSdkPath)) {
      return defaultSdkPath;
    }
  }
  return "";
}
function getAPILevel(apiLevelStr) {
  const match = (apiLevelStr || "").match(/^android-([0-9]+)$/);
  return match ? Number.parseInt(match[1], 10) : -1;
}
function getAndroidAPILevels() {
  const sdkPath = findSdkPath();
  if (!sdkPath) {
    return [];
  }
  const platformPath = path.join(sdkPath, "platforms");
  if (!existsDir(platformPath)) {
    return [];
  }
  return fs.readdirSync(platformPath).filter((name) => {
    const apiLevel = getAPILevel(name);
    return apiLevel >= 19 && existsDir(path.join(platformPath, name));
  }).map((name) => Number.parseInt(name.split("-")[1], 10)).sort((a, b) => b - a);
}
function workspaceRootCandidates() {
  return [
    process.cwd(),
    path.resolve(__dirname, "../../../../../../.."),
    path.resolve(__dirname, "../../../../../../../..")
  ];
}
function defaultIconRoot() {
  for (const root of workspaceRootCandidates()) {
    const candidate = path.join(root, "static", "assets", "google-play", "icons");
    if (existsDir(candidate)) {
      return candidate;
    }
  }
  return path.join(process.cwd(), "static", "assets", "google-play", "icons");
}
function getIconInfo(type, outputName, projectPath) {
  const base = type === "custom" && projectPath ? path.join(projectPath, "settings", "icons", outputName) : defaultIconRoot();
  let display = "";
  const list = Object.entries(ICON_DPI_LIST).map(([dirName, dpi]) => {
    const fileName = "ic_launcher.png";
    const iconPath = path.join(base, dirName, fileName);
    if (dirName === "mipmap-xxxhdpi") {
      display = `${iconPath}?timestamp=${Date.now()}`;
    }
    return { dirName, fileName, dpi, path: iconPath };
  });
  return { type, display, list };
}
function hasIcon(info) {
  return fs.existsSync(info.list[0].path);
}
function getDisplayCustomIcon(type, outputName, projectPath) {
  const info = getIconInfo(type, outputName, projectPath);
  if (!hasIcon(info)) {
    return getIconInfo("default", outputName, projectPath).display;
  }
  return info.display;
}
async function saveCustomIcon(source, outputName, projectPath) {
  const sharp = require("sharp");
  const info = getIconInfo("custom", outputName, projectPath);
  for (const item of info.list) {
    fs.mkdirSync(path.dirname(item.path), { recursive: true });
    await sharp(source).resize(item.dpi, item.dpi, { fit: "inside" }).withMetadata({ density: item.dpi }).toFile(item.path);
  }
  return info.display;
}
function activate(context) {
  context.registerMethod("getI18nBundle", () => loadBundle());
  context.registerMethod("t", (key, sub) => {
    const text = lookup(loadBundle(), key);
    return text === void 0 ? key : substitute(text, sub);
  });
  context.registerMethod("getAndroidAPILevels", () => getAndroidAPILevels());
  context.registerMethod("getDisplayCustomIcon", (type, outputName = "default", projectPath) => {
    return getDisplayCustomIcon(type, outputName, projectPath);
  });
  context.registerMethod("selectFile", async (filters) => {
    const vscode = require("vscode");
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters
    });
    return result?.[0]?.fsPath || "";
  });
  context.registerMethod("selectCustomIcon", async (outputName = "default", projectPath) => {
    const vscode = require("vscode");
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { Images: ["png"] },
      title: "Select Google Play icon"
    });
    const source = result?.[0]?.fsPath;
    if (!source || !projectPath) {
      return "";
    }
    return saveCustomIcon(source, outputName, projectPath);
  });
  context.registerMethod("saveCustomIcon", async (source, outputName = "default", projectPath) => {
    if (!source || !projectPath) {
      return "";
    }
    return saveCustomIcon(source, outputName, projectPath);
  });
  context.registerMethod("openProgramSettings", async () => {
    try {
      const vscode = require("vscode");
      await vscode.commands.executeCommand("workbench.action.openSettings", "android sdk");
      return true;
    } catch {
      return false;
    }
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate
});
