// web/src/apps/ModelDashboard.ts
export class ModelDashboardApp {
  private modelOrchestrator: ModelOrchestrator;
  private performanceMonitor: ModelPerformanceMonitor;
  private realTimeMetrics: RealTimeMetrics;

  private renderDashboard(): JSX.Element {
    return (
      <div className="model-dashboard">
        <div className="model-grid">
          {this.renderModelCards()}
        </div>
        <div className="performance-charts">
          {this.renderPerformanceCharts()}
        </div>
        <div className="cost-analysis">
          {this.renderCostAnalysis()}
        </div>
        <div className="selection-insights">
          {this.renderSelectionInsights()}
        </div>
      </div>
    );
  }

  private renderModelCards(): JSX.Element {
    return (
      <>
        {this.availableModels.map(model => (
          <ModelCard 
            key={model.id}
            model={model}
            metrics={this.realTimeMetrics.getModelMetrics(model.id)}
            onSelect={() => this.selectModel(model.id)}
          />
        ))}
      </>
    );
  }
}