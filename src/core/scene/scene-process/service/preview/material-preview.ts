import { InteractivePreview } from './interactive-preview';
import {
    DirectionalLight,
    gfx,
    Material,
    Mesh,
    MeshRenderer,
    primitives,
    Quat,
    utils,
    Vec3,
    Scene,
    Node,
    renderer,
    director,
    assetManager,
} from 'cc';

const regions = [new gfx.BufferTextureCopy()];
regions[0].texExtent.depth = 1;

function insertAdditionals(geometry: primitives.IGeometry) {
    if (!geometry.customAttributes) {
        geometry.customAttributes = [];
    }
    const EditorExtends = (cc as any).EditorExtends || (globalThis as any).EditorExtends;
    if (EditorExtends?.GeometryUtils?.calculateTangents) {
        geometry.customAttributes.push({
            attr: new gfx.Attribute(gfx.AttributeName.ATTR_TANGENT, gfx.Format.RGBA32F),
            values: EditorExtends.GeometryUtils.calculateTangents(
                geometry.positions, geometry.indices!, geometry.normals!, geometry.uvs!,
            ) as number[],
        });
    }
    return geometry;
}

interface IPrimitiveInfo {
    mesh: Mesh;
    scale: Vec3;
}

let primitiveData: Record<string, IPrimitiveInfo> | null = null;

function getPrimitiveData(): Record<string, IPrimitiveInfo> {
    if (!primitiveData) {
        primitiveData = {
            box: {
                mesh: utils.createMesh(insertAdditionals(primitives.box())),
                scale: new Vec3(1, 1, 1),
            },
            sphere: {
                mesh: utils.createMesh(insertAdditionals(primitives.sphere())),
                scale: new Vec3(1, 1, 1),
            },
            capsule: {
                mesh: utils.createMesh(insertAdditionals(primitives.capsule())),
                scale: new Vec3(0.8, 0.8, 0.8),
            },
            cylinder: {
                mesh: utils.createMesh(insertAdditionals(primitives.cylinder())),
                scale: new Vec3(0.8, 0.8, 0.8),
            },
            torus: {
                mesh: utils.createMesh(insertAdditionals(primitives.torus())),
                scale: new Vec3(1, 1, 1),
            },
            cone: {
                mesh: utils.createMesh(insertAdditionals(primitives.cone())),
                scale: new Vec3(1, 1, 1),
            },
            quad: {
                mesh: utils.createMesh(insertAdditionals(primitives.quad())),
                scale: new Vec3(1, 1, 1),
            },
        };
    }
    return primitiveData;
}

const tempVec3A = new Vec3();
const tempVec3B = new Vec3();
const transientMaterialOverridePatchKey = Symbol.for('cocos.cli.materialPreview.transientMaterialOverrides');

import type { IMaterialPreviewInstance } from '../../../common/preview';
import { loadPreviewAsset } from './asset-reload';

function collectTextureProperties(value: any, out: any[]) {
    if (!value) return;
    if (Array.isArray(value)) {
        value.forEach((item) => collectTextureProperties(item, out));
        return;
    }
    if (typeof value.getGFXTexture === 'function') {
        out.push(value);
    }
}

function getMaterialTextureProperties(material: Material): any[] {
    const textures: any[] = [];
    const propsArray = (material as any)._props;
    if (!Array.isArray(propsArray)) {
        return textures;
    }
    for (const props of propsArray) {
        if (!props) continue;
        for (const key of Object.keys(props)) {
            collectTextureProperties(props[key], textures);
        }
    }
    return textures;
}

function getMaterialTextureEntries(material: Material): Array<{ passIndex: number; name: string; value: any }> {
    const entries: Array<{ passIndex: number; name: string; value: any }> = [];
    const propsArray = (material as any)._props;
    if (!Array.isArray(propsArray)) {
        return entries;
    }
    propsArray.forEach((props, passIndex) => {
        if (!props) return;
        for (const name of Object.keys(props)) {
            const value = props[name];
            const textures: any[] = [];
            collectTextureProperties(value, textures);
            if (textures.length) {
                entries.push({ passIndex, name, value });
            }
        }
    });
    return entries;
}

function areTexturesReady(textures: any[]): boolean {
    return textures.every((texture) => {
        const gfxTexture = texture.getGFXTexture?.();
        return !!gfxTexture && !!gfxTexture.width && !!gfxTexture.height;
    });
}

async function waitForMaterialTextures(material: Material, timeoutMs = 1000): Promise<void> {
    const textures = getMaterialTextureProperties(material);
    if (!textures.length || areTexturesReady(textures)) {
        return;
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 16));
        if (areTexturesReady(textures)) {
            return;
        }
    }
}

