import { IPublicParticleService, IParticlePlayInfo } from '../../common';
import { Rpc } from '../rpc';

/**
 * 粒子系统服务代理：主进程通过 RPC 调用场景进程的 ParticleService。
 * 与 cocos-editor ParticleManager 对齐，覆盖 float-window / inspector
 * 需要的 play / pause / stop / restart / setPlaySpeed / queryPlayInfo 能力。
 */
export const ParticleProxy: IPublicParticleService = {
    queryPlayInfo(uuid: string): Promise<IParticlePlayInfo | null> {
        return Rpc.getInstance().request('Particle', 'queryPlayInfo', [uuid]);
    },
    setPlaySpeed(uuid: string, speed: number): Promise<void> {
        return Rpc.getInstance().request('Particle', 'setPlaySpeed', [uuid, speed]);
    },
    play(): Promise<void> {
        return Rpc.getInstance().request('Particle', 'play');
    },
    stop(): Promise<void> {
        return Rpc.getInstance().request('Particle', 'stop');
    },
    pause(): Promise<void> {
        return Rpc.getInstance().request('Particle', 'pause');
    },
    restart(): Promise<void> {
        return Rpc.getInstance().request('Particle', 'restart');
    },
};
