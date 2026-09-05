/**
 * Public AI/MCP facade for particle-system operations.
 *
 * 对照 https://docs.cocos.com/creator/4.0/manual/en/particle-system/
 * 与 cocos-editor ParticleManager 暴露给 float-window / inspector 的能力：
 *   - play / pause / stop / restart
 *   - setPlaySpeed
 *   - queryPlayInfo
 */
import { COMMON_STATUS, CommonResultType, getCommonErrorStatus } from '../base/schema-base';
import { description, param, result, title, tool } from '../decorator/decorator.js';
import { Scene } from '../../core/scene';
import {
    SchemaParticleIdentifier,
    SchemaParticleSpeed,
    SchemaParticlePlayInfo,
    SchemaParticleAction,
    SchemaParticleActionResult,
    TParticleIdentifier,
    TParticleSpeed,
    TParticlePlayInfo,
    TParticleAction,
    TParticleActionResult,
} from './particle-schema';

export class ParticleApi {
    /**
     * Query runtime info of a particle system.
     */
    @tool('particle-query-play-info')
    @title('Query particle system runtime info')
    @description('Get the current simulation speed, elapsed time, alive particle count and playing state of a cc.ParticleSystem component identified by nodePath or uuid.')
    @result(SchemaParticlePlayInfo)
    async queryPlayInfo(@param(SchemaParticleIdentifier) options: TParticleIdentifier): Promise<CommonResultType<TParticlePlayInfo>> {
        try {
            const uuid = await this._resolveUuid(options);
            if (!uuid) {
                return { code: COMMON_STATUS.NOT_FOUND, reason: `Particle component not found for: ${options.uuid || options.nodePath}` };
            }
            const info = await Scene.Particle.queryPlayInfo(uuid);
            if (!info) {
                return { code: COMMON_STATUS.NOT_FOUND, reason: `Particle component not found: ${options.uuid || options.nodePath}` };
            }
            return { code: COMMON_STATUS.SUCCESS, data: { ...info, found: true } };
        } catch (e) {
            return { code: getCommonErrorStatus(e), reason: e instanceof Error ? e.message : String(e) };
        }
    }

    /**
     * Set the simulation speed of a particle system.
     */
    @tool('particle-set-play-speed')
    @title('Set particle system simulation speed')
    @description('Set the simulation speed multiplier (1 = normal speed) of a cc.ParticleSystem component identified by nodePath or uuid.')
    @result(SchemaParticlePlayInfo)
    async setPlaySpeed(@param(SchemaParticleSpeed) options: TParticleSpeed): Promise<CommonResultType<TParticlePlayInfo>> {
        try {
            const uuid = await this._resolveUuid(options);
            if (!uuid) {
                return { code: COMMON_STATUS.NOT_FOUND, reason: `Particle component not found for: ${options.uuid || options.nodePath}` };
            }
            await Scene.Particle.setPlaySpeed(uuid, options.speed);
            const info = await Scene.Particle.queryPlayInfo(uuid);
            if (!info) {
                return { code: COMMON_STATUS.NOT_FOUND, reason: `Particle component not found: ${options.uuid || options.nodePath}` };
            }
            return { code: COMMON_STATUS.SUCCESS, data: { ...info, found: true } };
        } catch (e) {
            return { code: getCommonErrorStatus(e), reason: e instanceof Error ? e.message : String(e) };
        }
    }

    /**
     * Play the selected particle systems.
     */
    @tool('particle-play')
    @title('Play particle systems')
    @description('Play the currently selected cc.ParticleSystem components. When a nodePath or uuid is provided, ensure that component is selected first.')
    @result(SchemaParticleActionResult)
    async play(@param(SchemaParticleAction) options: TParticleAction): Promise<CommonResultType<TParticleActionResult>> {
        return this._runAction('play', options, async () => { await Scene.Particle.play(); });
    }

    /**
     * Pause the selected particle systems.
     */
    @tool('particle-pause')
    @title('Pause particle systems')
    @description('Pause the currently selected cc.ParticleSystem components. When a nodePath or uuid is provided, ensure that component is selected first.')
    @result(SchemaParticleActionResult)
    async pause(@param(SchemaParticleAction) options: TParticleAction): Promise<CommonResultType<TParticleActionResult>> {
        return this._runAction('pause', options, async () => { await Scene.Particle.pause(); });
    }

