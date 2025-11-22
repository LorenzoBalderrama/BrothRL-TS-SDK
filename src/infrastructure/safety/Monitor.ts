import { State } from '../../domain/entities/State';
import { Action } from '../../domain/entities/Action';

/**
 * Log entry for monitoring
 */
export interface LogEntry {
  timestamp: string;
  conversationId: string;
  turnNumber: number;
  state: any;
  action: any;
  reward?: number;
  metadata?: Record<string, any>;
}

/**
 * Metric data point
 */
export interface Metric {
  name: string;
  value: number;
  timestamp: string;
  labels?: Record<string, string>;
}

/**
 * Monitor configuration
 */
export interface MonitorConfig {
  /** Whether to enable logging */
  enableLogging?: boolean;
  
  /** Maximum number of log entries to keep in memory */
  maxLogEntries?: number;
  
  /** Custom log handler */
  logHandler?: (entry: LogEntry) => void;
  
  /** Custom metric handler */
  metricHandler?: (metric: Metric) => void;
  
  /** Whether to track metrics */
  enableMetrics?: boolean;
}

/**
 * Monitor for logging and tracking RL agent behavior
 */
export class Monitor {
  private config: Required<MonitorConfig>;
  private logs: LogEntry[] = [];
  private metrics: Map<string, number[]> = new Map();
  private conversationStats: Map<string, {
    startTime: number;
    turnCount: number;
    actions: string[];
    rewards: number[];
  }> = new Map();

  constructor(config: MonitorConfig = {}) {
    this.config = {
      enableLogging: config.enableLogging ?? true,
      maxLogEntries: config.maxLogEntries ?? 10000,
      logHandler: config.logHandler ?? undefined,
      metricHandler: config.metricHandler ?? undefined,
      enableMetrics: config.enableMetrics ?? true,
    } as Required<MonitorConfig>;
  }

  /**
   * Log a state-action pair
   */
  log(state: State, action: Action, reward?: number, metadata?: Record<string, any>): void {
    if (!this.config.enableLogging) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      conversationId: state.data.conversationId,
      turnNumber: state.data.turnNumber,
      state: this.serializeState(state),
      action: action.toJSON(),
      reward,
      metadata,
    };

    // Add to logs
    this.logs.push(entry);

    // Trim logs if needed
    if (this.logs.length > this.config.maxLogEntries) {
      this.logs = this.logs.slice(-this.config.maxLogEntries);
    }

    // Call custom handler if provided
    if (this.config.logHandler) {
      this.config.logHandler(entry);
    }

