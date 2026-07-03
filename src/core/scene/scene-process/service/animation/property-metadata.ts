import { CCClass, Component, Node, js } from 'cc';
import type {
    IAnimationPropertyInfo,
} from '../../../common';
import { getConstructor, getTypeName } from '../dump/utils';
import type { IAnimationPropertyMetadata } from './property-curve';

export function queryComponentAnimableProperties(component: Component): IAnimationPropertyInfo[] {
    const ctor = component.constructor as any;
    const props = Array.isArray(ctor.__props__) ? ctor.__props__ as string[] : [];
    const compName = js.getClassName(component);
    const result: IAnimationPropertyInfo[] = [];
    for (const prop of props) {
        if (prop === 'type' || prop === '__scriptAsset') {
            continue;
        }
        const attr = queryPropertyAttr(component as any, prop);
        if (!attr || attr.readonly || !isAnimablePropertyAttr(attr)) {
            continue;
        }
        const type = queryAnimablePropertyTypeFromAttr(component as any, prop, attr);
        if (!type) {
            continue;
        }
        result.push({
            name: prop,
            key: `${compName}.${prop}`,
            displayName: `${compName}.${prop}`,
            type: createAnimationPropertyType(type, attr),
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
        type: createAnimationPropertyType(type, attr),
        valueCtor: typeof attr.ctor === 'function' ? attr.ctor as new () => unknown : undefined,
    };
}

function queryAnimablePropertyTypeFromAttr(component: Record<string, unknown>, prop: string, attr: any): string {
    const value = component[prop];
    if (!attr.ctor && attr.type) {
        return normalizeAttrType(attr.type);
    }

    const ctor = getConstructor(value, attr);
    if (isNodeOrComponentCtor(ctor)) {
        return '';
    }
    const type = getTypeName(ctor);
    if (!type || type === 'Object' || type === 'Unknown') {
        return '';
    }
    return normalizePrimitiveTypeName(type);
}

function isAnimablePropertyAttr(attr: any): boolean {
    if (isNodeOrComponentType(attr.type) || isNodeOrComponentCtor(attr.ctor)) {
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

function normalizeAttrType(type: unknown): string {
    if (type instanceof (CCClass.Attr as any).PrimitiveType) {
        return normalizePrimitiveTypeName((type as { name: string }).name);
    }
    if (typeof type === 'function') {
        return getTypeName(type);
    }
    return normalizePrimitiveTypeName(String(type || ''));
}

function normalizePrimitiveTypeName(type: string): string {
    switch (type) {
        case 'Number':
        case 'Float':
        case 'Integer':
            return 'cc.Number';
        case 'Boolean':
            return 'cc.Boolean';
        case 'String':
            return 'cc.String';
        default:
            return type;
    }
}

function createAnimationPropertyType(type: string, attr: any): IAnimationPropertyInfo['type'] {
    const result: IAnimationPropertyInfo['type'] = { value: type };
    if (type === 'Enum' && Array.isArray(attr.enumList)) {
        result.enumList = attr.enumList.map((item: any) => ({
            name: String(item.name ?? ''),
            value: Number(item.value),
        }));
    }
    return result;
}

function isNodeOrComponentCtor(ctor: unknown): boolean {
    if (typeof ctor !== 'function') {
        return false;
    }
    return ctor === Node || ctor === Component || ctor.prototype instanceof Node || ctor.prototype instanceof Component;
}

function isNodeOrComponentType(type: unknown): boolean {
    if (isNodeOrComponentCtor(type)) {
        return true;
    }
    return typeof type === 'string' && (type === js.getClassName(Node) || type === js.getClassName(Component));
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
