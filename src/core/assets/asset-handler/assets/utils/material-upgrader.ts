import { queryAsset, Asset } from '@editor/asset-db';
import { EffectAsset } from 'cc';
import { readJSONSync, existsSync } from 'fs-extra';

const auxMap: Record<string, string> = { x: 'r', y: 'g', z: 'b', w: 'a', r: 'x', g: 'y', b: 'z', a: 'w' };
function getVectorComponent(v: Record<string, number>, c: string) {
    const n1 = v[c];
    const n2 = v[auxMap[c]];
    return n1 !== undefined ? n1 : n2 !== undefined ? n2 : 0;
}

const idxMap = ['x', 'y', 'z', 'w'];
function serializeAsVector(data: number[]) {
    const vector: any = { __type__: 'cc.Vec' + data.length };
    data.forEach((n, i) => (vector[idxMap[i]] = n));
    return vector;
}

const defineRE = /<\s*(\w+)\s*(?:\|\s*(\w+))?\s*>/g;
const targetRE = /(\w+)\s*(?:\.\s*([xyzw]+|[rgba]+))?/i;
function handleFormerlySerializedAs(props: Record<string, any>, defines: Record<string, any>, name: string, target: string, uuid: string) {
    // replace define references
    let defCap = defineRE.exec(target);
    let noMoreRouting = false;
    if (defCap && defCap[0].length >= target.length - 1) {
        noMoreRouting = true;
    }
    while (defCap) {
        const replacement = defines[defCap[1]] || defCap[2] || '';
        const beg = defCap.index;
        const end = defCap.index + defCap[0].length;
        target = target.substring(0, beg) + replacement + target.substring(end);
        defineRE.lastIndex = 0;
        defCap = defineRE.exec(target);
    }
    const cap = targetRE.exec(target);
    if (!cap) {
        console.warn(`formerlySerializedAs: illegal target '${target}', upgrade skipped`);
        return false;
    }
    if (!target.endsWith('!') && props[name] !== undefined) {
        return false;
    } // new prop already exists and not in force update mode
    if (noMoreRouting) {
        if (props[name] === target) {
            return false;
        }
        props[name] = target;
        return true;
    }
    const oldValue = props[cap[1]];
    if (oldValue === undefined) {
        return false;
    } // nothing to upgrade
    // semantic check
    const swizzle = (cap[2] && cap[2].toLowerCase()) || '';
    if (swizzle && typeof oldValue !== 'object') {
        console.warn(`formerlySerializedAs: '${target}' expected an object, get ${typeof oldValue} in ${uuid}, upgrade skipped`);
        return false;
    }
    if (swizzle.length > 4) {
        console.warn(`formerlySerializedAs: illegal target '${target}', upgrade skipped`);
        return false;
    }
    if (swizzle.length === 0) {
        // direct map
        props[name] = oldValue;
        delete props[cap[1]];
    } else if (swizzle.length === 1) {
        // partial extraction
        props[name] = getVectorComponent(oldValue, swizzle);
    } else {
        // partial & swizzled extraction
        const data = swizzle.split('').map((c) => getVectorComponent(oldValue, c));
        props[name] = serializeAsVector(data);
    }
    return true;
}

interface IMigration {
    formerlySerializedAs?: string;
    removeImmediately?: boolean;
}

type CCPassInfo = EffectAsset['techniques'][0]['passes'][0];

interface IPassInfo extends CCPassInfo {
    migrations: {
        macros: Record<string, IMigration>;
        properties: Record<string, IMigration>;
    };
}

export async function upgradeProperties(material: any, asset: Asset) {
    const uuid = asset.uuid;
    const effectID = material._effectAsset && material._effectAsset.__uuid__;
    let upgraded = false;
    if (!effectID) {
        return false;
    }
    const effectInfo = queryAsset(effectID);
    if (!effectInfo || !effectInfo.imported) {
        return false;
    }
    const effectPath = effectInfo.library + '.json';
    if (!existsSync(effectPath)) {
        console.error(`upgradeProperties: the library json of effect(${effectInfo.source}) not found, upgrade skipped`);
        return false;
    }
    const effect = readJSONSync(effectPath) as EffectAsset;
    const passes = effect.techniques[material._techIdx].passes;
    // user defined migration support
    for (let i = 0; i < passes.length; i++) {
        const pass = passes[i] as IPassInfo;
        const migrations = pass.migrations;
        if (!migrations) {
            continue;
        }
        const curProps = material._props[i];
        const curDefines = material._defines[i];
        if (migrations.properties && curProps && curDefines) {
            for (const name of Object.keys(migrations.properties)) {
                const target = migrations.properties[name].formerlySerializedAs;
                if (!target) {
                    continue;
                }
                upgraded = handleFormerlySerializedAs(curProps, curDefines, name, target, uuid) || upgraded;
            }
            for (const name of Object.keys(migrations.properties)) {
                if (!migrations.properties[name].removeImmediately) {
                    continue;
                }
                delete curProps[name];
                upgraded = true;
            }
        }
        if (migrations.macros && curDefines) {
            for (const name of Object.keys(migrations.macros)) {
                const target = migrations.macros[name].formerlySerializedAs;
                if (!target) {
                    continue;
                }
                upgraded = handleFormerlySerializedAs(curDefines, curDefines, name, target, uuid) || upgraded;
            }
            for (const name of Object.keys(migrations.macros)) {
                if (!migrations.macros[name].removeImmediately) {
                    continue;
                }
                delete curDefines[name];
                upgraded = true;
            }
        }
    }
    return upgraded;
}
