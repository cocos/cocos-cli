/**
 * 粒子系统服务接口，与 cocos-editor ParticleManager 对齐。
 * 负责管理粒子系统在编辑模式下的播放、停止、暂停、重启、
 * 播放速度与运行时信息查询等能力。
 *
 * 这些方法对应 cocos-editor 中 float-window / inspector
 * 通过 callSceneMethod 调用的 playParticle / pauseParticle /
 * stopParticle / restartParticle / setParticlePlaySpeed /
 * queryParticlePlayInfo 等场景方法。
 */

/**
 * queryPlayInfo 返回的粒子运行时数据
 */
export interface IParticlePlayInfo {
    /** 粒子系统的模拟速度 */
    speed: number;
    /** 当前已模拟的时间（秒，保留 2 位小数） */
    time: number;
    /** 当前存活的粒子数量 */
    particle: number;
    /** 是否正在播放 */
    isPlaying: boolean;
}

export interface IParticleService {
    /**
     * 请求粒子系统运行时的数据
     * @param uuid 粒子组件的 uuid
     */
    queryPlayInfo(uuid: string): IParticlePlayInfo | null;

    /**
     * 设置粒子的运行速度
     * @param uuid 组件的 uuid
     * @param speed 粒子组件的运行速度
     */
    setPlaySpeed(uuid: string, speed: number): void;

    /**
     * 播放选中的粒子，会递归查找父节点，直到找到非粒子组件的节点为止
     */
    play(): void;

    /**
     * 停止播放选中的粒子
     */
    stop(): void;

    /**
     * 暂停选中的粒子
     */
    pause(): void;

    /**
     * 重新开始播放选中的粒子
     */
    restart(): void;
}

/**
 * 对外暴露的公共方法集合（通过 RPC 可被主进程调用）。
 * 场景进程内部服务 IParticleService 是同步的，但跨进程 RPC 调用必须返回 Promise。
 */
export type IPublicParticleService = {
    queryPlayInfo(uuid: string): Promise<IParticlePlayInfo | null>;
    setPlaySpeed(uuid: string, speed: number): Promise<void>;
    play(): Promise<void>;
    stop(): Promise<void>;
    pause(): Promise<void>;
    restart(): Promise<void>;
};
