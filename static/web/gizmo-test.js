/**
 * Component Gizmo Test Module
 * 扫描场景中的灯光/碰撞体组件，提供快速选中测试
 */

const GIZMO_COMPONENTS = {
    Lights: [
        'cc.SphereLight',
        'cc.SpotLight',
        'cc.DirectionalLight',
    ],
    '3D Colliders': [
        'cc.BoxCollider',
        'cc.SphereCollider',
        'cc.CapsuleCollider',
        'cc.ConeCollider',
        'cc.CylinderCollider',
        'cc.PlaneCollider',
        'cc.SimplexCollider',
        'cc.MeshCollider',
    ],
    '2D Colliders': [
        'cc.BoxCollider2D',
        'cc.CircleCollider2D',
        'cc.PolygonCollider2D',
    ],
};

// { componentType: [{uuid, name, path}] }
let _scannedNodes = {};

/**
 * 递归遍历场景节点树，收集带目标组件的节点
 */
function collectComponentNodes(nodeInfo, parentPath, allTargetTypes) {
    const results = [];
    if (!nodeInfo) return results;

    const path = parentPath ? parentPath + '/' + (nodeInfo.name || '?') : (nodeInfo.name || '?');

    if (nodeInfo.components && nodeInfo.components.length > 0) {
        for (const comp of nodeInfo.components) {
            const typeName = comp.type || comp.cid || '';
            if (allTargetTypes.has(typeName)) {
                results.push({
                    uuid: nodeInfo.uuid || nodeInfo.nodeId || '',
                    name: nodeInfo.name || '?',
                    path: path,
                    componentType: typeName,
                });
            }
        }
    }

    if (nodeInfo.children) {
        for (const child of nodeInfo.children) {
            results.push(...collectComponentNodes(child, path, allTargetTypes));
        }
    }

    return results;
}

/**
 * 扫描场景，查找所有灯光/碰撞体节点
 */
async function scanGizmoComponents() {
    const statusEl = document.getElementById('gizmoScanStatus');
    if (!window.cli || !window.cli.Scene || !window.cli.Scene.Node) {
        if (statusEl) statusEl.textContent = 'Scene not loaded';
        return;
    }

    if (statusEl) {
        statusEl.textContent = 'Scanning...';
        statusEl.className = 'info-text status-warn';
    }

    try {
        const root = await window.cli.Scene.Node.queryNode({
            path: '/',
            queryChildren: true,
            queryComponent: true,
        });

        const allTypes = new Set();
        for (const group of Object.values(GIZMO_COMPONENTS)) {
            for (const t of group) allTypes.add(t);
        }

        const foundNodes = collectComponentNodes(root, '', allTypes);
        _scannedNodes = {};
        for (const node of foundNodes) {
            if (!_scannedNodes[node.componentType]) {
                _scannedNodes[node.componentType] = [];
            }
            _scannedNodes[node.componentType].push(node);
        }

        renderGizmoTestList();

        if (statusEl) {
            statusEl.textContent = 'Found ' + foundNodes.length + ' component(s)';
            statusEl.className = 'info-text status-ok';
        }
        if (typeof log === 'function') {
            log('Gizmo scan: ' + foundNodes.length + ' components found', 'status-ok');
        }
    } catch (e) {
        if (statusEl) {
            statusEl.textContent = 'Scan failed';
            statusEl.className = 'info-text status-err';
        }
        if (typeof log === 'function') {
            log('Gizmo scan error: ' + e.message, 'status-err');
        }
    }
}

/**
 * 渲染扫描结果到面板
 */
function renderGizmoTestList() {
    const container = document.getElementById('gizmoTestList');
    if (!container) return;
    container.innerHTML = '';

    for (const [groupName, types] of Object.entries(GIZMO_COMPONENTS)) {
        const groupNodes = [];
        for (const t of types) {
            if (_scannedNodes[t]) {
                groupNodes.push(..._scannedNodes[t].map(n => ({ ...n, shortType: t.replace('cc.', '') })));
            }
        }

        const groupDiv = document.createElement('div');
        groupDiv.style.marginBottom = '6px';

        const groupLabel = document.createElement('div');
        groupLabel.style.cssText = 'color:#aaa;font-size:11px;margin-bottom:2px;';
        groupLabel.textContent = groupName + ' (' + groupNodes.length + ')';
        groupDiv.appendChild(groupLabel);

        if (groupNodes.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.style.cssText = 'color:#666;font-size:10px;padding-left:8px;';
            emptyDiv.textContent = 'No nodes in scene';
            groupDiv.appendChild(emptyDiv);
        } else {
            for (const node of groupNodes) {
                const row = document.createElement('div');
                row.className = 'row';
                row.style.marginLeft = '8px';

                const btn = document.createElement('button');
                btn.className = 'btn';
                btn.textContent = node.name;
                btn.title = node.path + ' [' + node.shortType + ']';
                btn.onclick = () => selectGizmoNode(node.uuid, node.name, node.shortType);

                const tag = document.createElement('span');
                tag.style.cssText = 'color:#8cf;font-size:10px;';
                tag.textContent = node.shortType;

                row.appendChild(btn);
                row.appendChild(tag);
                groupDiv.appendChild(row);
            }
        }

        container.appendChild(groupDiv);
    }

    // 显示 Gizmo 注册状态
    renderGizmoRegistryStatus();
}

