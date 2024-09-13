var db = require("db");
var Pool = require("..");

var p = Pool(async () => {
    return await db.promises.open("sqlite::memory:");
}, 10, 1 * 1000);

async function main() {
    var res = await p(async (conn) => {
        console.log("Connected");
        await conn.execute("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)");
        await conn.execute("INSERT INTO test (name) VALUES ('Hello')");
        return await conn.execute("SELECT * FROM test");
    });

    console.log(res);
}

main();
