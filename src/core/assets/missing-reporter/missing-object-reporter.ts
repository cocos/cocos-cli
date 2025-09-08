'use strict';

import { MissingReporter } from './missing-reporter';
import * as _ from 'lodash';
import * as ps from 'path';
import * as ObjectWalker from './object-walker';
import * as assetdb from '@editor/asset-db';

export class MissingObjectReporter extends MissingReporter {

    doReport(obj: any, value: any, parsedObjects: any, rootUrl: any, inRootBriefLocation: any) {
        let parsingOwner;
        if (obj instanceof cc.Component || obj instanceof cc.Asset) {
            parsingOwner = obj;
        } else {
            parsingOwner = _.findLast(parsedObjects, (x: any) => (x instanceof cc.Component || x instanceof cc.Asset));
        }

        let byOwner = '';
        if (parsingOwner instanceof cc.Component) {
            const ownerType = MissingReporter.getObjectType(parsingOwner);
            byOwner = ` by ${ownerType} "${cc.js.getClassName(parsingOwner)}"`;
        } else {
            parsingOwner = _.findLast(parsedObjects, (x: any) => (x instanceof cc.Node));
            if (parsingOwner) {
                byOwner = ` by node "${parsingOwner.name}"`;
            }
        }

        let info;
        const valueIsUrl = typeof value === 'string';
        if (valueIsUrl) {
            info = `Asset "${value}" used${byOwner}${inRootBriefLocation} is missing.`;
        } else {
            let targetType = cc.js.getClassName(value);
            if (targetType.startsWith('cc.')) {
                targetType = targetType.slice(3);
            }
            if (value instanceof cc.Asset) {
                // missing asset
                info = `The ${targetType} used${byOwner}${inRootBriefLocation} is missing.`;
            } else {
                // missing object
                info = `The ${targetType} referenced${byOwner}${inRootBriefLocation} is invalid.`;
            }
        }

        info += MissingReporter.INFO_DETAILED;
        if (parsingOwner instanceof cc.Component) {
            parsingOwner = parsingOwner.node;
        }

        try {
            if (parsingOwner instanceof cc.Node) {
                let node = parsingOwner;
                let path = node.name;
                while (node.parent && !(node.parent instanceof cc.Scene)) {
                    node = node.parent;
                    path = `${node.name}/${path}`;
                }
                info += `Node path: "${path}"\n`;
            }
        } catch (error) { }

        if (rootUrl) {
            info += `Asset url: "${rootUrl}"\n`;
        }
        if (value instanceof cc.Asset && value._uuid) {
            try {
                const assetInfo = assetdb.queryMissingInfo(value._uuid.match(/[^@]*/)[0]);
                if (assetInfo) {
                    info += `Asset file: "${assetInfo.path}"\n`;
                    info += `Asset deleted time: "${new Date(assetInfo.removeTime).toLocaleString()}"\n`;
                }
            } catch (error) { }
            // info = pkg.execSync('asset-db', 'queryAssetInfo', this.root._uuid);
            info += `Missing uuid: "${value._uuid}"\n`;
        }
        info.slice(0, -1); // remove last '\n'

        // 因为报错很多，用户会觉得是编辑器不稳定，所以暂时隐藏错误
        if (console[this.outputLevel]) {
            console[this.outputLevel](info);
        } else {
            console.warn(info);
        }
    }

    report() {
        let rootUrl: any;
        let info: any;
        if (this.root instanceof cc.Asset) {
            try {
                // @ts-ignore
                const Manager: IAssetWorkerManager = globalThis.Manager;
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
        const rootType = MissingReporter.getObjectType(this.root);
        const inRootBriefLocation = rootUrl ? ` in ${rootType} "${ps.basename(rootUrl)}"` : '';

        ObjectWalker.walk(this.root, (obj: any, key: any, value: any, parsedObjects: any, parsedKeys: any) => {
            if (this.missingObjects.has(value)) {
                this.doReport(obj, value, parsedObjects, rootUrl, inRootBriefLocation);
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
                if (Manager && Manager.assetDBManager.ready) {
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
        const rootType = MissingReporter.getObjectType(this.root);
        const inRootBriefLocation = rootUrl ? ` in ${rootType} "${ps.basename(rootUrl)}"` : '';

        ObjectWalker.walkProperties(this.root, (obj: any, key: any, actualValue: any, parsedObjects: any) => {
            const props = this.missingOwners.get(obj);
            if (props && (key in props)) {
                const reportValue = props[key];
                this.doReport(obj, reportValue || actualValue, parsedObjects, rootUrl, inRootBriefLocation);
            }
        }, {
            dontSkipNull: true,
        });
    }
}
