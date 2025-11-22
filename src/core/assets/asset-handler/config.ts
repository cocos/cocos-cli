import { AssetHandler } from '../@types/protected';
export interface AssetHandlerInfo {
    name: string;
    extensions: string[];
    load: () => AssetHandler | Promise<AssetHandler>;
}

export const assetHandlerInfos: AssetHandlerInfo[] = [
    {
        name: 'directory',
        extensions: ['*'],
        load: async () => {
            return (await import('./assets/directory')).default;
        }
    },
    {
        name: 'unknown',
        extensions: ['*'],
        load: async () => {
            return (await import('./assets/unknown')).default;
        }
    },
    {
        name: 'text',
        extensions: [
            '.txt',
            '.html',
            '.htm',
            '.xml',
            '.css',
            '.less',
            '.scss',
            '.stylus',
            '.yaml',
            '.ini',
            '.csv',
            '.proto',
            '.ts',
            '.tsx',
            '.md',
            '.markdown'
        ],
        load: async () => {
            return (await import('./assets/text')).default;
        }
    },
    {
        name: 'json',
        extensions: ['.json'],
        load: async () => {
            return (await import('./assets/json')).default;
        }
    },
    {
        name: 'spine-data',
        extensions: ['.json', '.skel'],
        load: async () => {
            return (await import('./assets/spine')).default;
        }
    },
    {
        name: 'dragonbones',
        extensions: ['.json', '.dbbin'],
        load: async () => {
            return (await import('./assets/dragonbones/dragonbones')).default;
        }
    },
    {
        name: 'dragonbones-atlas',
        extensions: ['.json'],
        load: async () => {
            return (await import('./assets/dragonbones/dragonbones-atlas')).default;
        }
    },
    {
        name: 'terrain',
        extensions: ['.terrain'],
        load: async () => {
            return (await import('./assets/terrain')).default;
        }
    },
    {
        name: 'javascript',
        extensions: ['.js', '.cjs', '.mjs'],
        load: async () => {
            return (await import('./assets/javascript')).default;
        }
    },
    {
        name: 'typescript',
        extensions: ['.ts'],
        load: async () => {
            return (await import('./assets/typescript')).default;
        }
    },
    {
        name: 'scene',
        extensions: ['.scene', '.fire'],
        load: async () => {
            return (await import('./assets/scene')).default;
        }
    },
    {
        name: 'prefab',
        extensions: ['.prefab'],
        load: async () => {
            return (await import('./assets/scene/prefab')).default;
        }
    },
    {
        name: 'sprite-frame',
        extensions: [],
        load: async () => {
            return (await import('./assets/sprite-frame')).default;
        }
    },
    {
        name: 'tiled-map',
        extensions: ['.tmx'],
        load: async () => {
            return (await import('./assets/tiled-map')).default;
        }
    },
    {
        name: 'buffer',
        extensions: ['.bin'],
        load: async () => {
            return (await import('./assets/buffer')).default;
        }
    },
    {
        name: 'image',
        extensions: [
            '.jpg',
            '.png',
            '.jpeg',
            '.webp',
            '.tga',
            '.hdr',
            '.bmp',
            '.psd',
            '.tif',
            '.tiff',
            '.exr',
            '.znt'
        ],
        load: async () => {
            return (await import('./assets/image')).default;
        }
    },
    {
        name: 'sign-image',
        extensions: [],
        load: async () => {
            return (await import('./assets/image/sign')).default;
        }
    },
    {
        name: 'alpha-image',
        extensions: [],
        load: async () => {
            return (await import('./assets/image/alpha')).default;
        }
    },
    {
        name: 'texture',
        extensions: ['.texture'],
        load: async () => {
            return (await import('./assets/texture')).default;
        }
    },
    {
        name: 'texture-cube',
        extensions: ['.cubemap'],
        load: async () => {
            return (await import('./assets/texture-cube')).default;
        }
    },
    {
        name: 'erp-texture-cube',
        extensions: [],
        load: async () => {
            return (await import('./assets/erp-texture-cube')).default;
        }
    },
    {
        name: 'render-texture',
        extensions: ['.rt'],
        load: async () => {
            return (await import('./assets/render-texture')).default;
        }
    },
    {
        name: 'texture-cube-face',
        extensions: [],
        load: async () => {
            return (await import('./assets/texture-cube-face')).default;
        }
    },
    {
        name: 'rt-sprite-frame',
        extensions: [],
        load: async () => {
            return (await import('./assets/render-texture/rt-sprite-frame')).default;
        }
    },
    {
        name: 'gltf',
        extensions: ['.gltf', '.glb'],
        load: async () => {
            return (await import('./assets/gltf')).default;
        }
    },
    {
        name: 'gltf-mesh',
        extensions: [],
        load: async () => {
            return (await import('./assets/gltf/mesh')).default;
        }
    },
    {
        name: 'gltf-animation',
        extensions: [],
        load: async () => {
            return (await import('./assets/gltf/animation')).default;
        }
    },
    {
        name: 'gltf-skeleton',
        extensions: [],
        load: async () => {
            return (await import('./assets/gltf/skeleton')).default;
        }
    },
    {
        name: 'gltf-material',
        extensions: [],
        load: async () => {
            return (await import('./assets/gltf/material')).default;
        }
    },
    {
        name: 'gltf-scene',
        extensions: [],
        load: async () => {
            return (await import('./assets/gltf/prefab')).default;
        }
    },
    {
        name: 'gltf-embeded-image',
        extensions: [],
        load: async () => {
            return (await import('./assets/gltf/image')).default;
        }
    },
    {
        name: 'fbx',
        extensions: ['.fbx'],
        load: async () => {
            return (await import('./assets/fbx')).default;
        }
    },
    {
        name: 'material',
        extensions: ['.mtl'],
        load: async () => {
            return (await import('./assets/material')).default;
        }
    },
    {
        name: 'physics-material',
        extensions: ['.pmtl'],
        load: async () => {
            return (await import('./assets/physics-material')).default;
        }
    },
    {
        name: 'effect',
        extensions: ['.effect'],
        load: async () => {
            return (await import('./assets/effect')).default;
        }
    },
    {
        name: 'effect-header',
        extensions: ['.chunk'],
        load: async () => {
            return (await import('./assets/effect-header')).default;
        }
    },
    {
        name: 'audio-clip',
        extensions: [
            '.mp3',
            '.wav',
            '.ogg',
            '.aac',
            '.pcm',
            '.m4a'
        ],
        load: async () => {
            return (await import('./assets/audio-clip')).default;
        }
    },
    {
        name: 'animation-clip',
        extensions: ['.anim'],
        load: async () => {
            return (await import('./assets/animation-clip')).default;
        }
    },
    {
        name: 'animation-graph',
        extensions: ['.animgraph'],
        load: async () => {
            return (await import('./assets/animation-graph')).default;
        }
    },
    {
        name: 'animation-graph-variant',
        extensions: ['.animgraphvari'],
        load: async () => {
            return (await import('./assets/animation-graph-variant')).default;
        }
    },
    {
        name: 'animation-mask',
        extensions: ['.animask'],
        load: async () => {
            return (await import('./assets/animation-mask')).default;
        }
    },
    {
        name: 'ttf-font',
        extensions: ['.ttf'],
        load: async () => {
            return (await import('./assets/ttf-font')).default;
        }
    },
    {
        name: 'bitmap-font',
        extensions: ['.fnt'],
        load: async () => {
            return (await import('./assets/bitmap-font')).default;
        }
    },
    {
        name: 'particle',
        extensions: ['.plist'],
        load: async () => {
            return (await import('./assets/particle')).default;
        }
    },
    {
        name: 'sprite-atlas',
        extensions: ['.plist'],
        load: async () => {
            return (await import('./assets/texture-packer')).default;
        }
    },
    {
        name: 'auto-atlas',
        extensions: ['.pac'],
        load: async () => {
            return (await import('./assets/auto-atlas')).default;
        }
    },
    {
        name: 'label-atlas',
        extensions: ['.labelatlas'],
        load: async () => {
            return (await import('./assets/label-atlas')).default;
        }
    },
    {
        name: 'render-pipeline',
        extensions: ['.rpp'],
        load: async () => {
            return (await import('./assets/render-pipeline')).default;
        }
    },
    {
        name: 'render-stage',
        extensions: ['.stg'],
        load: async () => {
            return (await import('./assets/render-stage')).default;
        }
    },
    {
        name: 'render-flow',
        extensions: ['.flow'],
        load: async () => {
            return (await import('./assets/render-flow')).default;
        }
    },
    {
        name: 'instantiation-material',
        extensions: ['.material'],
        load: async () => {
            return (await import('./assets/instantiation-asset/material')).default;
        }
    },
    {
        name: 'instantiation-mesh',
        extensions: ['.mesh'],
        load: async () => {
            return (await import('./assets/instantiation-asset/mesh')).default;
        }
    },
    {
        name: 'instantiation-skeleton',
        extensions: ['.skeleton'],
        load: async () => {
            return (await import('./assets/instantiation-asset/skeleton')).default;
        }
    },
    {
        name: 'instantiation-animation',
        extensions: ['.animation'],
        load: async () => {
            return (await import('./assets/instantiation-asset/animation')).default;
        }
    },
    {
        name: 'video-clip',
        extensions: ['.mp4'],
        load: async () => {
            return (await import('./assets/video-clip')).default;
        }
    }
];