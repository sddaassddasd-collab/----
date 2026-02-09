import express from "express";
import http from "node:http";
import path from "node:path";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData
} from "../../shared/types.js";
import { registerSocketHandlers } from "./socket.js";

const PORT = Number(process.env.PORT ?? 3000);

const app = express();
const httpServer = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
  cors: { origin: "*" }
});

registerSocketHandlers(io);

const publicDir = path.resolve(process.cwd(), "public");

app.use(express.json());
app.use(express.static(publicDir));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/", (_req, res) => {
  res.redirect("/player");
});

app.get("/player", (_req, res) => {
  res.sendFile(path.join(publicDir, "player.html"));
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(publicDir, "admin.html"));
});

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Socket server listening on http://localhost:${PORT}`);
});
