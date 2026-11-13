/** Resolve assets relative to the resource base of the package that owns them. */
export function runtimeResource(name, base = new URL('./', import.meta.url).href) {
    return new URL(name, base.endsWith('/') ? base : base + '/').href;
}

export function backendResource(name, base) {
    if (!base) throw new Error('backendBaseUrl is required');
    return new URL(name.replace(/^\//, ''), base.endsWith('/') ? base : base + '/').href;
}

/** Inline import maps lose their source URL; resolve addresses before inserting them in the Webview. */
export function resolveImportMap(map, sourceUrl) {
    // SystemJS resolves bare targets through earlier maps (cc/env -> cc/editor/...).
    // Only URL-like values lose their base when a fetched map is inlined.
    const isUrlLike = value => typeof value === 'string' && /^(\.\.?\/|\/|[a-zA-Z][\w+.-]*:)/.test(value);
    const address = value => isUrlLike(value) ? new URL(value, sourceUrl).href : value;
    const key = address;
    const imports = values => Object.fromEntries(Object.entries(values || {}).map(([name, value]) => [key(name), address(value)]));
    return { ...map, imports: imports(map.imports), scopes: Object.fromEntries(
        Object.entries(map.scopes || {}).map(([scope, values]) => [new URL(scope, sourceUrl).href, imports(values)])
    ) };
}
