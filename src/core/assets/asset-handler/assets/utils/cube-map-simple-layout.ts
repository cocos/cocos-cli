/**
 * Blit area of each cube map face in the whole image.
 */
export type ISimpleLayout = Record<
    'top' | 'bottom' | 'left' | 'right' | 'front' | 'back',
    {
        x: number;
        y: number;
        width: number;
        height: number;
    }
>;

/**
 * NOTE: this table shall be only used for internal usage(testing).
 */
export const simpleLayoutTable: Array<
    [
        [number, number],
        {
            // layout aspect ratio; defined by [width, height]
            front: [number, number]; // x, y coordinates of the face image; x is in range [0, width); y is in the range [0, height]
            back: [number, number];
            top: [number, number];
            bottom: [number, number];
            right: [number, number];
            left: [number, number];
        },
    ]
> = [
    [
        [3, 4],
        {
            //   u
            // f r b
            //   d
            //   l
            front: [0, 1],
            back: [2, 1],
            top: [1, 0],
            bottom: [1, 2],
            right: [1, 1],
            left: [1, 3],
        },
    ],
    [
        [4, 3],
        {
            //   u
            // l f r b
            //   d
            front: [1, 1],
            back: [3, 1],
            top: [1, 0],
            bottom: [1, 2],
            right: [2, 1],
            left: [0, 1],
        },
    ],
    [
        [6, 1],
        {
            // r l u d f b
            right: [0, 0],
            left: [1, 0],
            top: [2, 0],
            bottom: [3, 0],
            front: [4, 0],
            back: [5, 0],
        },
    ],
    [
        [1, 6],
        {
            // inverse what [6, 1] does
            right: [0, 0],
            left: [0, 1],
            top: [0, 2],
            bottom: [0, 3],
            front: [0, 4],
            back: [0, 5],
        },
    ],
];

/**
 * Given the width and height of an image. If it match the simple layout, returns the layout.
 * Returns `undefined` otherwise.
 * @param width Image width.
 * @param height Image height.
 */
export function matchSimpleLayout(width: number, height: number): ISimpleLayout | undefined {
    for (const [[matchedWidth, matchedHeight], layoutCoords] of simpleLayoutTable) {
        if (width % matchedWidth !== 0 || width / matchedWidth !== height / matchedHeight) {
            continue; // Not the best match
        }
        const scale = width / matchedWidth;
        const layout = {} as ISimpleLayout;
        for (const faceName of Object.getOwnPropertyNames(layoutCoords) as (keyof typeof layoutCoords)[]) {
            const [x, y] = layoutCoords[faceName as keyof typeof layoutCoords];
            layout[faceName] = {
                x: x * scale,
                y: y * scale,
                width: scale,
                height: scale,
            };
        }
        return layout;
    }
}
