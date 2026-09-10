/** Distinguishes probe sphere hits from transform handles without extending general mouse events. */
export const probeSelectionEvents = new WeakSet<object>();

/** Probe selection belongs to a particular component, never to a reusable Gizmo slot. */
export class ProbeSelection {
    private owner: object | null = null;
    private count = 0;
    readonly indices = new Set<number>();
    private regionStart: Set<number> | undefined;

    bind(owner: object | null, count: number): void {
        if (this.owner !== owner || this.count !== count) {
            this.indices.clear();
            this.regionStart = undefined;
        }
        this.owner = owner;
        this.count = count;
    }

    all(): void {
        this.indices.clear();
        for (let index = 0; index < this.count; index++) { this.indices.add(index); }
    }

    beginRegion(): void { this.regionStart = new Set(this.indices); }
    endRegion(): void { this.regionStart = undefined; }

    /** Every drag frame uses its initial snapshot, so shrinking an additive box removes transient hits. */
    region(hits: Iterable<number>, additive: boolean): void {
        const baseline = additive ? this.regionStart ?? new Set(this.indices) : [];
        this.indices.clear();
        for (const index of [...baseline, ...hits]) {
            if (index >= 0 && index < this.count) { this.indices.add(index); }
        }
    }
}
