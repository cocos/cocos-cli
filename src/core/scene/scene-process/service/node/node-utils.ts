import { Node, Canvas, UITransformComponent, Scene, director, Layers, CCObject } from 'cc';


/**
 * 获取有效的 ui Canvas 的节点，向上和向下找
 * @param node 节点
 * @param prefabLimitRoot
 */
export function getUICanvasNode(node: Node | null, prefabLimitRoot = true): Node | null {
    if (!node) {
        return null;
    }

    if (hasOneKindOfComponent(node, Canvas)) {
        return node;
    }

    const stopAtRootNode: Node | Scene | null = director.getScene();
    if (node !== stopAtRootNode) {
        // 先检查该节点所在的祖父节点是否满足
        let parentNode = node.parent;
        while (parentNode) {
            if (hasOneKindOfComponent(parentNode, Canvas)) {
                // 祖父级有满足的，返回自身
                return node;
            }

            if (parentNode === stopAtRootNode) {
                break;
            }

            parentNode = parentNode.parent;
        }
    }

    // 检查子节点是否有满足
    const list = node.children.slice();
    // 返回最后一个有 cc.Canvas 组件的节点
    for (let i = list.length - 1; i >= 0; i--) {
        const child = list[i] as Node;
        if (hasOneKindOfComponent(child, Canvas)) {
            return child;
        }
    }

    return null;
}

/**
 * 获取有效的有 UITransform 组件的父节点，只向上找
 * @param node 节点
 */
export function getUITransformParentNode(node: Node | null): Node | null {
    if (!node) {
        return null;
    }

    if (hasOneKindOfComponent(node, UITransformComponent)) {
        return node;
    }

    const stopAtRootNode: Node | Scene | null = director.getScene();
    if (node === stopAtRootNode) {
        return null;
    }

    // 先检查该节点所在的祖父节点是否满足
    let parentNode = node.parent;
    while (parentNode) {
        if (hasOneKindOfComponent(parentNode, UITransformComponent)) {
            // 祖父级有满足的，返回自身
            return parentNode;
        }

        if (parentNode === stopAtRootNode) {
            break;
        }

        parentNode = parentNode.parent;
    }

    return null;
}

export function hasOneKindOfComponent(node: Node | Scene, kind: any) {
    if (node && node.components) {
        for (let j = 0; j < node.components.length; j++) {
            if (node.components[j] instanceof kind) {
                return true;
            }
        }
    }

    return false;
}


/**
 * 设置节点层级
 * @param node - 当前节点
 * @param layer - 层级
 * @param deep - 是否递归同步子节点
 */
export function setLayer(node: Node, layer: number, deep: boolean) {
    node.layer = layer;
    for (const child of node.children) {
        setLayer(child, layer, deep);
    }
}

/**
 * 是否是编辑节点
 * @param node
 */
export function isEditorNode(node: Node) {
    if (node.layer & Layers.Enum.GIZMOS) {
        return true;
    }

    let iterNode: Node | null = node;
    while (iterNode) {
        if (iterNode.objFlags & CCObject.Flags.HideInHierarchy) {
            return true;
        }

        iterNode = iterNode.parent;
    }

    return false;
}

/**
 * 检测一个节点是否是某个节点的一部分
 * @param testNode 测试节点
 * @param rootNode 根节点
 */
export function isPartOfNode(testNode: Node, rootNode: Node) {
    let checkNode: Node | null = testNode;

    while (checkNode) {
        if (checkNode === rootNode) {
            return true;
        }

        checkNode = checkNode.parent;
    }

    return false;
}