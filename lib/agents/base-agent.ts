import { AgentRole, AgentMessage } from "@prisma/client";
import { messageBus, NewMessage } from "@/lib/execution/message-bus";
import { trackAIUsage } from "@/lib/ai/call";

export interface AgentConfig {
  sessionId: string;
  projectId: string;
  agentRole: AgentRole;
  autoApprove?: boolean;
  onLog?: (level: "info" | "error" | "success", message: string) => void;
  /** When "cloud", agents use server workspace (e.g. AHP/legacy cloud); when "local", use sync client */
  mode?: "local" | "cloud";
}

export abstract class BaseAgent {
  protected config: AgentConfig;
  protected isRunning: boolean = false;
  protected isPaused: boolean = false;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  abstract processMessage(message: AgentMessage): Promise<Record<string, unknown>>;

  async run(): Promise<void> {
    this.isRunning = true;
    this.isPaused = false;

    try {
      const messages = await messageBus.getPendingMessagesFor(
        this.config.sessionId,
        this.config.agentRole
      );

      if (messages.length > 0) {
        this.log("info", `[${this.config.agentRole}] Processing ${messages.length} messages`);
      }

      for (const message of messages) {
        if (this.isPaused) continue;
        if (!this.isRunning) break;

        try {
          await messageBus.markAsProcessing(message.id);

          this.log("info", `[${this.config.agentRole}] Processing message: ${message.eventType}`);

          const response = await this.processMessage(message);
          await messageBus.markAsProcessed(message.id, response);

          this.log("info", `[${this.config.agentRole}] Message processed: ${message.eventType}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          this.log("error", `[${this.config.agentRole}] Failed to process message: ${errorMsg}`);
          await messageBus.markAsFailed(message.id, errorMsg);
        }
      }
    } finally {
      this.isRunning = false;
    }
  }

  pause(): void {
    this.isPaused = true;
    this.log("info", `[${this.config.agentRole}] Paused`);
  }

  resume(): void {
    this.isPaused = false;
    this.log("info", `[${this.config.agentRole}] Resumed`);
  }

  stop(): void {
    this.isRunning = false;
    this.log("info", `[${this.config.agentRole}] Stopped`);
  }

  protected async sendMessage(
    targetAgent: AgentRole,
    eventType: string,
    payload: Record<string, unknown>,
    replyToId?: string
  ): Promise<AgentMessage> {
    return await messageBus.postMessage({
      sessionId: this.config.sessionId,
      sourceAgent: this.config.agentRole,
      targetAgent,
      eventType: eventType as any,
      payload,
      replyToId,
    });
  }

  protected log(level: "info" | "error" | "success", message: string): void {
    if (this.config.onLog) {
      this.config.onLog(level, message);
    }
  }
}
