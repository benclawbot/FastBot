"use client";

import { useState, useEffect } from "react";
import { useSocket } from "@/lib/socket";
import { useWorkflows } from "@/lib/use-workflows";
import { Zap, Play, Clock, CheckCircle2, XCircle, AlertCircle, Plus, FileText, History, Box } from "lucide-react";
import type { WorkflowTemplate, WorkflowRun } from "@/lib/workflows";

const categoryColors: Record<string, string> = {
  development: "bg-blue-500/20 text-blue-400",
  analytics: "bg-purple-500/20 text-purple-400",
  marketing: "bg-orange-500/20 text-orange-400",
  other: "bg-zinc-500/20 text-zinc-400",
};

function WorkflowCard({
  template,
  onRun,
  running,
}: {
  template: WorkflowTemplate;
  onRun: () => void;
  running: boolean;
}) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 hover:border-white/[0.12] transition-all">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
          <Zap size={20} className="text-violet-400" />
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${categoryColors[template.category] || categoryColors.other}`}>
          {template.category}
        </span>
      </div>

      <h3 className="text-lg font-light text-white mb-2">{template.name}</h3>
      <p className="text-sm text-white/40 mb-4">{template.description}</p>

      <div className="flex flex-wrap gap-1 mb-4">
        {template.steps.slice(0, 3).map((step, i) => (
          <span key={i} className="text-xs text-white/30 bg-white/5 px-2 py-1 rounded">
            {step}
          </span>
        ))}
        {template.steps.length > 3 && (
          <span className="text-xs text-white/30 bg-white/5 px-2 py-1 rounded">
            +{template.steps.length - 3} more
          </span>
        )}
      </div>

      <button
        onClick={onRun}
        disabled={running}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-500 hover:bg-violet-400 disabled:bg-white/10 disabled:text-white/30 text-black font-medium rounded-xl transition-colors"
      >
        <Play size={16} />
        {running ? "Running..." : "Run Workflow"}
      </button>
    </div>
  );
}

function WorkflowHistoryItem({ run }: { run: WorkflowRun }) {
  const statusIcon = {
    pending: <Clock size={16} className="text-yellow-400" />,
    running: <AlertCircle size={16} className="text-blue-400 animate-pulse" />,
    completed: <CheckCircle2 size={16} className="text-emerald-400" />,
    failed: <XCircle size={16} className="text-red-400" />,
  };

  const statusColor = {
    pending: "text-yellow-400",
    running: "text-blue-400",
    completed: "text-emerald-400",
    failed: "text-red-400",
  };

  return (
    <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {statusIcon[run.status]}
          <span className="text-sm font-medium text-white">{run.workflowId}</span>
        </div>
        <span className={`text-xs ${statusColor[run.status]}`}>
          {run.status}
        </span>
      </div>

      {run.steps.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-white/40 mb-2">Steps:</p>
          {run.steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {step.status === "completed" ? (
                <CheckCircle2 size={12} className="text-emerald-400" />
              ) : step.status === "failed" ? (
                <XCircle size={12} className="text-red-400" />
              ) : (
                <Clock size={12} className="text-white/20" />
              )}
              <span className="text-white/60">{step.name}</span>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-white/30 mt-3">
        {new Date(run.startedAt).toLocaleString()}
      </div>
    </div>
  );
}

function CreateWorkflowCard() {
  return (
    <div className="bg-white/[0.03] border border-white/[0.06] border-dashed rounded-2xl p-5 hover:border-violet-500/30 transition-all cursor-pointer group">
      <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3">
        <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center group-hover:bg-violet-500/20 transition-colors">
          <Plus size={24} className="text-violet-400" />
        </div>
        <p className="text-sm text-white/60">Create Custom Workflow</p>
        <p className="text-xs text-white/30 text-center">
          Define your own workflow with YAML. Define steps, conditions, and approvals.
        </p>
      </div>
    </div>
  );
}

export default function WorkflowsPage() {
  const { socket, connected } = useSocket();
  const { templates, history, running, fetchTemplates, fetchHistory, runWorkflow } = useWorkflows();
  const [activeTab, setActiveTab] = useState<"templates" | "create" | "history">("templates");
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowTemplate | null>(null);
  const [customYaml, setCustomYaml] = useState("");
  const [runStatus, setRunStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  useEffect(() => {
    if (connected) {
      fetchTemplates();
      fetchHistory();
    }
  }, [connected, fetchTemplates, fetchHistory]);

  const handleRunWorkflow = async (workflow: WorkflowTemplate) => {
    setSelectedWorkflow(workflow);
    setRunStatus(null);
    try {
      await runWorkflow(workflow.id);
      setRunStatus({ success: true, message: `Workflow "${workflow.name}" started successfully!` });
      fetchHistory();
    } catch (err) {
      setRunStatus({ success: false, message: String(err) });
    }
  };

  const handleRunCustom = async () => {
    if (!customYaml.trim()) return;
    setRunStatus(null);
    try {
      await runWorkflow("custom", { yaml: customYaml });
      setRunStatus({ success: true, message: "Custom workflow started successfully!" });
      setActiveTab("history");
    } catch (err) {
      setRunStatus({ success: false, message: String(err) });
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-light tracking-tight mb-2">Workflows</h1>
            <p className="text-white/40">Automate tasks with AI-powered workflows</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("templates")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeTab === "templates"
                ? "bg-violet-500/20 text-violet-400"
                : "text-white/40 hover:text-white hover:bg-white/5"
            }`}
          >
            <Box size={16} />
            Templates
          </button>
          <button
            onClick={() => setActiveTab("create")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeTab === "create"
                ? "bg-violet-500/20 text-violet-400"
                : "text-white/40 hover:text-white hover:bg-white/5"
            }`}
          >
            <Plus size={16} />
            Create
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              activeTab === "history"
                ? "bg-violet-500/20 text-violet-400"
                : "text-white/40 hover:text-white hover:bg-white/5"
            }`}
          >
            <History size={16} />
            History
          </button>
        </div>

        {/* Status Message */}
        {runStatus && (
          <div
            className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
              runStatus.success
                ? "bg-emerald-500/10 border border-emerald-500/20"
                : "bg-red-500/10 border border-red-500/20"
            }`}
          >
            {runStatus.success ? (
              <CheckCircle2 size={20} className="text-emerald-400" />
            ) : (
              <XCircle size={20} className="text-red-400" />
            )}
            <span className={runStatus.success ? "text-emerald-400" : "text-red-400"}>
              {runStatus.message}
            </span>
          </div>
        )}

        {/* Templates Tab */}
        {activeTab === "templates" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <WorkflowCard
                key={template.id}
                template={template}
                onRun={() => handleRunWorkflow(template)}
                running={running && selectedWorkflow?.id === template.id}
              />
            ))}
          </div>
        )}

        {/* Create Tab */}
        {activeTab === "create" && (
          <div className="space-y-6">
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <FileText size={20} className="text-violet-400" />
                <h3 className="text-lg font-light">Custom YAML Workflow</h3>
              </div>

              <p className="text-sm text-white/40 mb-4">
                Define your workflow using YAML. Here's an example:
              </p>

              <pre className="bg-black/30 rounded-xl p-4 text-xs text-white/60 font-mono overflow-x-auto mb-4">
{`workflow:
  name: My Custom Workflow
  description: Example workflow

steps:
  - name: Fetch Data
    action: http_get
    url: https://api.example.com/data

  - name: Process
    action: transform
    input: \${step1.output}

  - name: Notify
    action: send_notification
    channel: telegram`}

              <textarea
                value={customYaml}
                onChange={(e) => setCustomYaml(e.target.value)}
                placeholder="Paste your YAML workflow here..."
                className="w-full h-64 bg-black/30 border border-white/10 rounded-xl p-4 text-xs text-white font-mono focus:outline-none focus:border-violet-500/50 resize-none"
              />
              </pre>

              <button
                onClick={handleRunCustom}
                disabled={!customYaml.trim() || running}
                className="flex items-center gap-2 px-6 py-3 bg-violet-500 hover:bg-violet-400 disabled:bg-white/10 disabled:text-white/30 text-black font-medium rounded-xl transition-colors"
              >
                <Play size={18} />
                {running ? "Running..." : "Run Custom Workflow"}
              </button>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div className="space-y-4">
            {history.length > 0 ? (
              history.map((run) => <WorkflowHistoryItem key={run.id} run={run} />)
            ) : (
              <div className="text-center py-12">
                <Clock size={48} className="text-white/20 mx-auto mb-4" />
                <p className="text-white/40">No workflow runs yet</p>
                <p className="text-sm text-white/30 mt-1">
                  Run a workflow from the Templates tab to get started
                </p>
              </div>
            )}
          </div>
        )}

        {/* Empty State */}
        {activeTab === "templates" && templates.length === 0 && (
          <div className="text-center py-12">
            <Zap size={48} className="text-white/20 mx-auto mb-4" />
            <p className="text-white/40">No workflow templates available</p>
            <p className="text-sm text-white/30 mt-1">
              Create a custom workflow in the Create tab
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
