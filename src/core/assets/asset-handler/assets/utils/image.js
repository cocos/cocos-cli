'use strict';

/**
 * 创建一个 canvas 节点，并等待图片加载完成绘制到其上
 * @param {*} file
 */
const getImageData = async function(file) {
    const $img = document.createElement('img');
    $img.src = file;

    await new Promise((resolve, reject) => {
        $img.addEventListener('load', () => {
            resolve($img);
        });
        $img.addEventListener('error', () => {
            reject();
        });
    });

    const $canvas = document.createElement('canvas');
    $canvas.width = $img.width;
    $canvas.height = $img.height;

    const $context = $canvas.getContext('2d');
    $context.drawImage($img, 0, 0);

    return $context.getImageData(0, 0, $img.width, $img.height);
};

module.exports = {
    getImageData,
};
