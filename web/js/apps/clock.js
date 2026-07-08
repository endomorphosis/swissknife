/**
 * Advanced Clock & Timer App for SwissKnife Web Desktop
 * World clock, stopwatch, countdown timer, and alarm functionality
 */

export class ClockApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.currentView = 'clock'; // 'clock', 'stopwatch', 'timer', 'alarm'
    
    // Clock settings
    this.clockFormat = '24h'; // '12h' or '24h'
    this.showSeconds = true;
    this.showDate = true;
    this.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // World clocks
    this.worldClocks = [
      { name: 'Local', timezone: this.timeZone, enabled: true },
      { name: 'New York', timezone: 'America/New_York', enabled: true },
      { name: 'London', timezone: 'Europe/London', enabled: true },
      { name: 'Tokyo', timezone: 'Asia/Tokyo', enabled: true },
      { name: 'Sydney', timezone: 'Australia/Sydney', enabled: true },
      { name: 'Dubai', timezone: 'Asia/Dubai', enabled: false },
      { name: 'Los Angeles', timezone: 'America/Los_Angeles', enabled: false },
      { name: 'Berlin', timezone: 'Europe/Berlin', enabled: false },
      { name: 'Shanghai', timezone: 'Asia/Shanghai', enabled: false }
    ];
    
    // Stopwatch
    this.stopwatch = {
      isRunning: false,
      startTime: null,
      elapsedTime: 0,
      laps: []
    };
    
    // Countdown timer
    this.timer = {
      isRunning: false,
      duration: 0, // in milliseconds
      remaining: 0,
      startTime: null,
      endTime: null
    };
    
    // Alarms
    this.alarms = [
      {
        id: 1,
        time: '07:00',
        label: 'Morning Alarm',
        enabled: true,
        repeat: ['mon', 'tue', 'wed', 'thu', 'fri'],
        sound: 'bell'
      },
      {
        id: 2,
        time: '12:30',
        label: 'Lunch Break',
        enabled: false,
        repeat: ['mon', 'tue', 'wed', 'thu', 'fri'],
        sound: 'chime'
      }
    ];
    
    // Timer presets
    this.timerPresets = [
      { name: 'Pomodoro', duration: 25 * 60 * 1000 },
      { name: 'Short Break', duration: 5 * 60 * 1000 },
      { name: 'Long Break', duration: 15 * 60 * 1000 },
      { name: 'Tea Timer', duration: 3 * 60 * 1000 },
      { name: 'Coffee Timer', duration: 4 * 60 * 1000 },
      { name: 'Meditation', duration: 10 * 60 * 1000 }
    ];
    
    this.updateInterval = null;
    this.initializeApp();
  }

  initializeApp() {
    this.startTimeUpdates();
  }

  createWindow() {
    const content = `
      <div class="clock-container">
        <!-- Header Tabs -->
        <div class="clock-header">
          <div class="view-tabs">
            <button class="view-tab ${this.currentView === 'clock' ? 'active' : ''}" data-view="clock">
              <span class="tab-icon">🕐</span>
              <span class="tab-text">Clock</span>
            </button>
            <button class="view-tab ${this.currentView === 'stopwatch' ? 'active' : ''}" data-view="stopwatch">
              <span class="tab-icon">⏱️</span>
              <span class="tab-text">Stopwatch</span>
            </button>
            <button class="view-tab ${this.currentView === 'timer' ? 'active' : ''}" data-view="timer">
              <span class="tab-icon">⏲️</span>
              <span class="tab-text">Timer</span>
            </button>
            <button class="view-tab ${this.currentView === 'alarm' ? 'active' : ''}" data-view="alarm">
              <span class="tab-icon">⏰</span>
              <span class="tab-text">Alarms</span>
            </button>
          </div>
          
          <div class="header-controls">
            <button class="control-btn" id="settings-btn" title="Settings">⚙️</button>
            <button class="control-btn" id="fullscreen-btn" title="Fullscreen">⛶</button>
          </div>
        </div>

        <!-- Main Content -->
        <div class="clock-content" id="clock-content">
          ${this.renderContentForView()}
        </div>

        <!-- Settings Panel -->
        <div class="settings-panel" id="settings-panel" style="display: none;">
          <div class="settings-header">
            <h3>⚙️ Settings</h3>
            <button class="close-btn" id="close-settings">×</button>
          </div>
          <div class="settings-content">
            ${this.renderSettings()}
          </div>
        </div>
      </div>

      <style>
        .clock-container {
          height: 100%;
          background: linear-gradient(135deg, #1e3a8a, #3730a3);
          color: white;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', roboto, sans-serif;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .clock-header {
          padding: 12px 16px;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .view-tabs {
          display: flex;
          gap: 4px;
        }

        .view-tab {
          padding: 8px 16px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          border-radius: 8px;
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
        }

        .view-tab:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: translateY(-1px);
        }

        .view-tab.active {
          background: linear-gradient(135deg, #fbbf24, #f59e0b);
          box-shadow: 0 2px 8px rgba(251, 191, 36, 0.3);
        }

        .header-controls {
          display: flex;
          gap: 8px;
        }

        .control-btn {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          border: none;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .control-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: scale(1.05);
        }

        .clock-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        /* Clock View */
        .clock-view {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .main-clock {
          text-align: center;
          margin-bottom: 40px;
        }

        .time-display {
          font-size: 4rem;
          font-weight: 200;
          font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
          margin-bottom: 8px;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
        }

        .date-display {
          font-size: 1.2rem;
          opacity: 0.8;
          margin-bottom: 16px;
        }

        .timezone-display {
          font-size: 0.9rem;
          opacity: 0.6;
          background: rgba(255, 255, 255, 0.1);
          padding: 4px 12px;
          border-radius: 12px;
        }

        .world-clocks {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 16px;
          width: 100%;
          max-width: 800px;
        }

        .world-clock-item {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border-radius: 12px;
          padding: 16px;
          text-align: center;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .world-clock-name {
          font-size: 0.9rem;
          opacity: 0.8;
          margin-bottom: 8px;
        }

        .world-clock-time {
          font-size: 1.5rem;
          font-weight: 500;
          font-family: monospace;
        }

        /* Stopwatch View */
        .stopwatch-view {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 40px 20px;
        }

        .stopwatch-display {
          font-size: 5rem;
          font-weight: 200;
          font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
          margin-bottom: 40px;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
        }

        .stopwatch-controls {
          display: flex;
          gap: 20px;
          margin-bottom: 40px;
        }

        .stopwatch-btn {
          padding: 12px 24px;
          border-radius: 50px;
          border: none;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          min-width: 120px;
        }

        .stopwatch-btn.start {
          background: linear-gradient(135deg, #22c55e, #16a34a);
          color: white;
        }

        .stopwatch-btn.stop {
          background: linear-gradient(135deg, #ef4444, #dc2626);
          color: white;
        }

        .stopwatch-btn.reset {
          background: rgba(255, 255, 255, 0.2);
          color: white;
        }

        .stopwatch-btn.lap {
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          color: white;
        }

        .stopwatch-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }

        .laps-list {
          width: 100%;
          max-width: 400px;
          max-height: 300px;
          overflow-y: auto;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 16px;
        }

        .lap-item {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .lap-item:last-child {
          border-bottom: none;
        }

        /* Timer View */
        .timer-view {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 40px 20px;
        }

        .timer-display {
          font-size: 5rem;
          font-weight: 200;
          font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
          margin-bottom: 20px;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
        }

        .timer-progress {
          width: 200px;
          height: 200px;
          border-radius: 50%;
          background: conic-gradient(#fbbf24 0deg, rgba(255, 255, 255, 0.2) 0deg);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 40px;
          position: relative;
        }

        .timer-progress::after {
          content: '';
          width: 180px;
          height: 180px;
          border-radius: 50%;
          background: linear-gradient(135deg, #1e3a8a, #3730a3);
          position: absolute;
        }

        .timer-time {
          position: relative;
          z-index: 1;
          font-size: 2rem;
          font-weight: 300;
          font-family: monospace;
        }

        .timer-setup {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 30px;
        }

        .time-input {
          width: 60px;
          padding: 8px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 6px;
          color: white;
          text-align: center;
          font-family: monospace;
        }

        .timer-presets {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 12px;
          width: 100%;
          max-width: 600px;
          margin-bottom: 30px;
        }

        .preset-btn {
          padding: 8px 12px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          text-align: center;
          font-size: 12px;
        }

        .preset-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: translateY(-1px);
        }

        /* Alarm View */
        .alarm-view {
          flex: 1;
          padding: 20px;
          overflow-y: auto;
        }

        .alarm-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .add-alarm-btn {
          padding: 8px 16px;
          background: linear-gradient(135deg, #22c55e, #16a34a);
          border: none;
          border-radius: 8px;
          color: white;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.2s ease;
        }

        .add-alarm-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(34, 197, 94, 0.3);
        }

        .alarms-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .alarm-item {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border-radius: 12px;
          padding: 16px;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .alarm-main {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .alarm-time {
          font-size: 2rem;
          font-weight: 300;
          font-family: monospace;
        }

        .alarm-toggle {
          position: relative;
          width: 50px;
          height: 26px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 13px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .alarm-toggle.enabled {
          background: linear-gradient(135deg, #22c55e, #16a34a);
        }

        .alarm-toggle::after {
          content: '';
          position: absolute;
          top: 2px;
          left: 2px;
          width: 22px;
          height: 22px;
          background: white;
          border-radius: 50%;
          transition: all 0.3s ease;
        }

        .alarm-toggle.enabled::after {
          transform: translateX(24px);
        }

        .alarm-details {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          opacity: 0.8;
        }

        .alarm-repeat {
          display: flex;
          gap: 4px;
        }

        .repeat-day {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 600;
        }

        .repeat-day.active {
          background: linear-gradient(135deg, #fbbf24, #f59e0b);
        }

        /* Settings Panel */
        .settings-panel {
          position: absolute;
          top: 60px;
          right: 16px;
          width: 300px;
          background: rgba(0, 0, 0, 0.95);
          backdrop-filter: blur(20px);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.2);
          z-index: 1000;
        }

        .settings-header {
          padding: 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .close-btn {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: none;
          background: rgba(239, 68, 68, 0.3);
          color: white;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .settings-content {
          padding: 16px;
        }

        .setting-group {
          margin-bottom: 20px;
        }

        .setting-label {
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 8px;
          opacity: 0.8;
        }

        .setting-control {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .setting-select {
          flex: 1;
          padding: 6px 8px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          color: white;
          font-size: 12px;
        }

        .setting-checkbox {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          cursor: pointer;
        }

        /* Animations */
        .pulse {
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }

        .blink {
          animation: blink 1s infinite;
        }

        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }

        /* Responsive */
        @media (max-width: 768px) {
          .time-display {
            font-size: 2.5rem;
          }
          
          .stopwatch-display,
          .timer-display {
            font-size: 3rem;
          }
          
          .world-clocks {
            grid-template-columns: 1fr;
          }
          
          .tab-text {
            display: none;
          }
        }
      </style>
    `;

    return {
      title: 'Clock & Timers',
      content,
      width: 700,
      height: 600,
      x: 250,
      y: 100
    };
  }

  renderContentForView() {
    switch (this.currentView) {
      case 'clock':
        return this.renderClockView();
      case 'stopwatch':
        return this.renderStopwatchView();
      case 'timer':
        return this.renderTimerView();
      case 'alarm':
        return this.renderAlarmView();
      default:
        return this.renderClockView();
    }
  }

  renderClockView() {
    const now = new Date();
    const timeString = this.formatTime(now);
    const dateString = this.formatDate(now);

    return `
      <div class="clock-view">
        <div class="main-clock">
          <div class="time-display" id="main-time">${timeString}</div>
          ${this.showDate ? `<div class="date-display" id="main-date">${dateString}</div>` : ''}
          <div class="timezone-display">${this.timeZone}</div>
        </div>
        
        <div class="world-clocks">
          ${this.worldClocks.filter(clock => clock.enabled).map(clock => `
            <div class="world-clock-item">
              <div class="world-clock-name">${clock.name}</div>
              <div class="world-clock-time" data-timezone="${clock.timezone}">
                ${this.formatTimeForTimezone(now, clock.timezone)}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  renderStopwatchView() {
    const elapsedDisplay = this.formatStopwatchTime(this.stopwatch.elapsedTime);

    return `
      <div class="stopwatch-view">
        <div class="stopwatch-display" id="stopwatch-display">${elapsedDisplay}</div>
        
        <div class="stopwatch-controls">
          <button class="stopwatch-btn ${this.stopwatch.isRunning ? 'stop' : 'start'}" id="stopwatch-toggle">
            ${this.stopwatch.isRunning ? 'Stop' : 'Start'}
          </button>
          <button class="stopwatch-btn lap" id="lap-btn" ${!this.stopwatch.isRunning ? 'disabled' : ''}>
            Lap
          </button>
          <button class="stopwatch-btn reset" id="stopwatch-reset">
            Reset
          </button>
        </div>
        
        ${this.stopwatch.laps.length > 0 ? `
          <div class="laps-list">
            <h4>Laps</h4>
            ${this.stopwatch.laps.map((lap, index) => `
              <div class="lap-item">
                <span>Lap ${index + 1}</span>
                <span>${this.formatStopwatchTime(lap)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  renderTimerView() {
    const remainingDisplay = this.formatStopwatchTime(this.timer.remaining);
    const progressPercent = this.timer.duration > 0 ? 
      ((this.timer.duration - this.timer.remaining) / this.timer.duration) * 100 : 0;

    return `
      <div class="timer-view">
        <div class="timer-progress" style="background: conic-gradient(#fbbf24 ${progressPercent * 3.6}deg, rgba(255, 255, 255, 0.2) ${progressPercent * 3.6}deg);">
          <div class="timer-time">${remainingDisplay}</div>
        </div>
        
        ${!this.timer.isRunning ? `
          <div class="timer-setup">
            <label>Hours:</label>
            <input type="number" class="time-input" id="timer-hours" min="0" max="23" value="0">
            <label>Minutes:</label>
            <input type="number" class="time-input" id="timer-minutes" min="0" max="59" value="5">
            <label>Seconds:</label>
            <input type="number" class="time-input" id="timer-seconds" min="0" max="59" value="0">
          </div>
          
          <div class="timer-presets">
            ${this.timerPresets.map(preset => `
              <button class="preset-btn" data-duration="${preset.duration}">
                ${preset.name}
              </button>
            `).join('')}
          </div>
        ` : ''}
        
        <div class="stopwatch-controls">
          <button class="stopwatch-btn ${this.timer.isRunning ? 'stop' : 'start'}" id="timer-toggle">
            ${this.timer.isRunning ? 'Stop' : 'Start'}
          </button>
          <button class="stopwatch-btn reset" id="timer-reset">
            Reset
          </button>
        </div>
      </div>
    `;
  }

  renderAlarmView() {
    return `
      <div class="alarm-view">
        <div class="alarm-header">
          <h3>Alarms</h3>
          <button class="add-alarm-btn" id="add-alarm-btn">+ Add Alarm</button>
        </div>
        
        <div class="alarms-list">
          ${this.alarms.map(alarm => `
            <div class="alarm-item" data-id="${alarm.id}">
              <div class="alarm-main">
                <div class="alarm-time">${alarm.time}</div>
                <div class="alarm-toggle ${alarm.enabled ? 'enabled' : ''}" data-id="${alarm.id}"></div>
              </div>
              <div class="alarm-details">
                <div class="alarm-label">${alarm.label}</div>
                <div class="alarm-repeat">
                  ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => `
                    <div class="repeat-day ${alarm.repeat.includes(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][index]) ? 'active' : ''}">${day}</div>
                  `).join('')}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  renderSettings() {
    return `
      <div class="setting-group">
        <div class="setting-label">Clock Format</div>
        <div class="setting-control">
          <select class="setting-select" id="clock-format">
            <option value="12h" ${this.clockFormat === '12h' ? 'selected' : ''}>12 Hour</option>
            <option value="24h" ${this.clockFormat === '24h' ? 'selected' : ''}>24 Hour</option>
          </select>
        </div>
      </div>
      
      <div class="setting-group">
        <div class="setting-label">Display Options</div>
        <label class="setting-checkbox">
          <input type="checkbox" id="show-seconds" ${this.showSeconds ? 'checked' : ''}>
          <span>Show Seconds</span>
        </label>
        <label class="setting-checkbox">
          <input type="checkbox" id="show-date" ${this.showDate ? 'checked' : ''}>
          <span>Show Date</span>
        </label>
      </div>
      
      <div class="setting-group">
        <div class="setting-label">Timezone</div>
        <div class="setting-control">
          <select class="setting-select" id="timezone-select">
            ${Intl.supportedValuesOf('timeZone').slice(0, 20).map(tz => `
              <option value="${tz}" ${tz === this.timeZone ? 'selected' : ''}>${tz}</option>
            `).join('')}
          </select>
        </div>
      </div>
      
      <div class="setting-group">
        <div class="setting-label">World Clocks</div>
        ${this.worldClocks.map(clock => `
          <label class="setting-checkbox">
            <input type="checkbox" class="world-clock-toggle" data-name="${clock.name}" ${clock.enabled ? 'checked' : ''}>
            <span>${clock.name}</span>
          </label>
        `).join('')}
      </div>
    `;
  }

  setupEventHandlers(container) {
    // View switching
    container.querySelectorAll('.view-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchView(tab.dataset.view);
      });
    });

    // Settings
    container.querySelector('#settings-btn').addEventListener('click', () => {
      this.toggleSettings();
    });

    container.querySelector('#close-settings').addEventListener('click', () => {
      this.toggleSettings();
    });

    // Stopwatch controls
    const stopwatchToggle = container.querySelector('#stopwatch-toggle');
    if (stopwatchToggle) {
      stopwatchToggle.addEventListener('click', () => {
        this.toggleStopwatch();
      });
    }

    const lapBtn = container.querySelector('#lap-btn');
    if (lapBtn) {
      lapBtn.addEventListener('click', () => {
        this.addLap();
      });
    }

    const stopwatchReset = container.querySelector('#stopwatch-reset');
    if (stopwatchReset) {
      stopwatchReset.addEventListener('click', () => {
        this.resetStopwatch();
      });
    }

    // Timer controls
    const timerToggle = container.querySelector('#timer-toggle');
    if (timerToggle) {
      timerToggle.addEventListener('click', () => {
        this.toggleTimer();
      });
    }

    const timerReset = container.querySelector('#timer-reset');
    if (timerReset) {
      timerReset.addEventListener('click', () => {
        this.resetTimer();
      });
    }

    // Timer presets
    container.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setTimerPreset(parseInt(btn.dataset.duration));
      });
    });

    // Alarm toggles
    container.querySelectorAll('.alarm-toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        this.toggleAlarm(parseInt(toggle.dataset.id));
      });
    });

    // Settings handlers
    this.setupSettingsHandlers(container);
  }

  setupSettingsHandlers(container) {
    const clockFormat = container.querySelector('#clock-format');
    if (clockFormat) {
      clockFormat.addEventListener('change', () => {
        this.clockFormat = clockFormat.value;
        this.updateTimeDisplay();
      });
    }

    const showSeconds = container.querySelector('#show-seconds');
    if (showSeconds) {
      showSeconds.addEventListener('change', () => {
        this.showSeconds = showSeconds.checked;
        this.updateTimeDisplay();
      });
    }

    const showDate = container.querySelector('#show-date');
    if (showDate) {
      showDate.addEventListener('change', () => {
        this.showDate = showDate.checked;
        this.refreshContent();
      });
    }

    container.querySelectorAll('.world-clock-toggle').forEach(toggle => {
      toggle.addEventListener('change', () => {
        const clockName = toggle.dataset.name;
        const clock = this.worldClocks.find(c => c.name === clockName);
        if (clock) {
          clock.enabled = toggle.checked;
          this.refreshContent();
        }
      });
    });
  }

  startTimeUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      this.updateTime();
    }, 100);
  }

  updateTime() {
    const now = Date.now();

    // Update stopwatch
    if (this.stopwatch.isRunning) {
      this.stopwatch.elapsedTime = now - this.stopwatch.startTime;
      this.updateStopwatchDisplay();
    }

    // Update timer
    if (this.timer.isRunning) {
      this.timer.remaining = Math.max(0, this.timer.endTime - now);
      if (this.timer.remaining === 0) {
        this.timerCompleted();
      }
      this.updateTimerDisplay();
    }

    // Update clocks every second
    if (now % 1000 < 100) {
      this.updateTimeDisplay();
    }
  }

  updateTimeDisplay() {
    const now = new Date();
    
    // Main clock
    const mainTime = document.querySelector('#main-time');
    if (mainTime) {
      mainTime.textContent = this.formatTime(now);
    }

    const mainDate = document.querySelector('#main-date');
    if (mainDate) {
      mainDate.textContent = this.formatDate(now);
    }

    // World clocks
    document.querySelectorAll('[data-timezone]').forEach(element => {
      const timezone = element.dataset.timezone;
      element.textContent = this.formatTimeForTimezone(now, timezone);
    });
  }

  updateStopwatchDisplay() {
    const display = document.querySelector('#stopwatch-display');
    if (display) {
      display.textContent = this.formatStopwatchTime(this.stopwatch.elapsedTime);
    }
  }

  updateTimerDisplay() {
    const progressPercent = this.timer.duration > 0 ? 
      ((this.timer.duration - this.timer.remaining) / this.timer.duration) * 100 : 0;

    const progress = document.querySelector('.timer-progress');
    if (progress) {
      progress.style.background = `conic-gradient(#fbbf24 ${progressPercent * 3.6}deg, rgba(255, 255, 255, 0.2) ${progressPercent * 3.6}deg)`;
    }

    const timeDisplay = document.querySelector('.timer-time');
    if (timeDisplay) {
      timeDisplay.textContent = this.formatStopwatchTime(this.timer.remaining);
    }
  }

  switchView(view) {
    this.currentView = view;
    this.refreshContent();
  }

  toggleSettings() {
    const panel = document.querySelector('#settings-panel');
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'block';
  }

  toggleStopwatch() {
    if (this.stopwatch.isRunning) {
      this.stopwatch.isRunning = false;
    } else {
      this.stopwatch.isRunning = true;
      this.stopwatch.startTime = Date.now() - this.stopwatch.elapsedTime;
    }
    this.refreshContent();
  }

  resetStopwatch() {
    this.stopwatch.isRunning = false;
    this.stopwatch.elapsedTime = 0;
    this.stopwatch.laps = [];
    this.refreshContent();
  }

  addLap() {
    if (this.stopwatch.isRunning) {
      this.stopwatch.laps.unshift(this.stopwatch.elapsedTime);
      this.refreshContent();
    }
  }

  toggleTimer() {
    if (this.timer.isRunning) {
      this.timer.isRunning = false;
    } else {
      // Get timer duration from inputs
      const hours = parseInt(document.querySelector('#timer-hours')?.value || 0);
      const minutes = parseInt(document.querySelector('#timer-minutes')?.value || 5);
      const seconds = parseInt(document.querySelector('#timer-seconds')?.value || 0);
      
      this.timer.duration = (hours * 3600 + minutes * 60 + seconds) * 1000;
      this.timer.remaining = this.timer.duration;
      this.timer.startTime = Date.now();
      this.timer.endTime = Date.now() + this.timer.duration;
      this.timer.isRunning = true;
    }
    this.refreshContent();
  }

  resetTimer() {
    this.timer.isRunning = false;
    this.timer.remaining = 0;
    this.timer.duration = 0;
    this.refreshContent();
  }

  setTimerPreset(duration) {
    const hours = Math.floor(duration / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((duration % (1000 * 60)) / 1000);

    const hoursInput = document.querySelector('#timer-hours');
    const minutesInput = document.querySelector('#timer-minutes');
    const secondsInput = document.querySelector('#timer-seconds');

    if (hoursInput) hoursInput.value = hours;
    if (minutesInput) minutesInput.value = minutes;
    if (secondsInput) secondsInput.value = seconds;
  }

  timerCompleted() {
    this.timer.isRunning = false;
    this.timer.remaining = 0;
    
    // Show notification
    if ('Notification' in window) {
      new Notification('⏲️ Timer Completed!', {
        body: 'Your countdown timer has finished.',
        icon: '/favicon.ico'
      });
    }

    // Play sound (mock)
    console.log('🔔 Timer completed!');
    
    this.refreshContent();
  }

  toggleAlarm(alarmId) {
    const alarm = this.alarms.find(a => a.id === alarmId);
    if (alarm) {
      alarm.enabled = !alarm.enabled;
      this.refreshContent();
    }
  }

  formatTime(date) {
    const options = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: this.clockFormat === '12h'
    };

    if (this.showSeconds) {
      options.second = '2-digit';
    }

    return date.toLocaleTimeString([], options);
  }

  formatDate(date) {
    return date.toLocaleDateString([], {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatTimeForTimezone(date, timezone) {
    const options = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: this.clockFormat === '12h',
      timeZone: timezone
    };

    if (this.showSeconds) {
      options.second = '2-digit';
    }

    return date.toLocaleTimeString([], options);
  }

  formatStopwatchTime(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const ms = Math.floor((milliseconds % 1000) / 10);

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    } else {
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }
  }

  refreshContent() {
    const container = document.querySelector('.clock-container');
    if (!container) return;

    // Update content
    const content = container.querySelector('#clock-content');
    content.innerHTML = this.renderContentForView();

    // Update active tab
    container.querySelectorAll('.view-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === this.currentView);
    });

    // Re-setup event handlers
    this.setupEventHandlers(container);
  }

  cleanup() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  // Initialize method required by the desktop framework
  async initialize() {
    // Initialize clock app
    this.startTimeUpdates();
    return this;
  }

  // Render method required by the desktop framework  
  async render() {
    const windowConfig = this.createWindow();
    
    // Set up event handlers after the HTML is rendered
    setTimeout(() => {
      this.setupEventHandlers(document.querySelector('.clock-container'));
      this.updateTimeDisplay();
    }, 0);
    
    return windowConfig.content;
  }
}

// Register the app
if (typeof window !== 'undefined') {
  window.createClockApp = (desktop) => new ClockApp(desktop);
}