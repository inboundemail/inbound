const CHUNK_PUBLIC_PATH = "server/instrumentation.js";
const runtime = require("./chunks/[turbopack]_runtime.js");
runtime.loadChunk("server/chunks/[root-of-the-server]__708948cd._.js");
runtime.loadChunk("server/chunks/node_modules_2e62d5bb._.js");
runtime.getOrInstantiateRuntimeModule(217065, CHUNK_PUBLIC_PATH);
module.exports = runtime.getOrInstantiateRuntimeModule(217065, CHUNK_PUBLIC_PATH).exports;
