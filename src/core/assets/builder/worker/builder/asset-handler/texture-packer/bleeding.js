// ------------------------------------------------------------------
/// prevents edge artifacts due to bilinear filtering
/// Note: Some image editors like Photoshop tend to fill purely transparent pixel with
/// white color (R=1, G=1, B=1, A=0). This is generally OK, because these white pixels
/// are impossible to see in normal circumstances.  However, when such textures are
/// used in 3D with bilinear filtering, the shader will sometimes sample beyond visible
/// edges into purely transparent pixels and the white color stored there will bleed
/// into the visible edge.  This method scans the texture to find all purely transparent
/// pixels that have a visible neighbor pixel, and copy the color data from that neighbor
/// into the transparent pixel, while preserving its 0 alpha value.  In order to
/// optimize the algorithm for speed of execution, a compromise is made to use any
/// arbitrary neighboring pixel, as this should generally lead to correct results.
/// It also limits itself to the immediate neighbors around the edge, resulting in a
/// a bleed of a single pixel border around the edges, which should be fine, as bilinear
/// filtering should generally not sample beyond that one pixel range.
// ------------------------------------------------------------------

// X and Y offsets used in contour bleed for sampling all around each purely transparent pixel

var applyContourBleed = function(resultBuffer, srcBuffer, width, rect, sampleXOffsets, sampleYOffsets, bufIdxOffsets) {
    if (rect.width === 0 || rect.height === 0) {
        return;
    }

    var start_x = rect.x;
    var end_x = rect.xMax;
    var start_y = rect.y;
    var end_y = rect.yMax;

    var pixelBytes = 4;
    var ditch = width * pixelBytes;
    var offsetIndex = 0, offsetCount = sampleXOffsets.length;

    var sampleX = 0, sampleY = 0, sampleBufIdx = 0;
    var bufIdx = 0;
    var bufRowStart = start_y * ditch + start_x * pixelBytes;
    for (var y = start_y, x = 0; y < end_y; ++y, bufRowStart += ditch) {
        bufIdx = bufRowStart;
        for (x = start_x; x < end_x; ++x, bufIdx += pixelBytes) {
            // only needs to bleed into purely transparent pixels
            if (srcBuffer[bufIdx + 3] === 0) {
                // sample all around to find any non-purely transparent pixels
                for (offsetIndex = 0; offsetIndex < offsetCount; offsetIndex++) {
                    sampleX = x + sampleXOffsets[offsetIndex];
                    sampleY = y + sampleYOffsets[offsetIndex];
                    // check to stay within texture bounds
                    if (sampleX >= start_x && sampleX < end_x && sampleY >= start_y && sampleY < end_y) {
                        sampleBufIdx = bufIdx + bufIdxOffsets[offsetIndex];
                        if (srcBuffer[sampleBufIdx + 3] > 0) {
                            // Copy RGB color channels to purely transparent pixel, but preserving its 0 alpha
                            resultBuffer[bufIdx] = srcBuffer[sampleBufIdx];
                            resultBuffer[bufIdx + 1] = srcBuffer[sampleBufIdx + 1];
                            resultBuffer[bufIdx + 2] = srcBuffer[sampleBufIdx + 2];
                            break;
                        }
                    }
                }
            }
        }
    }
};

// ------------------------------------------------------------------
/// prevents border artifacts due to bilinear filtering
/// Note: Shaders with bilinear filtering will sometimes sample outside the bounds
/// of the element, in the padding area, resulting in the padding color to bleed
/// around the rectangular borders of the element.  This is true even when padding is
/// purely transparent, because in that case, it is the 0 alpha that bleeds into the
/// alpha of the outer pixels.  Such alpha bleed is especially problematic when
/// trying to seamlessly tile multiple rectangular textures, as semi-transparent seams
/// will sometimes appear at different scales.  This method duplicates a single row of
/// pixels from the inner border of an element into the padding area.  This technique
/// can be used with all kinds of textures without risk, even textures with uneven
/// transparent edges, as it only allows the shader to sample more of the same (opaque
/// or transparent) values when it exceeds the bounds of the element.
// ------------------------------------------------------------------

