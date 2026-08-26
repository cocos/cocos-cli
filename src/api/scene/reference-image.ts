import { COMMON_STATUS, CommonResultType } from '../base/schema-base';
import { description, param, result, title, tool } from '../decorator/decorator';
import { Scene } from '../../core/scene';
import {
    SchemaReferenceImageParameters,
    SchemaReferenceImagePath,
    SchemaReferenceImageState,
    SchemaReferenceImageVisibility,
    TReferenceImageParameters,
    TReferenceImagePath,
    TReferenceImageState,
    TReferenceImageVisibility,
} from './reference-image-schema';

/** Formal, semantic MCP operations. Ephemeral preview APIs remain scene-Webview only. */
export class ReferenceImageApi {
    @tool('reference-image-query')
    @title('Query reference image state')
    @description('Get the current reference-image library, current binding, parameters and effective visibility.')
    @result(SchemaReferenceImageState)
    async query(): Promise<CommonResultType<TReferenceImageState>> {
        return this.execute(() => Scene.ReferenceImage.getState());
    }

    @tool('reference-image-add')
    @title('Add and select reference image')
    @description('Validate a local PNG, JPG, or JPEG, add it to the local library, and bind it to the current scene or prefab.')
    @result(SchemaReferenceImageState)
    async add(@param(SchemaReferenceImagePath) options: TReferenceImagePath): Promise<CommonResultType<TReferenceImageState>> {
        return this.execute(() => Scene.ReferenceImage.addAndSelect(options));
    }

    @tool('reference-image-delete')
    @title('Delete reference image')
    @description('Remove a reference image record and all scene bindings. The original local file is not deleted.')
    @result(SchemaReferenceImageState)
    async delete(@param(SchemaReferenceImagePath) options: TReferenceImagePath): Promise<CommonResultType<TReferenceImageState>> {
        return this.execute(() => Scene.ReferenceImage.remove(options));
    }

    @tool('reference-image-select')
    @title('Select reference image')
    @description('Bind an existing reference image to the current scene or prefab.')
    @result(SchemaReferenceImageState)
    async select(@param(SchemaReferenceImagePath) options: TReferenceImagePath): Promise<CommonResultType<TReferenceImageState>> {
        return this.execute(() => Scene.ReferenceImage.select(options));
    }

    @tool('reference-image-set-visible')
    @title('Set reference image visibility')
    @description('Set the persisted desired visibility. Reference images remain hidden while the editor is not in 2D mode.')
    @result(SchemaReferenceImageState)
    async setVisible(@param(SchemaReferenceImageVisibility) options: TReferenceImageVisibility): Promise<CommonResultType<TReferenceImageState>> {
        return this.execute(() => Scene.ReferenceImage.setVisible(options));
    }

    @tool('reference-image-refresh')
    @title('Refresh current reference image')
    @description('Reload the current reference image from its original local path.')
    @result(SchemaReferenceImageState)
    async refresh(): Promise<CommonResultType<TReferenceImageState>> {
        return this.execute(() => Scene.ReferenceImage.refresh());
    }

    @tool('reference-image-set-parameters')
    @title('Set reference image parameters')
    @description('Persist finite position or scale values and opacity from 0 to 100 for the image bound to the current scene or prefab.')
    @result(SchemaReferenceImageState)
    async setParameters(@param(SchemaReferenceImageParameters) patch: TReferenceImageParameters): Promise<CommonResultType<TReferenceImageState>> {
        return this.execute(() => Scene.ReferenceImage.commitParameters({ patch }));
    }

    private async execute(operation: () => Promise<TReferenceImageState>): Promise<CommonResultType<TReferenceImageState>> {
        try {
            return { code: COMMON_STATUS.SUCCESS, data: await operation() };
        } catch (error) {
            return { code: COMMON_STATUS.FAIL, reason: error instanceof Error ? error.message : String(error) };
        }
    }
}
