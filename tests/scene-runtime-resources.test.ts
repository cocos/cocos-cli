import { sceneRuntimeResources } from '../src/core/scene/runtime/resources';

it('exposes resource data without editor pages, private scripts or project initialization', () => {
    const routes = sceneRuntimeResources.get!;
    const matches = (url: string) => routes.filter(r => typeof r.url === 'string' ? r.url === url : r.url.test(url));
    for (const url of ['/scripting/web-env', '/scripting/engine/game-config', '/scripting/engine-dist/import-map.json', '/scripting/systemjs/system.js', '/scene-editor/settings.json']) {
        expect(matches(url).length).toBeGreaterThan(0);
    }
    for (const url of ['/scene-editor/', '/preview', '/static/web/scene-bundle.js', '/static/web/input-bridge.js']) {
        expect(matches(url)).toHaveLength(0);
    }
    expect(sceneRuntimeResources.post).toBeUndefined();
    expect(sceneRuntimeResources.staticFiles).toBeUndefined();
});
