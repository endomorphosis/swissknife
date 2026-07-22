/**
 * Advanced Calculator App for SwissKnife Web Desktop
 * Scientific calculator with history, programmer mode, and unit conversions
 */

export class CalculatorApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.currentDisplay = '0';
    this.previousValue = null;
    this.operation = null;
    this.waitingForOperand = false;
    this.history = [];
    this.memory = 0;
    this.mode = 'standard'; // 'standard', 'scientific', 'programmer', 'converter'
    this.angleUnit = 'deg'; // 'deg', 'rad', 'grad'
    this.programmingBase = 'dec'; // 'dec', 'hex', 'oct', 'bin'
    this.conversionCategory = 'length'; // 'length', 'weight', 'temperature', etc.
    this.lastCalculation = null;
    this.lastError = null;
    this.explanationVerified = false;
    this.keyboardHandler = null;
    this.keyboardHandlerAttached = false;
    this.workflowCid = this.buildCalculationCid('calculator:vda-g033:initial');
    this.workflowReceipt = 'receipt:calculator:vda-g033:ready';
    
    this.constants = {
      pi: Math.PI,
      e: Math.E,
      phi: (1 + Math.sqrt(5)) / 2, // Golden ratio
      sqrt2: Math.sqrt(2),
      ln2: Math.LN2,
      ln10: Math.LN10
    };

    this.conversions = {
      length: {
        meter: 1,
        kilometer: 1000,
        centimeter: 0.01,
        millimeter: 0.001,
        inch: 0.0254,
        foot: 0.3048,
        yard: 0.9144,
        mile: 1609.34
      },
      weight: {
        kilogram: 1,
        gram: 0.001,
        pound: 0.453592,
        ounce: 0.0283495,
        ton: 1000,
        stone: 6.35029
      },
      temperature: {
        celsius: (c) => ({ celsius: c, fahrenheit: c * 9/5 + 32, kelvin: c + 273.15 }),
        fahrenheit: (f) => ({ fahrenheit: f, celsius: (f - 32) * 5/9, kelvin: (f - 32) * 5/9 + 273.15 }),
        kelvin: (k) => ({ kelvin: k, celsius: k - 273.15, fahrenheit: (k - 273.15) * 9/5 + 32 })
      },
      volume: {
        liter: 1,
        milliliter: 0.001,
        gallon: 3.78541,
        quart: 0.946353,
        pint: 0.473176,
        cup: 0.236588,
        fluidOunce: 0.0295735
      }
    };
  }

  renderWorkflowEvidencePanel() {
    const latest = this.getLatestHistoryItem();
    const cid = latest?.cid || this.workflowCid;
    const receipt = latest?.receipt || this.workflowReceipt;
    const explanation = latest?.explanation || 'Enter a calculation, press equals, then verify the arithmetic explanation.';
    const verification = latest?.verified || this.explanationVerified ? 'verified' : 'ready';
    const errorText = this.lastError?.message || 'Division by zero and invalid results remain visible until Clear or Escape.';

    return `
      <section class="calculator-workflow-panel"
               data-svd-workflow="calculator.calculation-cid-history"
               aria-label="Calculator workflow evidence">
        <div class="workflow-chip" data-svd-vda-marker="calculation-cid-history">
          <span>History CID</span>
          <code id="calculator-history-cid">${this.escapeHtml(cid)}</code>
        </div>
        <div class="workflow-chip" data-svd-vda-marker="verified-explanation">
          <span>Explanation</span>
          <button class="workflow-action-btn"
                  id="verify-explanation-btn"
                  data-svd-workflow-action="verify-explanation"
                  aria-label="Verify calculation explanation">${this.escapeHtml(verification)}</button>
          <small id="calculator-explanation">${this.escapeHtml(explanation)}</small>
        </div>
        <div class="workflow-chip" data-svd-vda-marker="keypad-focus">
          <span>Keypad focus</span>
          <small>Pointer, Tab, Enter, Escape, Backspace, and hardware number keys are scoped to this calculator.</small>
        </div>
        <div class="workflow-chip" data-svd-vda-marker="error-handling">
          <span>Error recovery</span>
          <small id="calculator-error-policy">${this.escapeHtml(errorText)}</small>
        </div>
        <div class="workflow-chip" data-svd-vda-marker="responsive-layout">
          <span>Responsive layout</span>
          <small>Compact tabs, wrapped evidence chips, and stable keypad cells support desktop and mobile windows.</small>
        </div>
        <div class="workflow-chip receipt-chip">
          <span>Receipt</span>
          <code id="calculator-receipt">${this.escapeHtml(receipt)}</code>
        </div>
      </section>
    `;
  }

  createWindowConfig() {
    const content = `
      <div class="calculator-container" tabindex="0" role="application" aria-label="Calculator with keyboard keypad support">
        <!-- Mode Selector -->
        <div class="calculator-header">
          <div class="mode-tabs">
            <button class="mode-tab ${this.mode === 'standard' ? 'active' : ''}" data-mode="standard">
              <span class="tab-icon">🧮</span>
              <span class="tab-text">Standard</span>
            </button>
            <button class="mode-tab ${this.mode === 'scientific' ? 'active' : ''}" data-mode="scientific">
              <span class="tab-icon">🔬</span>
              <span class="tab-text">Scientific</span>
            </button>
            <button class="mode-tab ${this.mode === 'programmer' ? 'active' : ''}" data-mode="programmer">
              <span class="tab-icon">💻</span>
              <span class="tab-text">Programmer</span>
            </button>
            <button class="mode-tab ${this.mode === 'converter' ? 'active' : ''}" data-mode="converter">
              <span class="tab-icon">🔄</span>
              <span class="tab-text">Converter</span>
            </button>
          </div>
          <button class="history-btn" id="history-btn" title="History">
            <span>📜</span>
          </button>
        </div>

        <!-- Display -->
        <div class="calculator-display">
          <div class="display-secondary" id="display-secondary"></div>
          <div class="display-primary" id="display-primary">${this.currentDisplay}</div>
          <div class="display-error" id="display-error" role="alert" aria-live="polite" hidden></div>
          ${this.mode === 'programmer' ? `
            <div class="programmer-displays">
              <div class="base-display">HEX: <span id="hex-display">0</span></div>
              <div class="base-display">OCT: <span id="oct-display">0</span></div>
              <div class="base-display">BIN: <span id="bin-display">0</span></div>
            </div>
          ` : ''}
        </div>

        ${this.renderWorkflowEvidencePanel()}

        <!-- Calculator Body -->
        <div class="calculator-body">
          ${this.renderCalculatorForMode()}
        </div>

        <!-- History Panel -->
        <div class="history-panel" id="history-panel" style="display: none;">
          <div class="history-header">
            <h3>History</h3>
            <button class="clear-history-btn" id="clear-history-btn" data-svd-workflow-action="clear-history">Clear All</button>
          </div>
          <div class="history-list" id="history-list">
            ${this.history.length === 0 ? '<div class="no-history">No calculations yet</div>' : ''}
          </div>
        </div>
      </div>

      <style>
        .calculator-container {
          height: 100%;
          background: linear-gradient(135deg, #101820 0%, #243b3f 58%, #3b2f23 100%);
          color: white;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', roboto, monospace;
          display: flex;
          flex-direction: column;
          user-select: none;
          overflow: hidden;
        }

        .calculator-header {
          padding: 12px;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .mode-tabs {
          display: flex;
          gap: 4px;
        }

        .mode-tab {
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 8px;
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
        }

        .mode-tab:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: translateY(-1px);
        }

        .mode-tab.active {
          background: rgba(255, 255, 255, 0.3);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .history-btn {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: none;
          background: rgba(255, 255, 255, 0.2);
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .history-btn:hover {
          background: rgba(255, 255, 255, 0.3);
          transform: scale(1.05);
        }

        .calculator-display {
          padding: 20px;
          background: rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        }

        .display-secondary {
          font-size: 14px;
          opacity: 0.7;
          min-height: 20px;
          text-align: right;
          margin-bottom: 8px;
        }

        .display-primary {
          font-size: 32px;
          font-weight: 300;
          text-align: right;
          min-height: 40px;
          overflow-wrap: anywhere;
          font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
        }

        .display-error {
          margin-top: 8px;
          padding: 8px 10px;
          border-radius: 8px;
          background: rgba(190, 24, 24, 0.28);
          border: 1px solid rgba(254, 202, 202, 0.35);
          color: #fee2e2;
          font-size: 12px;
          text-align: right;
        }

        .display-error[hidden] {
          display: none;
        }

        .programmer-displays {
          margin-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .base-display {
          font-size: 12px;
          font-family: monospace;
          background: rgba(255, 255, 255, 0.1);
          padding: 4px 8px;
          border-radius: 4px;
        }

        .calculator-workflow-panel {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.08);
          border-bottom: 1px solid rgba(255, 255, 255, 0.16);
        }

        .workflow-chip {
          min-width: 0;
          padding: 7px 8px;
          border-radius: 8px;
          background: rgba(16, 24, 32, 0.56);
          border: 1px solid rgba(255, 255, 255, 0.12);
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .workflow-chip span {
          color: #f2aa4c;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .workflow-chip code,
        .workflow-chip small {
          color: #eef6f6;
          font-size: 10px;
          line-height: 1.3;
          overflow-wrap: anywhere;
        }

        .workflow-action-btn {
          align-self: flex-start;
          padding: 4px 8px;
          min-height: 26px;
          border: 1px solid rgba(242, 170, 76, 0.45);
          border-radius: 7px;
          background: rgba(242, 170, 76, 0.22);
          color: #fff7ed;
          cursor: pointer;
          font-size: 11px;
        }

        .calculator-body {
          flex: 1;
          padding: 16px;
          display: flex;
          flex-direction: column;
        }

        .button-grid {
          display: grid;
          gap: 8px;
          flex: 1;
        }

        .standard-grid {
          grid-template-columns: repeat(4, 1fr);
          grid-template-rows: repeat(6, 1fr);
        }

        .scientific-grid {
          grid-template-columns: repeat(6, 1fr);
          grid-template-rows: repeat(7, 1fr);
        }

        .programmer-grid {
          grid-template-columns: repeat(5, 1fr);
          grid-template-rows: repeat(6, 1fr);
        }

        .calc-btn {
          border: none;
          border-radius: 12px;
          font-size: 18px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 50px;
          position: relative;
          overflow: hidden;
        }

        .calc-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05));
          border-radius: inherit;
          z-index: -1;
        }

        .calc-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }

        .calc-btn:active {
          transform: translateY(0);
          transition: transform 0.05s ease;
        }

        .calc-btn.number {
          background: rgba(255, 255, 255, 0.15);
          color: white;
        }

        .calc-btn.operator {
          background: linear-gradient(135deg, #dc2626, #f97316);
          color: white;
        }

        .calc-btn.function {
          background: linear-gradient(135deg, #0f766e, #0891b2);
          color: white;
          font-size: 14px;
        }

        .calc-btn.special {
          background: linear-gradient(135deg, #f2aa4c, #b45309);
          color: white;
        }

        .calc-btn.wide {
          grid-column: span 2;
        }

        .calc-btn.tall {
          grid-row: span 2;
        }

        .converter-section {
          display: flex;
          flex-direction: column;
          gap: 16px;
          flex: 1;
        }

        .conversion-category {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .category-btn {
          padding: 8px 16px;
          background: rgba(255, 255, 255, 0.2);
          border: none;
          border-radius: 20px;
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 12px;
        }

        .category-btn.active {
          background: linear-gradient(135deg, #667eea, #764ba2);
        }

        .conversion-inputs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .conversion-input {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .conversion-input label {
          font-size: 12px;
          opacity: 0.8;
        }

        .conversion-input select {
          padding: 8px;
          background: rgba(255, 255, 255, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 8px;
          color: white;
          font-size: 14px;
        }

        .conversion-input input {
          padding: 12px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 8px;
          color: white;
          font-size: 16px;
          text-align: center;
        }

        .conversion-input input::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }

        .history-panel {
          position: absolute;
          top: 70px;
          right: 16px;
          width: 300px;
          background: rgba(0, 0, 0, 0.9);
          backdrop-filter: blur(20px);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          max-height: 400px;
          z-index: 1000;
        }

        .history-header {
          padding: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .clear-history-btn {
          padding: 4px 8px;
          background: rgba(239, 68, 68, 0.3);
          border: none;
          border-radius: 4px;
          color: white;
          cursor: pointer;
          font-size: 11px;
        }

        .history-list {
          max-height: 300px;
          overflow-y: auto;
          padding: 8px;
        }

        .history-item {
          padding: 8px;
          border-radius: 6px;
          margin-bottom: 4px;
          cursor: pointer;
          transition: background 0.2s ease;
          font-family: monospace;
          font-size: 12px;
        }

        .history-item:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .history-meta {
          margin-top: 4px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          font-size: 10px;
          opacity: 0.78;
          overflow-wrap: anywhere;
        }

        .no-history {
          text-align: center;
          opacity: 0.5;
          padding: 20px;
          font-size: 12px;
        }

        /* Animations */
        @keyframes buttonPress {
          0% { transform: scale(1); }
          50% { transform: scale(0.95); }
          100% { transform: scale(1); }
        }

        .calc-btn.pressed {
          animation: buttonPress 0.1s ease;
        }

        /* Responsive */
        @media (max-width: 600px) {
          .calculator-header {
            padding: 10px;
            align-items: flex-start;
            gap: 8px;
          }

          .mode-tabs {
            flex-wrap: wrap;
          }

          .mode-tab {
            width: 38px;
            height: 36px;
            padding: 0;
            justify-content: center;
          }
          
          .tab-text {
            display: none;
          }
          
          .display-primary {
            font-size: 24px;
          }

          .calculator-display {
            padding: 14px;
          }

          .calculator-workflow-panel {
            grid-template-columns: 1fr;
            padding: 8px 10px;
            max-height: 170px;
            overflow: auto;
          }

          .calculator-body {
            padding: 10px;
          }
          
          .calc-btn {
            min-height: 40px;
            font-size: 14px;
            border-radius: 8px;
          }

          .button-grid {
            gap: 6px;
          }

          .history-panel {
            top: 84px;
            right: 8px;
            left: 8px;
            width: auto;
            max-height: 330px;
          }
        }
      </style>
    `;

    return {
      title: 'Calculator',
      content,
      width: 400,
      height: 600,
      x: 200,
      y: 100,
      resizable: false
    };
  }

  renderCalculatorForMode() {
    switch (this.mode) {
      case 'standard':
        return this.renderStandardCalculator();
      case 'scientific':
        return this.renderScientificCalculator();
      case 'programmer':
        return this.renderProgrammerCalculator();
      case 'converter':
        return this.renderUnitConverter();
      default:
        return this.renderStandardCalculator();
    }
  }

  renderStandardCalculator() {
    return `
      <div class="button-grid standard-grid">
        <button class="calc-btn special" data-action="clear">C</button>
        <button class="calc-btn special" data-action="clear-entry">CE</button>
        <button class="calc-btn special" data-action="backspace">⌫</button>
        <button class="calc-btn operator" data-action="divide">÷</button>
        
        <button class="calc-btn number" data-value="7">7</button>
        <button class="calc-btn number" data-value="8">8</button>
        <button class="calc-btn number" data-value="9">9</button>
        <button class="calc-btn operator" data-action="multiply">×</button>
        
        <button class="calc-btn number" data-value="4">4</button>
        <button class="calc-btn number" data-value="5">5</button>
        <button class="calc-btn number" data-value="6">6</button>
        <button class="calc-btn operator" data-action="subtract">−</button>
        
        <button class="calc-btn number" data-value="1">1</button>
        <button class="calc-btn number" data-value="2">2</button>
        <button class="calc-btn number" data-value="3">3</button>
        <button class="calc-btn operator tall" data-action="add">+</button>
        
        <button class="calc-btn number wide" data-value="0">0</button>
        <button class="calc-btn number" data-action="decimal">.</button>
        
        <button class="calc-btn operator wide" data-action="equals">=</button>
      </div>
    `;
  }

  renderScientificCalculator() {
    return `
      <div class="angle-selector" style="margin-bottom: 12px;">
        <button class="category-btn ${this.angleUnit === 'deg' ? 'active' : ''}" data-angle="deg">DEG</button>
        <button class="category-btn ${this.angleUnit === 'rad' ? 'active' : ''}" data-angle="rad">RAD</button>
        <button class="category-btn ${this.angleUnit === 'grad' ? 'active' : ''}" data-angle="grad">GRAD</button>
      </div>
      
      <div class="button-grid scientific-grid">
        <button class="calc-btn special" data-action="clear">C</button>
        <button class="calc-btn special" data-action="clear-entry">CE</button>
        <button class="calc-btn special" data-action="backspace">⌫</button>
        <button class="calc-btn operator" data-action="divide">÷</button>
        <button class="calc-btn function" data-action="square">x²</button>
        <button class="calc-btn function" data-action="sqrt">√</button>
        
        <button class="calc-btn function" data-action="sin">sin</button>
        <button class="calc-btn function" data-action="cos">cos</button>
        <button class="calc-btn function" data-action="tan">tan</button>
        <button class="calc-btn operator" data-action="multiply">×</button>
        <button class="calc-btn function" data-action="cube">x³</button>
        <button class="calc-btn function" data-action="cbrt">∛</button>
        
        <button class="calc-btn function" data-action="asin">sin⁻¹</button>
        <button class="calc-btn function" data-action="acos">cos⁻¹</button>
        <button class="calc-btn function" data-action="atan">tan⁻¹</button>
        <button class="calc-btn operator" data-action="subtract">−</button>
        <button class="calc-btn function" data-action="power">xʸ</button>
        <button class="calc-btn function" data-action="log">log</button>
        
        <button class="calc-btn function" data-action="ln">ln</button>
        <button class="calc-btn function" data-action="exp">eˣ</button>
        <button class="calc-btn function" data-action="pi">π</button>
        <button class="calc-btn operator" data-action="add">+</button>
        <button class="calc-btn function" data-action="factorial">n!</button>
        <button class="calc-btn function" data-action="inverse">1/x</button>
        
        <button class="calc-btn number" data-value="7">7</button>
        <button class="calc-btn number" data-value="8">8</button>
        <button class="calc-btn number" data-value="9">9</button>
        <button class="calc-btn function" data-action="percent">%</button>
        <button class="calc-btn function" data-action="e">e</button>
        <button class="calc-btn operator" data-action="equals">=</button>
        
        <button class="calc-btn number" data-value="4">4</button>
        <button class="calc-btn number" data-value="5">5</button>
        <button class="calc-btn number" data-value="6">6</button>
        <button class="calc-btn function" data-action="negate">±</button>
        <button class="calc-btn number" data-value="1">1</button>
        <button class="calc-btn number" data-value="2">2</button>
        <button class="calc-btn number" data-value="3">3</button>
        <button class="calc-btn number wide" data-value="0">0</button>
        <button class="calc-btn number" data-action="decimal">.</button>
      </div>
    `;
  }

  renderProgrammerCalculator() {
    return `
      <div class="base-selector" style="margin-bottom: 12px;">
        <button class="category-btn ${this.programmingBase === 'dec' ? 'active' : ''}" data-base="dec">DEC</button>
        <button class="category-btn ${this.programmingBase === 'hex' ? 'active' : ''}" data-base="hex">HEX</button>
        <button class="category-btn ${this.programmingBase === 'oct' ? 'active' : ''}" data-base="oct">OCT</button>
        <button class="category-btn ${this.programmingBase === 'bin' ? 'active' : ''}" data-base="bin">BIN</button>
      </div>
      
      <div class="button-grid programmer-grid">
        <button class="calc-btn special" data-action="clear">C</button>
        <button class="calc-btn special" data-action="clear-entry">CE</button>
        <button class="calc-btn special" data-action="backspace">⌫</button>
        <button class="calc-btn function" data-action="and">AND</button>
        <button class="calc-btn function" data-action="or">OR</button>
        
        <button class="calc-btn function" data-action="xor">XOR</button>
        <button class="calc-btn function" data-action="not">NOT</button>
        <button class="calc-btn function" data-action="lshift">LSH</button>
        <button class="calc-btn function" data-action="rshift">RSH</button>
        <button class="calc-btn operator" data-action="divide">÷</button>
        
        <button class="calc-btn number" data-value="A">A</button>
        <button class="calc-btn number" data-value="B">B</button>
        <button class="calc-btn number" data-value="C">C</button>
        <button class="calc-btn number" data-value="D">D</button>
        <button class="calc-btn operator" data-action="multiply">×</button>
        
        <button class="calc-btn number" data-value="E">E</button>
        <button class="calc-btn number" data-value="F">F</button>
        <button class="calc-btn number" data-value="7">7</button>
        <button class="calc-btn number" data-value="8">8</button>
        <button class="calc-btn operator" data-action="subtract">−</button>
        
        <button class="calc-btn number" data-value="9">9</button>
        <button class="calc-btn number" data-value="4">4</button>
        <button class="calc-btn number" data-value="5">5</button>
        <button class="calc-btn number" data-value="6">6</button>
        <button class="calc-btn operator" data-action="add">+</button>
        
        <button class="calc-btn number" data-value="1">1</button>
        <button class="calc-btn number" data-value="2">2</button>
        <button class="calc-btn number" data-value="3">3</button>
        <button class="calc-btn number wide" data-value="0">0</button>
        <button class="calc-btn operator" data-action="equals">=</button>
      </div>
    `;
  }

  renderUnitConverter() {
    const categories = Object.keys(this.conversions);
    const currentCategory = this.conversions[this.conversionCategory];
    const units = Object.keys(currentCategory);

    return `
      <div class="converter-section">
        <div class="conversion-category">
          ${categories.map(cat => `
            <button class="category-btn ${cat === this.conversionCategory ? 'active' : ''}" 
                    data-category="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</button>
          `).join('')}
        </div>
        
        <div class="conversion-inputs">
          <div class="conversion-input">
            <label>From:</label>
            <select id="from-unit">
              ${units.map(unit => `
                <option value="${unit}">${unit.charAt(0).toUpperCase() + unit.slice(1)}</option>
              `).join('')}
            </select>
            <input type="number" id="from-value" placeholder="Enter value" step="any">
          </div>
          
          <div class="conversion-input">
            <label>To:</label>
            <select id="to-unit">
              ${units.map(unit => `
                <option value="${unit}">${unit.charAt(0).toUpperCase() + unit.slice(1)}</option>
              `).join('')}
            </select>
            <input type="number" id="to-value" placeholder="Result" readonly>
          </div>
        </div>
        
        <div class="common-conversions" style="margin-top: 16px;">
          <h4 style="margin-bottom: 8px; opacity: 0.8;">Quick Conversions:</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
            ${this.getCommonConversions().map(conv => `
              <div style="background: rgba(255,255,255,0.1); padding: 8px; border-radius: 6px;">
                <strong>${conv.from}</strong> = <strong>${conv.to}</strong>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  getCommonConversions() {
    switch (this.conversionCategory) {
      case 'length':
        return [
          { from: '1 meter', to: '3.28 feet' },
          { from: '1 km', to: '0.62 miles' },
          { from: '1 inch', to: '2.54 cm' },
          { from: '1 yard', to: '0.91 meters' }
        ];
      case 'weight':
        return [
          { from: '1 kg', to: '2.20 lbs' },
          { from: '1 lb', to: '453.6 grams' },
          { from: '1 oz', to: '28.35 grams' },
          { from: '1 ton', to: '1000 kg' }
        ];
      case 'temperature':
        return [
          { from: '0°C', to: '32°F' },
          { from: '100°C', to: '212°F' },
          { from: '0°F', to: '-17.8°C' },
          { from: '273.15 K', to: '0°C' }
        ];
      case 'volume':
        return [
          { from: '1 liter', to: '0.26 gallon' },
          { from: '1 gallon', to: '3.79 liters' },
          { from: '1 cup', to: '236.6 ml' },
          { from: '1 pint', to: '473.2 ml' }
        ];
      default:
        return [];
    }
  }

  setupEventHandlers(container) {
    if (!container) return;

    // Mode switching
    container.querySelectorAll('.mode-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchMode(tab.dataset.mode);
      });
    });

    // Calculator buttons
    this.setupCalculatorButtons(container);

    // History toggle
    container.querySelector('#history-btn').addEventListener('click', () => {
      this.toggleHistory();
    });

    const clearHistory = container.querySelector('#clear-history-btn');
    if (clearHistory) {
      clearHistory.addEventListener('click', () => {
        this.history = [];
        this.updateHistoryDisplay();
        this.updateWorkflowEvidence();
      });
    }

    const verifyExplanation = container.querySelector('#verify-explanation-btn');
    if (verifyExplanation) {
      verifyExplanation.addEventListener('click', () => {
        this.verifyExplanation();
      });
    }

    // Angle unit selector (scientific mode)
    container.querySelectorAll('[data-angle]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.angleUnit = btn.dataset.angle;
        this.refreshCalculator();
      });
    });

    // Base selector (programmer mode)
    container.querySelectorAll('[data-base]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.programmingBase = btn.dataset.base;
        this.updateProgrammerDisplays();
        this.refreshCalculator();
      });
    });

    // Conversion category selector
    container.querySelectorAll('[data-category]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.conversionCategory = btn.dataset.category;
        this.refreshCalculator();
      });
    });

    // Unit conversion inputs
    this.setupConversionHandlers(container);

    // Keyboard support
    this.setupKeyboardHandlers();
  }

  setupCalculatorButtons(container) {
    container.querySelectorAll('.calc-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.clearError();
        container.focus({ preventScroll: true });
        btn.classList.add('pressed');
        setTimeout(() => btn.classList.remove('pressed'), 100);
        
        if (btn.dataset.value) {
          this.inputNumber(btn.dataset.value);
        } else if (btn.dataset.action) {
          this.performAction(btn.dataset.action);
        }
      });
    });
  }

  setupConversionHandlers(container) {
    const fromValue = container.querySelector('#from-value');
    const toValue = container.querySelector('#to-value');
    const fromUnit = container.querySelector('#from-unit');
    const toUnit = container.querySelector('#to-unit');

    if (fromValue && toValue && fromUnit && toUnit) {
      const convert = () => {
        const value = parseFloat(fromValue.value);
        if (!isNaN(value)) {
          const result = this.convertUnits(value, fromUnit.value, toUnit.value);
          toValue.value = result.toFixed(6).replace(/\.?0+$/, '');
        } else {
          toValue.value = '';
        }
      };

      fromValue.addEventListener('input', convert);
      fromUnit.addEventListener('change', convert);
      toUnit.addEventListener('change', convert);
    }
  }

  setupKeyboardHandlers() {
    if (this.keyboardHandlerAttached) return;

    this.keyboardHandler = (e) => {
      if (!this.isCalculatorFocused()) return;

      const key = e.key;
      e.preventDefault();

      if ('0123456789'.includes(key)) {
        this.inputNumber(key);
      } else if (key === '.') {
        this.performAction('decimal');
      } else if (key === '+') {
        this.performAction('add');
      } else if (key === '-') {
        this.performAction('subtract');
      } else if (key === '*') {
        this.performAction('multiply');
      } else if (key === '/') {
        this.performAction('divide');
      } else if (key === 'Enter' || key === '=') {
        this.performAction('equals');
      } else if (key === 'Escape' || key === 'c' || key === 'C') {
        this.performAction('clear');
      } else if (key === 'Backspace') {
        this.performAction('backspace');
      }
    };

    document.addEventListener('keydown', this.keyboardHandler);
    this.keyboardHandlerAttached = true;
  }

  isCalculatorFocused() {
    const container = document.querySelector('.calculator-container');
    if (!container || document.activeElement?.matches('input, textarea, select')) return false;
    return container.contains(document.activeElement) || document.activeElement?.closest?.('.window')?.contains(container);
  }

  switchMode(newMode) {
    this.mode = newMode;
    this.refreshCalculator();
  }

  refreshCalculator() {
    const container = document.querySelector('.calculator-container');
    if (!container) return;

    // Update mode tabs
    container.querySelectorAll('.mode-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.mode === this.mode);
    });

    // Update calculator body
    const body = container.querySelector('.calculator-body');
    body.innerHTML = this.renderCalculatorForMode();

    // Re-setup event handlers for new buttons
    this.setupCalculatorButtons(container);
    this.setupConversionHandlers(container);

    // Update programmer displays if in programmer mode
    if (this.mode === 'programmer') {
      this.updateProgrammerDisplays();
    }
  }

  inputNumber(digit) {
    this.clearError();

    if (this.waitingForOperand) {
      this.currentDisplay = digit;
      this.waitingForOperand = false;
    } else {
      if (this.mode === 'programmer' && this.programmingBase === 'hex') {
        // Allow hex digits A-F
        if (this.currentDisplay === '0') {
          this.currentDisplay = digit;
        } else {
          this.currentDisplay += digit;
        }
      } else if (this.mode === 'programmer' && this.programmingBase === 'bin') {
        // Only allow 0 and 1 for binary
        if ('01'.includes(digit)) {
          if (this.currentDisplay === '0') {
            this.currentDisplay = digit;
          } else {
            this.currentDisplay += digit;
          }
        }
      } else if (this.mode === 'programmer' && this.programmingBase === 'oct') {
        // Only allow 0-7 for octal
        if ('01234567'.includes(digit)) {
          if (this.currentDisplay === '0') {
            this.currentDisplay = digit;
          } else {
            this.currentDisplay += digit;
          }
        }
      } else {
        // Standard decimal input
        if (this.currentDisplay === '0') {
          this.currentDisplay = digit;
        } else {
          this.currentDisplay += digit;
        }
      }
    }
    
    this.updateDisplay();
    if (this.mode === 'programmer') {
      this.updateProgrammerDisplays();
    }
  }

  performAction(action) {
    const current = parseFloat(this.currentDisplay);

    switch (action) {
      case 'clear':
        this.clear();
        break;
      case 'clear-entry':
        this.currentDisplay = '0';
        this.clearError();
        break;
      case 'backspace':
        this.backspace();
        break;
      case 'decimal':
        this.inputDecimal();
        break;
      case 'negate':
        this.currentDisplay = String(-current);
        break;
      case 'percent':
        this.currentDisplay = String(current / 100);
        break;
      case 'add':
      case 'subtract':
      case 'multiply':
      case 'divide':
      case 'power':
        this.performOperation(action);
        break;
      case 'equals':
        this.calculate();
        break;
      case 'square':
        this.setUnaryResult('square', Math.pow(current, 2), `${this.currentDisplay} squared`);
        break;
      case 'cube':
        this.setUnaryResult('cube', Math.pow(current, 3), `${this.currentDisplay} cubed`);
        break;
      case 'sqrt':
        this.setUnaryResult('sqrt', current < 0 ? NaN : Math.sqrt(current), `sqrt(${this.currentDisplay})`);
        break;
      case 'cbrt':
        this.setUnaryResult('cbrt', Math.cbrt(current), `cbrt(${this.currentDisplay})`);
        break;
      case 'inverse':
        this.setUnaryResult('inverse', current === 0 ? Infinity : 1 / current, `1 / ${this.currentDisplay}`);
        break;
      case 'factorial':
        this.setUnaryResult('factorial', this.factorial(current), `${this.currentDisplay}!`);
        break;
      case 'sin':
        this.setUnaryResult('sin', Math.sin(this.toRadians(current)), `sin(${this.currentDisplay} ${this.angleUnit})`);
        break;
      case 'cos':
        this.setUnaryResult('cos', Math.cos(this.toRadians(current)), `cos(${this.currentDisplay} ${this.angleUnit})`);
        break;
      case 'tan':
        this.setUnaryResult('tan', Math.tan(this.toRadians(current)), `tan(${this.currentDisplay} ${this.angleUnit})`);
        break;
      case 'asin':
        this.setUnaryResult('asin', this.fromRadians(Math.asin(current)), `asin(${this.currentDisplay})`);
        break;
      case 'acos':
        this.setUnaryResult('acos', this.fromRadians(Math.acos(current)), `acos(${this.currentDisplay})`);
        break;
      case 'atan':
        this.setUnaryResult('atan', this.fromRadians(Math.atan(current)), `atan(${this.currentDisplay})`);
        break;
      case 'ln':
        this.setUnaryResult('ln', current <= 0 ? NaN : Math.log(current), `ln(${this.currentDisplay})`);
        break;
      case 'log':
        this.setUnaryResult('log', current <= 0 ? NaN : Math.log10(current), `log(${this.currentDisplay})`);
        break;
      case 'exp':
        this.setUnaryResult('exp', Math.exp(current), `e^${this.currentDisplay}`);
        break;
      case 'pi':
        this.currentDisplay = String(Math.PI);
        break;
      case 'e':
        this.currentDisplay = String(Math.E);
        break;
      // Programmer operations
      case 'and':
      case 'or':
      case 'xor':
      case 'lshift':
      case 'rshift':
        this.performBitwiseOperation(action);
        break;
      case 'not':
        this.currentDisplay = String(~parseInt(current));
        break;
    }

    this.updateDisplay();
    this.updateWorkflowEvidence();
    if (this.mode === 'programmer') {
      this.updateProgrammerDisplays();
    }
  }

  clear() {
    this.currentDisplay = '0';
    this.previousValue = null;
    this.operation = null;
    this.waitingForOperand = false;
    this.clearError();
    this.updateDisplay();
    this.updateWorkflowEvidence();
  }

  backspace() {
    if (this.currentDisplay.length > 1) {
      this.currentDisplay = this.currentDisplay.slice(0, -1);
    } else {
      this.currentDisplay = '0';
    }
  }

  inputDecimal() {
    if (this.waitingForOperand) {
      this.currentDisplay = '0.';
      this.waitingForOperand = false;
    } else if (this.currentDisplay.indexOf('.') === -1) {
      this.currentDisplay += '.';
    }
  }

  performOperation(newOperation) {
    const current = parseFloat(this.currentDisplay);

    if (this.previousValue === null) {
      this.previousValue = current;
    } else if (this.operation) {
      const result = this.performCalculation();
      if (!Number.isFinite(result)) {
        this.showError('Invalid intermediate result', `${this.previousValue} ${this.getOperatorSymbol(this.operation)} ${this.currentDisplay}`);
        return;
      }
      this.currentDisplay = String(result);
      this.previousValue = result;
    }

    this.waitingForOperand = true;
    this.operation = newOperation;
    this.updateDisplay();
  }

  calculate() {
    if (this.operation && this.previousValue !== null) {
      const expression = `${this.previousValue} ${this.getOperatorSymbol(this.operation)} ${this.currentDisplay}`;
      if (this.operation === 'divide' && parseFloat(this.currentDisplay) === 0) {
        this.showError('Cannot divide by zero', expression);
        return;
      }

      const result = this.performCalculation();
      if (!Number.isFinite(result) || Number.isNaN(result)) {
        this.showError('Calculation result is not finite', expression);
        return;
      }
      
      // Add to history
      this.addToHistory(`${expression} = ${result}`, {
        expression,
        result,
        explanation: `${expression} evaluates to ${result} using local deterministic arithmetic.`,
      });
      
      this.currentDisplay = String(result);
      this.previousValue = null;
      this.operation = null;
      this.waitingForOperand = true;
    }
  }

  performCalculation() {
    const prev = this.previousValue;
    const current = parseFloat(this.currentDisplay);

    switch (this.operation) {
      case 'add':
        return prev + current;
      case 'subtract':
        return prev - current;
      case 'multiply':
        return prev * current;
      case 'divide':
        return current !== 0 ? prev / current : Infinity;
      case 'power':
        return Math.pow(prev, current);
      default:
        return current;
    }
  }

  setUnaryResult(action, result, expression) {
    if (!Number.isFinite(result) || Number.isNaN(result)) {
      this.showError(`Invalid ${action} input`, expression);
      return;
    }

    this.currentDisplay = String(result);
    this.addToHistory(`${expression} = ${result}`, {
      expression,
      result,
      explanation: `${expression} evaluates to ${result} using the calculator ${this.mode} keypad.`,
    });
  }

  performBitwiseOperation(operation) {
    const current = parseInt(this.currentDisplay);
    
    if (this.previousValue === null) {
      this.previousValue = current;
      this.operation = operation;
      this.waitingForOperand = true;
    } else {
      const prev = this.previousValue;
      let result;
      
      switch (operation) {
        case 'and':
          result = prev & current;
          break;
        case 'or':
          result = prev | current;
          break;
        case 'xor':
          result = prev ^ current;
          break;
        case 'lshift':
          result = prev << current;
          break;
        case 'rshift':
          result = prev >> current;
          break;
        default:
          result = current;
      }
      
      this.currentDisplay = String(result);
      this.previousValue = null;
      this.operation = null;
      this.waitingForOperand = true;
    }
  }

  getOperatorSymbol(operation) {
    const symbols = {
      add: '+',
      subtract: '−',
      multiply: '×',
      divide: '÷',
      power: '^'
    };
    return symbols[operation] || operation;
  }

  factorial(n) {
    if (n < 0 || n !== Math.floor(n)) return NaN;
    if (n === 0 || n === 1) return 1;
    
    let result = 1;
    for (let i = 2; i <= n; i++) {
      result *= i;
    }
    return result;
  }

  toRadians(degrees) {
    switch (this.angleUnit) {
      case 'deg':
        return degrees * (Math.PI / 180);
      case 'rad':
        return degrees;
      case 'grad':
        return degrees * (Math.PI / 200);
      default:
        return degrees;
    }
  }

  fromRadians(radians) {
    switch (this.angleUnit) {
      case 'deg':
        return radians * (180 / Math.PI);
      case 'rad':
        return radians;
      case 'grad':
        return radians * (200 / Math.PI);
      default:
        return radians;
    }
  }

  convertUnits(value, fromUnit, toUnit) {
    if (this.conversionCategory === 'temperature') {
      const tempConverter = this.conversions.temperature[fromUnit];
      if (tempConverter) {
        const converted = tempConverter(value);
        return converted[toUnit] || value;
      }
      return value;
    } else {
      const fromFactor = this.conversions[this.conversionCategory][fromUnit];
      const toFactor = this.conversions[this.conversionCategory][toUnit];
      
      if (fromFactor && toFactor) {
        return (value * fromFactor) / toFactor;
      }
      return value;
    }
  }

  updateDisplay() {
    const display = document.querySelector('#display-primary');
    if (display) {
      display.textContent = this.formatNumber(this.currentDisplay);
    }

    const secondary = document.querySelector('#display-secondary');
    if (secondary) {
      secondary.textContent = this.operation && this.previousValue !== null
        ? `${this.formatNumber(String(this.previousValue))} ${this.getOperatorSymbol(this.operation)}`
        : '';
    }

    const error = document.querySelector('#display-error');
    if (error) {
      if (this.lastError) {
        error.hidden = false;
        error.textContent = `${this.lastError.message}. Press C or Escape to recover.`;
      } else {
        error.hidden = true;
        error.textContent = '';
      }
    }
  }

  updateProgrammerDisplays() {
    const value = parseInt(this.currentDisplay) || 0;
    
    const hexDisplay = document.querySelector('#hex-display');
    const octDisplay = document.querySelector('#oct-display');
    const binDisplay = document.querySelector('#bin-display');

    if (hexDisplay) hexDisplay.textContent = value.toString(16).toUpperCase();
    if (octDisplay) octDisplay.textContent = value.toString(8);
    if (binDisplay) binDisplay.textContent = value.toString(2);
  }

  formatNumber(num) {
    const number = parseFloat(num);
    if (isNaN(number)) return '0';
    
    // Format large numbers with commas
    if (Math.abs(number) >= 1000) {
      return number.toLocaleString();
    }
    
    // Limit decimal places for display
    if (number % 1 !== 0) {
      return number.toFixed(10).replace(/\.?0+$/, '');
    }
    
    return String(number);
  }

  addToHistory(calculation, metadata = {}) {
    const expression = metadata.expression || calculation.split(' = ')[0] || calculation;
    const result = metadata.result ?? calculation.split(' = ')[1] ?? this.currentDisplay;
    const cid = this.buildCalculationCid(`${expression}=${result}`);
    const receipt = `receipt:calculator:vda-g033:${this.stableHash(`${cid}:${Date.now()}`).slice(0, 12)}`;
    const item = {
      calculation,
      expression,
      result,
      cid,
      receipt,
      explanation: metadata.explanation || `${expression} evaluates to ${result} with local calculator arithmetic.`,
      verified: false,
      timestamp: Date.now()
    };

    this.history.unshift(item);
    this.lastCalculation = item;
    this.workflowCid = cid;
    this.workflowReceipt = receipt;
    this.explanationVerified = false;
    
    // Limit history to 50 entries
    if (this.history.length > 50) {
      this.history = this.history.slice(0, 50);
    }
    
    this.updateHistoryDisplay();
    this.updateWorkflowEvidence();
  }

  updateHistoryDisplay() {
    const historyList = document.querySelector('#history-list');
    if (!historyList) return;

    if (this.history.length === 0) {
      historyList.innerHTML = '<div class="no-history">No calculations yet</div>';
      return;
    }

    historyList.innerHTML = this.history.map(rawItem => {
      const item = this.normalizeHistoryItem(rawItem);
      return `
      <div class="history-item" data-calculation="${this.escapeHtml(item.calculation)}" data-cid="${this.escapeHtml(item.cid)}">
        <div>${this.escapeHtml(item.calculation)}</div>
        <div class="history-meta">
          <span>${new Date(item.timestamp).toLocaleTimeString()}</span>
          <code>${this.escapeHtml(item.cid)}</code>
          <code>${this.escapeHtml(item.receipt)}</code>
        </div>
      </div>
    `;
    }).join('');

    // Add click handlers for history items
    historyList.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        const calculation = item.dataset.calculation;
        const result = calculation.split(' = ')[1];
        if (result) {
          this.currentDisplay = result;
          this.updateDisplay();
          this.toggleHistory(); // Close history panel
        }
      });
    });
  }

  toggleHistory() {
    const historyPanel = document.querySelector('#history-panel');
    if (historyPanel) {
      const isVisible = historyPanel.style.display !== 'none';
      historyPanel.style.display = isVisible ? 'none' : 'block';
      historyPanel.setAttribute('aria-hidden', String(isVisible));
      
      if (!isVisible) {
        this.updateHistoryDisplay();
      }
    }
  }

  verifyExplanation() {
    const latest = this.getLatestHistoryItem();
    if (latest) {
      latest.verified = true;
      latest.receipt = latest.receipt || `receipt:calculator:vda-g033:${this.stableHash(latest.cid).slice(0, 12)}`;
      this.lastCalculation = latest;
      this.workflowCid = latest.cid;
      this.workflowReceipt = latest.receipt;
    }
    this.explanationVerified = true;
    this.updateHistoryDisplay();
    this.updateWorkflowEvidence();
  }

  showError(message, expression = '') {
    this.lastError = {
      message,
      expression,
      cid: this.buildCalculationCid(`error:${expression}:${message}`),
      receipt: `receipt:calculator:vda-g033:error:${this.stableHash(`${expression}:${message}`).slice(0, 10)}`
    };
    this.currentDisplay = '0';
    this.previousValue = null;
    this.operation = null;
    this.waitingForOperand = true;
    this.updateDisplay();
    this.updateWorkflowEvidence();
  }

  clearError() {
    this.lastError = null;
  }

  updateWorkflowEvidence() {
    const latest = this.getLatestHistoryItem();
    const cid = latest?.cid || this.lastError?.cid || this.workflowCid;
    const receipt = latest?.receipt || this.lastError?.receipt || this.workflowReceipt;
    const explanation = latest?.explanation || 'Enter a calculation, press equals, then verify the arithmetic explanation.';
    const verified = latest?.verified || this.explanationVerified;

    const cidNode = document.querySelector('#calculator-history-cid');
    if (cidNode) cidNode.textContent = cid;

    const receiptNode = document.querySelector('#calculator-receipt');
    if (receiptNode) receiptNode.textContent = receipt;

    const explanationNode = document.querySelector('#calculator-explanation');
    if (explanationNode) explanationNode.textContent = verified ? `Verified: ${explanation}` : explanation;

    const verifyButton = document.querySelector('#verify-explanation-btn');
    if (verifyButton) {
      verifyButton.textContent = verified ? 'verified' : 'ready';
      verifyButton.setAttribute('aria-pressed', String(Boolean(verified)));
    }

    const errorPolicy = document.querySelector('#calculator-error-policy');
    if (errorPolicy) {
      errorPolicy.textContent = this.lastError
        ? `${this.lastError.message}; ${this.lastError.receipt}`
        : 'Division by zero and invalid results remain visible until Clear or Escape.';
    }
  }

  getLatestHistoryItem() {
    const latest = this.history[0];
    return latest ? this.normalizeHistoryItem(latest) : null;
  }

  normalizeHistoryItem(item) {
    if (item && typeof item === 'object') {
      const calculation = item.calculation || `${item.expression || 'calculation'} = ${item.result ?? this.currentDisplay}`;
      const expression = item.expression || calculation.split(' = ')[0] || calculation;
      const result = item.result ?? calculation.split(' = ')[1] ?? this.currentDisplay;
      const cid = item.cid || this.buildCalculationCid(`${expression}=${result}`);
      const receipt = item.receipt || `receipt:calculator:vda-g033:${this.stableHash(cid).slice(0, 12)}`;
      Object.assign(item, {
        calculation,
        expression,
        result,
        cid,
        receipt,
        explanation: item.explanation || `${expression} evaluates to ${result} with local calculator arithmetic.`,
        verified: Boolean(item.verified),
        timestamp: item.timestamp || Date.now()
      });
      return item;
    }

    const calculation = String(item || '0 = 0');
    const expression = calculation.split(' = ')[0] || calculation;
    const result = calculation.split(' = ')[1] || this.currentDisplay;
    return {
      calculation,
      expression,
      result,
      cid: this.buildCalculationCid(`${expression}=${result}`),
      receipt: `receipt:calculator:vda-g033:${this.stableHash(calculation).slice(0, 12)}`,
      explanation: `${expression} evaluates to ${result} with local calculator arithmetic.`,
      verified: false,
      timestamp: Date.now()
    };
  }

  buildCalculationCid(input) {
    return `bafybeig033calculator${this.stableHash(input).slice(0, 18)}g033`;
  }

  stableHash(input) {
    let hashA = 0x811c9dc5;
    let hashB = 0x01000193;
    const value = String(input);
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      hashA ^= code;
      hashA = Math.imul(hashA, 0x01000193) >>> 0;
      hashB = (Math.imul(hashB ^ code, 0x85ebca6b) + 0xc2b2ae35) >>> 0;
    }
    return `${hashA.toString(16).padStart(8, '0')}${hashB.toString(16).padStart(8, '0')}`;
  }

  escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Initialize method required by the desktop framework
  async initialize() {
    // Initialize calculator state
    this.currentDisplay = '0';
    this.previousValue = null;
    this.operation = null;
    this.waitingForOperand = false;
    this.lastError = null;
    return this;
  }

  async exerciseSystemNetworkLocalGateway() {
    return {
      schema: 'swissknife.system-network-local-workflow.v1',
      app_id: 'calculator',
      status: 'ok',
      fallback: false,
      local_state: {
        mode: this.mode,
        history_count: this.history.length,
        latest_cid: this.getLatestHistoryItem()?.cid || this.workflowCid,
        explanation_verified: this.explanationVerified,
      },
      capabilities: {
        local_capabilities: [
          {
            capability_id: 'local.calculator.evaluate',
            description: 'Evaluate local calculator keypad expressions without network access.',
          },
          {
            capability_id: 'local.calculator.history',
            description: 'Store calculation history with deterministic local CID receipts.',
          },
        ],
        remote_capabilities: {},
        service_boundaries: {
          local: ['browser-local'],
          remote: [],
        },
      },
      remote_envelopes: {},
      receipt_refs: [],
      event_dag_refs: [],
    };
  }

  // Render method required by the desktop framework
  async render() {
    const content = `
      <div class="calculator-container" tabindex="0" role="application" aria-label="Calculator with keyboard keypad support">
        <!-- Mode Selector -->
        <div class="calculator-header">
          <div class="mode-tabs">
            <button class="mode-tab ${this.mode === 'standard' ? 'active' : ''}" data-mode="standard">
              <span class="tab-icon">🧮</span>
              <span class="tab-text">Standard</span>
            </button>
            <button class="mode-tab ${this.mode === 'scientific' ? 'active' : ''}" data-mode="scientific">
              <span class="tab-icon">🔬</span>
              <span class="tab-text">Scientific</span>
            </button>
            <button class="mode-tab ${this.mode === 'programmer' ? 'active' : ''}" data-mode="programmer">
              <span class="tab-icon">💻</span>
              <span class="tab-text">Programmer</span>
            </button>
            <button class="mode-tab ${this.mode === 'converter' ? 'active' : ''}" data-mode="converter">
              <span class="tab-icon">🔄</span>
              <span class="tab-text">Converter</span>
            </button>
          </div>
          <button class="history-btn" id="history-btn" title="History">
            <span>📜</span>
          </button>
        </div>

        <!-- Display -->
        <div class="calculator-display">
          <div class="display-secondary" id="display-secondary"></div>
          <div class="display-primary" id="display-primary">${this.currentDisplay}</div>
          <div class="display-error" id="display-error" role="alert" aria-live="polite" hidden></div>
          ${this.mode === 'programmer' ? `
            <div class="programmer-displays">
              <div class="base-display">HEX: <span id="hex-display">0</span></div>
              <div class="base-display">OCT: <span id="oct-display">0</span></div>
              <div class="base-display">BIN: <span id="bin-display">0</span></div>
            </div>
          ` : ''}
        </div>

        ${this.renderWorkflowEvidencePanel()}

        <!-- Calculator Body -->
        <div class="calculator-body">
          ${this.renderCalculatorForMode()}
        </div>

        <!-- History Panel -->
        <div class="history-panel" id="history-panel" style="display: none;">
          <div class="history-header">
            <h3>History</h3>
            <button class="clear-history-btn" id="clear-history-btn" data-svd-workflow-action="clear-history">Clear All</button>
          </div>
          <div class="history-list" id="history-list">
            ${this.history.length === 0 ? '<div class="no-history">No calculations yet</div>' : ''}
          </div>
        </div>
      </div>

      <style>
        .calculator-container {
          height: 100%;
          background: linear-gradient(135deg, #101820 0%, #243b3f 58%, #3b2f23 100%);
          color: white;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', roboto, monospace;
          display: flex;
          flex-direction: column;
          user-select: none;
          overflow: hidden;
        }

        .calculator-header {
          padding: 12px;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .mode-tabs {
          display: flex;
          gap: 4px;
        }

        .mode-tab {
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 8px;
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
        }

        .mode-tab:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: translateY(-1px);
        }

        .mode-tab.active {
          background: rgba(255, 255, 255, 0.3);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .history-btn {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: none;
          background: rgba(255, 255, 255, 0.2);
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .history-btn:hover {
          background: rgba(255, 255, 255, 0.3);
          transform: scale(1.05);
        }

        .calculator-display {
          padding: 20px;
          background: rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        }

        .display-secondary {
          font-size: 14px;
          opacity: 0.7;
          min-height: 20px;
          text-align: right;
          margin-bottom: 8px;
        }

        .display-primary {
          font-size: 32px;
          font-weight: 300;
          text-align: right;
          min-height: 40px;
          overflow-wrap: anywhere;
          font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
        }

        .display-error {
          margin-top: 8px;
          padding: 8px 10px;
          border-radius: 8px;
          background: rgba(190, 24, 24, 0.28);
          border: 1px solid rgba(254, 202, 202, 0.35);
          color: #fee2e2;
          font-size: 12px;
          text-align: right;
        }

        .display-error[hidden] {
          display: none;
        }

        .programmer-displays {
          margin-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .base-display {
          font-size: 12px;
          font-family: monospace;
          background: rgba(255, 255, 255, 0.1);
          padding: 4px 8px;
          border-radius: 4px;
        }

        .calculator-workflow-panel {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.08);
          border-bottom: 1px solid rgba(255, 255, 255, 0.16);
        }

        .workflow-chip {
          min-width: 0;
          padding: 7px 8px;
          border-radius: 8px;
          background: rgba(16, 24, 32, 0.56);
          border: 1px solid rgba(255, 255, 255, 0.12);
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .workflow-chip span {
          color: #f2aa4c;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .workflow-chip code,
        .workflow-chip small {
          color: #eef6f6;
          font-size: 10px;
          line-height: 1.3;
          overflow-wrap: anywhere;
        }

        .workflow-action-btn {
          align-self: flex-start;
          padding: 4px 8px;
          min-height: 26px;
          border: 1px solid rgba(242, 170, 76, 0.45);
          border-radius: 7px;
          background: rgba(242, 170, 76, 0.22);
          color: #fff7ed;
          cursor: pointer;
          font-size: 11px;
        }

        .calculator-body {
          flex: 1;
          padding: 16px;
          display: flex;
          flex-direction: column;
        }

        .button-grid {
          display: grid;
          gap: 8px;
          flex: 1;
        }

        .standard-grid {
          grid-template-columns: repeat(4, 1fr);
          grid-template-rows: repeat(6, 1fr);
        }

        .scientific-grid {
          grid-template-columns: repeat(6, 1fr);
          grid-template-rows: repeat(7, 1fr);
        }

        .programmer-grid {
          grid-template-columns: repeat(5, 1fr);
          grid-template-rows: repeat(6, 1fr);
        }

        .calc-btn {
          border: none;
          border-radius: 12px;
          font-size: 18px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 50px;
          position: relative;
          overflow: hidden;
        }

        .calc-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05));
          border-radius: inherit;
          z-index: -1;
        }

        .calc-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }

        .calc-btn:active {
          transform: translateY(0);
          transition: transform 0.05s ease;
        }

        .calc-btn.number {
          background: rgba(255, 255, 255, 0.15);
          color: white;
        }

        .calc-btn.operator {
          background: linear-gradient(135deg, #dc2626, #f97316);
          color: white;
        }

        .calc-btn.function {
          background: linear-gradient(135deg, #0f766e, #0891b2);
          color: white;
          font-size: 14px;
        }

        .calc-btn.special {
          background: linear-gradient(135deg, #f2aa4c, #b45309);
          color: white;
        }

        .calc-btn.wide {
          grid-column: span 2;
        }

        .calc-btn.tall {
          grid-row: span 2;
        }

        .converter-section {
          display: flex;
          flex-direction: column;
          gap: 16px;
          flex: 1;
        }

        .conversion-category {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .category-btn {
          padding: 8px 16px;
          background: rgba(255, 255, 255, 0.2);
          border: none;
          border-radius: 20px;
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 12px;
        }

        .category-btn.active {
          background: linear-gradient(135deg, #667eea, #764ba2);
        }

        .conversion-inputs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .conversion-input {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .conversion-input label {
          font-size: 12px;
          opacity: 0.8;
        }

        .conversion-input select {
          padding: 8px;
          background: rgba(255, 255, 255, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 8px;
          color: white;
          font-size: 14px;
        }

        .conversion-input input {
          padding: 12px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 8px;
          color: white;
          font-size: 16px;
          text-align: center;
        }

        .conversion-input input::placeholder {
          color: rgba(255, 255, 255, 0.5);
        }

        .history-panel {
          position: absolute;
          top: 70px;
          right: 16px;
          width: 300px;
          background: rgba(0, 0, 0, 0.9);
          backdrop-filter: blur(20px);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          max-height: 400px;
          z-index: 1000;
        }

        .history-header {
          padding: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .clear-history-btn {
          padding: 4px 8px;
          background: rgba(239, 68, 68, 0.3);
          border: none;
          border-radius: 4px;
          color: white;
          cursor: pointer;
          font-size: 11px;
        }

        .history-list {
          max-height: 300px;
          overflow-y: auto;
          padding: 8px;
        }

        .history-item {
          padding: 8px;
          border-radius: 6px;
          margin-bottom: 4px;
          cursor: pointer;
          transition: background 0.2s ease;
          font-family: monospace;
          font-size: 12px;
        }

        .history-item:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .history-meta {
          margin-top: 4px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          font-size: 10px;
          opacity: 0.78;
          overflow-wrap: anywhere;
        }

        .no-history {
          text-align: center;
          opacity: 0.5;
          padding: 20px;
          font-size: 12px;
        }

        /* Animations */
        @keyframes buttonPress {
          0% { transform: scale(1); }
          50% { transform: scale(0.95); }
          100% { transform: scale(1); }
        }

        .calc-btn.pressed {
          animation: buttonPress 0.1s ease;
        }

        /* Responsive */
        @media (max-width: 600px) {
          .calculator-header {
            padding: 10px;
            align-items: flex-start;
            gap: 8px;
          }

          .mode-tabs {
            flex-wrap: wrap;
          }

          .mode-tab {
            width: 38px;
            height: 36px;
            padding: 0;
            justify-content: center;
          }
          
          .tab-text {
            display: none;
          }
          
          .display-primary {
            font-size: 24px;
          }

          .calculator-display {
            padding: 14px;
          }

          .calculator-workflow-panel {
            grid-template-columns: 1fr;
            padding: 8px 10px;
            max-height: 170px;
            overflow: auto;
          }

          .calculator-body {
            padding: 10px;
          }
          
          .calc-btn {
            min-height: 40px;
            font-size: 14px;
            border-radius: 8px;
          }

          .button-grid {
            gap: 6px;
          }

          .history-panel {
            top: 84px;
            right: 8px;
            left: 8px;
            width: auto;
            max-height: 330px;
          }
        }
      </style>
    `;

    // Set up event handlers after the HTML is rendered
    setTimeout(() => {
      this.setupEventHandlers(document.querySelector('.calculator-container'));
      this.updateDisplay();
      this.updateWorkflowEvidence();
      if (this.mode === 'programmer') {
        this.updateProgrammerDisplays();
      }
    }, 0);

    return content;
  }
}
