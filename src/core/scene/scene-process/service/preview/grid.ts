import { Camera, Color, Node, Vec3, gfx, MeshRenderer, Layers } from 'cc';
import { CameraUtils } from '../camera/utils';
import LinearTicks from '../camera/grid/linear-ticks';

const _lineEnd = 1000000;
const tempV3 = new Vec3();

export class Grid {
    private _gridMeshComp: MeshRenderer;
    private synchronizeCamera: Camera;
    private _lineColor = cc.color().fromHEX('#A6A6A6');
    hTicks?: LinearTicks;
    vTicks?: LinearTicks;

    constructor(rootNode: Node, synchronizeCamera: Camera) {
        this._gridMeshComp = CameraUtils.createGrid('internal/editor/grid', rootNode);
        this._gridMeshComp.node.layer = Layers.Enum.DEFAULT;
        this._gridMeshComp.node.setRotationFromEuler(new Vec3(90, 0, 0));

        this.synchronizeCamera = synchronizeCamera;

        this.hTicks = new LinearTicks().initTicks([5, 2], 1, 10000).spacing(15, 80);
        this.vTicks = new LinearTicks().initTicks([5, 2], 1, 10000).spacing(15, 80);
        this.synchronizeCamera.node.on('transform-changed', this.updateGrid, this);
    }

    private _hide = false;

    hide() {
        this._hide = true;
        this._gridMeshComp.node.active = false;
    }

    show() {
        this._hide = false;
        this._gridMeshComp.node.active = true;
    }

    public _updateGridData(positions: number[], colors: number[], lineColor: Color, lineEnd: number | null = null) {
        const hTicks = this.hTicks;
        const vTicks = this.vTicks;

        this.synchronizeCamera.node.getWorldPosition(tempV3);
        const cameraPos = tempV3;

        const distance = cameraPos.y;
        const scale = distance / 500;

        const range = 5000;
        const scaleRange = (range * scale) | 0;

        const curStartX = -scaleRange + cameraPos.x;
        const curEndX = scaleRange + cameraPos.x;
        const curStartY = -scaleRange + cameraPos.z;
        const curEndY = scaleRange + cameraPos.z;
        hTicks!.range(curStartX, curEndX, range);
        vTicks!.range(curStartY, curEndY, range);

        const tempColor = lineColor.clone();
        tempColor.a = 0;

        const lineOpacity = 200;
        for (let i = hTicks!.minTickLevel; i <= hTicks!.maxTickLevel; ++i) {
            const ratio = hTicks!.tickRatios[i];
            if (ratio > 0) {
                const ticks = hTicks!.ticksAtLevel(i, true);
                for (let j = 0; j < ticks.length; ++j) {
                    const tick = ticks[j];

                    const color = lineColor.clone();
                    color.a = ratio * lineOpacity;

                    const dist = Math.abs(tick - cameraPos.x);
                    color.a *= 1 - dist / scaleRange;
                    // x
                    positions.push(tick, cameraPos.z);
                    positions.push(tick, curStartY);
                    positions.push(tick, cameraPos.z);
                    positions.push(tick, curEndY);
                    colors.push(color.x, color.y, color.z, color.w);
                    colors.push(tempColor.x, tempColor.y, tempColor.z, tempColor.w);
                    colors.push(color.x, color.y, color.z, color.w);
                    colors.push(tempColor.x, tempColor.y, tempColor.z, tempColor.w);
                }
            }
        }

        for (let i = vTicks!.minTickLevel; i <= vTicks!.maxTickLevel; ++i) {
            const ratio = vTicks!.tickRatios[i];
            if (ratio > 0) {
                const ticks = vTicks!.ticksAtLevel(i, true);
                for (let j = 0; j < ticks.length; ++j) {
                    const tick = ticks[j];

                    const color = lineColor.clone();
                    color.a = ratio * lineOpacity;

                    const dist = Math.abs(tick - cameraPos.z);
                    color.a *= 1 - dist / scaleRange;

                    // y
                    positions.push(cameraPos.x, tick);
                    positions.push(curStartX, tick);
                    positions.push(cameraPos.x, tick);
                    positions.push(curEndX, tick);
                    colors.push(color.x, color.y, color.z, color.w);
                    colors.push(tempColor.x, tempColor.y, tempColor.z, tempColor.w);
                    colors.push(color.x, color.y, color.z, color.w);
                    colors.push(tempColor.x, tempColor.y, tempColor.z, tempColor.w);
                }
            }
        }
    }

    public updateGrid() {
        if (this._hide) { return; }
        const positions: number[] = [];
        const colors: number[] = [];
        const indices: number[] = [];
        this._updateGridData(positions, colors, this._lineColor, _lineEnd);

        if (positions.length > 0) {
            for (let i = 0; i < positions.length; i += 2) {
                indices.push(i / 2);
            }

            CameraUtils.updateVBAttr(this._gridMeshComp, gfx.AttributeName.ATTR_POSITION, positions);
            CameraUtils.updateVBAttr(this._gridMeshComp, gfx.AttributeName.ATTR_COLOR, colors);
            CameraUtils.updateIB(this._gridMeshComp, indices);
        }
    }
}
