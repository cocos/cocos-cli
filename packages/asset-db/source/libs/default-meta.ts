'use strict';

const defaultMeta = {};

export function setDefaultUserData(name: string, userData: any) {
    defaultMeta[name] = userData;
}

export function fillUserData(name: string, userData: any) {
    const defaultUserData = defaultMeta[name];
    if (!defaultUserData) {
        return;
    }

    for (let key in defaultUserData) {
        if (!(key in userData)) {
            userData[key] = defaultUserData[key];
        }
    }
}