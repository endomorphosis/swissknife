// src/ai/multi-agent/AgentRoles.ts
export enum AgentRole {
  RESEARCHER = 'researcher',
  ANALYST = 'analyst', 
  CODER = 'coder',
  REVIEWER = 'reviewer',
  COORDINATOR = 'coordinator',
  EXECUTOR = 'executor',
  MONITOR = 'monitor'
}

export class AgentRoleManager {
  private roleDefinitions: Map<AgentRole, RoleDefinition> = new Map();

  constructor() {
    this.initializeRoles();
  }

  private initializeRoles(): void {
    this.roleDefinitions.set(AgentRole.RESEARCHER, {
      capabilities: ['web_search', 'document_analysis', 'data_gathering'],
      tools: ['WebSearchTool', 'FileReadTool', 'GrepTool'],
      systemPrompt: `You are a research specialist agent. Your role is to gather, analyze, and synthesize information from various sources. You excel at finding relevant data and providing comprehensive research summaries.`,
      personality: 'thorough, analytical, detail-oriented'
    });

    this.roleDefinitions.set(AgentRole.CODER, {
      capabilities: ['code_generation', 'debugging', 'testing', 'optimization'],
      tools: ['FileEditTool', 'BashTool', 'GrepTool', 'NotebookEditTool'],
      systemPrompt: `You are a software development specialist agent. You excel at writing clean, efficient code, debugging issues, and implementing solutions. You follow best practices and write comprehensive tests.`,
      personality: 'precise, logical, solution-oriented'
    });

    this.roleDefinitions.set(AgentRole.COORDINATOR, {
      capabilities: ['task_management', 'team_coordination', 'workflow_optimization'],
      tools: ['AgentTool', 'MCPTool', 'MemoryWriteTool'],
      systemPrompt: `You are a coordination specialist agent. Your role is to manage workflows, coordinate between team members, and ensure efficient task distribution and completion.`,
      personality: 'organized, diplomatic, strategic'
    });
  }
}