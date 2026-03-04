"use client";

import { useState, useEffect, useCallback } from "react";
import { useSocket } from "./socket";
import type { WorkflowTemplate, WorkflowRun } from "./workflows";

export function useWorkflows() {
  const { socket, connected } = useSocket();
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [history, setHistory] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const fetchTemplates = useCallback(() => {
    if (!socket || !connected) return;
    socket.emit("workflows:list");
  }, [socket, connected]);

  const fetchHistory = useCallback(() => {
    if (!socket || !connected) return;
    socket.emit("workflows:history");
  }, [socket, connected]);

  const runWorkflow = useCallback((workflowId: string, inputs?: Record<string, string>) => {
    if (!socket || !connected) return Promise.reject("Not connected");
    setRunning(true);
    return new Promise((resolve, reject) => {
      socket.emit("workflows:run", { workflowId, inputs });
      socket.once("workflows:started", (data) => {
        setRunning(false);
        if (data.error) {
          reject(data.error);
        } else {
          resolve(data);
        }
      });
      socket.once("workflows:error", (data) => {
        setRunning(false);
        reject(data.error);
      });
    });
  }, [socket, connected]);

  useEffect(() => {
    if (!socket) return;

    socket.on("workflows:list", (data) => {
      if (data.templates) {
        setTemplates(data.templates);
      }
    });

    socket.on("workflows:history", (data) => {
      if (data.history) {
        // Transform kanban to workflow history
        const runs: WorkflowRun[] = Object.entries(data.history).map(([phase, tasks]: [string, any]) => ({
          id: phase,
          workflowId: "orchestration",
          status: phase === "done" ? "completed" : phase === "in_progress" ? "running" : "pending",
          startedAt: Date.now(),
          steps: (tasks || []).map((task: any) => ({
            id: task.id || task.description,
            name: task.description || "Task",
            status: "completed" as const,
          })),
        }));
        setHistory(runs);
      }
    });

    return () => {
      socket.off("workflows:list");
      socket.off("workflows:history");
      socket.off("workflows:started");
      socket.off("workflows:error");
    };
  }, [socket]);

  return {
    templates,
    history,
    loading,
    running,
    fetchTemplates,
    fetchHistory,
    runWorkflow,
  };
}
