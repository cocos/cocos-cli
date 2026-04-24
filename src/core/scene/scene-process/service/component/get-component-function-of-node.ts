import { Node, CCClass, Component, js } from 'cc';

const excludeFunctionNames = [
    'constructor',
    'null',
    'onLoad',
    'start',
    'onEnable',
    'onDisable',
    'onDestroy',
    'update',
    'lateUpdate',
    'onFocusInEditor',
    'onLostFocusInEditor',
    'resetInEditor',
    'onRestore',
    'isRunning',
    'realDestroyInEditor',
    'getComponent',
    'getComponentInChildren',
    'getComponents',
    'getComponentsInChildren',
];

const getPropertyNames = (target: any) => {
    let propertyNames: string[] = [];
    let Ctor = target;

    if (target && typeof target === 'object') {
        propertyNames = Object.getOwnPropertyNames(target);
        Ctor = target.constructor;
    }

    const classes = [Ctor].concat(CCClass.getInheritanceChain(Ctor));
    const allPropertyNamesofClasses = classes.reduce((prev, next) => {
        const keys = Object.getOwnPropertyNames(next.prototype);
        return prev.concat(keys);
    }, []);

    return [...new Set(propertyNames.concat(allPropertyNamesofClasses))];
};

function getFunctions(component: Component) {
    const keys = getPropertyNames(component.constructor);

    return keys.filter((key) => {
        const isPrivate = key.startsWith('_');
        const isExclude = excludeFunctionNames.includes(key);
        const isGetter = !!js.getPropertyDescriptor(component, key)?.get;

        if (isPrivate || isExclude || isGetter) {
            return false;
        }
        return true;
    });
}

export default (node: Node) => {
    return node.components.reduce((prev: any, next) => {
        const key = cc.js.getClassName(next);
        prev[key] = getFunctions(next);

        return prev;
    }, {});
};
