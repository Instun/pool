# @instun/pool

## Overview

`@instun/pool` is an asynchronous pool module designed for use with Fibjs, Node.js, browser, and React Native. It allows you to manage a pool of resources efficiently, ensuring that your application can handle multiple tasks concurrently without overwhelming the system.

## Installation

To install the package, use npm:

```sh
fibjs --install @instun/pool
```

## Usage

### Basic Example

Here is a basic example of how to use the pool module:

```js
var db = require("db");
var Pool = require("@instun/pool");

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
```

## API

### Pool

#### `Pool(create, size, timeout)`

- `create`: A function that creates a new resource.
- `size`: The maximum number of resources in the pool.
- `timeout`: The time in milliseconds before a resource is considered idle and removed from the pool.

### Methods

#### `function clear()`

Clears idle resources from the pool.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request on GitHub.

## Author

This project is maintained by [Instun](https://github.com/Instun).

## Repository

[GitHub Repository](https://github.com/Instun/pool)
