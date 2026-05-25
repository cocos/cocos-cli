'use strict';

import { Node, js, director } from 'cc';

const UI_GROUP_COMPONENTS = [
    'cc.Button',
    'cc.EditBox',
    'cc.PageView',
    'cc.ProgressBar',
    'cc.RichText',
    'cc.ScrollView',
    'cc.Slider',
    'cc.Toggle',
    'cc.ToggleContainer',
];

function getUIRootNode(node: Node): Node | null {
    let target = node.parent;
    while (target) {
        if (target === target.scene) {
            return null;
        }
        for (const comp of UI_GROUP_COMPONENTS) {
            if (target.getComponent(comp)) {
                return target;
            }
        }
        target = target.parent;
    }
    return null;
}

function getPrefabRootNode(node: Node): Node | null {
    // @ts-ignore
    return (node && node.prefab && node.prefab.root) || null;
}

function getEditingRootNode(): Node | null {
    try {
        const { Service } = require('../../core/decorator');
        return Service?.Scene?.rootNode ?? director.getScene();
    } catch (e) {
        return director.getScene();
    }
}

export function getSelectNode(rayResultNodes: Node[], selectionNodePath: string): Node {
    const nodes: Node[] = rayResultNodes;
    const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
    let rootNode: Node | null = null;
    rootNode = getUIRootNode(rayResultNodes[0]);
    if (!rootNode) {
        rootNode = getPrefabRootNode(rayResultNodes[0]);
        if (rootNode &&
            (!selectionNodePath || selectionNodePath === (EditorExtends?.Node?.getNodePath?.(rootNode) ?? '')) &&
            getEditingRootNode() === rootNode) {
            return rayResultNodes[0];
        }
    }
    if (rootNode) {
        const idx = rayResultNodes.indexOf(rootNode);
        if (idx !== -1) {
            nodes.splice(idx, 1);
        }
        nodes.unshift(rootNode);
    }
    let resultNode = nodes[0];
    if (selectionNodePath) {
        for (let i = 0; i < nodes.length; i++) {
            const nodePath = EditorExtends?.Node?.getNodePath?.(nodes[i]) ?? '';
            if (nodes[i] && selectionNodePath === nodePath) {
                resultNode = nodes[i + 1];
                resultNode = resultNode || nodes[0];
                break;
            }
        }
    }
    return resultNode;
}
