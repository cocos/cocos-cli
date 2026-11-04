/** Versioned capability contract, published through @cocos/cocos-cli-types/scene. */
export interface HostModules {
    'commands/base': typeof import('../../../commands/base');
    'core/assets/index': typeof import('../../assets/index');
    'core/base/editor-shim': typeof import('../../base/editor-shim');
    'core/base/i18n': typeof import('../../base/i18n');
    'core/base/utils/uuid': typeof import('../../base/utils/uuid');
    'core/builder/@types/protected': typeof import('../../builder/@types/protected');
    'core/builder/index': typeof import('../../builder/index');
    'core/builder/platforms/web-common/utils': typeof import('../../builder/platforms/web-common/utils');
    'core/builder/share/common-options-validator': typeof import('../../builder/share/common-options-validator');
    'core/configuration/index': typeof import('../../configuration/index');
    'core/configuration/script/interface': typeof import('../../configuration/script/interface');
    'core/extension-roots': typeof import('../../extension-roots');
    'core/launcher': typeof import('../../launcher');
    'core/project/index': typeof import('../../project/index');
    'core/scene/common/index': typeof import('../common/index');
    'core/scene/common/preview': typeof import('../common/preview');
    'core/scene/common/reflection-probe': typeof import('../common/reflection-probe');
    'core/scene/index': typeof import('../index');
    'core/scene/main-process/index': typeof import('../main-process/index');
    'core/scene/main-process/rpc': typeof import('../main-process/rpc');
    'core/scene/runtime/resources/scene-routes': typeof import('./resources/scene-routes');
    'core/scene/runtime/resources/scripting-routes': typeof import('./resources/scripting-routes');
    'core/scene/runtime/resources/settings': typeof import('./resources/settings');
    'core/scripting/index': typeof import('../../scripting/index');
    'global': typeof import('../../../global');
    'lib/simulator/simulator': typeof import('../../../lib/simulator/simulator');
    'server/index': typeof import('../../../server/index');
    'server/interfaces': typeof import('../../../server/interfaces');
    'server/middleware/index': typeof import('../../../server/middleware/index');
    'server/socket': typeof import('../../../server/socket');
}
export interface BrowserModules {
    'scene': Omit<typeof import('./core'), 'default'>;
    'scene/context': Omit<typeof import('./context'), 'default'>;
    'scene/common': Omit<typeof import('../common/index'), 'default'>;
    // Configuration interfaces are type exports, with no browser runtime members.
    'scene/config': Record<never, never>;
    'scene/i18n': typeof import('../scene-process/i18n');
    'scene/rpc': Omit<typeof import('../scene-process/rpc'), 'default'>;
    'scene/light-probe-normal-reset': Omit<typeof import('../scene-process/light-probe-normal-reset'), 'default'>;
    'scene/animation/property-commit-event': Omit<typeof import('../scene-process/service/animation/property-commit-event'), 'default'>;
    'scene/editor-session': Omit<typeof import('../scene-process/service/core/editor-session'), 'default'>;
    'scene/dump': typeof import('../scene-process/service/dump/index');
    'scene/engine': Omit<typeof import('../scene-process/service/engine'), 'default'>;
    'scene/message': Omit<typeof import('../scene-process/service/message'), 'default'>;
    'scene/node': typeof import('../scene-process/service/node/index');
    'scene/node/node-create': Omit<typeof import('../scene-process/service/node/node-create'), 'default'>;
    'scene/node/node-type-config': typeof import('../scene-process/service/node/node-type-config');
    'scene/node/node-utils': Omit<typeof import('../scene-process/service/node/node-utils'), 'default'>;
    'scene/node/prefab-canvas-mutation': Omit<typeof import('../scene-process/service/node/prefab-canvas-mutation'), 'default'>;
    'scene/operation/types': Omit<typeof import('../scene-process/service/operation/types'), 'default'>;
    'scene/prefab/prefab-editor-utils': Omit<typeof import('../scene-process/service/prefab/prefab-editor-utils'), 'default'>;
    'scene/reference-image': Omit<typeof import('../scene-process/service/reference-image'), 'default'>;
    'scene/scene/light-probe-snapshot': Omit<typeof import('../scene-process/service/scene/light-probe-snapshot'), 'default'>;
    'scene/scene/light-probe-transform': Omit<typeof import('../scene-process/service/scene/light-probe-transform'), 'default'>;
    'scene/scene/utils': Omit<typeof import('../scene-process/service/scene/utils'), 'default'>;
    'scene/service-manager': Omit<typeof import('../scene-process/service/service-manager'), 'default'>;
    'scene/utils/asset-reload': Omit<typeof import('../scene-process/service/utils/asset-reload'), 'default'>;
    'scene/utils/editor-node': Omit<typeof import('../scene-process/service/utils/editor-node'), 'default'>;
    'scene/utils/state-machine/finite-state-machine': typeof import('../scene-process/service/utils/state-machine/finite-state-machine');
    'scene/utils/state-machine/state-interface': typeof import('../scene-process/service/utils/state-machine/state-interface');
    'scene/session/client': Omit<typeof import('../session/client'), 'default'>;
    'scene/session/methods': Omit<typeof import('../session/methods'), 'default'>;
    'scene/session/protocol': Omit<typeof import('../session/protocol'), 'default'>;
    'engine/editor-extends': Omit<typeof import('../../engine/editor-extends/index'), 'default'>;
    'engine/node-path': Omit<typeof import('../../engine/editor-extends/manager/path-utils'), 'default'>;
    'engine/serialize': Omit<typeof import('../../engine/editor-extends/utils/serialize/index'), 'default'>;
    'engine/deserialize': Omit<typeof import('../../engine/editor-extends/utils/deserialize'), 'default'>;
    'engine/geometry': Omit<typeof import('../../engine/editor-extends/utils/geometry'), 'default'>;
    'engine/prefab': Omit<typeof import('../../engine/editor-extends/utils/prefab'), 'default'>;
    'engine/graphics-config': Omit<typeof import('../../engine/graphics-config'), 'default'>;
    'engine/polyfill': Record<never, never>;
    // TypeScript exposes the CommonJS export-assignment member on this namespace.
    'engine/overwrite': { default: typeof import('cc/overwrite'); 'export=': typeof import('cc/overwrite') };
    'engine/editor/2d-misc': Omit<typeof import('cc/editor/2d-misc'), 'default'>;
    'engine/editor/new-gen-anim': Omit<typeof import('cc/editor/new-gen-anim'), 'default'>;
    'engine/editor/lod-group-utils': Omit<typeof import('cc/editor/lod-group-utils'), 'default'>;
}
export interface HostCapabilities {
    readonly apiVersion: 1;
    readonly cliVersion: string;
    readonly identity: object;
    readonly modules: HostModules;
    readonly portable: Pick<BrowserModules, 'scene/session/client' | 'scene/session/methods' | 'scene/session/protocol'>;
    readonly browserHostPath: string;
}
