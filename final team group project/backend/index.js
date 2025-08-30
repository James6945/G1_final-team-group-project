import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
const PORT = 7070;

// 读地址与 ABI
const addr = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "contracts_address.json"))
).SpendingLimitWallet;

const abi = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..","apps", "parent", "abi.json"))
);

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const contract = new ethers.Contract(addr, abi, provider);

// WebSocket
const wss = new WebSocketServer({ noServer: true });
let sockets = new Set();

wss.on("connection", (ws) => {
  sockets.add(ws);
  ws.on("close", () => sockets.delete(ws));
});

const server = app.listen(PORT, () => {
  console.log("Backend listening on http://localhost:" + PORT);
});

server.on("upgrade", (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

function broadcast(obj) {
  const data = JSON.stringify(obj);
  [...sockets].forEach((ws) => {
    try { ws.send(data); } catch {}
  });
}

// 订阅事件
contract.on("Payment", (child, merchant, amount, ev) => {
  broadcast({ type: "Payment", child, merchant, amount: amount.toString(), tx: ev.log.transactionHash });
});
contract.on("TempRequested", (child, amount, ev) => {
  broadcast({ type: "TempRequested", child, amount: amount.toString(), tx: ev.log.transactionHash });
});
contract.on("TempApproved", (parent, child, amount, expires, ev) => {
  broadcast({ type: "TempApproved", parent, child, amount: amount.toString(), expires: Number(expires), tx: ev.log.transactionHash });
});
contract.on("Frozen", (parent, child, isFrozen, ev) => {
  broadcast({ type: "Frozen", parent, child, isFrozen, tx: ev.log.transactionHash });
});

app.get("/health", (_, res) => res.json({ ok: true, address: addr }));
