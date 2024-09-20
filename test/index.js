var test = require("test");
test.setup();

var Pool = require("../lib");
var db = require("db").promises;

async function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function parallel(func, n) {
    var tasks = [];
    if (typeof func == 'function') {
        for (var i = 0; i < n; i++) {
            tasks.push(func());
        }
    } else if (Array.isArray(func) && typeof n == 'function') {
        for (var i = 0; i < func.length; i++) {
            tasks.push(n(func[i]));
        }
    }

    return await Promise.all(tasks);
}

describe("pool", () => {
    var pools = [];

    afterEach(() => {
        pools.forEach((p) => {
            p.clear();
        });

        pools = [];
    });

    it("run", async () => {
        var p = Pool(() => {
            return 10;
        });
        pools.push(p);

        assert.equal(await p((v) => {
            return v + 1;
        }), 11);
    });

    it("sync callback", async () => {
        var p = Pool(() => {
            return 10;
        });
        pools.push(p);

        assert.equal(await p((v) => {
            return v + 1;
        }), 11);
    });

    it("pool", async () => {
        var n = 0;
        var running = -1;

        var p = Pool(() => {
            n++;
            return n;
        });
        pools.push(p);

        assert.equal(await p((v) => {
            running = p.info().running;
            return v + 1;
        }), 2);

        assert.equal(running, 1);
        assert.equal(p.info().running, 0);
    });

    it("maxsize", async () => {
        var n = 0;
        var m = 0;

        var p = Pool(() => {
            // n++;
            return n;
        }, 10);
        pools.push(p);

        await parallel(async () => {
            await p(async (c) => {
                n++;
                if (n > m)
                    m = n;
                await sleep(50);
                n--;
            });
        }, 20);

        assert.equal(m, 10);
    });

    it("name", async () => {
        var n = 0;

        var p = Pool((name) => {
            n++;
            return name;
        });
        pools.push(p);

        assert.equal(n, 0);

        assert.equal(await p('a', async (v) => {
            return v;
        }), 'a');

        assert.equal(n, 1);

        assert.equal(await p('b', async (v) => {
            return v;
        }), 'b');

        assert.equal(n, 2);

        assert.equal(await p('a', async (v) => {
            return v;
        }), 'a');

        assert.equal(n, 2);
    });

    it("throw", async () => {
        var n = 0;
        var running = -1;

        var p = Pool(() => {
            n++;
            return n;
        });
        pools.push(p);

        assert.equal(await p((v) => {
            return v + 1;
        }), 2);

        assert.throws(async () => {
            await p((v) => {
                running = p.info().running;
                throw "error";
            });
        });
        assert.equal(running, 1);
        assert.equal(p.info().running, 0);

        assert.equal(await p((v) => {
            return v + 1;
        }), 3);
    });

    it("async close when throw", async () => {
        var called = false;

        var p = Pool({
            create: () => {
                return 100;
            },
            destroy: async (o) => {
                await sleep(10);
                called = true;
            }
        });
        pools.push(p);

        assert.throws(async () => {
            await p((v) => {
                throw "error";
            });
        });

        assert.isFalse(called);
        await sleep(10);
        assert.isTrue(called);
    });

    it("default close function", async () => {
        var called = false;

        var p = Pool({
            create: () => {
                return {
                    close: async () => {
                        await sleep(10);
                        called = true;
                    }
                };
            }
        });
        pools.push(p);

        assert.throws(async () => {
            await p((v) => {
                throw "error";
            });
        });

        assert.isFalse(called);
        await sleep(10);
        assert.isTrue(called);
    });

    it("default destroy function", async () => {
        var called = false;

        var p = Pool({
            create: () => {
                return {
                    destroy: async () => {
                        await sleep(10);
                        called = true;
                    }
                };
            }
        });
        pools.push(p);

        assert.throws(async () => {
            await p((v) => {
                throw "error";
            });
        });

        assert.isFalse(called);
        await sleep(10);
        assert.isTrue(called);
    });

    it("default destroy function, but destroy is not a function, mongodb3.0 case", async () => {
        var cnt = 0;
        var p = Pool({
            create: () => {
                return {
                    destroy: ++cnt
                }
            }
        });
        pools.push(p);

        assert.throws(async () => {
            await p((v) => {
                throw "error";
            });
        });

        assert.equal(cnt, 1);
    });

    it("default dispose function", async () => {
        var called = false;

        var p = Pool({
            create: () => {
                return {
                    dispose: async () => {
                        await sleep(10);
                        called = true;
                    }
                };
            }
        });
        pools.push(p);

        assert.throws(async () => {
            await p((v) => {
                throw "error";
            });
        });

        assert.isFalse(called);
        await sleep(10);
        assert.isTrue(called);
    });

    it("clean timeout", async () => {
        var called = false;

        var p = Pool({
            create: () => {
                return 100;
            },
            destroy: async (o) => {
                await sleep(10);
                called = true;
            },
            timeout: 10
        });
        pools.push(p);

        await p((v) => { });

        assert.isFalse(called);
        assert.equal(p.connections(), 1);
        await sleep(100);
        assert.isTrue(called);
        assert.equal(p.connections(), 0);
    });

    it("retry", async () => {
        var n = 0;

        var p = Pool(async () => {
            n++;
            throw "open error";
        });
        pools.push(p);

        assert.throws(async () => {
            await p((v) => { });
        });

        assert.equal(n, 1);

        var n1 = 0;
        var p1 = Pool({
            create: () => {
                n1++;
                throw "open error";
            },
            retry: 10
        });
        pools.push(p1);

        assert.throws(async () => {
            await p1(async (v) => { });
        });

        assert.equal(n1, 10);

        var n2 = 0;
        var p2 = Pool({
            create: () => {
                n2++;
                if (n2 == 3)
                    return;
                throw "open error";
            },
            retry: 10
        });
        pools.push(p2);

        await p2(async (v) => { });

        assert.equal(n2, 3);
    });

    it("long time create", async () => {
        var called = 0;

        var p = Pool({
            create: async () => {
                called++;
                if (called == 1)
                    await sleep(20);
                return called;
            }
        });
        pools.push(p);

        var cs = [];
        await parallel([0, 1, 2, 3, 4], async n => {
            await p(async (c) => {
                await sleep(1);
                cs[n] = c;
            });
        });

        assert.deepEqual(cs, [2, 3, 4, 5, 2]);
        assert.equal(p.info().count, 4);
        await sleep(100);
        assert.equal(p.info().count, 5);
    });

    it("long time fault create", async () => {
        var called = 0;

        var p = Pool({
            create: async () => {
                called++;
                if (called == 1) {
                    await sleep(20);
                    throw 100;
                }
                return called;
            }
        });
        pools.push(p);

        var cs = [];
        await parallel([0, 1, 2, 3, 4], async n => {
            await p(async (c) => {
                await sleep(1);
                cs[n] = c;
            });
        });

        assert.deepEqual(cs, [2, 3, 4, 5, 2]);
        assert.equal(p.info().count, 4);
        await sleep(100);
        assert.equal(p.info().count, 4);
    });

    it("maxsize and create", async () => {
        var createCount = 0,
            maxsize = 2;

        var p = Pool({
            create: () => {
                createCount++;
                return {};
            },
            maxsize: maxsize
        });
        pools.push(p);

        await parallel(["a", "b", "c", "d"], async n => {
            await p(async (n) => {
                await sleep(50);
            })
        });

        assert.equal(createCount, maxsize);
    });

    it("clear", async () => {
        async function _parallel(data) {
            await parallel(data, async function (n) {
                await p(async (n) => {
                    await sleep(50);
                })
            });
        };

        var maxsize = 3;

        var p = Pool({
            create: () => {
                return {};
            },
            maxsize: maxsize,
            timeout: 60 * 1000
        });
        pools.push(p);

        await _parallel(["a", "b", "c", "d"]);

        assert.equal(p.info().count, maxsize);

        p.clear();
        await sleep(100);

        assert.equal(p.info().count, 0);

        await _parallel(["a"]);

        assert.equal(p.info().count, 0);
    });

    it("throw real error", async () => {
        var called = false;
        var destroyed = false;

        var p = Pool({
            create: () => {
                return 100;
            },
            destroy: async (o) => {
                await sleep(10);
                destroyed = true;
            }
        });
        pools.push(p);

        try {
            await p(async (v) => {
                throw "error";
            });
        } catch (error) {
            called = true
            assert.isObject(error)
            assert.equal(error.message, 'error')
        }

        assert.isTrue(called);

        assert.isFalse(destroyed);
        await sleep(10);
        assert.isTrue(destroyed);
    });

    it('control access', async () => {
        var p = Pool({
            create: () => {
                const o = {
                    close: async () => {
                        await sleep(10);
                    },
                    test_func: async function () { },
                    test_this: async function () {
                        if (this !== o)
                            throw "this is not o";
                    }
                }
                return o;
            }
        });
        pools.push(p);

        var o1;
        await p(async o => {
            o1 = o;
            await o.test_func();
        });

        assert.throws(async () => {
            await o1.test_func();
        });

        await p(async o => {
            await o.test_this();
        });
    });

    it('not control access', async () => {
        var p = Pool({
            create: () => {
                const o = {
                    close: async () => {
                        await sleep(10);
                    },
                    test_func: async function () { }
                }
                return o;
            },
            strict: false
        });
        pools.push(p);

        var o1;
        await p(async o => {
            o1 = o;
            await o.test_func();
        });

        await o1.test_func();
    });

    it("FIX:throw in sync create function", async () => {
        var p = Pool(() => {
            throw "open error";
        });
        pools.push(p);

        assert.throws(async () => {
            await p(async (v) => { });
        });
    });

    it("db pool", async () => {
        var p = Pool(async () => {
            return await db.openSQLite(":memory:");
        });
        pools.push(p);

        var conn1;
        var r = await p(async (conn) => {
            conn1 = conn;
            return await conn.execute("select 1 as n")
        });
        assert.deepEqual(r, [{ n: 1 }]);

        assert.throws(async () => {
            await conn1.execute("select 1 as n");
        });
    });
});

test.run(console.DEBUG);
