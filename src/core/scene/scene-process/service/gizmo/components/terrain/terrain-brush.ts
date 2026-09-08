import { Material, Terrain, Texture2D, Vec2, Vec3, Vec4, builtinResMgr, clamp } from 'cc';

export enum TerrainBrushType { CIRCLE, IMAGE, _MAX }

export class TerrainEdModifierKeyState { public siftPressed = false; }

const brushDepthOffsetDefaultRatios = 0.001;
let brushDepthOffset = 0.05;

/** Shared brush math and the editor brush preview material state. */
export class TerrainBrush {
    public static updateBrushDepthOffset(cameraDistanceFactor: number) {
        const ratios = brushDepthOffsetDefaultRatios + (cameraDistanceFactor / 300) * 0.00025;
        brushDepthOffset = Math.max(0.05, cameraDistanceFactor * ratios);
    }

    public static updateBrushDepthOffsetToMaterial(material: Material | null) {
        material?.setProperty('BrushDepthOffset', brushDepthOffset);
    }

    public material: Material | null = null;
    public position = new Vec3();
    public radius = 5;
    public strength = 1;
    public _setHeight = 0;
    public _rotation = 0;

    public get rotation() { return this._rotation / 180 * Math.PI; }
    public getDelta(_x: number, _z: number) { return 0; }
    public getBound(bbmin: Vec2, bbmax: Vec2) {
        bbmin.set(this.position.x - this.radius, this.position.z - this.radius);
        bbmax.set(this.position.x + this.radius, this.position.z + this.radius);
    }
    public update(_terrain: Terrain, pos: Vec3) { this.position.set(pos); }
}

export class TerrainBrushData {
    public bmin: number[] = [0, 0];
    public bmax: number[] = [0, 0];
    public width() { return this.bmax[0] - this.bmin[0] + 1; }
    public height() { return this.bmax[1] - this.bmin[1] + 1; }
}

export enum eTerrainCircleBrushType { Linear, Smooth, Spherical, Tip }

export class TerrainCircleBrush extends TerrainBrush {
    protected type = eTerrainCircleBrushType.Linear;
    protected falloff = 0.5;

    constructor() { super(); this._updateMaterial(); }

    public setType(type: eTerrainCircleBrushType) {
        if (this.type !== type) { this.type = type; this._updateMaterial(); }
    }
    public getType() { return this.type; }
    public _updateMaterial() {
        const effect = (cc as any).EffectAsset?.get?.('internal/editor/terrain-circle-brush');
        if (effect) {
            this.material = new Material();
            this.material.initialize({ effectAsset: effect, defines: this._getTypeDefine() });
        }
    }
    public _getTypeDefine(): Record<string, number> {
        return [{ LINEAR: 1 }, { SMOOTH: 1 }, { SPHERICAL: 1 }, { TIP: 1 }][this.type];
    }
    public static _calculateFalloff_Linear(distance: number, radius: number, falloff: number) {
        if (distance <= radius) return 1;
        if (distance > radius + falloff || falloff <= 0) return 0;
        return Math.max(0, 1 - (distance - radius) / falloff);
    }
    public static _calculateFalloff_Spherical(distance: number, radius: number, falloff: number) {
        const y = this._calculateFalloff_Linear(distance, radius, falloff);
        return y * y * (3 - 2 * y);
    }
    public static _calculateFalloff_Smooth(distance: number, radius: number, falloff: number) {
        if (distance <= radius) return 1;
        if (distance > radius + falloff || falloff <= 0) return 0;
        const y = (distance - radius) / falloff;
        return Math.sqrt(Math.max(0, 1 - y * y));
    }
    public static _calculateFalloff_Tip(distance: number, radius: number, falloff: number) {
        if (distance <= radius) return 1;
        if (distance > radius + falloff || falloff <= 0) return 0;
        const y = (falloff + radius - distance) / falloff;
        return 1 - Math.sqrt(Math.max(0, 1 - y * y));
    }
    public getDelta(x: number, z: number) {
        const distance = Math.hypot(x - this.position.x, z - this.position.z);
        const radius = (1 - this.falloff) * this.radius;
        const falloff = this.falloff * this.radius;
        let value = 0;
        switch (this.type) {
            case eTerrainCircleBrushType.Linear: value = TerrainCircleBrush._calculateFalloff_Linear(distance, radius, falloff); break;
            case eTerrainCircleBrushType.Smooth: value = TerrainCircleBrush._calculateFalloff_Smooth(distance, radius, falloff); break;
            case eTerrainCircleBrushType.Spherical: value = TerrainCircleBrush._calculateFalloff_Spherical(distance, radius, falloff); break;
            case eTerrainCircleBrushType.Tip: value = TerrainCircleBrush._calculateFalloff_Tip(distance, radius, falloff); break;
        }
        return value * this.strength;
    }
    public update(terrain: Terrain, pos: Vec3) {
        super.update(terrain, pos);
        if (!this.material) return;
        const terrainPos = terrain.node.getWorldPosition();
        const brushPos = new Vec4(terrainPos.x + pos.x, terrainPos.y + pos.y, terrainPos.z + pos.z, 0);
        const brushParams = new Vec4((1 - this.falloff) * this.radius, this.falloff * this.radius, 0, 0);
        for (const block of terrain.getBlocks()) {
            if (block._getBrushMaterial() !== this.material || !block._getBrushPass() || !block.material) continue;
            block.material.setProperty('BrushPos', brushPos);
            block.material.setProperty('BrushParams', brushParams);
            TerrainBrush.updateBrushDepthOffsetToMaterial(block.material);
        }
    }
}

