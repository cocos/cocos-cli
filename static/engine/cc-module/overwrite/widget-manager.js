'use strict';

/**
 * 编辑器内重写 widget 内部分方法以实现值锁定功能
 */

module.exports = function(ccm) {
    const { Widget, UITransform, Label } = ccm;
    const cc = global.cc;
    const LockFlags = {
        TOP: 1 << 0,
        MID: 1 << 1,
        BOT: 1 << 2,
        LEFT: 1 << 3,
        CENTER: 1 << 4,
        RIGHT: 1 << 5,
    };

    Widget.prototype.setLockTop = function(lock) {
        this._setLock(LockFlags.TOP, lock);
    };
    Widget.prototype.getLockTop = function() {
        return this._lockFlags & LockFlags.TOP;
    };

    Widget.prototype.setLockBottom = function(lock) {
        this._setLock(LockFlags.BOT, lock);
    };
    Widget.prototype.getLockBottom = function() {
        return this._lockFlags & LockFlags.BOT;
    };

    Widget.prototype.setLockLeft = function(lock) {
        this._setLock(LockFlags.LEFT, lock);
    };
    Widget.prototype.getLockLeft = function() {
        return this._lockFlags & LockFlags.LEFT;
    };

    Widget.prototype.setLockRight = function(lock) {
        this._setLock(LockFlags.RIGHT, lock);
    };
    Widget.prototype.getLockRight = function() {
        return this._lockFlags & LockFlags.RIGHT;
    };

    Widget.prototype.setLockHorizontalCenter = function(lock) {
        this._setLock(LockFlags.CENTER, lock);
    };
    Widget.prototype.getLockHorizontalCenter = function() {
        return this._lockFlags & LockFlags.CENTER;
    };

    Widget.prototype.setLockVerticalCenter = function(lock) {
        this._setLock(LockFlags.MID, lock);
    };
    Widget.prototype.getLockVerticalCenter = function() {
        return this._lockFlags & LockFlags.MID;
    };

    Widget.prototype._setLock = function(flag, isLock) {
        const current = (this._lockFlags & flag) > 0;
        if (isLock === current) {
            return;
        }
        if (isLock) {
            this._lockFlags |= flag;
        } else {
            this._lockFlags &= ~flag;
        }
    };

    Widget.prototype._adjustWidgetToAllowMovingInEditor = function(eventType) {
        if (!(eventType & cc.internal.TransformBit.POSITION)) {
            return;
        }

        if (cc._widgetManager.isAligning) {
            return;
        }

        const self = this;
        const newPos = self.node.getPosition();
        const oldPos = this._lastPos;
        const delta = new cc.Vec3(newPos);
        delta.subtract(oldPos);

        let target = self.node.parent;
        const inverseScale = new cc.Vec3(1, 1, 1);

        if (self.target) {
            target = self.target;
            cc.internal.computeInverseTransForTarget(self.node, target, new cc.Vec3(), inverseScale);
        }
        if (!target) {
            return;
        }

        const targetSize = cc.internal.getReadonlyNodeSize(target);
        const deltaInPercent = new cc.Vec3();
        if (targetSize.width !== 0 && targetSize.height !== 0) {
            cc.Vec3.set(deltaInPercent, delta.x / targetSize.width, delta.y / targetSize.height, deltaInPercent.z);
        }

        if (self.isAlignTop && !self.getLockTop()) {
            self._top -= (self._isAbsTop ? delta.y : deltaInPercent.y) * inverseScale.y;
        }
        if (self.isAlignBottom && !self.getLockBottom()) {
            self._bottom += (self._isAbsBottom ? delta.y : deltaInPercent.y) * inverseScale.y;
        }
        if (self.isAlignLeft && !self.getLockLeft()) {
            self._left += (self._isAbsLeft ? delta.x : deltaInPercent.x) * inverseScale.x;
        }
        if (self.isAlignRight && !self.getLockRight()) {
            self._right -= (self._isAbsRight ? delta.x : deltaInPercent.x) * inverseScale.x;
        }
        if (self.isAlignHorizontalCenter && !self.getLockHorizontalCenter()) {
            self._horizontalCenter += (self._isAbsHorizontalCenter ? delta.x : deltaInPercent.x) * inverseScale.x;
        }
        if (self.isAlignVerticalCenter && !self.getLockVerticalCenter()) {
            self._verticalCenter += (self._isAbsVerticalCenter ? delta.y : deltaInPercent.y) * inverseScale.y;
        }
        this._recursiveDirty();
        self.node.getPosition(self._lastPos);
    };

    Widget.prototype._adjustWidgetToAllowResizingInEditor = function() {
        if (cc._widgetManager.isAligning) {
            return;
        }

        const self = this;
        const uiTransformComp = self.node.getComponent(UITransform);
        if (!uiTransformComp) {
            return;
        }

        const newSize = uiTransformComp.contentSize;
        const oldSize = this._lastSize;
        const delta = new cc.Vec3(newSize.width - oldSize.width, newSize.height - oldSize.height, 0);

        let target = self.node.parent;
        const inverseScale = new cc.Vec3(1, 1, 1);
        if (self.target) {
            target = self.target;
            cc.internal.computeInverseTransForTarget(self.node, target, new cc.Vec3(), inverseScale);
        }
        if (!target) {
            return;
        }

        const targetSize = cc.internal.getReadonlyNodeSize(target);
        const deltaInPercent = new cc.Vec3();
        if (targetSize.width !== 0 && targetSize.height !== 0) {
            cc.Vec3.set(deltaInPercent, delta.x / targetSize.width, delta.y / targetSize.height, deltaInPercent.z);
        }

        const anchor = uiTransformComp.anchorPoint;

        if (self.isAlignTop && !self.getLockTop()) {
            self._top -= (self._isAbsTop ? delta.y : deltaInPercent.y) * (1 - anchor.y) * inverseScale.y;
        }
        if (self.isAlignBottom && !self.getLockBottom()) {
            self._bottom -= (self._isAbsBottom ? delta.y : deltaInPercent.y) * anchor.y * inverseScale.y;
        }
        if (self.isAlignLeft && !self.getLockLeft()) {
            self._left -= (self._isAbsLeft ? delta.x : deltaInPercent.x) * anchor.x * inverseScale.x;
        }
        if (self.isAlignRight && !self.getLockRight()) {
            self._right -= (self._isAbsRight ? delta.x : deltaInPercent.x) * (1 - anchor.x) * inverseScale.x;
        }

        // hack for label none mode can`t change context size
        const label = self.node.getComponent(Label);
        if (label && label.overflow === 0 && self.isAlignRight && self.isAlignLeft) {
            return;
        }
        this._recursiveDirty();
    };
};
