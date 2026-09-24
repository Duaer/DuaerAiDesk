#!/usr/bin/env node
// 零依赖开发编排：并行拉起 API（127.0.0.1:8787）与 Web（127.0.0.1:5273）。
// 两个子进程任意一个退出，就整体收工，避免留下孤儿端口占用。
import { spawn } from "node:child_process";
import process from "node:process";

const WEB_URL = "http://127.0.0.1:5273";
const API_URL = "http://127.0.0.1:8787/api/health";

let shuttingDown = false;
/** @type {import("node:child_process").ChildProcess[]} */
const children = [];

function prefixLines(stream, prefix, out) {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) out.write(`${prefix}${line}\n`);
  });
  stream.on("end", () => {
    if (buffer) out.write(`${prefix}${buffer}\n`);
    buffer = "";
  });
}

function run(name, script) {
  const child = spawn("pnpm", ["run", script], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "1" },
    shell: process.platform === "win32",
  });
  prefixLines(child.stdout, `[${name}] `, process.stdout);
  prefixLines(child.stderr, `[${name}] `, process.stderr);
  child.on("error", (error) => {
    console.error(`[${name}] 启动失败：${error.message}`);
    shutdown(1);
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(
      `[${name}] 已退出（code=${code ?? "-"} signal=${signal ?? "-"}），停止其余进程。`,
    );
    shutdown(code ?? 1);
  });
  children.push(child);
  return child;
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 150);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("本地任务看板 · 开发模式");
console.log(`  Web  ${WEB_URL}`);
console.log(`  API  ${API_URL}`);
console.log("  数据 data/kanban.db（可用 DB_PATH 覆盖）");
console.log("  按 Ctrl+C 退出\n");

run("api", "dev:server");
run("web", "dev:web");
