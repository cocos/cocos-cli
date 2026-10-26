/** Optional view callbacks. The public engine never imports a view service. */
const updates = new Set<(dt: number) => void>();

export function registerViewUpdate(update: (dt: number) => void): () => void {
    updates.add(update);
    return () => { updates.delete(update); };
}

export function updateViews(dt: number): void {
    for (const update of [...updates]) update(dt);
}
