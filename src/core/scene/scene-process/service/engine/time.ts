let lastUpdateTime = 0;
let startTime = 0;

/**
 * !#en The interface to get time information from Fireball.
 *
 * See [Time](/en/scripting/time/)
 * !#zh Time 模块用于获得游戏里的时间和帧率相关信息。直接使用 cc.Time.*** 访问即可。
 *
 * 请参考教程[计时和帧率](/zh/scripting/time/)
 *
 * @class Time
 * @static
 */
class Time {
    /**
     * The time at the beginning of this frame. This is the time in seconds since the start of the game.
     * @property time
     * @type {number}
     * @readOnly
     */
    public time = 0;

    /**
     * The time at the beginning of this frame. This is the real time in seconds since the start of the game.
     *
     * `Time.realTime` not affected by time scale, and also keeps increasing while the player is paused in editor or in the background.
     * @property realTime
     * @type {number}
     * @readOnly
     */
    public realTime = 0;

    /**
     * The time in seconds it took to complete the last frame. Use this property to make your game frame rate independent.
     * @property deltaTime
     * @type {number}
     * @readOnly
     */
    public deltaTime = 0;

    /**
     * The total number of frames that have passed.
     * @property frameCount
     * @type {number}
     * @readOnly
     */
    public frameCount = 0;

    /**
     * The maximum time a frame can take.
     * @property maxDeltaTime
     * @type {number}
     * @readOnly
     */
    public maxDeltaTime = 0.3333333;

    /**
     * @method _update
     * @param {number} timestamp
     * @param {Boolean} [paused=false] if true, only realTime will be updated
     * @param {number} [maxDeltaTime=Time.maxDeltaTime]
     * @private
     */
    public update(timestamp: number, paused: boolean, maxDeltaTime: number) {
        if (!paused) {
            maxDeltaTime = maxDeltaTime || this.maxDeltaTime;
            let delta = timestamp - lastUpdateTime;
            delta = Math.min(maxDeltaTime, delta);
            this.deltaTime = delta;
            lastUpdateTime = timestamp;

            if (this.frameCount === 0) {
                startTime = timestamp;
            } else {
                this.time += delta;
                this.realTime = timestamp - startTime;
            }
            ++this.frameCount;
        }
    }

    /**
     * @method _restart
     * @param {number} timestamp
     * @private
     */
    public restart(timestamp: number) {
        this.time = 0;
        this.realTime = 0;
        this.deltaTime = 0;
        this.frameCount = 0;
        lastUpdateTime = timestamp;
    }
}

export default new Time();
