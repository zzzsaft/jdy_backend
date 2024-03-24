class Limiter {
    seq;
    bucket;
    t;
    constructor(duration, limit) {
        this.seq = 0;
        this.bucket = duration;
        this.t = new Array(limit).fill(0);
    }
    /**
     * 限流阻塞
     */
    async tryBeforeRun() {
        const now = new Date().getTime();
        const interval = now - this.t[this.seq];
        if (interval < 0) {
            // 执行时间: t[seq]+bucket=now-interval+bucket
            // 等待时间: bucket-interval
            await sleep(this.bucket - interval);
            return await this.tryBeforeRun();
        }
        if (interval < this.bucket) {
            this.t[this.seq] += this.bucket;
            this.seq = (this.seq + 1) % this.t.length;
            await sleep(this.bucket - interval);
        }
        else {
            this.t[this.seq] = now;
            this.seq = (this.seq + 1) % this.t.length;
        }
    }
}
async function sleep(time) {
    return new Promise((resolve) => {
        setTimeout(resolve, time);
    });
}
class LimiterSet {
    limiterSet;
    globalLimiter;
    constructor(duration, limit) {
        this.limiterSet = {};
        this.globalLimiter = new Limiter(duration, limit);
    }
    async tryBeforeRun(limitOption) {
        this.globalLimiter.tryBeforeRun();
        (this.limiterSet[limitOption.name] ||
            (this.limiterSet[limitOption.name] = new Limiter(limitOption.duration, limitOption.limit))).tryBeforeRun();
    }
}
export let jdyLimiter = new LimiterSet(1000, 50);
export let wechatLimiter = new LimiterSet(60000, 3000);
//# sourceMappingURL=limiter.js.map