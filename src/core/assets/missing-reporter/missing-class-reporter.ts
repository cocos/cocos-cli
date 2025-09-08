'use strict';

import * as _ from 'lodash';
import * as ps from 'path';
import * as ObjectWalker from './object-walker';
import * as assetdb from '@editor/asset-db';

import { MissingReporter } from './missing-reporter';
import Utils from '../../base/utils';

function report(parsingOwner: any, classId: any, asset: any, url: any) {
    const assetType = MissingReporter.getObjectType(asset);
    const assetName = url && ps.basename(url);

    if (asset instanceof cc.SceneAsset || asset instanceof cc.Prefab) {
        let info;
        let component;
        let node;
        if (parsingOwner instanceof cc.Component) {
            component = parsingOwner;
            node = component.node;
        } else if (cc.Node.isNode(parsingOwner)) {
            node = parsingOwner;
        }

        const IN_LOCATION = assetName ? ` in ${assetType} "${assetName}"` : '';
        let detailedClassId = classId;
        let isScript = false;

        if (component) {
            let compName = cc.js.getClassName(component);
            // missing property type
            if (component instanceof cc._MissingScript) {
                isScript = true;
                detailedClassId = compName = component._$erialized.__type__;
            }
            info = `Class "${classId}" used by component "${compName}"${IN_LOCATION} is missing or invalid.`;
        } else if (node) {
            // missing component
            isScript = true;
            info = `Script "${classId}" attached to "${node.name}"${IN_LOCATION} is missing or invalid.`;
        } else {
            return;
        }

        info += MissingReporter.INFO_DETAILED;

        try {
            let child = node;
            let path = child.name;
            while (child.parent && !(child.parent instanceof cc.Scene)) {
                child = child.parent;
                path = `${child.name}/${path}`;
            }
            info += `Node path: "${path}"\n`;
        } catch (error) { }

        if (url) {
            info += `Asset url: "${url}"\n`;
        }

        if (isScript && Utils.UUID.isUUID(detailedClassId)) {
            const scriptUuid = Utils.UUID.decompressUUID(detailedClassId);
            try {
                const scriptInfo = assetdb.queryMissingInfo(scriptUuid.match(/[^@]*/)![0]);
                if (scriptInfo) {
                    info += `Script file: "${scriptInfo.path}"\n`;
                    info += `Script deleted time: "${new Date(scriptInfo.removeTime).toLocaleString()}"\n`;
                }
            } catch (error) { }
            info += `Script UUID: "${scriptUuid}"\n`;
            info += `Class ID: "${detailedClassId}"\n`;
        }
        info.slice(0, -1); // remove last '\n'
        console.error(info);
    } else {
        // missing CustomAsset ? not yet implemented
    }
}

async function reportByWalker(value: any, obj: any, parsedObjects: any, asset: any, url?: any, classId?: any) {
    classId = classId || (value._$erialized && value._$erialized.__type__);
    let parsingOwner;
    if (obj instanceof cc.Component || cc.Node.isNode(obj)) {
        parsingOwner = obj;
    } else {
        parsingOwner = _.findLast(parsedObjects, (x: any) => (x instanceof cc.Component || cc.Node.isNode(x)));
    }
    await report(parsingOwner, classId, asset, url);
}

// MISSING CLASS REPORTER

export class MissingClassReporter extends MissingReporter {

    report() {
        ObjectWalker.walk(this.root, (obj: any, key: any, value: any, parsedObjects: any) => {
            if (this.missingObjects.has(value)) {
                reportByWalker(value, obj, parsedObjects, this.root);
            }
        });
    }

    reportByOwner() {
        let rootUrl: any;
        let info: any;
        if (this.root instanceof cc.Asset) {
            try {
                // @ts-ignore
                const Manager: IAssetWorkerManager = globalThis.Manager;
                // @ts-ignore
                if (Manager && Manager.assetManager) {
                    info = Manager.assetManager.queryAssetInfo(this.root._uuid);
                } else {
                    // info = pkg.execSync('asset-db', 'queryAssetInfo', this.root._uuid);
                }
            } catch (error) {
                console.error(error);
                info = null;
            }
            rootUrl = info ? info.path : null;
        }

        ObjectWalker.walkProperties(this.root, (obj: any, key: any, value: any, parsedObjects: any) => {
            const props = this.missingOwners.get(obj);
            if (props && (key in props)) {
                const typeId = props[key];
                reportByWalker(value, obj, parsedObjects, this.root, rootUrl, typeId);
            }
        }, {
            dontSkipNull: true,
        });
    }
}

// 用这个模块来标记找不到脚本的对象
export const MissingClass = {
    reporter: new MissingClassReporter(),
    classFinder(id: any, data: any, owner: any, propName: any) {
        const cls = cc.js.getClassById(id);
        if (cls) {
            return cls;
        } else if (id) {
            console.warn(`Missing class: ${id}`);
            MissingClass.hasMissingClass = true;
            MissingClass.reporter.stashByOwner(owner, propName, id);
        }
        return null;
    },
    hasMissingClass: false,
    reportMissingClass(asset: any) {
        if (!asset._uuid) {
            return;
        }
        if (MissingClass.hasMissingClass) {
            MissingClass.reporter.root = asset;
            MissingClass.reporter.reportByOwner();
            MissingClass.hasMissingClass = false;
        }
    },
    reset() {
        MissingClass.reporter.reset();
    },
};

// @ts-ignore
MissingClass.classFinder.onDereferenced = function (curOwner: any, curPropName: any, newOwner: any, newPropName: any) {
    const id = MissingClass.reporter.removeStashedByOwner(curOwner, curPropName);
    if (id) {
        MissingClass.reporter.stashByOwner(newOwner, newPropName, id);
    }
};
