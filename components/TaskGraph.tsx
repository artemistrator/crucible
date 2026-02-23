"use client";

import { useMemo, useCallback, useEffect } from "react";
import dagre from "dagre";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  MarkerType,
  Handle,
  Position,
  NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Palette, Wrench, Rocket, Crown, Bot, Search, ClipboardList } from "lucide-react";

import { cn } from "@/lib/utils";
import { getExecutorDisplayLabel } from "@/lib/agent-display";
import type { TaskDetail } from "./TaskDetailSheet";
import "./TaskGraph.css";

const agentIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  TASK_EXECUTOR: Palette,
  BACKEND: Wrench,
  DEVOPS: Rocket,
  TEAMLEAD: Crown,
  CURSOR: Bot,
  QA: Search,
};

/* ----- Types for execution state (backend integration) ----- */
export type NodeVisualState = "todo" | "running" | "done";

export interface CompletedStageInfo {
  name: string;
  tokens?: number;
  time?: string;
}

export interface RunningNodeData {
  currentStage: 0 | 1 | 2 | 3;
  progress: number;
  completedStages: CompletedStageInfo[];
  estimatedSec?: number;
  runningLabel?: string; // e.g. "streaming..." or "thinking..."
}

export interface DoneNodeData {
  duration: string;
  cost: string;
  tokensIn?: number;
  tokensOut?: number;
}

export type ExecutionStateEntry =
  | { state: "running"; data: RunningNodeData }
  | { state: "done"; data: DoneNodeData };

const STAGE_NAMES = ["generate_prompt()", "call_llm()", "write_report()", "save_files()"];

function getVisualStateFromTask(
  task: TaskDetail,
  executionStateByTaskId?: Record<string, ExecutionStateEntry>
): NodeVisualState {
  const entry = executionStateByTaskId?.[task.id];
  if (entry) return entry.state;
  if (task.status === "IN_PROGRESS") return "running";
  if (task.status === "DONE") return "done";
  return "todo";
}

function getExecutionDataForTask(
  task: TaskDetail,
  executionStateByTaskId?: Record<string, ExecutionStateEntry>
): { runningData?: RunningNodeData; doneData?: DoneNodeData } {
  const entry = executionStateByTaskId?.[task.id];
  if (!entry) {
    if (task.status === "IN_PROGRESS")
      return { runningData: { currentStage: 0, progress: 0, completedStages: [], runningLabel: "..." } };
    if (task.status === "DONE")
      return { doneData: { duration: "—", cost: "—" } };
    return {};
  }
  if (entry.state === "running") return { runningData: entry.data };
  return { doneData: entry.data };
}

/* ----- Props ----- */
interface TaskGraphProps {
  tasks: TaskDetail[];
  onTaskClick: (taskId: string) => void;
  executionStateByTaskId?: Record<string, ExecutionStateEntry>;
}

interface CustomNodeData extends Record<string, unknown> {
  title: string;
  status: TaskDetail["status"];
  executorAgent: TaskDetail["executorAgent"];
  onClick: () => void;
  visualState: NodeVisualState;
  runningData?: RunningNodeData;
  doneData?: DoneNodeData;
}

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 240;
const nodeHeightExpanded = 280;

function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  dagreGraph.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 120 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeightExpanded });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: "top" as Position,
      sourcePosition: "bottom" as Position,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeHeightExpanded / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