/**
 * 选中节点以触发 Gizmo 显示
 */
function selectGizmoNode(uuid, name, type) {
    if (!window.cli || !window.cli.Scene) return;

    try {
        // 先清除选中
        window.cli.Scene.Selection.clear();
        // 选中目标节点
        window.cli.Scene.Selection.select(uuid);
        // 聚焦
        try {
            window.cli.Scene.Camera.focus([uuid]);
        } catch (_) {}

        try { window.cli.Scene.Engine.repaintInEditMode(); } catch (_) {}

        const selInfo = document.getElementById('gizmoSelInfo');
        if (selInfo) {
            selInfo.textContent = name + ' [' + type + ']';
            selInfo.className = 'info-text status-ok';
        }
        if (typeof log === 'function') {
            log('Selected: ' + name + ' (' + type + ')', 'status-ok');
        }
        if (typeof refreshState === 'function') {
            setTimeout(refreshState, 100);
        }
    } catch (e) {
        if (typeof log === 'function') {
            log('Select error: ' + e.message, 'status-err');
        }
    }
}

/**
 * 显示哪些 Gizmo 已注册
 */
function renderGizmoRegistryStatus() {
    const container = document.getElementById('gizmoRegistryInfo');
    if (!container) return;
    container.innerHTML = '';

    let registeredGizmos = null;
    try {
        // GizmoDefines.components 是 Map<string, GizmoClass>
        const gizmoModule = window.cli?.Scene?.Gizmo;
        if (gizmoModule && gizmoModule._gizmoDefines) {
            registeredGizmos = gizmoModule._gizmoDefines;
        }
    } catch (_) {}

    // 从 cc 引擎获取 className 来检查注册情况
    const allTypes = [];
    for (const group of Object.values(GIZMO_COMPONENTS)) {
        for (const t of group) allTypes.push(t);
    }

    const checkDiv = document.createElement('div');
    checkDiv.style.cssText = 'font-size:10px;line-height:1.6;';

    for (const t of allTypes) {
        const shortName = t.replace('cc.', '');
        const found = _scannedNodes[t] && _scannedNodes[t].length > 0;
        const line = document.createElement('div');

        // 简单标记：场景中有此组件的节点
        const icon = found ? '●' : '○';
        const color = found ? '#6c6' : '#666';
        line.innerHTML = '<span style="color:' + color + '">' + icon + '</span> ' + shortName;
        checkDiv.appendChild(line);
    }

    container.appendChild(checkDiv);
}

/**
 * 调试：列出 renderScene 中所有 model，帮助排查射线检测问题
 */
function debugSceneModels() {
    const container = document.getElementById('gizmoTestList');
    if (!container) return;

    const cc = window.cc;
    if (!cc || !cc.director) {
        if (typeof log === 'function') log('cc.director not available', 'status-err');
        return;
    }

    const scene = cc.director.getScene();
    if (!scene) {
        if (typeof log === 'function') log('No scene loaded', 'status-err');
        return;
    }

    const renderScene = scene.renderScene || scene._renderScene;
    if (!renderScene) {
        if (typeof log === 'function') log('No renderScene', 'status-err');
        return;
    }

    const models = renderScene.models;
    const div = document.createElement('div');
    div.style.cssText = 'margin-top:8px;font-size:10px;line-height:1.8;';

    const title = document.createElement('div');
    title.style.cssText = 'color:#ff0;font-size:11px;margin-bottom:4px;';
    title.textContent = 'RenderScene Models (' + models.length + ')';
    div.appendChild(title);

    const editorMask = (cc.Layers.Enum.GIZMOS | cc.Layers.Enum.SCENE_GIZMO | cc.Layers.Enum.EDITOR);

    for (let i = 0; i < models.length; i++) {
        const m = models[i];
        if (!m || !m.node) continue;
        // 跳过编辑器自身的 model
        if (m.node.layer & editorMask) continue;

        const wb = m.worldBounds;
        const line = document.createElement('div');
        const layerHex = '0x' + m.node.layer.toString(16);
        let info = (m.enabled ? '●' : '○') + ' ' + m.node.name
            + ' | layer=' + layerHex
            + ' | enabled=' + m.enabled;
        if (wb) {
            const c = wb.center;
            const h = wb.halfExtents;
            info += ' | bounds=(' + c.x.toFixed(1) + ',' + c.y.toFixed(1) + ',' + c.z.toFixed(1)
                + ') half=(' + h.x.toFixed(1) + ',' + h.y.toFixed(1) + ',' + h.z.toFixed(1) + ')';
        } else {
            info += ' | NO worldBounds';
        }

        const comps = m.node.components || m.node._components || [];
        const compNames = [];
        for (const c of comps) {
            const cn = c.constructor?.name || c.__classname__ || '?';
            compNames.push(cn);
        }
        if (compNames.length > 0) {
            info += ' | comps=[' + compNames.join(',') + ']';
        }

        line.textContent = info;
        line.style.color = wb ? '#afa' : '#f88';
        div.appendChild(line);
    }

    container.appendChild(div);
    if (typeof log === 'function') {
        log('Listed ' + models.length + ' models in renderScene', 'status-ok');
    }
}

// 全局暴露
window.scanGizmoComponents = scanGizmoComponents;
window.selectGizmoNode = selectGizmoNode;
window.debugSceneModels = debugSceneModels;
