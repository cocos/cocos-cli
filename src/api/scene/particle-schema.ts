/**
 * Runtime schemas for the public AI/MCP particle-system operations.
 *
 * 对应 https://docs.cocos.com/creator/4.0/manual/en/particle-system/
 * 与 cocos-editor ParticleManager 暴露给 float-window / inspector 的能力。
 */
import { z } from 'zod';

/** 粒子组件标识：节点路径或组件 uuid 二选一 */
export const SchemaParticleIdentifier = z
    .object({
        /** 粒子组件所在节点的路径，如 'Canvas/Particles' */
        nodePath: z.string().min(1).optional().describe('Path of the node holding the cc.ParticleSystem component, e.g. "Canvas/Particles"'),
        /** 粒子组件的 uuid（优先于 nodePath） */
        uuid: z.string().min(1).optional().describe('UUID of the cc.ParticleSystem component (takes precedence over nodePath)'),
    })
    .refine((value) => Boolean(value.nodePath || value.uuid), {
        message: 'Either nodePath or uuid is required.',
    })
    .describe('Particle system identifier: nodePath or uuid');

/** queryPlayInfo / setPlaySpeed 需要指定粒子组件 */
export const SchemaParticleSpeed = z
    .object({
        nodePath: z.string().min(1).optional().describe('Path of the node holding the cc.ParticleSystem component'),
        uuid: z.string().min(1).optional().describe('UUID of the cc.ParticleSystem component (takes precedence over nodePath)'),
        /** 播放速度倍率，1 为正常速度 */
        speed: z.number().finite().min(0).describe('Simulation speed multiplier, 1 = normal speed'),
    })
    .refine((value) => Boolean(value.nodePath || value.uuid), {
        message: 'Either nodePath or uuid is required.',
    })
    .describe('Particle system speed options');

/** 粒子运行时信息 */
export const SchemaParticlePlayInfo = z
    .object({
        speed: z.number().describe('Current simulation speed multiplier'),
        time: z.number().describe('Elapsed simulation time in seconds'),
        particle: z.number().int().min(0).describe('Number of alive particles'),
        isPlaying: z.boolean().describe('Whether the particle system is currently playing'),
        /** 找不到组件时返回 null */
        found: z.boolean().optional().describe('Whether the particle component was located'),
    })
    .describe('Particle system runtime info');

/** play/pause/stop/restart 这类操作作用于当前选中的粒子组件 */
export const SchemaParticleAction = z
    .object({
        /**
         * 是否仅作用于指定的粒子组件。未提供时，作用于当前选中的所有粒子组件。
         */
        nodePath: z.string().min(1).optional().describe('Optional path of the node holding the cc.ParticleSystem component. When omitted, the action applies to all currently selected particle systems.'),
        uuid: z.string().min(1).optional().describe('Optional UUID of the cc.ParticleSystem component (takes precedence over nodePath). When omitted, the action applies to all currently selected particle systems.'),
    })
    .describe('Particle system action options');

export const SchemaParticleActionResult = z
    .object({
        action: z.string().describe('The action that was performed'),
        applied: z.boolean().describe('Whether the action was applied to at least one particle system'),
    })
    .describe('Particle system action result');

export type TParticleIdentifier = z.infer<typeof SchemaParticleIdentifier>;
export type TParticleSpeed = z.infer<typeof SchemaParticleSpeed>;
export type TParticlePlayInfo = z.infer<typeof SchemaParticlePlayInfo>;
export type TParticleAction = z.infer<typeof SchemaParticleAction>;
export type TParticleActionResult = z.infer<typeof SchemaParticleActionResult>;
