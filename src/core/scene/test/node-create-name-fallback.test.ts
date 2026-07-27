/**
 * 验证 createNodeByAsset 的 cc.Script 分支：
 * - 有 @ccclass 时使用 ccclass 名称
 * - 无 @ccclass（queryScriptName 返回空）时使用文件名兜底（去扩展名）
 */

import * as fs from 'fs';
import * as path from 'path';

describe('cc.Script 节点名称兜底', () => {
    const source = fs.readFileSync(
        path.resolve(__dirname, '../scene-process/service/node/node-create.ts'),
        'utf-8',
    );

    function extractCaseBody(src: string, caseLabel: string): string {
        const caseIdx = src.indexOf(`case '${caseLabel}'`);
        if (caseIdx === -1) return '';
        let braceCount = 0;
        let started = false;
        let bodyStart = caseIdx;
        let bodyEnd = caseIdx;
        for (let i = caseIdx; i < src.length; i++) {
            if (src[i] === '{') {
                if (!started) bodyStart = i;
                started = true;
                braceCount++;
            } else if (src[i] === '}') {
                braceCount--;
                if (started && braceCount === 0) {
                    bodyEnd = i + 1;
                    break;
                }
            }
        }
        return src.slice(bodyStart, bodyEnd);
    }

    const scriptCase = extractCaseBody(source, 'cc.Script');

    it('cc.Script case 应存在', () => {
        expect(scriptCase.length).toBeGreaterThan(0);
    });

    it('应先通过 queryScriptName 获取 ccclass 名称', () => {
        expect(scriptCase).toMatch(/queryScriptName/);
    });

    it('queryScriptName 返回空时应通过 queryAssetInfo 查询文件名兜底', () => {
        expect(scriptCase).toMatch(/if\s*\(\s*!name\s*\)/);
        expect(scriptCase).toMatch(/queryAssetInfo/);
    });

    it('应使用 basename + extname 去除扩展名', () => {
        expect(scriptCase).toMatch(/basename\(assetInfo\.name,\s*extname\(assetInfo\.name\)\)/);
    });

    it('兜底逻辑应在 new Node(name) 之前', () => {
        const fallbackIdx = scriptCase.indexOf('!name');
        const newNodeIdx = scriptCase.indexOf('new Node(name)');
        expect(fallbackIdx).toBeGreaterThan(-1);
        expect(newNodeIdx).toBeGreaterThan(-1);
        expect(fallbackIdx).toBeLessThan(newNodeIdx);
    });

    it('有 ccclass 名称时不应触发兜底（仅在 !name 时查询 assetInfo）', () => {
        const queryAssetInfoIdx = scriptCase.indexOf('queryAssetInfo');
        const ifNotNameIdx = scriptCase.indexOf('if (!name)');
        expect(ifNotNameIdx).toBeGreaterThan(-1);
        expect(queryAssetInfoIdx).toBeGreaterThan(ifNotNameIdx);
    });
});
