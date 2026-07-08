import {
    Animation,
    CCClass,
    Component,
    Node,
    animation,
} from 'cc';
import { isAnimationAssetValue } from './asset-value';
import { isWritableProperty } from './property-writability';

const NODE_SAMPLED_PROPERTIES = ['active', 'position', 'rotation', 'scale'] as const;

export interface IAnimationSampledNodeState {
    uuid: string;
    properties: Record<string, unknown>;
    components: IAnimationSampledComponentState[];
    children: IAnimationSampledNodeState[];
}

interface IAnimationSampledComponentState {
    uuid: string;
    properties: Record<string, unknown>;
}

export function captureAnimationSampledState(rootNode: Node): IAnimationSampledNodeState {
    return {
        uuid: rootNode.uuid,
        properties: captureNodeProperties(rootNode),
        components: rootNode.components
            .map(captureComponentState)
            .filter((state): state is IAnimationSampledComponentState => Boolean(state)),
        children: rootNode.children.map(captureAnimationSampledState),
    };
}

export async function restoreAnimationSampledState(rootNode: Node, state: IAnimationSampledNodeState): Promise<void> {
    restoreProperties(rootNode as any, state.properties);

    for (const componentState of state.components) {
        const component = rootNode.components.find((item) => item.uuid === componentState.uuid);
        if (component) {
            restoreProperties(component as any, componentState.properties);
            (component as any).onRestore?.();
        }
    }

    for (const childState of state.children) {
        const child = rootNode.children.find((item) => item.uuid === childState.uuid);
        if (child) {
            await restoreAnimationSampledState(child, childState);
        }
    }
}

function captureNodeProperties(node: Node): Record<string, unknown> {
    const properties: Record<string, unknown> = {};
    for (const key of NODE_SAMPLED_PROPERTIES) {
        properties[key] = cloneSampledValue((node as any)[key]);
    }
    return properties;
}

function captureComponentState(component: Component): IAnimationSampledComponentState | null {
    if (isAnimationComponent(component)) {
        return null;
    }

    const properties: Record<string, unknown> = {};
    const ctor = component.constructor as any;
    const props = Array.isArray(ctor.__props__) ? ctor.__props__ as string[] : [];
    for (const prop of props) {
        if (!(prop in component) || !isAnimatableComponentProperty(ctor, prop) || !canRestoreComponentProperty(component, prop)) {
            continue;
        }
        properties[prop] = cloneSampledValue((component as any)[prop]);
    }

    return {
        uuid: component.uuid,
        properties,
    };
}

function isAnimatableComponentProperty(ctor: Function, prop: string): boolean {
    if (prop === 'type' || prop === '__scriptAsset') {
        return false;
    }
    const attr = CCClass.attr(ctor, prop);
    return Boolean(attr && attr.animatable !== false && !attr.readonly);
}

function canRestoreComponentProperty(component: Component, prop: string): boolean {
    if (isWritableProperty(component, prop)) {
        return true;
    }
    const value = (component as any)[prop];
    return Boolean(value && typeof value === 'object' && typeof value.set === 'function');
}

function isAnimationComponent(component: Component): boolean {
    const controllerCtor = (animation as any).AnimationController;
    return component instanceof Animation || Boolean(controllerCtor && component instanceof controllerCtor);
}

function restoreProperties(target: Record<string, any>, properties: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(properties)) {
        assignSampledValue(target, key, value);
    }
}

function assignSampledValue(target: Record<string, any>, key: string, value: unknown): void {
    const cloned = cloneSampledValue(value);
    const writable = isWritableProperty(target, key);
    let assignError: unknown;
    if (writable) {
        try {
            target[key] = cloned;
            return;
        } catch (error) {
            assignError = error;
            // Fall back to in-place ValueType restore below.
        }
    }

    const current = target[key];
    if (current && typeof current === 'object' && typeof current.set === 'function' && cloned && typeof cloned === 'object') {
        current.set(cloned);
        return;
    }
    if (assignError) {
        throw assignError;
    }
}

function cloneSampledValue<T>(value: T): T {
    if (value === null || value === undefined || typeof value !== 'object') {
        return value;
    }
    if (isAnimationAssetValue(value)) {
        return value;
    }
    if (typeof (value as any).clone === 'function') {
        return (value as any).clone();
    }
    if (Array.isArray(value)) {
        return value.map((item) => cloneSampledValue(item)) as T;
    }
    if (isPlainObject(value)) {
        const result: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value)) {
            result[key] = cloneSampledValue(item);
        }
        return result as T;
    }
    return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
