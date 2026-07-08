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

  createWindowConfig() {
    const content = `
      <div class="calculator-container">
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
          ${this.mode === 'programmer' ? `
            <div class="programmer-displays">
              <div class="base-display">HEX: <span id="hex-display">0</span></div>
              <div class="base-display">OCT: <span id="oct-display">0</span></div>
              <div class="base-display">BIN: <span id="bin-display">0</span></div>
            </div>
          ` : ''}
        </div>

        <!-- Calculator Body -->
        <div class="calculator-body">
          ${this.renderCalculatorForMode()}
        </div>

        <!-- History Panel -->
        <div class="history-panel" id="history-panel" style="display: none;">
          <div class="history-header">
            <h3>History</h3>
            <button class="clear-history-btn" id="clear-history-btn">Clear All</button>
          </div>
          <div class="history-list" id="history-list">
            ${this.history.length === 0 ? '<div class="no-history">No calculations yet</div>' : ''}
          </div>
        </div>
      </div>

      <style>
        .calculator-container {
          height: 100%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', roboto, monospace;
          display: flex;
          flex-direction: column;
          user-select: none;
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
          word-wrap: break-word;
          font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
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
          background: linear-gradient(135deg, #ff6b6b, #ee5a6f);
          color: white;
        }

        .calc-btn.function {
          background: linear-gradient(135deg, #4ecdc4, #44a08d);
          color: white;
          font-size: 14px;
        }

        .calc-btn.special {
          background: linear-gradient(135deg, #feca57, #ff9ff3);
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
          .mode-tabs {
            flex-wrap: wrap;
          }
          
          .tab-text {
            display: none;
          }
          
          .display-primary {
            font-size: 24px;
          }
          
          .calc-btn {
            min-height: 40px;
            font-size: 14px;
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
    document.addEventListener('keydown', (e) => {
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
    });
  }

  isCalculatorFocused() {
    return document.querySelector('.calculator-container') && 
           !document.activeElement.matches('input, textarea, select');
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
        this.currentDisplay = String(Math.pow(current, 2));
        break;
      case 'cube':
        this.currentDisplay = String(Math.pow(current, 3));
        break;
      case 'sqrt':
        this.currentDisplay = String(Math.sqrt(current));
        break;
      case 'cbrt':
        this.currentDisplay = String(Math.cbrt(current));
        break;
      case 'inverse':
        this.currentDisplay = String(1 / current);
        break;
      case 'factorial':
        this.currentDisplay = String(this.factorial(current));
        break;
      case 'sin':
        this.currentDisplay = String(Math.sin(this.toRadians(current)));
        break;
      case 'cos':
        this.currentDisplay = String(Math.cos(this.toRadians(current)));
        break;
      case 'tan':
        this.currentDisplay = String(Math.tan(this.toRadians(current)));
        break;
      case 'asin':
        this.currentDisplay = String(this.fromRadians(Math.asin(current)));
        break;
      case 'acos':
        this.currentDisplay = String(this.fromRadians(Math.acos(current)));
        break;
      case 'atan':
        this.currentDisplay = String(this.fromRadians(Math.atan(current)));
        break;
      case 'ln':
        this.currentDisplay = String(Math.log(current));
        break;
      case 'log':
        this.currentDisplay = String(Math.log10(current));
        break;
      case 'exp':
        this.currentDisplay = String(Math.exp(current));
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
    if (this.mode === 'programmer') {
      this.updateProgrammerDisplays();
    }
  }

  clear() {
    this.currentDisplay = '0';
    this.previousValue = null;
    this.operation = null;
    this.waitingForOperand = false;
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
      this.currentDisplay = String(result);
      this.previousValue = result;
    }

    this.waitingForOperand = true;
    this.operation = newOperation;
  }

  calculate() {
    if (this.operation && this.previousValue !== null) {
      const result = this.performCalculation();
      
      // Add to history
      this.addToHistory(`${this.previousValue} ${this.getOperatorSymbol(this.operation)} ${this.currentDisplay} = ${result}`);
      
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
        return current !== 0 ? prev / current : 0;
      case 'power':
        return Math.pow(prev, current);
      default:
        return current;
    }
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

  addToHistory(calculation) {
    this.history.unshift({
      calculation,
      timestamp: Date.now()
    });
    
    // Limit history to 50 entries
    if (this.history.length > 50) {
      this.history = this.history.slice(0, 50);
    }
    
    this.updateHistoryDisplay();
  }

  updateHistoryDisplay() {
    const historyList = document.querySelector('#history-list');
    if (!historyList) return;

    if (this.history.length === 0) {
      historyList.innerHTML = '<div class="no-history">No calculations yet</div>';
      return;
    }

    historyList.innerHTML = this.history.map(item => `
      <div class="history-item" data-calculation="${item.calculation}">
        <div>${item.calculation}</div>
        <div style="font-size: 10px; opacity: 0.7;">${new Date(item.timestamp).toLocaleTimeString()}</div>
      </div>
    `).join('');

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
      
      if (!isVisible) {
        this.updateHistoryDisplay();
      }
    }
  }

  // Initialize method required by the desktop framework
  async initialize() {
    // Initialize calculator state
    this.currentDisplay = '0';
    this.previousValue = null;
    this.operation = null;
    this.waitingForOperand = false;
    return this;
  }

  // Render method required by the desktop framework
  async render() {
    const content = `
      <div class="calculator-container">
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
          ${this.mode === 'programmer' ? `
            <div class="programmer-displays">
              <div class="base-display">HEX: <span id="hex-display">0</span></div>
              <div class="base-display">OCT: <span id="oct-display">0</span></div>
              <div class="base-display">BIN: <span id="bin-display">0</span></div>
            </div>
          ` : ''}
        </div>

        <!-- Calculator Body -->
        <div class="calculator-body">
          ${this.renderCalculatorForMode()}
        </div>

        <!-- History Panel -->
        <div class="history-panel" id="history-panel" style="display: none;">
          <div class="history-header">
            <h3>History</h3>
            <button class="clear-history-btn" id="clear-history-btn">Clear All</button>
          </div>
          <div class="history-list" id="history-list">
            ${this.history.length === 0 ? '<div class="no-history">No calculations yet</div>' : ''}
          </div>
        </div>
      </div>

      <style>
        .calculator-container {
          height: 100%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', roboto, monospace;
          display: flex;
          flex-direction: column;
          user-select: none;
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
          word-wrap: break-word;
          font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
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
          background: linear-gradient(135deg, #ff6b6b, #ee5a6f);
          color: white;
        }

        .calc-btn.function {
          background: linear-gradient(135deg, #4ecdc4, #44a08d);
          color: white;
          font-size: 14px;
        }

        .calc-btn.special {
          background: linear-gradient(135deg, #feca57, #ff9ff3);
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
          .mode-tabs {
            flex-wrap: wrap;
          }
          
          .tab-text {
            display: none;
          }
          
          .display-primary {
            font-size: 24px;
          }
          
          .calc-btn {
            min-height: 40px;
            font-size: 14px;
          }
        }
      </style>
    `;

    // Set up event handlers after the HTML is rendered
    setTimeout(() => {
      this.setupEventHandlers(document.querySelector('.calculator-container'));
      this.updateDisplay();
      if (this.mode === 'programmer') {
        this.updateProgrammerDisplays();
      }
    }, 0);

    return content;
  }
}