export class TerrainImageBrush extends TerrainBrush {
    private _image: Texture2D | null = null;
    private _pixelData: number[] | null = null;

    constructor() {
        super();
        const effect = (cc as any).EffectAsset?.get?.('internal/editor/terrain-image-brush');
        if (effect) {
            this.material = new Material();
            this.material.initialize({ effectAsset: effect });
        }
    }

    public set image(value: Texture2D | null) {
        if (this._image === value) return;
        this._image = value;
        this._pixelData = null;
        if (!value || typeof document === 'undefined') return;
        const nativeData: any = value.mipmaps?.[0]?.data;
        const source = nativeData?._src;
        const readImage = (image: CanvasImageSource, width: number, height: number) => {
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            const context = canvas.getContext('2d');
            if (!context) return;
            context.drawImage(image, 0, 0, width, height);
            const data = context.getImageData(0, 0, width, height).data;
            this._pixelData = new Array(width * height);
            for (let i = 0; i < this._pixelData.length; ++i) this._pixelData[i] = data[i * 4] / 255;
        };
        if (source) {
            const image = document.createElement('img');
            image.onload = () => readImage(image, value.width, value.height);
            image.src = `file://${source}`;
        } else if (nativeData) {
            readImage(nativeData as CanvasImageSource, value.width, value.height);
        }
    }
    public get image() { return this._image; }
    public static getColor(pixels: number[], width: number, height: number, u: number, v: number) {
        u = clamp(u, 0, width - 1); v = clamp(v, 0, height - 1);
        return pixels[v * width + u];
    }
    public static sampleImage(pixels: number[], width: number, height: number, u: number, v: number) {
        u *= width - 1; v *= height - 1;
        const u0 = Math.floor(u), v0 = Math.floor(v), u1 = u0 + 1, v1 = v0 + 1;
        const du = u - u0, dv = v - v0;
        const c00 = this.getColor(pixels, width, height, u0, v0);
        const c10 = this.getColor(pixels, width, height, u1, v0);
        const c01 = this.getColor(pixels, width, height, u0, v1);
        const c11 = this.getColor(pixels, width, height, u1, v1);
        return (c00 + (c10 - c00) * du) * (1 - dv) + (c01 + (c11 - c01) * du) * dv;
    }
    public sample(u: number, v: number) {
        return this._pixelData && this._image
            ? TerrainImageBrush.sampleImage(this._pixelData, this._image.width, this._image.height, u, v)
            : 1;
    }
    public getDelta(x: number, z: number) {
        let dx = this.position.x - x, dz = this.position.z - z;
        if (this.rotation) {
            const sine = Math.sin(this.rotation), cosine = Math.cos(this.rotation);
            const tx = dx * cosine + dz * sine;
            dz = -dx * sine + dz * cosine; dx = tx;
        }
        const u = dx / this.radius * 0.5 + 0.5, v = dz / this.radius * 0.5 + 0.5;
        return u < 0 || u > 1 || v < 0 || v > 1 ? 0 : this.sample(u, v) * this.strength;
    }
    public getBound(bbmin: Vec2, bbmax: Vec2) {
        const c = Math.abs(Math.cos(this.rotation)), s = Math.abs(Math.sin(this.rotation));
        const halfX = this.radius * (c + s), halfZ = this.radius * (c + s);
        bbmin.set(this.position.x - halfX, this.position.z - halfZ);
        bbmax.set(this.position.x + halfX, this.position.z + halfZ);
    }
    public update(terrain: Terrain, pos: Vec3) {
        super.update(terrain, pos);
        if (!this.material) return;
        const terrainPos = terrain.node.getWorldPosition();
        const brushPos = new Vec4(terrainPos.x + pos.x, terrainPos.y + pos.y, terrainPos.z + pos.z, 0);
        const brushParams = new Vec4(this.radius, 1, this.rotation, 0);
        const fallback = builtinResMgr.get<Texture2D>('grey-texture');
        for (const block of terrain.getBlocks()) {
            if (block._getBrushMaterial() !== this.material || !block._getBrushPass() || !block.material) continue;
            block.material.setProperty('BrushPos', brushPos);
            block.material.setProperty('BrushParams', brushParams);
            block.material.setProperty('BrushImage', this._image ?? fallback);
            TerrainBrush.updateBrushDepthOffsetToMaterial(block.material);
        }
    }
}
