import type { HostCapabilities } from './editor-types-contract';
let capabilities: HostCapabilities | undefined;
const identity = Object.freeze({});

/** The CLI owns implementation loading; private packages receive shared objects only. */
export function createSceneEditorHostCapabilities(): HostCapabilities {
    return capabilities ??= {
        apiVersion: 1,
        cliVersion: require('../../../../package.json').version,
        identity,
        browserHostPath: '/scripting/scene-runtime/host.js',
        modules: {
            'commands/base': require('../../../commands/base'),
            'core/assets/index': require('../../assets/index'),
            'core/base/editor-shim': require('../../base/editor-shim'),
            'core/base/i18n': require('../../base/i18n'),
            'core/base/utils/uuid': require('../../base/utils/uuid'),
            'core/builder/@types/protected': require('../../builder/@types/protected'),
            'core/builder/index': require('../../builder/index'),
            'core/builder/platforms/web-common/utils': require('../../builder/platforms/web-common/utils'),
            'core/builder/share/common-options-validator': require('../../builder/share/common-options-validator'),
            'core/configuration/index': require('../../configuration/index'),
            'core/configuration/script/interface': require('../../configuration/script/interface'),
            'core/extension-roots': require('../../extension-roots'),
            'core/launcher': require('../../launcher'),
            'core/project/index': require('../../project/index'),
            'core/scene/common/index': require('../common/index'),
            'core/scene/common/preview': require('../common/preview'),
            'core/scene/common/reflection-probe': require('../common/reflection-probe'),
            'core/scene/index': require('../index'),
            'core/scene/main-process/index': require('../main-process/index'),
            'core/scene/main-process/rpc': require('../main-process/rpc'),
            'core/scene/runtime/resources/scene-routes': require('./resources/scene-routes'),
            'core/scene/runtime/resources/scripting-routes': require('./resources/scripting-routes'),
            'core/scene/runtime/resources/settings': require('./resources/settings'),
            'core/scripting/index': require('../../scripting/index'),
            'global': require('../../../global'),
            'lib/simulator/simulator': require('../../../lib/simulator/simulator'),
            'server/index': require('../../../server/index'),
            'server/interfaces': require('../../../server/interfaces'),
            'server/middleware/index': require('../../../server/middleware/index'),
            'server/socket': require('../../../server/socket'),
        },
        portable: {
            'scene/session/client': require('../session/client'),
            'scene/session/methods': require('../session/methods'),
            'scene/session/protocol': require('../session/protocol'),
        },
    };
}
