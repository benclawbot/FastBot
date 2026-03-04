// Workflow types for FastBot

export interface WorkflowStep {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  output?: string;
  error?: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  steps: string[];
  category: "development" | "analytics" | "marketing" | "other";
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: "pending" | "running" | "completed" | "failed";
  startedAt: number;
  completedAt?: number;
  steps: WorkflowStep[];
  result?: string;
  error?: string;
}

export interface WorkflowInputs {
  [key: string]: string;
}
