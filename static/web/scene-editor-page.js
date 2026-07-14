/* global window, document, cc, EditorExtends */

/**
 * 场景编辑器调试页逻辑（浏览器 ESM）。
 *
 * 由 scene-editor.ejs 末尾的 `<script type="module">` 调用 initPage() 引导：
 * 先 boot() 得到场景服务上下文（services / events / serverURL），再把所有原先内联在页面里的
 * 调试逻辑绑定到 DOM。替代旧的 window.SceneCtx 全局与内联 on* 事件属性。
 *
 * @param {{ ip?: string, port?: number|string, https?: boolean }} addr
 */
export default async function initPage({ ip, port, https }) {
    const { default: boot } = await import('/static/web/scene-editor-boot.js');
    // 场景服务上下文（services / events / serverURL），供本页调试逻辑使用。
    const ctx = await boot({ ip, port, https });
    const { services, events, serverURL } = ctx;

    // 解构本页实际用到的服务。
    const { Engine, Camera, Selection, Node, Gizmo, SceneView, Script, Editor } = services;

    /* ── Helpers ── */
    function log(msg, cls) {
        const el = document.getElementById('log');
        const d = document.createElement('div');
        d.textContent = new Date().toLocaleTimeString() + ' ' + msg;
        if (cls) d.className = cls;
        el.appendChild(d);
        el.scrollTop = el.scrollHeight;
    }

    function safeCall(svc, method, ...args) {
        try {
            if (!services) { log('services not ready', 'status-warn'); return; }
            const s = services[svc];
            if (!s) { log(svc + ' not registered', 'status-warn'); return; }
            const result = s[method](...args);
            log(svc + '.' + method + '(' + args.map(a => JSON.stringify(a)).join(',') + ')', 'status-ok');
            try { Engine.repaintInEditMode(); } catch (_) {}
            return result;
        } catch (e) {
            log(svc + '.' + method + ' error: ' + e.message, 'status-err');
        }
    }

    function togglePanel() {
        document.getElementById('testPanel').classList.toggle('collapsed');
    }

    function toggleSection(id) {
        document.getElementById(id).classList.toggle('folded');
    }

    // 打开浏览器预览（根路径 /，CC_PREVIEW 跑游戏）。默认预览“当前打开的场景”，
    // 取不到时退回场景输入框里的 UUID/URL，再退回项目默认启动场景。
    function openBrowserPreview() {
        let scene = '';
        try {
            const ed = Editor;
            const uuid = ed && ed.getCurrentEditorUuid && ed.getCurrentEditorUuid();
            if (uuid) scene = uuid;
        } catch (e) { /* ignore */ }
        if (!scene) {
            const input = document.getElementById('sceneInput');
            if (input && input.value.trim()) scene = input.value.trim();
        }
        const url = scene ? '/?scene=' + encodeURIComponent(scene) : '/';
        window.open(url, '_blank');
    }

    /* ── Scene ── */
    async function doLoadScene() {
        const btn = document.getElementById('btnLoad');
        const status = document.getElementById('sceneStatus');
        const sceneInput = document.getElementById('sceneInput').value.trim();
        btn.disabled = true;
        status.textContent = 'Loading...';
        status.className = 'info-text status-warn';
        try {
            const { loadScene } = await import('/static/web/load-scene.js');
            await loadScene(ctx, sceneInput || undefined);
            status.textContent = 'Loaded';
            status.className = 'info-text status-ok';
            log('Scene loaded' + (sceneInput ? ': ' + sceneInput : ''), 'status-ok');
            setTimeout(() => { initPanel(); }, 500);
        } catch (e) {
            status.textContent = 'Failed';
            status.className = 'info-text status-err';
            log('Load failed: ' + e.message, 'status-err');
        }
        btn.disabled = false;
    }

    /* ── Script Test ── */
    async function doCreateScript() {
        var name = document.getElementById('scriptNameInput').value.trim() || 'TestComponent';
        var status = document.getElementById('scriptStatus');
        status.textContent = 'Creating...';
        try {
            var url = serverURL + '/create-asset';
            var body = {
                dbURL: 'db://assets/' + name + '.ts',
                content: [
                    "import { _decorator, Component } from 'cc';",
                    "const { ccclass, menu } = _decorator;",
                    "",
                    "@ccclass('" + name + "')",
                    "@menu('Custom/" + name + "')",
                    "export class " + name + " extends Component {",
                    "    start() {}",
                    "    update(dt: number) {}",
                    "}"
                ].join('\n')
            };
            var res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            var data = await res.json();
            status.textContent = res.ok ? 'Created' : 'Failed';
            status.className = 'info-text ' + (res.ok ? 'status-ok' : 'status-err');
            log('Create script: ' + name + ' -> ' + JSON.stringify(data), res.ok ? 'status-ok' : 'status-err');
            if (res.ok) {
                status.textContent = 'Reloading...';
                setTimeout(function() {
                    Script.investigatePackerDriver().then(function() {
                        setTimeout(function() { doCheckMenus(); }, 2000);
                    });
                }, 3000);
            }
        } catch(e) {
            status.textContent = 'Error';
            status.className = 'info-text status-err';
            log('Create script error: ' + e.message, 'status-err');
        }
    }

    async function doDeleteScript() {
        var name = document.getElementById('scriptNameInput').value.trim() || 'TestComponent';
        var status = document.getElementById('scriptStatus');
        status.textContent = 'Deleting...';
        try {
            var url = serverURL + '/delete-asset';
            var body = { dbURL: 'db://assets/' + name + '.ts' };
            var res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            var data = await res.json();
            status.textContent = res.ok ? 'Deleted' : 'Failed';
            status.className = 'info-text ' + (res.ok ? 'status-ok' : 'status-err');
            log('Delete script: ' + name + ' -> ' + JSON.stringify(data), res.ok ? 'status-ok' : 'status-err');
            if (res.ok) {
                status.textContent = 'Reloading...';
                setTimeout(function() {
                    Script.investigatePackerDriver().then(function() {
                        setTimeout(function() { doCheckMenus(); }, 2000);
                    });
                }, 3000);
            }
        } catch(e) {
            status.textContent = 'Error';
            status.className = 'info-text status-err';
            log('Delete script error: ' + e.message, 'status-err');
        }
    }

    function doCheckMenus() {
        var menus = EditorExtends.Component.getMenus();
        var custom = menus.filter(function(m) { return !m.menuPath.startsWith('hidden:'); });
        var status = document.getElementById('scriptStatus');
        status.textContent = 'Total: ' + menus.length + ', Custom: ' + custom.length;
        status.className = 'info-text status-ok';
        log('Menus total: ' + menus.length + ', custom: ' + custom.length, 'status-ok');
    }

    /* ── Camera ── */
    function set2D(is2D) {
        try {
            if (Camera) {
                Camera.is2D = is2D;
                log('Camera.is2D = ' + is2D, 'status-ok');
            }
        } catch(e) { log('set2D error: ' + e.message, 'status-err'); }
        document.getElementById('btn2D').classList.toggle('active', is2D);
        document.getElementById('btn3D').classList.toggle('active', !is2D);
    }

    function alignToSelection() {
        const uuids = getSelectedUuids();
        if (uuids.length === 0) { log('No selection for align', 'status-warn'); return; }
        safeCall('Camera', 'alignSceneViewToNode', uuids);
    }

    function alignSelectionToView() {
        const uuids = getSelectedUuids();
        if (uuids.length === 0) { log('No selection for align', 'status-warn'); return; }
        safeCall('Camera', 'alignNodeToSceneView', uuids);
    }

    function rotateCam(x, y, z, byDist) {
        try {
            if (!Camera) { log('Camera not ready', 'status-warn'); return; }
            const dir = new cc.Vec3(x, y, z);
            Camera.rotateCameraToDir(dir, byDist);
            log('rotateCameraToDir(' + x + ',' + y + ',' + z + ')', 'status-ok');
        } catch(e) { log('rotateCam error: ' + e.message, 'status-err'); }
    }

    function focusSelected() {
        // Selection.query() 返回的是节点 path，而 Camera.focus 内部用 EditorExtends.Node.getNode(uuid)
        // 按 uuid 查节点，直接把 path 传进去会查不到、聚焦不生效。这里先把 path 转成 uuid。
        const paths = getSelectedUuids();
        if (paths.length === 0) { log('No selection to focus', 'status-warn'); return; }
        const EE = (window.cc && window.cc.EditorExtends) || window.EditorExtends;
        const uuids = paths.map(function (p) {
            try { const n = EE && EE.Node && EE.Node.getNodeByPath(p); return n ? n.uuid : null; } catch (e) { return null; }
        }).filter(Boolean);
        if (uuids.length === 0) { log('Cannot resolve selection path to uuid', 'status-warn'); return; }
        safeCall('Camera', 'focus', uuids);
    }

    // 输入节点路径 → 按路径选中该节点 + 相机聚焦到该节点
    // Selection.select 接受 path；Camera.focus 需要 uuid，所以先把 path 转成 uuid。
    function focusByPath() {
        const path = (document.getElementById('focusPathInput').value || '').trim();
        if (!path) { log('No path entered', 'status-warn'); return; }
        const EE = (window.cc && window.cc.EditorExtends) || window.EditorExtends;
        let uuid = null;
        try { const n = EE && EE.Node && EE.Node.getNodeByPath(path); uuid = n ? n.uuid : null; } catch (e) {}
        if (!uuid) { log('Node not found by path: ' + path, 'status-warn'); return; }
        safeCall('Selection', 'select', path);
        safeCall('Camera', 'focus', [uuid]);
        log('Focus by path: ' + path);
        setTimeout(refreshState, 100);
    }

    /* ── Gizmo ── */
    const tools = ['position', 'rotation', 'scale', 'rect', 'view'];

    function setTool(name) {
        safeCall('Gizmo', 'changeTool', name);
        tools.forEach(t => {
            const el = document.getElementById('tool-' + t);
            if (el) el.classList.toggle('active', t === name);
        });
        document.getElementById('toolName').textContent = name;
    }

    function setCoord(coord) {
        safeCall('Gizmo', 'setCoordinate', coord);
        document.getElementById('coord-local').classList.toggle('active', coord === 'local');
        document.getElementById('coord-global').classList.toggle('active', coord === 'global');
    }

    function setPivot(pivot) {
        safeCall('Gizmo', 'setPivot', pivot);
        document.getElementById('pivot-pivot').classList.toggle('active', pivot === 'pivot');
        document.getElementById('pivot-center').classList.toggle('active', pivot === 'center');
    }

    /* ── Selection ── */
    function getSelectedUuids() {
        try {
            if (Selection) {
                return Selection.query() || [];
            }
        } catch(e) {}
        return [];
    }

    function doSelect() {
        const sel = document.getElementById('nodeList');
        const uuid = sel.value;
        if (!uuid) { log('No node selected in dropdown', 'status-warn'); return; }
        safeCall('Selection', 'select', uuid);
        setTimeout(refreshState, 100);
    }

    function doUnselect() {
        const sel = document.getElementById('nodeList');
        const uuid = sel.value;
        if (!uuid) { log('No node selected in dropdown', 'status-warn'); return; }
        safeCall('Selection', 'unselect', uuid);
        setTimeout(refreshState, 100);
    }

    async function refreshNodeList() {
        const sel = document.getElementById('nodeList');
        sel.innerHTML = '<option value="">loading...</option>';
        try {
            const root = await Node.query({
                path: '/', queryChildren: true, queryComponent: false
            });
            sel.innerHTML = '';
            if (root && root.children) {
                flattenNodes(root.children, '', sel);
            }
            if (sel.options.length === 0) {
                sel.innerHTML = '<option value="">-- no nodes --</option>';
            }
            log('Node list refreshed (' + sel.options.length + ' nodes)', 'status-ok');
        } catch(e) {
            sel.innerHTML = '<option value="">-- error --</option>';
            log('refreshNodeList error: ' + e.message, 'status-err');
        }
    }

    function flattenNodes(nodes, prefix, sel) {
        if (!nodes) return;
        for (const n of nodes) {
            const name = prefix + (n.name || n.nodeId || '?');
            const opt = document.createElement('option');
            opt.value = n.nodeId || n.uuid || '';
            opt.textContent = name;
            sel.appendChild(opt);
            if (n.children && n.children.length > 0) {
                flattenNodes(n.children, name + '/', sel);
            }
        }
    }

    /* ── State Refresh ── */
    function refreshState() {
        try {
            if (!services) return;

            // Camera
            try {
                const fov = Camera.getCameraFov();
                document.getElementById('fovSlider').value = fov;
                document.getElementById('fovVal').textContent = Math.round(fov);
                const grid = Camera.isGridVisible();
                document.getElementById('chkGrid').checked = grid;
                const is2D = Camera.is2D;
                document.getElementById('btn2D').classList.toggle('active', is2D);
                document.getElementById('btn3D').classList.toggle('active', !is2D);
                const cam = Camera.camera;
                if (cam && cam.node) {
                    const p = cam.node.worldPosition;
                    document.getElementById('camPos').textContent =
                        'x:' + p.x.toFixed(1) + ' y:' + p.y.toFixed(1) + ' z:' + p.z.toFixed(1);
                }
            } catch(e) {}

            // Gizmo
            try {
                const tool = Gizmo.transformToolName;
                document.getElementById('toolName').textContent = tool || '?';
                tools.forEach(t => {
                    const el = document.getElementById('tool-' + t);
                    if (el) el.classList.toggle('active', t === tool);
                });
            } catch(e) {}

            // Selection
            try {
                const sel = Selection.query();
                const info = document.getElementById('selInfo');
                if (sel && sel.length > 0) {
                    info.textContent = sel.length + ': ' + sel.map(u => u.substring(0, 8)).join(', ');
                } else {
                    info.textContent = 'none';
                }
            } catch(e) {}

            // SceneView
            try {
                const lightOn = SceneView.querySceneLightOn();
                document.getElementById('chkLight').checked = lightOn;
            } catch(e) {}

        } catch(e) {
            // Services not ready
        }
    }

    /* ── Rect Test ── */
    function doMultiSelect() {
        var sel = document.getElementById('nodeList');
        var uuid = sel.value;
        if (!uuid) { log('No node selected in dropdown', 'status-warn'); return; }
        try {
            if (Selection) {
                Selection.select(uuid);
                log('Added to selection: ' + uuid.substring(0, 8), 'status-ok');
                setTimeout(function() { refreshState(); refreshRectInfo(); }, 100);
            }
        } catch(e) { log('doMultiSelect error: ' + e.message, 'status-err'); }
    }

    function doSelectAll2D() {
        try {
            if (!Selection) return;
            Selection.clear();
            var sel = document.getElementById('nodeList');
            var uuids = [];
            for (var i = 0; i < sel.options.length; i++) {
                if (sel.options[i].value) uuids.push(sel.options[i].value);
            }
            for (var j = 0; j < uuids.length; j++) {
                Selection.select(uuids[j]);
            }
            log('Selected all nodes: ' + uuids.length, 'status-ok');
            setTimeout(function() { refreshState(); refreshRectInfo(); }, 100);
        } catch(e) { log('doSelectAll2D error: ' + e.message, 'status-err'); }
    }

    function refreshRectInfo() {
        try {
            var selInfo = document.getElementById('rectSelInfo');
            var boundsInfo = document.getElementById('rectBoundsInfo');
            if (!Selection) {
                selInfo.textContent = '0 nodes';
                boundsInfo.textContent = '-';
                return;
            }
            var uuids = Selection.query() || [];
            selInfo.textContent = uuids.length + ' node' + (uuids.length !== 1 ? 's' : '');
            if (uuids.length > 1) {
                selInfo.textContent += ' (multi)';
            }

            var nodes = [];
            var EditorExtends = (cc && cc.EditorExtends) || window.EditorExtends;
            if (EditorExtends && EditorExtends.Node) {
                for (var k = 0; k < uuids.length; k++) {
                    var n = EditorExtends.Node.getNode(uuids[k]);
                    if (n) nodes.push(n);
                }
            }
            if (nodes.length > 1) {
                var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                for (var m = 0; m < nodes.length; m++) {
                    var wp = nodes[m].getWorldPosition();
                    if (wp.x < minX) minX = wp.x;
                    if (wp.x > maxX) maxX = wp.x;
                    if (wp.y < minY) minY = wp.y;
                    if (wp.y > maxY) maxY = wp.y;
                }
                boundsInfo.textContent = 'W:' + (maxX - minX).toFixed(0) + ' H:' + (maxY - minY).toFixed(0);
            } else if (nodes.length === 1) {
                var uit = nodes[0].getComponent('cc.UITransform');
                if (uit) {
                    boundsInfo.textContent = 'W:' + uit.contentSize.width.toFixed(0) + ' H:' + uit.contentSize.height.toFixed(0);
                } else {
                    boundsInfo.textContent = 'no UITransform';
                }
            } else {
                boundsInfo.textContent = '-';
            }
        } catch(e) {
            document.getElementById('rectBoundsInfo').textContent = 'error';
        }
    }

    /* ── Init Panel ── */
    async function initPanel() {
        refreshState();
        refreshRectInfo();
        await refreshNodeList();
        // Auto-refresh every 2s
        setInterval(refreshState, 2000);
        setInterval(refreshRectInfo, 2000);
    }

    /* ── Debug View ── */
    // 构建单一通道(radio)/组合光照项(checkbox)分组控件，调用 Engine.changeDebugOption。
    // setAllComposite / resetDebugView 需在事件绑定处访问，声明在外层。
    var setAllComposite;
    var resetDebugView;
    (function initDebugViewTest() {
        // Single 调试模式：单选(radio)，同一时刻只看一个通道；value = DebugViewSingleType 数值。
        // 分组与 cocos-editor debug-view.ts 一致。
        var SINGLE_GROUPS = [
            { title: '', items: [[0, 'Disable all 禁用 (NONE)']] },
            { title: 'Model Info 模型信息', items: [
                [1, 'Vertex colors 顶点色'], [2, 'World normal 世界法线'], [3, 'World tangent 世界切线'],
                [4, 'World position 世界坐标'], [5, 'Mirrored normal 镜像法线'], [6, 'Front face 正面着色'],
                [7, 'UV0'], [8, 'UV1'], [9, 'Lightmap UV 光照图UV'], [10, 'Proj depth Z 投影深度Z'], [11, 'Linear depth W 线性深度W'] ] },
            { title: 'Material Info 材质信息', items: [
                [12, 'Pixel normal 世界像素法线'], [13, 'Pixel tangent 世界像素切线'], [14, 'Pixel binormal 世界像素副法线'],
                [15, 'Base color 固有色'], [16, 'Diffuse color 漫反射颜色'], [17, 'Specular color 镜面反射颜色'],
                [18, 'Opacity 透明度'], [19, 'Metallic 金属度'], [20, 'Roughness 粗糙度'], [21, 'Specular intensity 镜面反射强度'], [22, 'IOR 折射率'] ] },
            { title: 'Lighting Info 光照信息', items: [
                [23, 'Direct diffuse 直接光漫反射'], [24, 'Direct specular 直接光镜面反射'], [25, 'Direct lighting 直接光'],
                [26, 'Ambient diffuse 环境光漫反射'], [27, 'Ambient specular 环境光镜面反射'], [28, 'Ambient lighting 环境光'],
                [29, 'Emissive 自发光'], [30, 'Light map 光照图'], [31, 'Shadows 阴影'], [32, 'AO 环境光遮蔽'] ] },
            { title: 'Adv Lighting 高级光照信息', items: [
                [33, 'Fresnel 菲涅尔'], [34, 'Direct transmit diffuse'], [35, 'Direct transmit specular'],
                [36, 'Ambient transmit diffuse'], [37, 'Ambient transmit specular'], [38, 'Transmit lighting'],
                [39, 'Direct TRT'], [40, 'Ambient TRT'], [41, 'TRT lighting'] ] },
            { title: 'Misc 杂项信息', items: [[42, 'Fog factor 雾因子']] },
        ];
        // Composite 组合项：复选(checkbox)，可多选叠加；key = DebugViewCompositeType 数值。
        var COMPOSITE_GROUPS = [
            { title: 'Lighting 光照', items: [
                [0, 'Direct diffuse 直接光漫反射'], [1, 'Direct specular 直接光镜面反射'], [2, 'Ambient diffuse 环境光漫反射'],
                [3, 'Ambient specular 环境光镜面反射'], [4, 'Emissive 自发光'], [5, 'Light map 光照图'], [6, 'Shadows 阴影'], [7, 'AO 环境光遮蔽'] ] },
            { title: 'Misc 杂项信息', items: [[8, 'Normal map'], [9, 'Fog factor 雾因子'], [10, 'Tone mapping'], [11, 'Gamma correction']] },
            { title: 'Adv Lighting 高级光照信息', items: [[12, 'Fresnel 菲涅尔'], [13, 'Transmit diffuse'], [14, 'Transmit specular'], [15, 'TRT'], [16, 'TT']] },
        ];

        function groupHeader(title) {
            if (!title) { return null; }
            var div = document.createElement('div');
            div.style.cssText = 'color:#8a8a8a;font-size:10px;margin:4px 0 1px;border-bottom:1px solid #3a3a3a;';
            div.textContent = title;
            return div;
        }
        function renderGroups(container, groups, buildItem) {
            if (!container) { return; }
            container.innerHTML = '';
            groups.forEach(function (g) {
                var header = groupHeader(g.title);
                if (header) { container.appendChild(header); }
                g.items.forEach(function (it) { container.appendChild(buildItem(it[0], it[1])); });
            });
        }

        var singleList = document.getElementById('dbgSingleList');
        renderGroups(singleList, SINGLE_GROUPS, function (value, label) {
            var lbl = document.createElement('label');
            lbl.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:11px;';
            var input = document.createElement('input');
            input.type = 'radio';
            input.name = 'dbgSingle';
            input.value = String(value);
            if (value === 0) { input.checked = true; }
            input.addEventListener('change', function () {
                safeCall('Engine', 'changeDebugOption', 'single', value);
            });
            lbl.appendChild(input);
            lbl.appendChild(document.createTextNode(value + ' ' + label));
            return lbl;
        });

        var compList = document.getElementById('dbgCompositeList');
        renderGroups(compList, COMPOSITE_GROUPS, function (key, label) {
            var lbl = document.createElement('label');
            lbl.style.cssText = 'display:flex;align-items:center;gap:4px;font-size:11px;';
            var input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = true;
            input.setAttribute('data-comp', String(key));
            input.addEventListener('change', function (e) {
                safeCall('Engine', 'changeDebugOption', 'composite', { key: key, value: e.target.checked });
            });
            lbl.appendChild(input);
            lbl.appendChild(document.createTextNode(key + ' ' + label));
            return lbl;
        });

        setAllComposite = function (on) {
            safeCall('Engine', 'changeDebugOption', 'composite', { key: 10000, value: on });
            if (compList) { compList.querySelectorAll('input[data-comp]').forEach(function (c) { c.checked = on; }); }
        };

        resetDebugView = function () {
            safeCall('Engine', 'changeDebugOption', 'single', 0);
            safeCall('Engine', 'changeDebugOption', 'composite', { key: 10000, value: true });
            safeCall('Engine', 'changeDebugOption', 'LIGHTING_WITH_BASE_COLOR', true);
            safeCall('Engine', 'changeDebugOption', 'CSM_LAYER_COLORATION', false);
            if (singleList) { var r = singleList.querySelector('input[value="0"]'); if (r) { r.checked = true; } }
            var lwa = document.getElementById('dbgLWA'); if (lwa) { lwa.checked = true; }
            var csm = document.getElementById('dbgCSM'); if (csm) { csm.checked = false; }
            if (compList) { compList.querySelectorAll('input[data-comp]').forEach(function (c) { c.checked = true; }); }
        };
    })();
    // Debug View END

    /* ── Bind UI events (replaces inline on* attributes) ── */
    function bindClick(id, handler) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('click', handler);
    }
    function bindChange(id, handler) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('change', handler);
    }

    // Panel toggle
    bindClick('panelToggle', function () { togglePanel(); });

    // Section headers
    bindClick('sec-scene-h', function () { toggleSection('sec-scene'); });
    bindClick('sec-debugview-h', function () { toggleSection('sec-debugview'); });
    bindClick('sec-camera-h', function () { toggleSection('sec-camera'); });
    bindClick('sec-gizmo-h', function () { toggleSection('sec-gizmo'); });
    bindClick('sec-selection-h', function () { toggleSection('sec-selection'); });
    bindClick('sec-sceneview-h', function () { toggleSection('sec-sceneview'); });
    bindClick('sec-rect-test-h', function () { toggleSection('sec-rect-test'); });
    bindClick('sec-log-h', function () { toggleSection('sec-log'); });

    // Scene
    bindClick('btnLoad', function () { doLoadScene(); });
    bindClick('btnPreview', function () { openBrowserPreview(); });
    bindClick('btnCreateScript', function () { doCreateScript(); });
    bindClick('btnDeleteScript', function () { doDeleteScript(); });
    bindClick('btnCheckMenus', function () { doCheckMenus(); });

    // Debug View
    bindChange('dbgLWA', function (e) { safeCall('Engine', 'changeDebugOption', 'LIGHTING_WITH_BASE_COLOR', e.target.checked); });
    bindChange('dbgCSM', function (e) { safeCall('Engine', 'changeDebugOption', 'CSM_LAYER_COLORATION', e.target.checked); });
    bindClick('btnResetDebugView', function () { resetDebugView(); });
    bindClick('btnCompAllOn', function () { setAllComposite(true); });
    bindClick('btnCompAllOff', function () { setAllComposite(false); });

    // Camera
    bindClick('btnZoomReset', function () { safeCall('Camera', 'zoomReset'); });
    bindChange('chkGrid', function (e) { safeCall('Camera', 'setGridVisible', e.target.checked); });
    bindClick('btnToggleProjection', function () { safeCall('Camera', 'changeProjection'); refreshState(); });
    var fovSlider = document.getElementById('fovSlider');
    if (fovSlider) {
        fovSlider.addEventListener('input', function (e) {
            safeCall('Camera', 'setCameraProperty', { fov: Number(e.target.value) });
            document.getElementById('fovVal').textContent = e.target.value;
        });
    }
    bindClick('btn2D', function () { set2D(true); });
    bindClick('btn3D', function () { set2D(false); });
    bindClick('btnResetCamera', function () { safeCall('Camera', 'resetCameraProperty'); refreshState(); });
    bindClick('btnAlignViewToNode', function () { alignToSelection(); });
    bindClick('btnAlignNodeToView', function () { alignSelectionToView(); });
    bindClick('btnViewFront', function () { rotateCam(0, 0, -1, true); });
    bindClick('btnViewBack', function () { rotateCam(0, 0, 1, true); });
    bindClick('btnViewLeft', function () { rotateCam(-1, 0, 0, true); });
    bindClick('btnViewRight', function () { rotateCam(1, 0, 0, true); });
    bindClick('btnViewTop', function () { rotateCam(0, -1, 0, true); });
    bindClick('btnViewBottom', function () { rotateCam(0, 1, 0, true); });
    bindClick('btnFocusSelected', function () { focusSelected(); });

    // Gizmo
    bindClick('tool-position', function () { setTool('position'); });
    bindClick('tool-rotation', function () { setTool('rotation'); });
    bindClick('tool-scale', function () { setTool('scale'); });
    bindClick('tool-rect', function () { setTool('rect'); });
    bindClick('tool-view', function () { setTool('view'); });
    bindClick('coord-local', function () { setCoord('local'); });
    bindClick('coord-global', function () { setCoord('global'); });
    bindClick('pivot-pivot', function () { setPivot('pivot'); });
    bindClick('pivot-center', function () { setPivot('center'); });
    bindChange('chkLock', function (e) { safeCall('Gizmo', 'lockGizmoTool', e.target.checked); });
    bindChange('chkIcons', function (e) { safeCall('Gizmo', 'setIconVisible', e.target.checked); });

    // Selection
    bindClick('btnSelect', function () { doSelect(); });
    bindClick('btnUnselect', function () { doUnselect(); });
    bindClick('btnClearSel', function () { safeCall('Selection', 'clear'); refreshState(); });
    bindClick('btnRefreshNodes', function () { refreshNodeList(); });
    var focusPathInput = document.getElementById('focusPathInput');
    if (focusPathInput) {
        focusPathInput.addEventListener('keydown', function (event) {
            if (event.key === 'Enter') focusByPath();
        });
    }
    bindClick('btnSelectFocus', function () { focusByPath(); });

    // SceneView
    bindChange('chkLight', function (e) { safeCall('SceneView', 'setSceneLightOn', e.target.checked); });

    // Rect Test
    bindClick('btnMultiSelect', function () { doMultiSelect(); });
    bindClick('btnSelectAll2D', function () { doSelectAll2D(); });
    bindClick('btnRectSwitch', function () { setTool('rect'); });

    // Log
    bindClick('btnClearLog', function () { document.getElementById('log').innerHTML = ''; });
}
