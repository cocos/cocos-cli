import NativePackTool, { CocosParams, InternalNativePlatform } from './base/default';

export type ISupportPlatform = 'windows';

const platformPackToolMap: Record<string, string> = {
    windows: './platforms/windows',
};

export class NativePackToolManager {
    private PackToolMap: Map<InternalNativePlatform, NativePackTool> = new Map();
    static platformToPackTool: Map<InternalNativePlatform, typeof NativePackTool> = new Map();

    static register(platform: InternalNativePlatform, tool: typeof NativePackTool) {
        NativePackToolManager.platformToPackTool.set(platform, tool);
    }

    private async getTool(platform: InternalNativePlatform): Promise<NativePackTool> {
        const handler = this.PackToolMap.get(platform);
        if (handler) {
            return handler;
        }
        const PackTool = await NativePackToolManager.getPackTool(platform);
        const tool = new (PackTool as new () => NativePackTool)();
        this.PackToolMap.set(platform, tool);
        return tool;
    }
    async register(params:CocosParams<Object>) {
        const tool = await this.getTool(params.platform);
        tool.init(params);
        return tool;
    }

    async destory(platform: InternalNativePlatform) {
        this.PackToolMap.delete(platform);
    }

    static async getPackTool(platform: InternalNativePlatform): Promise<typeof NativePackTool> {
        if (NativePackToolManager.platformToPackTool.has(platform)) {
            return NativePackToolManager.platformToPackTool.get(platform)!;
        }
        if (!platformPackToolMap[platform]) {
            throw new Error(`No pack tool for platform ${platform}}`);
        }
        const PackTool = (await import(platformPackToolMap[platform])).default;
        NativePackToolManager.platformToPackTool.set(platform, PackTool);
        return PackTool;
    }

    async openWithIDE(platform: InternalNativePlatform, projectPath: string, IDEDir?: string) {
        const PackTool = await NativePackToolManager.getPackTool(platform);
        await PackTool.openWithIDE!(projectPath, IDEDir);
        return PackTool;
    }

    async create(params:CocosParams<Object>): Promise<NativePackTool> {
        const tool = await this.register(params);
        await tool.create();
        return tool;
    }

    async generate(params:CocosParams<Object>): Promise<NativePackTool> {
        const tool = await this.register(params);
        await tool.generate!();
        return tool;
    }

    async make(params:CocosParams<Object>): Promise<NativePackTool> {
        const tool = await this.register(params);
        await tool.make!();
        return tool;
    }

    async run(params:CocosParams<Object>): Promise<NativePackTool> {
        const tool = await this.register(params);
        await tool.run!();
        return tool;
    }
}

const nativePackToolMg = new NativePackToolManager();

export default nativePackToolMg;
