import { extractJSON } from "../src/parse.js";
import assert from "node:assert";
assert.deepEqual(extractJSON('{"a":1}'), { a: 1 });
assert.deepEqual(extractJSON('```json\n{"a":1}\n```'), { a: 1 });
assert.deepEqual(extractJSON('Here you go:\n{"a":{"b":2}} thanks'), { a: { b: 2 } });
assert.equal(extractJSON("no json here"), null);
console.log("ai-service parse tests passed");
