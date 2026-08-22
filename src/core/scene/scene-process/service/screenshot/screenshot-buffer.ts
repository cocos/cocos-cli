import { gfx } from 'cc';

const SCREENSHOT_RENDER_TIMEOUT_MS = 10_000;

/**
 * 截图专用离屏渲染缓冲。
 *
 * 复用 service/preview/buffer.ts 中已验证的离屏窗口 + gl.readPixels 读回思路。
 * 关键点：本类只接收由上层 ScreenshotService 临时创建、完全自持的相机栈，
 * 绝不触碰运行中的编辑器相机 / 场景相机。渲染完毕后由上层销毁这些临时相机，
 * 因此不会像旧实现那样把 live 相机指向离屏窗口后残留在渲染管线里，导致下一帧
 * `ForwardPipeline.getRenderPass` 读到 null 帧缓冲而崩溃。
 *
 * 本类只负责：
 *   1. 创建/复用一个 isOffscreen 的渲染窗口；
 *   2. 把传入的临时相机切到该窗口渲一帧（tempWindow + repaint）；
 *   3. 读回帧缓冲像素（含垂直翻转 / BGRA 处理），返回 RGBA。
 */
export interface IReadbackResult {
    width: number;
    height: number;
    /** RGBA，长度 = width * height * 4 */
    buffer: Uint8Array;
}

export interface IScreenshotRenderCamera {
    comp: any;
    cam: any;
}

export class ScreenshotBuffer {
    private _name: string;
    private device = cc.director.root!.device;
    private width = 0;
    private height = 0;
    private data: Uint8Array = new Uint8Array(0);
    private window: any = null;
    private regions = [new gfx.BufferTextureCopy()];

    private readonly needInvertGFXApi = [
        gfx.API.GLES2,
        gfx.API.GLES3,
        gfx.API.WEBGL,
        gfx.API.WEBGL2,
    ];

    private static readonly indexOfRGBA = [0, 1, 2, 3];
    private static readonly indexOfBGRA = [2, 1, 0, 3];

    constructor(name = 'screenshot') {
        this._name = name;
    }

    /** 确保离屏窗口存在并匹配目标尺寸 */
    private ensureWindow(width: number, height: number) {
        width = Math.max(1, Math.floor(width));
        height = Math.max(1, Math.floor(height));

        if (!this.window) {
            this.createWindow(width, height);
        } else if (width !== this.width || height !== this.height) {
            this.window.resize(width, height);
        }

        this.width = width;
        this.height = height;
        this.data = new Uint8Array(this.width * this.height * 4);
        this.regions[0].texExtent.width = this.width;
        this.regions[0].texExtent.height = this.height;
    }

    private createWindow(width: number, height: number) {
        const root = cc.director.root!;
        const swapchain = root.mainWindow?.swapchain;
        const swapchainColorFormat = swapchain?.colorTexture?.format;
        const swapchainDepthFormat = swapchain?.depthStencilTexture?.format;
        // headless 场景进程的 swapchain 纹理可能存在，但 format 仍是 UNKNOWN。
        // RenderWindow 遇到 UNKNOWN 深度格式不会创建 depthStencilTexture，
        // 而 legacy ForwardPipeline 会无条件读取该附件并在渲染时崩溃。
        const colorFormat = swapchainColorFormat != null && swapchainColorFormat !== gfx.Format.UNKNOWN
            ? swapchainColorFormat
            : gfx.Format.RGBA8;
        const depthStencilFormat = swapchainDepthFormat != null && swapchainDepthFormat !== gfx.Format.UNKNOWN
            ? swapchainDepthFormat
            : gfx.Format.DEPTH_STENCIL;
        const renderPassInfo = new gfx.RenderPassInfo(
            [new gfx.ColorAttachment(colorFormat)],
            new gfx.DepthStencilAttachment(depthStencilFormat),
        );
        renderPassInfo.colorAttachments[0].barrier = root.device.getGeneralBarrier(
            new gfx.GeneralBarrierInfo(0, gfx.AccessFlagBit.FRAGMENT_SHADER_READ_TEXTURE),
        );
        this.window = root.createWindow({
            title: this._name,
            width,
            height,
            renderPassInfo,
            isOffscreen: true,
        });
        if (!this.window?.framebuffer?.colorTextures?.[0] || !this.window.framebuffer.depthStencilTexture) {
            const invalidWindow = this.window;
            this.window = null;
            if (invalidWindow) {
                root.destroyWindow(invalidWindow);
            }
            throw new Error('创建截图离屏窗口失败：framebuffer 颜色或深度附件不可用。');
        }
    }

    get renderWindow() {
        return this.window;
    }