function GNode({ data }: NodeProps) {
  const d = data as CustomNodeData;
  const isTodo = d.visualState === "todo";
  const isRunning = d.visualState === "running";
  const isDone = d.visualState === "done";

  const stateClass =
    isTodo ? "state-todo" : isRunning ? "state-running" : "state-done";
  const dotClass =
    isTodo ? "dot-todo" : isRunning ? "dot-running" : "dot-done";

  const runningData = d.runningData;
  const doneData = d.doneData;

  return (
    <div
      className={cn("gnode", stateClass)}
      onClick={d.onClick}
      data-cursor-element-id={undefined}
    >
      <Handle type="target" position={Position.Top} className="!border-[var(--node-border)] !bg-[var(--node-border)]" />
      <div className="gnode-header">
        <h3 className="gnode-title">{d.title}</h3>
        {d.executorAgent && (() => {
          const Icon = agentIcons[d.executorAgent!] ?? ClipboardList;
          return (
            <span className="ml-1 flex-shrink-0" title={getExecutorDisplayLabel(d.executorAgent!)}>
              <Icon className="h-3.5 w-3.5 text-[var(--muted)]" />
            </span>
          );
        })()}
        <div className={cn("gnode-dot", dotClass)} />
      </div>

      {isRunning && runningData && (
        <>
          <div className="gnode-stages">
            {STAGE_NAMES.map((name, idx) => {
              const isDoneStage = idx < runningData.currentStage;
              const isCurrent = idx === runningData.currentStage;
              const stageClass = isDoneStage
                ? "stage-done"
                : isCurrent
                  ? "stage-running"
                  : "stage-pending";
              const completed = runningData.completedStages[idx];
              return (
                <div key={name} className={cn("gnode-stage", stageClass)}>
                  {isDoneStage && (
                    <span className="stage-icon">✓</span>
                  )}
                  {isCurrent && <div className="mini-spinner" />}
                  {!isDoneStage && !isCurrent && (
                    <span className="stage-icon">○</span>
                  )}
                  <span className="stage-name">{name}</span>
                  {isDoneStage && completed && (
                    <span className="stage-meta">
                      {completed.tokens != null ? `${completed.tokens} tk` : completed.time ?? ""}
                    </span>
                  )}
                  {isCurrent && (
                    <span className="stage-meta blink">
                      · {runningData.runningLabel ?? "streaming..."}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="gnode-progress">
            <div
              className="gnode-progress-fill"
              style={{ width: `${Math.min(100, Math.max(0, runningData.progress))}%` }}
            />
          </div>
          <div className="gnode-progress-labels">
            <span>{runningData.progress}%</span>
            <span>
              {runningData.estimatedSec != null ? `~${runningData.estimatedSec}s` : "—"}
            </span>
          </div>
        </>
      )}

      {isDone && doneData && (
        <div className="gnode-done-summary">
          <span className="done-check">✓</span>
          <span>
            Completed in {doneData.duration} · {doneData.cost}
          </span>
          {doneData.tokensOut != null && (
            <span className="done-tokens">{doneData.tokensOut} tk ↓</span>
          )}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!border-[var(--node-border)] !bg-[var(--node-border)]" />
    </div>
  );
}

const nodeTypes = {
  customTask: GNode,
};

export function TaskGraph({
  tasks,
  onTaskClick,
  executionStateByTaskId,
}: TaskGraphProps) {
  const initialNodes = useMemo(() => {
    return tasks.map((task) => {
      const visualState = getVisualStateFromTask(task, executionStateByTaskId);
      const { runningData, doneData } = getExecutionDataForTask(
        task,
        executionStateByTaskId
      );
      return {
        id: task.id,
        type: "customTask",
        position: { x: 0, y: 0 },
        data: {
          title: task.title,
          status: task.status,
          executorAgent: task.executorAgent,
          onClick: () => onTaskClick(task.id),
          visualState,
          runningData,
          doneData,
        },
      };
    });
  }, [tasks, onTaskClick, executionStateByTaskId]);

  const taskVisualStateById = useMemo(() => {
    const m: Record<string, NodeVisualState> = {};
    tasks.forEach((t) => {
      m[t.id] = getVisualStateFromTask(t, executionStateByTaskId);
    });
    return m;
  }, [tasks, executionStateByTaskId]);

  const initialEdges = useMemo(() => {
    const edges: Edge[] = [];
    tasks.forEach((task) => {
      if (task.dependencies?.length) {
        task.dependencies.forEach((dep) => {
          const sourceState = taskVisualStateById[dep.id] ?? "todo";
          const targetState = taskVisualStateById[task.id] ?? "todo";
          let edgeClass = "edge-pending";
          let stroke = "#1e2235";
          let animated = false;
          let strokeDasharray: string | undefined;
          if (sourceState === "done" && targetState === "running") {
            edgeClass = "edge-active";
            stroke = "#4f7ef8";
            animated = true;
            strokeDasharray = "6 14";
          } else if (sourceState === "done" && targetState === "done") {
            edgeClass = "edge-done";
            stroke = "rgba(34, 197, 94, 0.5)";
          }
          edges.push({
            id: `${dep.id}-${task.id}`,
            source: dep.id,
            target: task.id,
            type: "smoothstep",
            className: edgeClass,
            animated,
            style: {
              stroke,
              strokeWidth: 2,
              strokeDasharray,
            },
            markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
          });
        });
      }
    });
    return edges;
  }, [tasks, taskVisualStateById]);

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => getLayoutedElements(initialNodes, initialEdges),
    [initialNodes, initialEdges]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  useEffect(() => {
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [layoutedNodes, layoutedEdges, setNodes, setEdges]);

  const setNodeState = useCallback(
    (
      nodeId: string,
      state: NodeVisualState,
      data?: RunningNodeData | DoneNodeData
    ) => {
      setNodes((prev) =>
        prev.map((n) => {
          if (n.id !== nodeId) return n;
          const current = n.data as CustomNodeData;
          return {
            ...n,
            data: {
              ...current,
              visualState: state,
              runningData: state === "running" ? (data as RunningNodeData) : undefined,
              doneData: state === "done" ? (data as DoneNodeData) : undefined,
            },
          };
        })
      );
    },
    [setNodes]
  );

  return (
    <div className="h-[600px] w-full overflow-hidden rounded-lg task-graph-pane">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        className="min-h-0 min-w-0"
      >
        <Background gap={16} />
        <Controls className="!bg-[var(--node-bg)] !border-[var(--node-border)] !text-[var(--text)]" />
        <MiniMap
          nodeColor={(node) => {
            const state = (node.data as CustomNodeData).visualState;
            if (state === "done") return "var(--node-done)";
            if (state === "running") return "var(--node-running)";
            return "var(--node-todo)";
          }}
          maskColor="rgba(0, 0, 0, 0.15)"
          className="!bg-[var(--node-bg)] !border-[var(--node-border)]"
        />
      </ReactFlow>
    </div>
  );
}

export type { CustomNodeData };
