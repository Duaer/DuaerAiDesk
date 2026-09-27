import { describe, expect, it } from "vitest";
import { startTestServer } from "./helpers";

describe("kanban board smoke", () => {
  it("creates a task and lists it on the board", async () => {
    const server = await startTestServer();
    try {
      const created = await server.createTask("release smoke");
      expect(created.status).toBe(201);
      const board = await server.listBoard();
      expect(board.some((task) => task.title === "release smoke")).toBe(true);
    } finally {
      await server.close();
    }
  });
});
