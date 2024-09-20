const Semaphore = require("@instun/semaphore");
const async_event = require("@instun/event");

const AsyncFunction = (async () => { }).constructor;
function isAsyncFunction(func) {
    return func instanceof AsyncFunction;
}

function ensureError(e) {
    if (typeof e === 'string')
        e = new Error(e);
    return e;
}

const GetPool = function (_opt, maxsize, timeout) {
    let opt = _opt;
    if (typeof _opt === 'function') {
        opt = {
            create: _opt,
            maxsize: maxsize,
            timeout: timeout
        };
    }

    var create = opt.create;
    if (!isAsyncFunction(create)) {
        const _create = create;
        create = async (name) => {
            return _create(name);
        };
    }

    var destroy = opt.destroy || ((o) => {
        if (typeof o.close === 'function')
            o.close();
        if (typeof o.destroy === 'function')
            o.destroy();
        if (typeof o.dispose === 'function')
            o.dispose();
    });
    if (!isAsyncFunction(destroy)) {
        const _destroy = destroy;
        destroy = async (o) => {
            _destroy(o);
        };
    }

    maxsize = opt.maxsize || 10;

    timeout = opt.timeout || 60000;
    let tm = timeout / 10;
    if (tm < 10)
        tm = 10;

    const retry = opt.retry || 1;
    let pools = [];
    const jobs = [];
    let count = 0;
    let running = 0;
    let clearTimer;

    const sem = new Semaphore(maxsize);

    function clearPool() {
        let c;
        const d = new Date().getTime();

        while (count) {
            c = pools[0];
            if (d - c.time.getTime() > timeout) {
                pools = pools.slice(1);
                count--;
                if (c.o !== undefined)
                    destroy(c.o);
            }
            else
                break;
        }

        if (!count) {
            if (clearTimer) {
                clearTimer.clear();
                clearTimer = null;
            }
        }
        else if (!clearTimer)
            clearTimer = setInterval(clearPool, tm);
    }

    function putback(name, o, e) {
        e = ensureError(e);
        for (let i = 0; i < jobs.length; i++) {
            const job = jobs[i];
            if (job.name === name) {
                jobs.splice(i, 1);
                job.o = o;
                job.e = e;
                job.ev.set();
                return;
            }
        }

        if (e === undefined)
            pools[count++] = {
                o: o,
                name: name,
                time: new Date()
            };
    }

    async function connect(name) {
        let o;
        let cn = 0;
        let err;

        while (true) {
            try {
                o = await create(name);
                break;
            }
            catch (e) {
                if (++cn >= retry) {
                    err = e;
                    break;
                }
            }
        }
        putback(name, o, err);
    }

    const pool = async (name, func) => {
        if (typeof name === 'function') {
            func = name;
            name = "";
        }

        if (!isAsyncFunction(func))
            throw new Error("func must be async function");

        let r;
        let o;
        let p = false;

        clearPool();
        await sem.acquire();

        if (count) {
            for (let i = count - 1; i >= 0; i--)
                if (pools[i].name === name) {
                    p = true;
                    o = pools[i].o;
                    pools.splice(i, 1);
                    count--;
                    break;
                }
        }

        if (!p) {
            connect(name);
            const job = {
                name: name,
                ev: async_event()
            };

            jobs.push(job);
            await job.ev.wait();
            if (job.e) {
                sem.release();
                throw ensureError(job.e);
            }
            o = job.o;
        }

        running++;
        try {
            r = await func(o);
            putback(name, o);
        }
        catch (e) {
            if (o !== undefined)
                destroy(o);
            throw ensureError(e);
        }
        finally {
            running--;
            sem.release();
            clearPool();
        }

        return r;
    };

    pool.connections = () => count;

    pool.info = () => ({
        maxsize: maxsize,
        count: count,
        running: running,
        timeout: timeout
    });

    pool.clear = () => {
        timeout = -1;
        clearPool();
    };

    return pool;
};

module.exports = GetPool;