    /**
     * 把上层自持的临时相机栈渲染到同一个离屏窗口并读回合成像素。
     *
     * @param renderScene 当前场景的 renderScene（cam 需加入其中才能看到场景内容）
     * @param cameras     按 priority 升序排列的临时相机
     */
    async render(
        renderScene: any,
        cameras: IScreenshotRenderCamera[],
        width: number,
        height: number,
    ): Promise<IReadbackResult> {
        if (this.device.gfxAPI === gfx.API.UNKNOWN) {
            throw new Error('截图不可用：无头 WebGL 初始化失败，场景进程已降级为 EmptyDevice。请检查 gl/@napi-rs/canvas 原生依赖和图形运行环境。');
        }
        if (!cameras.length) {
            throw new Error('截图不可用：没有可用于离屏渲染的相机。');
        }
        this.ensureWindow(width, height);
        const currWindow = this.window;

        // 先把全部相机指向同一离屏窗口，再启用并触发一帧。RenderWindow 会按
        // priority 排序，因此 DEPTH_ONLY / DONT_CLEAR 的 UI 相机会叠加在主相机之上。
        // 若在指向离屏窗口前启用，_activate/onEnable 会把它挂到 mainWindow，触发 framebuffer 错误。
        for (const { comp, cam } of cameras) {
            if (renderScene && !cam.scene) {
                renderScene.addCamera(cam);
            }
            cam.isWindowSize = false;
            cam.changeTargetWindow(currWindow);
            if (cam.width !== this.width || cam.height !== this.height) {
                cam.resize(this.width, this.height);
            }
            comp.enabled = true;
            cam.enabled = true;
            cam.update(true);
        }

        const root = cc.director.root!;
        const prevTempWindow = (root as any).tempWindow;
        (root as any).tempWindow = currWindow;

        // 强制在编辑模式下渲染一帧
        const engine: any = (await import('../core/decorator')).Service.Engine;
        return await new Promise<IReadbackResult>((resolve, reject) => {
            let settled = false;
            let timeout: ReturnType<typeof setTimeout> | undefined;

            const cleanup = () => {
                cc.director.off(cc.Director.EVENT_AFTER_DRAW, onAfterDraw);
                if (timeout) {
                    clearTimeout(timeout);
                }
                (root as any).tempWindow = prevTempWindow;
            };

            const onAfterDraw = () => {
                if (settled) return;
                settled = true;
                cleanup();
                try {
                    resolve(this.copyFrameBuffer());
                } catch (error) {
                    reject(error);
                }
            };
            cc.director.once(cc.Director.EVENT_AFTER_DRAW, onAfterDraw);
            timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                cleanup();
                reject(new Error(
                    `截图渲染超时（${SCREENSHOT_RENDER_TIMEOUT_MS}ms）：未收到 EVENT_AFTER_DRAW。`,
                ));
            }, SCREENSHOT_RENDER_TIMEOUT_MS);
            try {
                if (typeof engine.forceRepaintInEditMode === 'function') {
                    engine.forceRepaintInEditMode();
                } else {
                    void engine.repaintInEditMode?.();
                }
            } catch (error) {
                if (settled) return;
                settled = true;
                cleanup();
                reject(error);
            }
        });
    }

    private copyFrameBuffer(): IReadbackResult {
        const result: IReadbackResult = { width: this.width, height: this.height, buffer: this.data };
        const window = this.window;
        if (!window || !window.framebuffer) {
            return result;
        }

        const destBuffer = new Uint8Array(this.data.buffer);
        const colorTex = window.framebuffer.colorTextures[0];
        if (colorTex) {
            // Use the gfx API so its WebGL state cache stays synchronized.
            // Binding a raw temporary FBO here leaves the cache pointing at a
            // framebuffer that is no longer bound and breaks later frames.
            this.device.copyTextureToBuffers(colorTex, [destBuffer], this.regions);
        }

        this.formatBuffer(
            this.data,
            this.needInvertGFXApi.includes(this.device.gfxAPI),
            this.device.gfxAPI === gfx.API.METAL,
        );
        return result;
    }

    /** 垂直翻转 +（Metal 下）BGRA→RGBA，逻辑与 PreviewBuffer.formatBuffer 一致 */
    private formatBuffer(buffer: Uint8Array, needInvert: boolean, conversionBGRA: boolean) {
        if (!needInvert) {
            return buffer;
        }
        const indexArr = conversionBGRA ? ScreenshotBuffer.indexOfBGRA : ScreenshotBuffer.indexOfRGBA;
        const tmp = { r: 0, g: 0, b: 0, a: 0 };

        for (let w = 0; w < this.width; w++) {
            for (let h = 0; h < this.height / 2; h++) {
                const startIndex = (h * this.width + w) * 4;
                const invertIndex = ((this.height - 1 - h) * this.width + w) * 4;

                tmp.r = buffer[startIndex + indexArr[0]];
                tmp.g = buffer[startIndex + indexArr[1]];
                tmp.b = buffer[startIndex + indexArr[2]];
                tmp.a = buffer[startIndex + indexArr[3]];

                buffer[startIndex + 0] = buffer[invertIndex + indexArr[0]];
                buffer[startIndex + 1] = buffer[invertIndex + indexArr[1]];
                buffer[startIndex + 2] = buffer[invertIndex + indexArr[2]];
                buffer[startIndex + 3] = buffer[invertIndex + indexArr[3]];

                buffer[invertIndex + 0] = tmp.r;
                buffer[invertIndex + 1] = tmp.g;
                buffer[invertIndex + 2] = tmp.b;
                buffer[invertIndex + 3] = tmp.a;
            }
        }
        return buffer;
    }

    destroy() {
        if (this.window) {
            cc.director.root!.destroyWindow(this.window);
            this.window = null;
        }
    }
}
