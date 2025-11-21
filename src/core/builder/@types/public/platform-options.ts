import { IBuildTaskOption } from "./options";


// 主要为了生成 schema
export type WebDesktopBuildOptions = IBuildTaskOption<'web-desktop'>;
export type WebMobileBuildOptions = IBuildTaskOption<'web-mobile'>;