    /**
     * Stop the selected particle systems.
     */
    @tool('particle-stop')
    @title('Stop particle systems')
    @description('Stop the currently selected cc.ParticleSystem components. When a nodePath or uuid is provided, ensure that component is selected first.')
    @result(SchemaParticleActionResult)
    async stop(@param(SchemaParticleAction) options: TParticleAction): Promise<CommonResultType<TParticleActionResult>> {
        return this._runAction('stop', options, async () => { await Scene.Particle.stop(); });
    }

    /**
     * Restart the selected particle systems.
     */
    @tool('particle-restart')
    @title('Restart particle systems')
    @description('Restart the currently selected cc.ParticleSystem components (stop then play). When a nodePath or uuid is provided, ensure that component is selected first.')
    @result(SchemaParticleActionResult)
    async restart(@param(SchemaParticleAction) options: TParticleAction): Promise<CommonResultType<TParticleActionResult>> {
        return this._runAction('restart', options, async () => { await Scene.Particle.restart(); });
    }

    private async _runAction(
        action: string,
        options: TParticleAction,
        fn: () => Promise<void>,
    ): Promise<CommonResultType<TParticleActionResult>> {
        try {
            // 行为作用于当前选中的粒子组件集合。若调用方指定了具体组件，
            // 先选中它的节点，再执行 play/pause/stop/restart，
            // 与 cocos-editor float-window 按钮行为一致。
            if (options.nodePath || options.uuid) {
                const nodePath = await this._resolveNodePath(options);
                if (!nodePath) {
                    return { code: COMMON_STATUS.NOT_FOUND, reason: `Particle component not found for: ${options.uuid || options.nodePath}` };
                }
                // Selection 服务以节点 path 进行选择。直接通过 RPC 调用，
                // 因为 Scene 代理未聚合 Selection 模块。
                try {
                    const { Rpc } = await import('../../core/scene/main-process/rpc');
                    await Rpc.getInstance().request('Selection', 'select', [nodePath]);
                } catch (selectErr) {
                    // 选中失败不阻断播放行为，仅记录
                    console.warn('[ParticleApi] select before action failed:', selectErr);
                }
            }
            await fn();
            return { code: COMMON_STATUS.SUCCESS, data: { action, applied: true } };
        } catch (e) {
            return { code: getCommonErrorStatus(e), reason: e instanceof Error ? e.message : String(e) };
        }
    }

    /**
     * 解析粒子组件所在节点的路径。优先使用调用方传入的 nodePath；
     * 若仅提供 uuid，则通过组件 uuid 反查节点，再由节点 uuid 取节点路径。
     */
    private async _resolveNodePath(options: { uuid?: string; nodePath?: string }): Promise<string | null> {
        if (options.nodePath) {
            return options.nodePath;
        }
        if (options.uuid) {
            // 组件 uuid 与节点 uuid 相同（cc 引擎约定：组件继承自 CCObject，其 uuid 即节点 uuid）。
            // Selection 服务以节点 path 进行选择，故需要把 uuid 转为 path。
            // NodeProxy 未暴露 getPathByUuid，直接通过 RPC 调用。
            try {
                const { Rpc } = await import('../../core/scene/main-process/rpc');
                const path = await Rpc.getInstance().request('Node', 'getPathByUuid', [options.uuid]);
                if (typeof path === 'string' && path.length > 0) {
                    return path;
                }
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    /**
     * 将 nodePath/uuid 标识解析为粒子组件 uuid。优先使用 uuid。
     */
    private async _resolveUuid(options: { uuid?: string; nodePath?: string }): Promise<string | null> {
        if (options.uuid) {
            return options.uuid;
        }
        if (options.nodePath) {
            // 组件路径 = 节点路径 + 组件类型，与 scene-query-component 约定一致
            const componentPath = `${options.nodePath}/cc.ParticleSystem`;
            const componentInfo = await Scene.Component.query({ path: componentPath });
            if (componentInfo && typeof componentInfo === 'object') {
                // IComponentInfo.value.uuid.value 或直接 uuid 字段，兼容两种 dump 结构
                const anyInfo = componentInfo as any;
                return anyInfo?.value?.uuid?.value ?? anyInfo?.uuid ?? null;
            }
        }
        return null;
    }
}
