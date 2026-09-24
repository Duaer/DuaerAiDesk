import process from "node:process";
import { createApp } from "./app";
import { openDatabase, resolveDbPath } from "./db";

const HOST = process.env.HOST ?? "127.0.0.1";
const parsedPort = Number.parseInt(process.env.PORT ?? "", 10);
const PORT = Number.isInteger(parsedPort) && parsedPort >= 0 ? parsedPort : 8787;

const dbPath = resolveDbPath();
const db = openDatabase(dbPath);
const app = createApp({ db, dbPath });

const server = app.listen(PORT, HOST, () => {
  console.log(`看板 API 已启动：http://${HOST}:${PORT}`);
  console.log(`数据库：${dbPath}`);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `端口 ${PORT} 已被占用。请先关闭占用该端口的进程，或用 PORT=<其它端口> pnpm start。`,
    );
  } else {
    console.error("API 启动失败：", error);
  }
  db.close();
  process.exit(1);
});

let closing = false;

function shutdown(signal: string): void {
  if (closing) return;
  closing = true;
  console.log(`\n收到 ${signal}，正在关闭…`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  // 兜底：连接没能在 2 秒内收干净就强制退出，避免 Ctrl+C 之后进程赖着不走。
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
