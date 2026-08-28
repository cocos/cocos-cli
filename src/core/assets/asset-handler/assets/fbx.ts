import { AssetHandlerBase } from '../../@types/protected';
import GltfHandler from './gltf';

export const FbxHandler: AssetHandlerBase = {
    ...GltfHandler,

    // Handler 的名字，用于指定 Handler as 等
    name: 'fbx',

    propertySchemaConfig: {
        ...(GltfHandler.propertySchemaConfig ?? {}),
        legacyFbxImporter: {
            title: 'i18n:ENGINE.assets.fbx.legacyFbxImporter.name',
            description: 'i18n:ENGINE.assets.fbx.legacyFbxImporter.title',
            type: 'boolean',
            default: false,
        },
        fbx: {
            title: 'i18n:ENGINE.assets.fbx.fbx',
            description: 'i18n:importer.property_schema.fbx.fbx_description',
            type: 'object',
            default: {
                unitConversion: 'geometry-level',
                animationBakeRate: 24,
                preferLocalTimeSpan: true,
                smartMaterialEnabled: false,
                matchMeshNames: false,
            },
            properties: {
                unitConversion: {
                    title: 'i18n:importer.property_schema.fbx.unit_conversion',
                    description: 'i18n:importer.property_schema.fbx.unit_conversion_description',
                    type: 'string',
                    default: 'geometry-level',
                    enum: ['geometry-level', 'hierarchy-level', 'disabled'],
                    enumDescriptions: [
                        'i18n:importer.property_schema.fbx.unit_conversion_geometry_level',
                        'i18n:importer.property_schema.fbx.unit_conversion_hierarchy_level',
                        'i18n:importer.property_schema.fbx.unit_conversion_disabled',
                    ],
                },
                animationBakeRate: {
                    title: 'i18n:ENGINE.assets.fbx.animationBakeRate.name',
                    description: 'i18n:ENGINE.assets.fbx.animationBakeRate.title',
                    type: 'number',
                    default: 24,
                    enum: [0, 24, 25, 30, 60],
                    enumDescriptions: ['i18n:ENGINE.assets.fbx.animationBakeRate.auto', '24 FPS', '25 FPS', '30 FPS', '60 FPS'],
                },
                preferLocalTimeSpan: {
                    title: 'i18n:ENGINE.assets.fbx.preferLocalTimeSpan.name',
                    description: 'i18n:ENGINE.assets.fbx.preferLocalTimeSpan.title',
                    type: 'boolean',
                    default: true,
                },
                smartMaterialEnabled: {
                    title: 'i18n:ENGINE.assets.fbx.smartMaterialEnabled.name',
                    description: 'i18n:ENGINE.assets.fbx.smartMaterialEnabled.title',
                    type: 'boolean',
                    default: false,
                },
                matchMeshNames: {
                    title: 'i18n:importer.property_schema.fbx.match_mesh_names',
                    description: 'i18n:importer.property_schema.fbx.match_mesh_names_description',
                    type: 'boolean',
                    default: false,
                },
            },
        },
    },
};

export default FbxHandler;