function refreshMaterialTextureBindings(material: Material) {
    for (const { passIndex, name, value } of getMaterialTextureEntries(material)) {
        material.setProperty(name, value, passIndex);
    }
}

function getActivePreviewService(): any {
    return (globalThis as any).cli?.Scene?.Preview;
}

function isMaterialPreviewActive(): boolean {
    const previewService = getActivePreviewService();
    return !!previewService && previewService.activePreview === previewService.materialPreview;
}

function isTransientPreviewMaterial(material: any): boolean {
    return isMaterialPreviewActive()
        && material
        && material.constructor === Material
        && !material._uuid;
}

function getPassCount(material: any): number {
    const effectAsset = material._effectAsset;
    const techIdx = material._techIdx || 0;
    const technique = effectAsset?.techniques?.[techIdx];
    return technique?.passes?.length || material._passes?.length || 1;
}

function applyMaterialRecord(material: any, key: '_defines' | '_states', overrides: Record<string, any>, passIdx?: number) {
    if (!overrides || typeof overrides !== 'object') {
        return;
    }

    const records = Array.isArray(material[key]) ? material[key] : (material[key] = []);
    const applyAt = (index: number) => {
        records[index] = {
            ...(records[index] || {}),
            ...overrides,
        };
    };

    if (passIdx === undefined) {
        for (let i = 0; i < getPassCount(material); i++) {
            applyAt(i);
        }
    } else {
        applyAt(passIdx);
    }

    material._update?.(true);
}

function installTransientMaterialOverridePatch() {
    const proto = Material.prototype as any;
    if (proto[transientMaterialOverridePatchKey]) {
        return;
    }

    const recompileShaders = proto.recompileShaders;
    const overridePipelineStates = proto.overridePipelineStates;

    Object.defineProperty(proto, transientMaterialOverridePatchKey, {
        configurable: false,
        enumerable: false,
        value: true,
    });

    proto.recompileShaders = function patchedRecompileShaders(overrides: Record<string, any>, passIdx?: number) {
        if (isTransientPreviewMaterial(this)) {
            applyMaterialRecord(this, '_defines', overrides, passIdx);
            return;
        }
        return recompileShaders.call(this, overrides, passIdx);
    };

    proto.overridePipelineStates = function patchedOverridePipelineStates(overrides: Record<string, any>, passIdx?: number) {
        if (isTransientPreviewMaterial(this)) {
            applyMaterialRecord(this, '_states', overrides, passIdx);
            return;
        }
        return overridePipelineStates.call(this, overrides, passIdx);
    };
}

export class MaterialPreview extends InteractivePreview implements IMaterialPreviewInstance {
    private lightComp!: DirectionalLight;
    private modelComp!: MeshRenderer;
    private currentPrimitive = 'sphere';
    private material: Material | null = null;

    private dummyUniformBuffer!: gfx.Buffer;
    private dummyStorageTexture!: gfx.Texture;
    private dummySampleTexture!: gfx.Texture;
    private dummySampler!: gfx.Sampler;
    private dummyStorageBuffer!: gfx.Buffer;
    private uniformBuffer!: gfx.Buffer;
    private storageBuffer!: gfx.Buffer;

    protected enableGrid = false;
    disablePan = true;
    disableMouseWheel = true;

    public init(registerName: string, queryName: string) {
        super.init(registerName, queryName);
        installTransientMaterialOverridePatch();
        const device = director.root!.device;
        const isSceneNative = !!(globalThis as any).isSceneNative;

        this.uniformBuffer = device.createBuffer(new gfx.BufferInfo(
            gfx.BufferUsageBit.UNIFORM,
            gfx.MemoryUsageBit.HOST | gfx.MemoryUsageBit.DEVICE,
            16,
        ));
        this.dummyUniformBuffer = device.createBuffer(new gfx.BufferViewInfo(this.uniformBuffer, 0, this.uniformBuffer.size));

        this.storageBuffer = !isSceneNative ? this.uniformBuffer : device.createBuffer(new gfx.BufferInfo(
            gfx.BufferUsageBit.STORAGE,
            gfx.MemoryUsageBit.HOST | gfx.MemoryUsageBit.DEVICE,
            16,
        ));
        this.dummyStorageBuffer = !isSceneNative ? this.dummyUniformBuffer :
            device.createBuffer(new gfx.BufferViewInfo(this.storageBuffer, 0, this.storageBuffer.size));

        this.dummySampleTexture = device.createTexture(new gfx.TextureInfo(
            gfx.TextureType.TEX2D,
            gfx.TextureUsageBit.SAMPLED,
            gfx.Format.RGBA8,
            4, 4,
        ));
        this.dummyStorageTexture = !isSceneNative ? this.dummySampleTexture : device.createTexture(new gfx.TextureInfo(
            gfx.TextureType.TEX2D,
            gfx.TextureUsageBit.STORAGE,
            gfx.Format.RGBA8,
            4, 4,
        ));
        this.dummySampler = device.getSampler(new gfx.SamplerInfo());
    }

