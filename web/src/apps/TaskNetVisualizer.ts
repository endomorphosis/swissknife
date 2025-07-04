// web/src/apps/TaskNetVisualizer.ts
export class TaskNetVisualizerApp {
  private canvas: HTMLCanvasElement;
  private taskGraph: TaskGraph;
  private nodeRenderer: NodeRenderer;

  renderTaskGraph(rootTaskId: string): void {
    const task = this.taskManager.getTask(rootTaskId);
    const graph = this.taskManager.getGoTGraph(rootTaskId);
    
    // Render nodes and connections
    this.nodeRenderer.renderNodes(graph.getAllNodes());
    this.nodeRenderer.renderConnections(graph.getConnections());
    
    // Add interactive controls
    this.addNodeInteraction();
    this.addRealTimeUpdates();
  }

  async decomposeTask(nodeId: string): Promise<void> {
    // Trigger task decomposition
    await this.taskManager.decomposeNode(nodeId);
    this.refreshVisualization();
  }
}