var applyPaddingBleed = function(resultBuffer, srcBuffer, width, height, rect) {
    if (rect.width === 0 || rect.height === 0) {
        return;
    }

    var yMin = rect.y;
    var yMax = rect.yMax - 1;
    var xMin = rect.x;
    var xMax = rect.xMax - 1;

    var pixelBytes = 4;
    var ditch = width * pixelBytes;
    var xBufMin = xMin * pixelBytes;
    var xBufMax = xMax * pixelBytes;
    var topRowStart = yMin * ditch;
    var botRowStart = yMax * ditch;

    var bufIdx = 0, bufEnd = 0;

    // copy top row of pixels
    if (yMin - 1 >= 0) {
        bufIdx = topRowStart + xBufMin;
        bufEnd = topRowStart + xBufMax + (pixelBytes - 1);
        for (; bufIdx <= bufEnd; ++bufIdx) {
            resultBuffer[bufIdx - ditch] = srcBuffer[bufIdx];
        }
    }
    // copy bottom row of pixels
    if (yMax + 1 < height) {
        bufIdx = botRowStart + xBufMin;
        bufEnd = botRowStart + xBufMax + (pixelBytes - 1);
        for (; bufIdx <= bufEnd; ++bufIdx) {
            resultBuffer[bufIdx + ditch] = srcBuffer[bufIdx];
        }
    }
    // copy left column of pixels
    if (xMin - 1 >= 0) {
        bufIdx = topRowStart + xBufMin;
        bufEnd = botRowStart + xBufMin;
        for (; bufIdx <= bufEnd; bufIdx += ditch) {
            resultBuffer[bufIdx - 4] = srcBuffer[bufIdx];
            resultBuffer[bufIdx - 3] = srcBuffer[bufIdx + 1];
            resultBuffer[bufIdx - 2] = srcBuffer[bufIdx + 2];
            resultBuffer[bufIdx - 1] = srcBuffer[bufIdx + 3];
        }
    }
    // copy right column of pixels
    if (xMax + 1 < width) {
        bufIdx = topRowStart + xBufMax;
        bufEnd = botRowStart + xBufMax;
        for (; bufIdx <= bufEnd; bufIdx += ditch) {
            resultBuffer[bufIdx + 4] = srcBuffer[bufIdx];
            resultBuffer[bufIdx + 5] = srcBuffer[bufIdx + 1];
            resultBuffer[bufIdx + 6] = srcBuffer[bufIdx + 2];
            resultBuffer[bufIdx + 7] = srcBuffer[bufIdx + 3];
        }
    }
    // copy corners
    if (xMin - 1 >= 0 && yMin - 1 >= 0) {
        for (bufIdx = topRowStart + xBufMin, bufEnd = bufIdx + 4; bufIdx < bufEnd; bufIdx++) {
            resultBuffer[bufIdx - ditch - pixelBytes] = srcBuffer[bufIdx];
        }
    }
    if (xMax + 1 < width && yMin - 1 >= 0) {
        for (bufIdx = topRowStart + xBufMax, bufEnd = bufIdx + 4; bufIdx < bufEnd; bufIdx++) {
            resultBuffer[bufIdx - ditch + pixelBytes] = srcBuffer[bufIdx];
        }
    }
    if (xMin - 1 >= 0 && yMax + 1 < height) {
        for (bufIdx = botRowStart + xBufMin, bufEnd = bufIdx + 4; bufIdx < bufEnd; bufIdx++) {
            resultBuffer[bufIdx + ditch - pixelBytes] = srcBuffer[bufIdx];
        }
    }
    if (xMax + 1 < width && yMax + 1 < height) {
        for (bufIdx = botRowStart + xBufMax, bufEnd = bufIdx + 4; bufIdx < bufEnd; bufIdx++) {
            resultBuffer[bufIdx + ditch + pixelBytes] = srcBuffer[bufIdx];
        }
    }
};

var applyBleed = function(options, atlas, srcBuffer, resultBuffer) {
    let i = 0;
    let tex = null;
    if (options.contourBleed) {
        // init offsets
        var pixelBytes = 4;
        var ditch = atlas.width * pixelBytes;

        // offset
        //   x x x
        //   x o x
        //   x x x
        var sampleXOffsets = [-1, 0, 1, -1, 1, -1, 0, 1];
        var sampleYOffsets = [-1, -1, -1, 0, 0, 1, 1, 1];
        var bufIdxOffsets = [];
        for (var j = 0; j < sampleXOffsets.length; j++) {
            bufIdxOffsets[j] = sampleXOffsets[j] * pixelBytes + sampleYOffsets[j] * ditch;
        }
        // bleed elements
        for (i = 0, tex = null; i < atlas.spriteFrameInfos.length; i++) {
            tex = atlas.spriteFrameInfos[i].trim;
            applyContourBleed(resultBuffer, srcBuffer, atlas.width,
                cc.rect(tex.x, tex.y, tex.rotatedWidth, tex.rotatedHeight),
                sampleXOffsets, sampleYOffsets, bufIdxOffsets);
        }
    }
    if (options.paddingBleed) {
        console.time('apply padding bleed');
        for (i = 0, tex = null; i < atlas.spriteFrameInfos.length; i++) {
            tex = atlas.spriteFrameInfos[i].trim;
            applyPaddingBleed(resultBuffer, srcBuffer, atlas.width, atlas.height,
                cc.rect(tex.x, tex.y, tex.rotatedWidth, tex.rotatedHeight));
        }
        console.timeEnd('apply padding bleed');
    }
};

module.exports = {
    applyBleed: applyBleed,
};
