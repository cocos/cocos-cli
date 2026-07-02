import { CCClass, Component, Node, js } from 'cc';
import type {
    IAnimationPropertyInfo,
} from '../../../common';
import type { IAnimationPropertyMetadata } from './property-curve';

export function queryComponentAnimableProperties(component: Component): IAnimationPropertyInfo[] {
    const ctor = component.constructor as any;
    const props = Array.isArray(ctor.__props__) ? ctor.__props__ as string[] : [];
    const compName = js.getClassName(component);
    const result: IAnimationPropertyInfo[] = [];
    for (const prop of props) {
        const type = queryAnimablePropertyType(component as any, prop);
        if (!type) {
            continue;
        }
        result.push({
            name: prop,
            key: `${compName}.${prop}`,
            displayName: `${compName}.${prop}`,
            type: { value: type },
            menuName: `${compName}.${prop}`,
            comp: compName,
        });
    }
    return result;
}

export function queryAnimationPropertyMetadata(rootNode: Node, nodePath: string, propKey: string): IAnimationPropertyMetadata | null {
    const componentProperty = splitComponentPropertyKey(propKey);
    if (!componentProperty) {
        return null;
    }

    const node = nodePath ? rootNode.getChildByPath(nodePath) : rootNode;
    const component = node?.components.find((item) => js.getClassName(item) === componentProperty.comp);
    if (!component) {
        return null;
    }

    const attr = queryPropertyAttr(component as any, componentProperty.propName);
    if (!attr || attr.readonly || !isAnimablePropertyAttr(attr)) {
        return null;
    }
    const type = queryAnimablePropertyTypeFromAttr(component as any, componentProperty.propName, attr);
    if (!type) {
        return null;
    }
    return {
        type: { value: type },
        valueCtor: typeof attr.ctor === 'function' ? attr.ctor as new () => unknown : undefined,
    };
}

function queryAnimablePropertyType(component: Record<string, unknown>, prop: string): string {
    if (prop === 'type' || prop === '__scriptAsset') {
        return '';
    }
    const attr = queryPropertyAttr(component, prop);
    if (!attr || attr.readonly || !isAnimablePropertyAttr(attr)) {
        return '';
    }
    return queryAnimablePropertyTypeFromAttr(component, prop, attr);
}

function queryAnimablePropertyTypeFromAttr(component: Record<string, unknown>, prop: string, attr: any): string {
    const ctorType = queryAttrCtorType(attr);
    if (ctorType) {
        return ctorType;
    }
    const type = attr.type;
    if (typeof type === 'string') {
        return type;
    }
    if (type instanceof (CCClass.Attr as any).PrimitiveType) {
        return type.name;
    }
    if (typeof type === 'function') {
        return js.getClassName(type);
    }
    const value = component[prop];
    if (typeof value === 'number') {
        return 'cc.Number';
    }
    if (typeof value === 'boolean') {
        return 'cc.Boolean';
    }
    if (typeof value === 'string') {
        return 'cc.String';
    }
    if (value && typeof value === 'object') {
        return queryAnimableObjectPropertyType(value);
    }
    return '';
}

function queryAnimableObjectPropertyType(value: object): string {
    if (value instanceof Node || value instanceof Component || Array.isArray(value)) {
        return '';
    }
    const ctor = (value as { constructor?: Function }).constructor;
    if (!ctor || ctor === Object) {
        return '';
    }
    const type = js.getClassName(ctor);
    return type && type !== 'Object' ? type : '';
}

function isAnimablePropertyAttr(attr: any): boolean {
    if (attr.type === js.getClassName(Node)) {
        return false;
    }
    if (isNodeOrComponentCtor(attr.ctor)) {
        return false;
    }
    if (attr.animatable !== undefined) {
        return Boolean(attr.animatable);
    }
    return attr.visible === undefined ? true : Boolean(attr.visible);
}

function queryPropertyAttr(component: Record<string, unknown>, prop: string): any {
    return CCClass.attr(component as any, prop) || CCClass.attr((component as any).constructor, prop);
}

function queryAttrCtorType(attr: any): string {
    const ctor = attr?.ctor;
    if (typeof ctor !== 'function') {
        return '';
    }
    const type = js.getClassName(ctor);
    return type && type !== 'Object' ? type : '';
}

function isNodeOrComponentCtor(ctor: unknown): boolean {
    if (typeof ctor !== 'function') {
        return false;
    }
    return ctor === Node || ctor === Component || ctor.prototype instanceof Node || ctor.prototype instanceof Component;
}

function splitComponentPropertyKey(propKey: string): { comp: string; propName: string } | null {
    const index = propKey.lastIndexOf('.');
    if (index <= 0 || index === propKey.length - 1) {
        return null;
    }
    return {
        comp: propKey.slice(0, index),
        propName: propKey.slice(index + 1),
    };
}