    // Update conversation stats
    this.updateConversationStats(state, action, reward);
  }

  /**
   * Record a metric
   */
  recordMetric(name: string, value: number, labels?: Record<string, string>): void {
    if (!this.config.enableMetrics) return;

    const metric: Metric = {
      name,
      value,
      timestamp: new Date().toISOString(),
      labels,
    };

    // Store metric value
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(value);

    // Call custom handler if provided
    if (this.config.metricHandler) {
      this.config.metricHandler(metric);
    }
  }

  /**
   * Update conversation statistics
   */
  private updateConversationStats(state: State, action: Action, reward?: number): void {
    const convId = state.data.conversationId;
    
    if (!this.conversationStats.has(convId)) {
      this.conversationStats.set(convId, {
        startTime: Date.now(),
        turnCount: 0,
        actions: [],
        rewards: [],
      });
    }

    const stats = this.conversationStats.get(convId)!;
    stats.turnCount++;
    stats.actions.push(action.type);
    if (reward !== undefined) {
      stats.rewards.push(reward);
    }
  }

  /**
   * Get all logs
   */
  getLogs(limit?: number): LogEntry[] {
    if (limit) {
      return this.logs.slice(-limit);
    }
    return [...this.logs];
  }

  /**
   * Get logs for a specific conversation
   */
  getConversationLogs(conversationId: string): LogEntry[] {
    return this.logs.filter(log => log.conversationId === conversationId);
  }

  /**
   * Get metric values
   */
  getMetric(name: string): number[] {
    return this.metrics.get(name) || [];
  }

  /**
   * Get metric statistics
   */
  getMetricStats(name: string): {
    count: number;
    mean: number;
    min: number;
    max: number;
    latest: number;
  } | null {
    const values = this.getMetric(name);
    if (values.length === 0) return null;

    const sum = values.reduce((a, b) => a + b, 0);
    return {
      count: values.length,
      mean: sum / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      latest: values[values.length - 1],
    };
  }

  /**
   * Get all metric names
   */
  getMetricNames(): string[] {
    return Array.from(this.metrics.keys());
  }

  /**
   * Get conversation statistics
   */
  getConversationStats(conversationId: string): {
    duration: number;
    turnCount: number;
    actionCounts: Record<string, number>;
    averageReward: number;
    totalReward: number;
  } | null {
    const stats = this.conversationStats.get(conversationId);
    if (!stats) return null;

    const duration = Date.now() - stats.startTime;
    const actionCounts: Record<string, number> = {};
    
    for (const action of stats.actions) {
      actionCounts[action] = (actionCounts[action] || 0) + 1;
    }

    const totalReward = stats.rewards.reduce((a, b) => a + b, 0);
    const averageReward = stats.rewards.length > 0 
      ? totalReward / stats.rewards.length 
      : 0;

    return {
      duration,
      turnCount: stats.turnCount,
      actionCounts,
      averageReward,
      totalReward,
    };
  }

  /**
   * Get overall statistics
   */
  getOverallStats(): {
    totalLogs: number;
    totalConversations: number;
    totalMetrics: number;
    averageTurnsPerConversation: number;
    actionDistribution: Record<string, number>;
  } {
    const totalLogs = this.logs.length;
    const totalConversations = this.conversationStats.size;
    const totalMetrics = Array.from(this.metrics.values())
      .reduce((sum, arr) => sum + arr.length, 0);

    // Calculate average turns
    const turnCounts = Array.from(this.conversationStats.values())
      .map(s => s.turnCount);
    const averageTurnsPerConversation = turnCounts.length > 0
      ? turnCounts.reduce((a, b) => a + b, 0) / turnCounts.length
      : 0;

    // Calculate action distribution
    const actionDistribution: Record<string, number> = {};
    for (const stats of this.conversationStats.values()) {
      for (const action of stats.actions) {
        actionDistribution[action] = (actionDistribution[action] || 0) + 1;
      }
    }

    return {
      totalLogs,
      totalConversations,
      totalMetrics,
      averageTurnsPerConversation,
      actionDistribution,
    };
  }

  /**
   * Export logs as JSON
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics.clear();
  }

  /**
   * Clear conversation stats
   */
  clearConversationStats(): void {
    this.conversationStats.clear();
  }

  /**
   * Clear all data
   */
  clearAll(): void {
    this.clearLogs();
    this.clearMetrics();
    this.clearConversationStats();
  }

  /**
   * Serialize state for logging (with size limit)
   */
  private serializeState(state: State): any {
    const data = state.toJSON();
    
    // Limit history size
    if (data.history && data.history.length > 10) {
      const truncated = [
        ...data.history.slice(0, 5),
        ...data.history.slice(-5),
      ];
      data.history = truncated;
    }

    return data;
  }

  /**
   * Create a summary report
   */
  createReport(): string {
    const overall = this.getOverallStats();
    
    let report = '=== RL Voice Agent Monitor Report ===\n\n';
    report += `Total Logs: ${overall.totalLogs}\n`;
    report += `Total Conversations: ${overall.totalConversations}\n`;
    report += `Total Metrics Recorded: ${overall.totalMetrics}\n`;
    report += `Average Turns per Conversation: ${overall.averageTurnsPerConversation.toFixed(2)}\n\n`;
    
    report += '=== Action Distribution ===\n';
    const sortedActions = Object.entries(overall.actionDistribution)
      .sort((a, b) => b[1] - a[1]);
    
    for (const [action, count] of sortedActions) {
      const percentage = ((count / overall.totalLogs) * 100).toFixed(1);
      report += `${action}: ${count} (${percentage}%)\n`;
    }
    
    report += '\n=== Metrics ===\n';
    for (const name of this.getMetricNames()) {
      const stats = this.getMetricStats(name);
      if (stats) {
        report += `${name}: mean=${stats.mean.toFixed(3)}, `;
        report += `min=${stats.min.toFixed(3)}, max=${stats.max.toFixed(3)}\n`;
      }
    }
    
    return report;
  }
}

