// Test orchestration integration via Socket.IO
import { io } from "socket.io-client";

const socket = io("http://127.0.0.1:44512", {
  transports: ["websocket"],
  auth: { token: "test-token" }
});

socket.on("connect", () => {
  console.log("Connected to gateway");

  // Test orchestration:status
  socket.emit("orchestration:status", {}, (response) => {
    console.log("orchestration:status ->", response);

    // Test orchestration:start
    socket.emit("orchestration:start", { request: "Test orchestration from socket" }, (response) => {
      console.log("orchestration:start ->", response);

      // Get kanban
      socket.emit("orchestration:kanban", {}, (response) => {
        console.log("orchestration:kanban ->", response);

        socket.disconnect();
        process.exit(0);
      });
    });
  });
});

socket.on("connect_error", (err) => {
  console.error("Connection error:", err.message);
  process.exit(1);
});

// Timeout
setTimeout(() => {
  console.log("Timeout");
  socket.disconnect();
  process.exit(1);
}, 10000);