    public createNodes(scene: Scene) {
        this.lightComp = new Node('Material Preview Light').addComponent(DirectionalLight);
        this.lightComp.node.setRotationFromEuler(-45, -45, 0);
        this.lightComp.node.setParent(scene);

        this.modelComp = new Node('Material Preview Model').addComponent(MeshRenderer);
        this.modelComp.mesh = getPrimitiveData().sphere.mesh;
        const material = new Material();
        material.initialize({ effectName: 'builtin-standard' });
        this.modelComp.material = material;
        this.setMaterial(material);

        this.modelComp.node.setParent(this.scene);
        this._modelNode = this.modelComp.node;
    }

    public setMaterial(material: Material | null, force = false) {
        if (material && (force || material !== this.material)) {
            const comp = this.modelComp;
            const _matInsInfo = {
                parent: material,
                owner: comp as any,
                subModelIdx: 0,
            };
            const instantiated = new renderer.MaterialInstance(_matInsInfo);
            comp.material = instantiated;
            this.material = material;
            this.updateDs();
            this.cameraComp.enabled = true;
            this.cameraComp.node.getWorldPosition(tempVec3A);
            this.modelComp.node.getWorldPosition(tempVec3B);
            this.viewDist = Vec3.distance(tempVec3A, tempVec3B);
        }
    }

    public updateDs() {
        const model = this.modelComp.model;
        if (model) {
            for (let i = 0; i < model.subModels.length; i++) {
                const ds = model.subModels[i].descriptorSet;
                const bindings = ds.layout.bindings;
                const device = director.root!.device;
                for (let j = 0; j < bindings.length; j++) {
                    const desc = bindings[j];
                    const binding = desc.binding;
                    const dsType = desc.descriptorType;
                    if (dsType & gfx.DescriptorType.UNIFORM_BUFFER ||
                        dsType & gfx.DescriptorType.DYNAMIC_UNIFORM_BUFFER) {
                        if (!ds.getBuffer(binding)) { ds.bindBuffer(binding, this.dummyUniformBuffer); }
                    } else if (dsType & gfx.DescriptorType.STORAGE_BUFFER ||
                        dsType & gfx.DescriptorType.DYNAMIC_STORAGE_BUFFER) {
                        if (!ds.getBuffer(binding)) { ds.bindBuffer(binding, this.dummyStorageBuffer); }
                    } else if (dsType & (gfx as any).DESCRIPTOR_SAMPLER_TYPE) {
                        if (!ds.getTexture(binding)) {
                            if (dsType & gfx.DescriptorType.SAMPLER_TEXTURE ||
                                dsType & gfx.DescriptorType.TEXTURE) {
                                ds.bindTexture(binding, this.dummySampleTexture);
                            } else if (dsType & gfx.DescriptorType.STORAGE_IMAGE) {
                                ds.bindTexture(binding, this.dummyStorageTexture);
                            }
                        }
                        if (!ds.getSampler(binding)) { ds.bindSampler(binding, this.dummySampler); }
                    }
                }
                ds.update();
            }
        }
    }

    public async setMaterialByUuid(uuid: string) {
        if (!uuid) {
            console.warn(`Failed to set material in Material preview, by uuid: ${uuid}`);
            return;
        }
        try {
            const material = await loadPreviewAsset<Material>(uuid, 'material');
            await waitForMaterialTextures(material);
            refreshMaterialTextureBindings(material);
            this.setMaterial(material, true);
            assetManager.assetListener?.emit(uuid, material);
            this.resetCameraView();
        } catch (e) {
            console.warn(`[MaterialPreview] setMaterial failed:`, e);
            this.resetCameraView();
        }
    }

    public switchPrimitive(type: string) {
        const data = getPrimitiveData();
        if (!data[type]) return;
        if (type === this.currentPrimitive) return;
        this.currentPrimitive = type;
        this.modelComp.mesh = data[type].mesh;
        this.updateDs();
        this.modelComp.node.setScale(data[type].scale);
        this.cameraComp.enabled = true;
    }

    public setLightEnable(enable: boolean) {
        if (this.lightComp.enabled !== enable) {
            this.lightComp.enabled = enable;
        }
    }

    public resetCameraView() {
        if (this._modelNode) {
            this.resetCamera(this._modelNode);
            this.autoPerfectCameraViewOnModel(this._modelNode);
        }
    }
}
