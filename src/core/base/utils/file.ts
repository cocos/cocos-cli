'use strict';

import { existsSync } from 'fs';
import { basename, dirname, extname, join } from 'path';

/**
 * 检查文件在指定文件夹中是否存在，如果存在则通过追加数字后缀的方式生成一个唯一的文件名。
 * @param targetFolder 目标文件夹的路径。
 * @param fileName 需要检查存在的文件名。
 * @returns 返回一个唯一的文件名字符串。
 */
export const resolveFileNameConflict = (targetFolder: string, fileName: string): string => {
    // 如果fileName为空，抛出错误
    if (!fileName) throw new Error(`fileName is empty`);
    // 获取文件扩展名
    const fileExt = extname(fileName);
    // 获取文件的基础名（不包括扩展名）
    let fileBase = basename(fileName, fileExt);

    // 循环检查直到找到一个不存在的文件名
    while (existsSync(join(targetFolder, `${fileBase}${fileExt}`))) {
        if ((/(\d+)$/.test(fileBase))) {
            fileBase = fileBase.replace(/^(.+?)(\d+)?$/, ($: string, $1: string, $2: string | undefined) => {
                let num;
                if (!$2) {
                    // 如果是纯数字的话 $2 是为 undefined，$1 自增就行
                    let num = parseInt($1, 10);
                    num += 1;
                    return num.toString();
                }
                num = parseInt($2, 10);
                num += 1;
                // 返回更新后的文件名
                return `${$1}${num.toString().padStart($2.length, '0')}`;
            });
        } else {
            // 如果原文件名不包含数字后缀，则添加-001作为后缀
            fileBase = `${fileBase}-001`;
        }
    }

    // 返回最终生成的唯一文件名
    return `${fileBase}${fileExt}`;
};

/**
 * 初始化一个可用的文件名
 * Initializes a available filename
 * 返回可用名称的文件路径
 * Returns the file path with the available name
 * 
 * @param file 初始文件路径 Initial file path
 */
export function getName(file: string): string {
    if (!existsSync(file)) {
        return file;
    }

    const dir = dirname(file);
    const fileName = basename(file);
    const newFileName = resolveFileNameConflict(dir, fileName);

    return join(dir, newFileName);
}

export async function trashItem(file: string) {
    // TODO
    // const trash = await import('sudo-trash');
    // return await trash.trash(file);
}

export function requireFile(file: string) {
    // TODO
    return require(file);
}