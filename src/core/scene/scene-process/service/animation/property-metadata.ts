import { CCClass, Component, Node, Renderer, js } from 'cc';
import type {
    IAnimationPropertyInfo,
} from '../../../common';
import { getConstructor, getTypeName } from '../dump/utils';
import type { IAnimationPropertyMetadata } from './property-curve';
import {
    parseMaterialUniformPropertyKey,
    queryMaterialUniformTarget,
    queryMaterialUniformType,
} from './material-uniform';
import { isWritableProperty } from './property-writability';

export function queryComponentAnimableProperties(component: Component): IAnimationPropertyInfo[] {
    const ctor = component.constructor as any;
    const props = Array.isArray(ctor.__props__) ? ctor.__props__ as string[] : [];
    const compName = js.getClassName(component);
    const result: IAnimationPropertyInfo[] = [];
    for (const prop of props) {
        if (prop === '__scriptAsset') {
            continue;
        }
        const rendererMaterialProp = queryRendererMaterialProperty(component, prop);
        if (rendererMaterialProp) {
            const materialProperties = queryMaterialAnimableProperties(component as any, rendererMaterialProp, compName);
            if (materialProperties.length > 0) {
                result.push(...materialProperties);
                continue;
            }
        }
        const attr = queryPropertyAttr(component as any, prop);
        if (!attr || attr.readonly || !isAnimablePropertyAttr(attr)) {
            continue;
        }
        const materialProperties = queryMaterialAnimableProperties(component as any, prop, compName);
        if (materialProperties.length > 0) {
            result.push(...materialProperties);
            continue;
        }
        if (!isWritableProperty(component, prop)) {
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
    const materialUniform = parseMaterialUniformPropertyKey(propKey);
    if (materialUniform) {
        const node = nodePath ? rootNode.getChildByPath(nodePath) : rootNode;
        const component = node?.components.find((item) => js.getClassName(item) === materialUniform.comp);
        const target = component ? queryMaterialUniformTarget(component as any, materialUniform) : null;
        const type = target ? queryMaterialUniformType(target.pass, materialUniform.uniformName) : '';
        return type ? {
            type: { value: type },
            valueCtor: undefined,
        } : null;
    }

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
    if (!attr || attr.readonly || !isWritableProperty(component, componentProperty.propName) || !isAnimablePropertyAttr(attr)) {
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

function queryMaterialAnimableProperties(component: Record<string, unknown>, prop: string, compName: string): IAnimationPropertyInfo[] {
    const targets = queryMaterialTargets(component[prop], prop);
    const result: IAnimationPropertyInfo[] = [];
    for (const target of targets) {
        const passes = Array.isArray(target.material?.passes) ? target.material.passes : [];
        passes.forEach((pass: any, passIndex: number) => {
            const properties = pass?.properties;
            if (!properties || typeof properties !== 'object') {
                return;
            }
            for (const uniformName of Object.keys(properties)) {
                const type = queryUniformPropertyType(pass, uniformName);
                if (!type) {
                    continue;
                }
                const uniform = queryUniformNameData(passIndex, uniformName);
                result.push({
                    name: uniformName,
                    key: `${compName}.${target.path}.${uniform.key}`,
                    displayName: `${compName}.${target.displayPath}.${uniform.displayName}`,
                    type,
                    menuName: uniform.displayName,
                    comp: compName,
                    category: `${compName}/${target.category}/${uniformName}`,
                });
            }
        });
    }
    return result;
}

function queryRendererMaterialProperty(component: Component, prop: string): string {
    return prop === 'sharedMaterials' && component instanceof Renderer ? 'materials' : '';
}

function queryMaterialTargets(value: unknown, prop: string): Array<{ material: any; path: string; displayPath: string; category: string }> {
    if (Array.isArray(value)) {
        return value.map((material, index) => ({
            material,
            path: `${prop}.${index}`,
            displayPath: `${prop}[${index}]`,
            category: `${prop}/${index}`,
        }));
    }
    return [{
        material: value,
        path: prop,
        displayPath: prop,
        category: prop,
    }];
}

function queryUniformNameData(passIndex: number, uniformName: string): { key: string; displayName: string } {
    return {
        key: `pass.${passIndex}.${uniformName}`,
        displayName: `pass[${passIndex}].${uniformName}`,
    };
}

function queryUniformPropertyType(pass: any, uniformName: string): IAnimationPropertyInfo['type'] | null {
    const type = queryMaterialUniformType(pass, uniformName);
    return type ? { value: type } : null;
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
