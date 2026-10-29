/**
 * Calendar & Event Tracking App for SwissKnife Web Desktop
 * Full-featured calendar with event management, reminders, and scheduling
 */

const VDA_G035_WORKFLOW = 'calendar.artifact-backed-scheduling';

// Visible calendar controls stay in the browser. They do not call a tool.

export class CalendarApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.currentView = 'month'; // 'month', 'week', 'day', 'agenda'
    this.currentDate = new Date();
    this.selectedDate = new Date();
    this.editingEventId = null;
    
    this.events = this.buildDefaultEvents();
    this.vdaG035 = this.buildVdaG035State();
    
    // Event categories with colors
    this.categories = {
      work: { name: 'Work', color: '#3b82f6', icon: '💼' },
      personal: { name: 'Personal', color: '#10b981', icon: '🏠' },
      development: { name: 'Development', color: '#8b5cf6', icon: '💻' },
      business: { name: 'Business', color: '#f59e0b', icon: '🤝' },
      health: { name: 'Health', color: '#ef4444', icon: '🏥' },
      education: { name: 'Education', color: '#06b6d4', icon: '📚' },
      social: { name: 'Social', color: '#ec4899', icon: '🎉' }
    };
    
    // Calendar settings
    this.settings = {
      weekStartsOn: 1, // 0 = Sunday, 1 = Monday
      timeFormat: '24h', // '12h' or '24h'
      showWeekNumbers: true,
      defaultView: 'month',
      defaultReminder: 15,
      workingHours: { start: 9, end: 17 },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
    
    this.initializeApp();
  }

  initializeApp() {
    // Load events from localStorage if available
    this.loadEventsFromStorage();
    this.loadViewFromStorage();
    this.vdaG035 = this.buildVdaG035State();
    if (typeof window !== 'undefined') {
      window.calendarApp = this;
    }
    this.setupEventListeners();
  }

  async initialize() {
    // Initialize SwissKnife integration if available
    if (this.desktop && this.desktop.swissknife) {
      this.swissknife = this.desktop.swissknife;
    }
  }

  async render() {
    await this.initialize();
    
    return `
      <div class="calendar-container">
        <!-- Header -->
        <div class="calendar-header">
          <div class="calendar-nav">
            <div class="nav-controls">
              <button class="nav-btn" id="prevBtn" aria-label="Previous period">‹</button>
              <button class="nav-btn" id="todayBtn">Today</button>
              <button class="nav-btn" id="nextBtn" aria-label="Next period">›</button>
            </div>
            <div class="current-period">
              <h2 id="currentPeriod">${this.formatCurrentPeriod()}</h2>
              <p id="calendarTimezone" class="calendar-timezone">Timezone: ${this.escapeHtml(this.settings.timezone)}</p>
            </div>
            <div class="view-controls">
              <button class="view-btn ${this.currentView === 'month' ? 'active' : ''}" data-view="month">Month</button>
              <button class="view-btn ${this.currentView === 'week' ? 'active' : ''}" data-view="week">Week</button>
              <button class="view-btn ${this.currentView === 'day' ? 'active' : ''}" data-view="day">Day</button>
              <button class="view-btn ${this.currentView === 'agenda' ? 'active' : ''}" data-view="agenda">Agenda</button>
            </div>
          </div>
          <div class="calendar-actions">
            <button class="action-btn sk-btn sk-btn-primary" id="addEventBtn">+ New Event</button>
            <button class="action-btn sk-btn" id="settingsBtn" aria-label="Settings">Settings</button>
            <button class="action-btn sk-btn" id="exportBtn">Export</button>
          </div>
        </div>

        <p id="calendarLiveStatus" class="calendar-live-status" role="status">${this.escapeHtml(this.buildLiveStatus())}</p>

        <!-- Main Content -->
        <div class="calendar-content">
          <!-- Month View -->
          <div class="calendar-view month-view ${this.currentView === 'month' ? 'active' : ''}">
            ${this.renderMonthView()}
          </div>

          <!-- Week View -->
          <div class="calendar-view week-view ${this.currentView === 'week' ? 'active' : ''}">
            ${this.renderWeekView()}
          </div>

          <!-- Day View -->
          <div class="calendar-view day-view ${this.currentView === 'day' ? 'active' : ''}">
            ${this.renderDayView()}
          </div>

          <!-- Agenda View -->
          <div class="calendar-view agenda-view ${this.currentView === 'agenda' ? 'active' : ''}">
            ${this.renderAgendaView()}
          </div>
        </div>

        ${this.renderVdaG035Workflow()}

        <!-- Sidebar -->
        <details class="calendar-sidebar">
          <summary>More calendar tools</summary>
          <div class="mini-calendar">
            <h3>Mini Calendar</h3>
            ${this.renderMiniCalendar()}
          </div>
          
          <div class="event-categories">
            <h3>Categories</h3>
            <div class="category-list">
              ${Object.entries(this.categories).map(([key, cat]) => `
                <div class="category-item" data-category="${key}">
                  <span class="category-color" style="background-color: ${cat.color}"></span>
                  <span class="category-icon">${cat.icon}</span>
                  <span class="category-name">${cat.name}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="upcoming-events">
            <h3>Upcoming Events</h3>
            <div class="upcoming-list">
              ${this.renderUpcomingEvents()}
            </div>
          </div>
        </details>
      </div>

      <!-- Event Modal -->
      <div class="event-modal hidden" id="eventModal">
        <div class="modal-content">
          <div class="modal-header">
            <h3 id="modalTitle">New Event</h3>
            <button class="modal-close" id="modalClose">×</button>
          </div>
          <div class="modal-body">
            <form id="eventForm">
              <div class="form-group">
                <label for="eventTitle">Title</label>
                <input type="text" id="eventTitle" name="title" required>
              </div>
              <div class="form-group">
                <label for="eventDescription">Description</label>
                <textarea id="eventDescription" name="description" rows="3"></textarea>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="eventDate">Date</label>
                  <input type="date" id="eventDate" name="date" required>
                </div>
                <div class="form-group">
                  <label for="eventTime">Time</label>
                  <input type="time" id="eventTime" name="time" required>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="eventEndDate">End Date</label>
                  <input type="date" id="eventEndDate" name="endDate">
                </div>
                <div class="form-group">
                  <label for="eventEndTime">End Time</label>
                  <input type="time" id="eventEndTime" name="endTime">
                </div>
              </div>
              <div class="form-group">
                <label for="eventCategory">Category</label>
                <select id="eventCategory" name="category">
                  ${Object.entries(this.categories).map(([key, cat]) => `
                    <option value="${key}">${cat.icon} ${cat.name}</option>
                  `).join('')}
                </select>
              </div>
              <div class="form-group">
                <label for="eventLocation">Location</label>
                <input type="text" id="eventLocation" name="location" placeholder="Optional">
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="eventReminder">Reminder</label>
                  <select id="eventReminder" name="reminder">
                    <option value="0">No reminder</option>
                    <option value="5">5 minutes before</option>
                    <option value="15" selected>15 minutes before</option>
                    <option value="30">30 minutes before</option>
                    <option value="60">1 hour before</option>
                    <option value="1440">1 day before</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="eventRecurring">Repeat</label>
                  <select id="eventRecurring" name="recurring">
                    <option value="none">No repeat</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label for="eventAttendees">Attendees</label>
                <input type="text" id="eventAttendees" name="attendees" placeholder="Email addresses, comma separated">
              </div>
              <p id="eventFormError" class="form-error" role="alert" hidden></p>
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-secondary sk-btn" id="cancelBtn">Cancel</button>
            <button type="button" class="btn-danger sk-btn sk-btn-danger hidden" id="deleteBtn">Delete</button>
            <button type="submit" class="btn-primary sk-btn sk-btn-primary" id="saveBtn">Save Event</button>
          </div>
        </div>
      </div>

      <style>
        .calendar-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          max-height: 100%;
          min-height: 0;
          width: 100%;
          font-family: system-ui, -apple-system, sans-serif;
          background: var(--sk-bg-deep, #0e1412);
          color: var(--sk-text, #edf7f2);
          overflow-x: hidden;
          overflow-y: auto;
          padding-bottom: 0.75rem;
          box-sizing: border-box;
        }

        .calendar-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          flex-shrink: 0;
        }

        .calendar-nav {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .nav-controls {
          display: flex;
          gap: 0.5rem;
        }

        .nav-btn, .view-btn, .action-btn {
          padding: 0.5rem 1rem;
          background: var(--sk-bg-header, #12211d);
          border: 1px solid var(--sk-border, #263a34);
          border-radius: 6px;
          color: var(--sk-text, #edf7f2);
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 0.9rem;
          white-space: nowrap;
          flex: 0 0 auto;
          min-width: max-content;
          position: relative;
        }

        .nav-btn:hover, .view-btn:hover, .action-btn:hover {
          background: var(--sk-bg-inset, #17241f);
          transform: translateY(-1px);
        }

        .view-controls {
          display: grid;
          grid-template-columns: repeat(4, max-content);
          gap: 0.35rem;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          padding: 0.25rem;
        }

        .view-btn.active {
          background: var(--sk-accent, #8bd8bd);
          border-color: var(--sk-accent, #8bd8bd);
          color: #0e1412;
        }

        .nav-btn:focus-visible,
        .view-btn:focus-visible,
        .action-btn:focus-visible,
        .modal-footer button:focus-visible,
        .workflow-actions button:focus-visible {
          outline: 2px solid var(--sk-accent, #8bd8bd);
          outline-offset: 2px;
        }

        .calendar-timezone,
        .calendar-live-status {
          margin: 0.35rem 0 0;
          color: var(--sk-text, #edf7f2);
          font-size: 0.85rem;
          line-height: 1.35;
          white-space: normal;
          overflow-wrap: anywhere;
        }

        .calendar-live-status {
          margin: 0.35rem 1rem 0.5rem;
          white-space: pre-line;
          overflow-wrap: break-word;
          word-break: normal;
          max-height: none;
          overflow: visible;
          flex-shrink: 0;
          font-size: 0.75rem;
          line-height: 1.3;
        }

        .mini-month-grid {
          width: 100%;
        }

        .mini-month-header {
          text-align: center;
          font-weight: 600;
          margin-bottom: 0.35rem;
        }

        .mini-day-names,
        .mini-days {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 2px;
          width: 100%;
        }

        .mini-day-name,
        .mini-day {
          text-align: center;
          font-size: 0.72rem;
          line-height: 1.7;
          min-width: 0;
          min-height: 1.4rem;
        }

        .mini-day.today {
          outline: 1px solid var(--sk-accent, #8bd8bd);
          border-radius: 4px;
        }

        .mini-day.has-events {
          font-weight: 700;
        }

        .form-error {
          margin: 0;
          color: var(--sk-err, #ff6b6b);
          font-size: 0.9rem;
        }

        .event-chip {
          display: block;
          margin-top: 0.08rem;
          font-size: 0.72rem;
          line-height: 1.3;
          max-height: none;
          white-space: normal;
          overflow: visible;
          overflow-wrap: break-word;
          word-break: normal;
          hyphens: manual;
        }

        .calendar-actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .calendar-workflow {
          margin: 0.75rem 1rem 0;
          padding: 0.875rem;
          background: rgba(8, 20, 32, 0.72);
          border: 1px solid rgba(255, 255, 255, 0.22);
          border-radius: 8px;
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
          flex-shrink: 0;
        }

        .workflow-head {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
          align-items: flex-start;
          margin-bottom: 0.75rem;
        }

        .workflow-head h3 {
          margin: 0 0 0.25rem;
          font-size: 1rem;
        }

        .workflow-head p {
          margin: 0;
          color: rgba(255, 255, 255, 0.76);
          font-size: 0.84rem;
        }

        .workflow-status {
          padding: 0.25rem 0.5rem;
          border-radius: 999px;
          background: rgba(94, 227, 161, 0.12);
          border: 1px solid rgba(94, 227, 161, 0.5);
          color: var(--sk-ok, #5ee3a1);
          font-size: 0.76rem;
          white-space: nowrap;
        }

        .workflow-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 0.625rem;
        }

        .workflow-card {
          min-width: 0;
          padding: 0.625rem;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.14);
        }

        .workflow-card strong {
          display: block;
          margin-bottom: 0.25rem;
          font-size: 0.82rem;
        }

        .workflow-card p {
          margin: 0 0 0.4rem;
          color: rgba(255, 255, 255, 0.78);
          font-size: 0.76rem;
          line-height: 1.35;
        }

        .calendar-workflow > summary {
          cursor: pointer;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }

        .workflow-card code {
          display: block;
          overflow: visible;
          white-space: normal;
          overflow-wrap: anywhere;
          color: var(--sk-accent, #8bd8bd);
          font-size: 0.72rem;
          font-family: ui-monospace, monospace;
        }

        .workflow-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          margin-top: 0.75rem;
        }

        .workflow-actions button,
        .calendar-search button {
          padding: 0.45rem 0.65rem;
          border: 1px solid rgba(255, 255, 255, 0.25);
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.16);
          color: #fff;
          cursor: pointer;
          font-size: 0.8rem;
        }

        .calendar-search {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.75rem;
        }

        .calendar-search input {
          flex: 1;
          min-width: 0;
          padding: 0.5rem 0.65rem;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.25);
          background: rgba(255, 255, 255, 0.12);
          color: #fff;
        }

        .calendar-search input::placeholder {
          color: rgba(255, 255, 255, 0.62);
        }

        .workflow-summary {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.5rem;
          margin-top: 0.75rem;
          font-size: 0.78rem;
        }

        .workflow-summary span {
          min-width: 0;
          overflow: visible;
          white-space: normal;
          overflow-wrap: anywhere;
          color: rgba(255, 255, 255, 0.82);
        }

        @media (max-width: 768px) {
          .calendar-container {
            max-height: 100%;
            padding-bottom: 0.75rem;
          }

          .calendar-header {
            flex-direction: column;
            gap: 1rem;
            align-items: stretch;
          }
          
          .calendar-nav {
            justify-content: center;
          }
          
          .calendar-actions {
            justify-content: center;
          }
          
          .nav-btn, .view-btn, .action-btn {
            padding: 0.35rem 0.5rem;
            font-size: 0.8rem;
          }

          .view-controls {
            width: 100%;
            justify-content: start;
          }

          .calendar-workflow {
            margin: 0.5rem;
            padding: 0.75rem;
          }

          .workflow-head {
            flex-direction: column;
            gap: 0.5rem;
          }

          .workflow-grid {
            grid-template-columns: 1fr;
          }

          .workflow-summary {
            grid-template-columns: 1fr;
          }

          .form-row {
            grid-template-columns: 1fr;
          }
        }

        .calendar-content {
          flex: 0 0 auto;
          display: flex;
          position: relative;
          min-height: 0;
          gap: 0.5rem;
          overflow: visible;
        }

        .calendar-view {
          flex: 1;
          display: none;
          padding: 1rem;
          min-width: 0;
        }

        .calendar-view.active {
          display: block;
          min-height: 0;
          overflow: visible;
        }

        .calendar-sidebar {
          width: auto;
          min-width: 0;
          max-width: 100%;
          box-sizing: border-box;
          background: rgba(0, 0, 0, 0.15);
          border-left: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          padding: 1rem;
          overflow-y: auto;
          flex-shrink: 0;
        }

        @media (max-width: 1200px) {
          .calendar-sidebar {
            width: auto;
            min-width: 0;
          }
        }

        @media (max-width: 1000px) {
          .calendar-content {
            flex-direction: column;
            gap: 1rem;
          }
          
          .calendar-sidebar {
            width: 100%;
            max-width: none;
            order: 2;
            border-left: none;
            border-top: 1px solid rgba(255, 255, 255, 0.2);
          }
        }

        .calendar-sidebar h3 {
          margin: 0 0 1rem 0;
          font-size: 1.1rem;
          color: rgba(255, 255, 255, 0.9);
        }

        .month-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 1px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          overflow: visible;
          width: 100%;
          max-width: 100%;
          min-height: 18rem;
          grid-auto-rows: minmax(2.4rem, auto);
        }

        .month-header {
          display: contents;
        }

        .day-header {
          padding: 0.3rem 0.2rem;
          text-align: center;
          background: rgba(255, 255, 255, 0.2);
          font-weight: 600;
          font-size: 0.75rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .day-cell {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid transparent;
          cursor: pointer;
          position: relative;
          display: flex;
          flex-direction: column;
          padding: 0.15rem 0.2rem;
          transition: all 0.2s ease;
          min-height: 1.7rem;
          height: auto;
          overflow: visible;
          min-width: 0;
        }

        .day-cell:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .day-cell.other-month {
          opacity: 0.4;
        }

        .day-cell.today {
          background: rgba(139, 216, 189, 0.18);
          border-color: var(--sk-accent, #8bd8bd);
        }

        .day-cell.selected {
          background: rgba(255, 255, 255, 0.3);
          border-color: rgba(255, 255, 255, 0.7);
        }

        .day-number {
          font-weight: 600;
          margin-bottom: 0.25rem;
        }

        .day-events {
          flex: 1 0 auto;
          display: flex;
          flex-direction: column;
          overflow: visible;
        }

        .event-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          margin: 1px;
          display: inline-block;
        }

        .category-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .category-item:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .category-color {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        .upcoming-event {
          padding: 0.75rem;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          margin-bottom: 0.5rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .upcoming-event:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: translateY(-1px);
        }

        .event-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .event-modal.hidden {
          display: none;
        }

        .modal-content {
          background: var(--sk-bg-panel, #101b18);
          border: 1px solid var(--sk-border, #263a34);
          border-radius: 12px;
          width: 90%;
          max-width: 600px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.5rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        }

        .modal-close {
          background: none;
          border: none;
          font-size: 1.5rem;
          color: white;
          cursor: pointer;
          padding: 0.25rem;
        }

        .modal-body {
          padding: 1.5rem;
        }

        .form-group {
          margin-bottom: 1rem;
        }

        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: rgba(255, 255, 255, 0.9);
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.1);
          color: white;
          font-size: 1rem;
        }

        .form-group input::placeholder,
        .form-group textarea::placeholder {
          color: rgba(255, 255, 255, 0.6);
        }

        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
          padding: 1.5rem;
          border-top: 1px solid rgba(255, 255, 255, 0.2);
        }

        /* Button hierarchy: baseline tokens; design-system .sk-btn classes refine */
        .btn-primary {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 6px;
          background: var(--sk-accent, #8bd8bd);
          color: #0e1412;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-primary:hover {
          background: var(--sk-ok, #5ee3a1);
        }
        .btn-secondary {
          padding: 0.75rem 1.5rem;
          border: 1px solid var(--sk-border, #263a34);
          border-radius: 6px;
          background: var(--sk-bg-header, #12211d);
          color: var(--sk-text, #edf7f2);
          font-weight: 500;
          cursor: pointer;
        }
        .btn-secondary:hover {
          background: var(--sk-bg-inset, #17241f);
        }
        .btn-danger {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 6px;
          background: var(--sk-err, #ff6b6b);
          color: #0e1412;
          font-weight: 600;
          cursor: pointer;
        }
        .btn-danger:hover {
          filter: brightness(1.1);
        }

        .hidden {
          display: none;
        }

        /* Week and Day view styles */
        .time-grid {
          display: grid;
          grid-template-columns: 60px 1fr;
          height: 100%;
          overflow-y: auto;
        }

        .time-slots {
          border-right: 1px solid rgba(255, 255, 255, 0.2);
        }

        .time-slot {
          height: 60px;
          padding: 0.5rem;
          font-size: 0.8rem;
          color: rgba(255, 255, 255, 0.7);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .week-days {
          display: grid;
          grid-template-columns: repeat(7, minmax(96px, 1fr));
          min-width: 680px;
          overflow-x: auto;
        }

        .week-day-column {
          border-right: 1px solid rgba(255, 255, 255, 0.12);
          min-height: 100%;
        }

        .week-day-heading {
          position: sticky;
          top: 0;
          background: rgba(255, 255, 255, 0.14);
          padding: 0.55rem;
          font-weight: 600;
          text-align: center;
          z-index: 1;
        }

        .week-event {
          margin: 0.45rem;
          padding: 0.5rem;
          border-radius: 6px;
          color: #fff;
          font-size: 0.78rem;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.16);
        }

        .week-event-time {
          opacity: 0.82;
          font-size: 0.72rem;
          margin-bottom: 0.2rem;
        }

        .agenda-list {
          padding: 1rem;
        }

        .agenda-day {
          margin-bottom: 2rem;
        }

        .agenda-date {
          font-size: 1.2rem;
          font-weight: 600;
          margin-bottom: 1rem;
          color: rgba(255, 255, 255, 0.9);
        }

        .agenda-event {
          background: rgba(255, 255, 255, 0.1);
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 0.5rem;
          border-left: 4px solid;
        }
      </style>
    `;
  }

  eventOn(dayOffset, hour, minute) {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    date.setHours(hour, minute, 0, 0);
    return date;
  }

  formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatClock(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  formatStamp(date) {
    return `${this.formatLocalDate(date)} ${this.formatClock(date)}`;
  }

  parseLocalDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return new Date(value);
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  selectedDayEvents() {
    return this.events.filter(event => event.date.toDateString() === this.selectedDate.toDateString())
      .sort((a, b) => a.date - b.date);
  }

  buildLiveStatus() {
    const timezone = this.settings?.timezone || 'local';
    const events = this.selectedDayEvents();
    const conflicts = this.detectEventConflicts().filter(conflict =>
      conflict.when.some(stamp => stamp.startsWith(this.formatLocalDate(this.selectedDate))));
    const lines = events.map(event => `${event.title} | ${this.formatStamp(event.date)} | timezone: ${event.timezone || timezone}`);
    const overlaps = conflicts.length
      ? ['Overlaps:', ...conflicts.map(conflict => `${conflict.events[0]} ${conflict.when[0]} and ${conflict.events[1]} ${conflict.when[1]}`)].join('\n')
      : 'Overlaps: none';
    return `Selected date: ${this.formatLocalDate(this.selectedDate)}\n${lines.length ? lines.join('\n') : 'No events on this date'}\n${overlaps}`;
  }

  showEventError(message) {
    const error = document.querySelector('#eventFormError');
    if (!error) return;
    error.hidden = false;
    error.textContent = message;
  }

  clearEventError() {
    const error = document.querySelector('#eventFormError');
    if (!error) return;
    error.hidden = true;
    error.textContent = '';
  }

  buildDefaultEvents() {
    // Sample events for a first-run calendar. They stay in browser storage.
    return [
      {
        id: 1,
        title: 'Artifact Planning Review',
        description: 'Review calendar event artifacts and Event DAG checkpoints for VDA-G035.',
        date: this.eventOn(0, 9, 30),
        endDate: this.eventOn(0, 10, 30),
        category: 'work',
        reminder: 15,
        recurring: 'none',
        location: 'MCP Control Room',
        attendees: ['product@swissknife.dev', 'ops@swissknife.dev'],
        artifactCid: null,
        receiptRef: null
      },
      {
        id: 2,
        title: 'Semantic Search Sync',
        description: 'Index meeting notes and find the policy review slot through semantic_search.',
        date: this.eventOn(0, 10, 0),
        endDate: this.eventOn(0, 11, 0),
        category: 'development',
        reminder: 10,
        recurring: 'none',
        location: 'Search Lab',
        attendees: ['search@swissknife.dev'],
        artifactCid: null,
        receiptRef: null
      },
      {
        id: 3,
        title: 'Reminder Policy Check',
        description: 'Verify reminder window, notification permission fallback, and receipt visibility.',
        date: this.eventOn(1, 14, 0),
        endDate: this.eventOn(1, 14, 45),
        category: 'business',
        reminder: 30,
        recurring: 'weekly',
        location: 'Policy Desk',
        attendees: ['policy@swissknife.dev'],
        artifactCid: null,
        receiptRef: null
      },
      {
        id: 4,
        title: 'Mobile Summary Walkthrough',
        description: 'Compact mobile agenda summary with conflict and reminder status.',
        date: this.eventOn(2, 8, 45),
        endDate: this.eventOn(2, 9, 15),
        category: 'personal',
        reminder: 5,
        recurring: 'none',
        location: 'Meta Glasses Preview',
        attendees: ['mobile@swissknife.dev'],
        artifactCid: null,
        receiptRef: null
      }
    ];
  }

  mergeVdaDefaultEvents(events) {
    const defaults = this.buildDefaultEvents();
    const byTitle = new Map(events.map(event => [String(event.title), event]));
    for (const event of defaults) {
      if (!byTitle.has(event.title)) {
        events.push(event);
      }
    }
    return events;
  }

  buildVdaG035State() {
    const conflicts = this.detectEventConflicts();
    const reminders = this.events
      .filter(event => Number(event.reminder) > 0)
      .map(event => ({
        eventId: event.id,
        title: event.title,
        minutesBefore: event.reminder,
        receiptRef: null
      }));
    return {
      workflowId: VDA_G035_WORKFLOW,
      status: 'ready',
      // Local workflow fields. Null means the browser has not recorded that step.
      eventManifestCid: null,
      eventManifestReadback: null,
      reminderPolicyCid: null,
      reminderEventCid: null,
      conflictResolutionCid: null,
      mobileSummaryCid: null,
      eventDagCid: null,
      receiptRefs: [],
      eventRefs: [],
      semanticQuery: 'policy reminder',
      semanticResults: [],
      semanticBackend: null,
      reminders,
      conflicts,
      conflictResolution: conflicts.length > 0
        ? 'Unresolved overlaps detected locally — run "Resolve conflict" to evaluate them in the browser.'
        : 'No conflicts detected.',
      mobileSummary: this.buildMobileSummary([], conflicts, reminders),
      actionLog: [
        'workflow ready — events and controls stay local-only'
      ]
    };
  }

  renderVdaG035Workflow() {
    const state = this.vdaG035 || this.buildVdaG035State();
    const conflicts = state.conflicts || [];
    const reminders = state.reminders || [];
    const persistedCount = this.events.filter(event => event.artifactCid).length;
    const semanticSummary = state.semanticBackend
      ? `${state.semanticResults.length} result(s) from ${this.escapeHtml(state.semanticBackend)}`
      : 'not run yet — local event text search';
    const receiptList = state.receiptRefs.length > 0
      ? state.receiptRefs.map(ref => this.escapeHtml(ref)).join(' ')
      : 'none yet';
    const eventList = state.eventRefs.length > 0
      ? state.eventRefs.map(ref => this.escapeHtml(ref)).join(' ')
      : 'none yet';
    return `
      <details class="calendar-workflow" data-svd-workflow="${VDA_G035_WORKFLOW}">
        <summary>Local calendar diagnostics</summary>
        <div class="workflow-head">
          <div>
            <h3>VDA-G035 governed calendar workflow</h3>
            <p>Events, reminders, conflict checks, search, and the mobile summary stay in this browser. Every visible control is local-only and calls no tool. Month, week, day, and agenda rendering use the local clock.</p>
          </div>
          <span class="workflow-status" role="status" aria-live="polite" id="vda-g035-status">Status: ${this.escapeHtml(state.status)}</span>
        </div>

        <div class="workflow-grid">
          <article class="workflow-card" data-svd-vda-marker="artifact-backed-events">
            <strong>Artifact-backed events</strong>
            <p>${persistedCount}/${this.events.length} events persisted as real artifacts. Manifest: <code>${this.escapeHtml(state.eventManifestCid || 'not published yet')}</code>${state.eventManifestReadback ? ` — ${this.escapeHtml(state.eventManifestReadback)}` : ''}</p>
            <p>Event DAG checkpoint: <code>${this.escapeHtml(state.eventDagCid || 'no checkpoint yet')}</code></p>
            <small>Share an event by sharing its artifact CID.</small>
          </article>
          <article class="workflow-card" data-svd-vda-marker="semantic-search">
            <strong>Semantic search</strong>
            <p>Local search "${this.escapeHtml(state.semanticQuery)}": ${semanticSummary}.</p>
            ${(state.semanticResults || []).map(result => `<code>${this.escapeHtml(result.artifactCid || result.title || 'hit')}</code>`).join('')}
          </article>
          <article class="workflow-card" data-svd-vda-marker="reminders">
            <strong>Reminders</strong>
            <p>${reminders.length} reminder(s) computed locally; policy artifact: <code>${this.escapeHtml(state.reminderPolicyCid || 'not persisted yet')}</code>.</p>
            ${state.reminderEventCid ? `<small>event DAG: ${this.escapeHtml(state.reminderEventCid)}</small>` : ''}
          </article>
          <article class="workflow-card" data-svd-vda-marker="conflict-handling" data-conflict-state="${conflicts.length > 0 ? 'detected' : 'clear'}">
            <strong>Conflict handling</strong>
            <p>${this.escapeHtml(state.conflictResolution)}</p>
            <code>${this.escapeHtml(state.conflictResolutionCid || 'no resolution persisted yet')}</code>
          </article>
          <article class="workflow-card" data-svd-vda-marker="mobile-summary" data-mobile-summary-state="compact">
            <strong>Mobile summary</strong>
            <p>${this.escapeHtml(state.mobileSummary)}</p>
            <small>Local rendering (local UI). Persisted artifact: <code>${this.escapeHtml(state.mobileSummaryCid || 'not persisted yet')}</code></small>
          </article>
        </div>

        <div class="workflow-actions">
          <button type="button" data-svd-workflow-action="persist-event-artifact" onclick="window.calendarApp?.persistVdaG035EventArtifact()">Persist artifact</button>
          <button type="button" data-svd-workflow-action="run-semantic-search" onclick="window.calendarApp?.runVdaG035SemanticSearch()">Run semantic search</button>
          <button type="button" data-svd-workflow-action="schedule-reminder" onclick="window.calendarApp?.scheduleVdaG035Reminder()">Schedule reminder</button>
          <button type="button" data-svd-workflow-action="resolve-conflict" onclick="window.calendarApp?.resolveVdaG035Conflict()">Resolve conflict</button>
          <button type="button" data-svd-workflow-action="refresh-mobile-summary" onclick="window.calendarApp?.refreshVdaG035MobileSummary()">Refresh mobile summary</button>
        </div>

        <div class="calendar-search">
          <input id="calendarSemanticSearch" type="search" value="${this.escapeHtml(state.semanticQuery)}" aria-label="Calendar semantic search query">
          <button type="button" id="calendarSemanticSearchBtn">Search calendar</button>
        </div>

        <div class="workflow-summary">
          <span>Receipts: ${receiptList}</span>
          <span>Local events: ${this.escapeHtml(this.events.map(event => event.title).join(', ') || 'none')}</span>
          <span id="calendarMobileSummary">${this.escapeHtml(state.mobileSummary)}</span>
        </div>
      </details>
    `;
  }

  // Re-render just the workflow panel after backend state changes.
  refreshVdaG035WorkflowPanel() {
    const container = document.querySelector('.calendar-container');
    if (!container) return;
    const existing = container.querySelector('.calendar-workflow');
    if (!existing) return;
    const template = document.createElement('template');
    template.innerHTML = this.renderVdaG035Workflow().trim();
    existing.replaceWith(template.content.firstChild);
    this.updateVdaG035Status();
    const searchBtn = container.querySelector('#calendarSemanticSearchBtn');
    if (searchBtn && !searchBtn.dataset.vdaWired) {
      searchBtn.dataset.vdaWired = 'true';
      searchBtn.addEventListener('click', () => this.runVdaG035SemanticSearch());
    }
  }

  // Local event list only. This control does not call a tool.
  persistVdaG035EventArtifact() {
    if (this.events.length === 0) {
      this.vdaG035.status = 'no events to keep';
      this.updateVdaG035Status();
      return;
    }
    this.saveEventsToStorage();
    this.vdaG035.eventManifestReadback = `local event list: ${this.events.length} event(s)`;
    this.vdaG035.status = `events kept local-only (${this.events.length})`;
    this.vdaG035.actionLog.push('persist-event-artifact:local');
    this.saveVdaG035EvidenceToStorage();
    this.refreshVdaG035WorkflowPanel();
  }

  // Local text match over events already in the browser.
  runVdaG035SemanticSearch(query = null) {
    const searchInput = document.querySelector('#calendarSemanticSearch');
    const searchText = String(query || searchInput?.value || this.vdaG035.semanticQuery || '').trim();
    const needle = searchText.toLowerCase();
    this.vdaG035.semanticQuery = searchText;
    const results = this.events.filter(event => {
      const haystack = `${event.title || ''} ${event.description || ''} ${event.location || ''} ${event.category || ''}`.toLowerCase();
      return needle.length === 0 || haystack.includes(needle);
    });
    this.vdaG035.semanticResults = results.map(event => ({
      event,
      id: event.id,
      title: event.title,
      score: null,
      artifactCid: null,
      receiptRef: null
    }));
    this.vdaG035.semanticBackend = 'local';
    this.vdaG035.status = `local search complete: ${results.length} result(s)`;
    this.vdaG035.actionLog.push(`run-semantic-search:local:${searchText}:${results.length}`);
    this.saveVdaG035EvidenceToStorage();
    this.refreshVdaG035WorkflowPanel();
  }

  // Reminder list is computed from events already in the browser.
  scheduleVdaG035Reminder() {
    this.vdaG035.reminders = this.events
      .filter(event => Number(event.reminder) > 0)
      .map(event => ({
        eventId: event.id,
        title: event.title,
        minutesBefore: event.reminder,
        receiptRef: null,
        fallback: 'in-app reminder banner when notifications are denied'
      }));
    this.vdaG035.status = `reminders computed locally (${this.vdaG035.reminders.length})`;
    this.vdaG035.actionLog.push('schedule-reminder:local-only');
    this.saveVdaG035EvidenceToStorage();
    this.refreshVdaG035WorkflowPanel();
  }

  // Conflict detection compares event times already in the browser.
  resolveVdaG035Conflict() {
    this.vdaG035.conflicts = this.detectEventConflicts();
    const conflicts = this.vdaG035.conflicts;
    this.vdaG035.conflictResolution = conflicts.length > 0
      ? `Detected ${conflicts.length} overlap(s) locally: ${conflicts.map(conflict => conflict.events.join(' ↔ ')).join('; ')}.`
      : 'No conflicts detected.';
    this.vdaG035.status = `conflict handling ${conflicts.length > 0 ? 'detected (local)' : 'clear'}`;
    this.vdaG035.actionLog.push('resolve-conflict:local-only');
    this.saveVdaG035EvidenceToStorage();
    this.refreshVdaG035WorkflowPanel();
  }

  // The mobile summary is rendered from local calendar state.
  refreshVdaG035MobileSummary() {
    this.vdaG035.mobileSummary = this.buildMobileSummary(this.vdaG035.semanticResults, this.vdaG035.conflicts, this.vdaG035.reminders);
    this.vdaG035.status = 'mobile summary refreshed (local UI)';
    this.vdaG035.actionLog.push('refresh-mobile-summary:local');
    this.saveVdaG035EvidenceToStorage();
    this.refreshVdaG035WorkflowPanel();
  }

  saveVdaG035EvidenceToStorage() {
    try {
      localStorage.setItem('swissknife-calendar-vda-g035', JSON.stringify({
        schema: 'swissknife.calendar.vda-g035.v2',
        workflow_id: VDA_G035_WORKFLOW,
        saved_at: new Date().toISOString(),
        // Real values only; null means "not performed yet". No fixtures.
        event_manifest_cid: this.vdaG035.eventManifestCid || null,
        event_manifest_readback: this.vdaG035.eventManifestReadback || null,
        reminder_policy_cid: this.vdaG035.reminderPolicyCid || null,
        reminder_event_cid: this.vdaG035.reminderEventCid || null,
        conflict_resolution_cid: this.vdaG035.conflictResolutionCid || null,
        mobile_summary_cid: this.vdaG035.mobileSummaryCid || null,
        event_dag_cid: this.vdaG035.eventDagCid || null,
        receipt_refs: this.vdaG035.receiptRefs,
        event_refs: this.vdaG035.eventRefs,
        semantic_query: this.vdaG035.semanticQuery,
        semantic_backend: this.vdaG035.semanticBackend,
        semantic_results: (this.vdaG035.semanticResults || []).map(result => ({
          title: result.title, artifact_cid: result.artifactCid, score: result.score
        })),
        action_log: this.vdaG035.actionLog
      }));
    } catch (error) {
      console.warn('Failed to save VDA-G035 calendar evidence:', error);
    }
  }

  updateVdaG035Status() {
    const status = document.querySelector('#vda-g035-status');
    if (status) status.textContent = `Status: ${this.vdaG035.status}`;
    const summary = document.querySelector('#calendarMobileSummary');
    if (summary) summary.textContent = this.vdaG035.mobileSummary;
  }

  detectEventConflicts() {
    const sorted = [...this.events].sort((a, b) => a.date - b.date);
    const conflicts = [];
    for (let index = 0; index < sorted.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < sorted.length; nextIndex += 1) {
        const first = sorted[index];
        const second = sorted[nextIndex];
        if (first.date.toDateString() !== second.date.toDateString()) continue;
        const firstEnd = first.endDate || new Date(first.date.getTime() + 60 * 60 * 1000);
        const secondEnd = second.endDate || new Date(second.date.getTime() + 60 * 60 * 1000);
        if (first.date < secondEnd && second.date < firstEnd) {
          conflicts.push({
            events: [first.title, second.title],
            when: [this.formatStamp(first.date), this.formatStamp(second.date)],
            state: 'detected',
            receiptRef: null
          });
        }
      }
    }
    return conflicts;
  }

  buildMobileSummary(searchResults = [], conflicts = [], reminders = []) {
    const nextEvent = [...this.events].sort((a, b) => a.date - b.date)[0];
    const nextTitle = nextEvent ? nextEvent.title : 'No scheduled events';
    const overlapNote = conflicts.length > 0 ? `${conflicts.length} overlap(s) detected` : 'no overlaps';
    return `${this.events.length} events; next ${nextTitle}; ${reminders.length} reminders; ${overlapNote}; ${searchResults.length} local search result(s).`;
  }

  formatCurrentPeriod() {
    const options = { year: 'numeric', month: 'long' };
    return this.currentDate.toLocaleDateString('en-US', options);
  }

  renderMonthView() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const today = new Date();
    
    // Get first day of month and adjust for week start preference
    const firstDay = new Date(year, month, 1);
    const startDate = new Date(firstDay);
    const dayOfWeek = (firstDay.getDay() - this.settings.weekStartsOn + 7) % 7;
    startDate.setDate(startDate.getDate() - dayOfWeek);
    
    // Generate 6 weeks of days
    const days = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      days.push(date);
    }
    
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    if (this.settings.weekStartsOn === 0) {
      dayNames.unshift(dayNames.pop()); // Move Sunday to start
    }
    
    return `
      <div class="month-grid">
        <div class="month-header">
          ${dayNames.map(day => `<div class="day-header">${day}</div>`).join('')}
        </div>
        ${days.map(date => {
          const isToday = date.toDateString() === today.toDateString();
          const isCurrentMonth = date.getMonth() === month;
          const isSelected = date.toDateString() === this.selectedDate.toDateString();
          const dayEvents = this.getEventsForDate(date);
          
          return `
            <div class="day-cell ${!isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" 
                 data-date="${this.formatLocalDate(date)}">
              <div class="day-number">${date.getDate()}</div>
              <div class="day-events">
                ${dayEvents.map(event => `
                  <span class="event-chip">${this.escapeHtml(event.title)}</span>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  renderWeekView() {
    const weekStart = new Date(this.currentDate);
    const dayOfWeek = (weekStart.getDay() - this.settings.weekStartsOn + 7) % 7;
    weekStart.setDate(weekStart.getDate() - dayOfWeek);
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);
      return date;
    });

    return `
      <div class="week-container">
        <div class="time-grid">
          <div class="time-slots">
            ${Array.from({length: 24}, (_, i) => `
              <div class="time-slot">${i.toString().padStart(2, '0')}:00</div>
            `).join('')}
          </div>
          <div class="week-days">
            ${days.map(date => {
              const events = this.getEventsForDate(date).sort((a, b) => a.date - b.date);
              return `
                <div class="week-day-column" data-date="${date.toISOString().split('T')[0]}">
                  <div class="week-day-heading">
                    ${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </div>
                  ${events.length > 0 ? events.map(event => `
                    <div class="week-event" style="background: ${this.categories[event.category]?.color || '#3b82f6'}">
                      <div class="week-event-time">${this.formatEventTime(event)}</div>
                      <div>${this.escapeHtml(event.title)}</div>
                    </div>
                  `).join('') : '<div class="no-events-hour sk-empty">No events</div>'}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  renderDayView() {
    const selectedDate = this.selectedDate || this.currentDate;
    const dayEvents = this.events.filter(e => 
      e.date.toDateString() === selectedDate.toDateString()
    ).sort((a, b) => a.date - b.date);
    
    return `
      <div class="day-container">
        <div class="day-header">
          <h3>${selectedDate.toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}</h3>
        </div>
        <div class="day-schedule">
          ${Array.from({length: 24}, (_, hour) => {
            const hourEvents = dayEvents.filter(e => e.date.getHours() === hour);
            return `
              <div class="hour-slot">
                <div class="hour-label">${hour.toString().padStart(2, '0')}:00</div>
                <div class="hour-content">
                  ${hourEvents.map(event => `
                    <div class="day-event" style="background: ${this.categories[event.category]?.color || '#007bff'}">
                      <div class="event-time">${event.date.toLocaleTimeString('en-US', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}</div>
                      <div class="event-title">${this.escapeHtml(event.title)}</div>
                      ${event.location ? `<div class="event-location">📍 ${this.escapeHtml(event.location)}</div>` : ''}
                    </div>
                  `).join('') || '<div class="no-events-hour"></div>'}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  renderAgendaView() {
    const upcomingEvents = this.events
      .filter(event => event.date.getFullYear() === this.currentDate.getFullYear() && event.date.getMonth() === this.currentDate.getMonth())
      .sort((a, b) => a.date - b.date);

    return `
      <div class="agenda-list">
        ${upcomingEvents.length > 0 ? upcomingEvents.map(event => `
          <div class="agenda-event" style="border-left-color: ${this.categories[event.category].color}">
            <div class="event-time">${this.formatStamp(event.date)} — ${event.endDate ? this.formatStamp(event.endDate) : this.formatEventTime(event)}</div>
            <div class="calendar-timezone">Timezone: ${this.escapeHtml(event.timezone || this.settings.timezone)}</div>
            <div class="event-title">${this.escapeHtml(event.title)}</div>
            <div class="event-description">${this.escapeHtml(event.description)}</div>
            ${event.location ? `<div class="event-location">📍 ${this.escapeHtml(event.location)}</div>` : ''}
          </div>
        `).join('') : '<div class="agenda-event">No events in this month.</div>'}
      </div>
    `;
  }

  renderMiniCalendar() {
    const today = new Date();
    const month = this.currentDate.getMonth();
    const year = this.currentDate.getFullYear();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    
    let calendar = `
      <div class="mini-month-grid">
        <div class="mini-month-header">
          ${this.currentDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
        </div>
        <div class="mini-day-names">
          ${dayNames.map(day => `<div class="mini-day-name">${day}</div>`).join('')}
        </div>
        <div class="mini-days">
    `;
    
    // Add empty cells for days before the first of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      calendar += '<div class="mini-day empty"></div>';
    }
    
    // Add the days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const isToday = date.toDateString() === today.toDateString();
      const hasEvents = this.events.some(e => e.date.toDateString() === date.toDateString());
      
      calendar += `
        <div class="mini-day ${isToday ? 'today' : ''} ${hasEvents ? 'has-events' : ''}" 
             data-date="${date.toISOString()}">
          ${day}
        </div>
      `;
    }
    
    calendar += `
        </div>
      </div>
    `;
    
    return calendar;
  }

  renderUpcomingEvents() {
    const upcomingEvents = this.events
      .filter(event => event.date >= new Date())
      .sort((a, b) => a.date - b.date)
      .slice(0, 5);

    return upcomingEvents.map(event => `
      <div class="upcoming-event" data-event-id="${event.id}">
        <div class="event-title" style="color: ${this.categories[event.category].color}">
          ${this.categories[event.category].icon} ${this.escapeHtml(event.title)}
        </div>
        <div class="event-time">${this.formatEventTime(event)}</div>
      </div>
    `).join('') || '<div class="upcoming-event">No upcoming events.</div>';
  }

  getEventsForDate(date) {
    const dateStr = date.toDateString();
    return this.events.filter(event => event.date.toDateString() === dateStr);
  }

  formatEventTime(event) {
    return this.formatClock(event.date);
  }

  setupEventListeners() {
    // This will be called after the HTML is rendered
    setTimeout(() => {
      this.attachEventListeners();
    }, 100);
  }

  attachEventListeners() {
    const container = document.querySelector('.calendar-container');
    if (!container) return;

    if (!container.dataset.navWired) {
      container.dataset.navWired = 'true';
      const prevBtn = container.querySelector('#prevBtn');
      const nextBtn = container.querySelector('#nextBtn');
      const todayBtn = container.querySelector('#todayBtn');
      if (prevBtn) prevBtn.addEventListener('click', () => this.navigatePrevious());
      if (nextBtn) nextBtn.addEventListener('click', () => this.navigateNext());
      if (todayBtn) todayBtn.addEventListener('click', () => this.navigateToday());
      container.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          this.currentView = e.currentTarget.dataset.view;
          this.updateView();
        });
      });
      const addEventBtn = container.querySelector('#addEventBtn');
      if (addEventBtn) addEventBtn.addEventListener('click', () => this.showEventModal());
      const semanticSearchBtn = container.querySelector('#calendarSemanticSearchBtn');
      if (semanticSearchBtn) semanticSearchBtn.addEventListener('click', () => this.runVdaG035SemanticSearch());
      this.setupModalEventListeners();
    }

    container.querySelectorAll('.day-cell').forEach(cell => {
      if (cell.dataset.wired) return;
      cell.dataset.wired = 'true';
      cell.addEventListener('click', (e) => {
        this.selectedDate = this.parseLocalDate(e.currentTarget.dataset.date);
        this.currentDate = new Date(this.selectedDate);
        this.updateView();
      });
    });
  }

  setupModalEventListeners() {
    const modal = document.querySelector('#eventModal');
    if (!modal || modal.dataset.wired === 'true') return;
    modal.dataset.wired = 'true';
    const closeBtn = document.querySelector('#modalClose');
    const cancelBtn = document.querySelector('#cancelBtn');
    const saveBtn = document.querySelector('#saveBtn');
    const deleteBtn = document.querySelector('#deleteBtn');

    if (closeBtn) closeBtn.addEventListener('click', () => this.hideEventModal());
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.hideEventModal());
    if (saveBtn) saveBtn.addEventListener('click', () => this.saveEvent());
    if (deleteBtn) deleteBtn.addEventListener('click', () => this.deleteSelectedEvent());

    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.hideEventModal();
    });
  }

  navigatePrevious() {
    if (this.currentView === 'month' || this.currentView === 'agenda') {
      this.currentDate.setMonth(this.currentDate.getMonth() - 1);
    } else if (this.currentView === 'week') {
      this.currentDate.setDate(this.currentDate.getDate() - 7);
    } else if (this.currentView === 'day') {
      this.currentDate.setDate(this.currentDate.getDate() - 1);
    }
    this.updateView();
  }

  navigateNext() {
    if (this.currentView === 'month' || this.currentView === 'agenda') {
      this.currentDate.setMonth(this.currentDate.getMonth() + 1);
    } else if (this.currentView === 'week') {
      this.currentDate.setDate(this.currentDate.getDate() + 7);
    } else if (this.currentView === 'day') {
      this.currentDate.setDate(this.currentDate.getDate() + 1);
    }
    this.updateView();
  }

  navigateToday() {
    this.currentDate = new Date();
    this.selectedDate = new Date();
    this.updateView();
  }

  updateView() {
    this.saveViewToStorage();
    // Update the current period display
    const currentPeriod = document.querySelector('#currentPeriod');
    if (currentPeriod) {
      currentPeriod.textContent = this.formatCurrentPeriod();
    }
    const liveStatus = document.querySelector('#calendarLiveStatus');
    if (liveStatus) liveStatus.textContent = this.buildLiveStatus();
    const timezoneNode = document.querySelector('#calendarTimezone');
    if (timezoneNode) timezoneNode.textContent = `Timezone: ${this.settings.timezone}`;

    // Update view buttons
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === this.currentView);
    });

    // Update calendar views
    document.querySelectorAll('.calendar-view').forEach(view => {
      view.classList.toggle('active', view.classList.contains(`${this.currentView}-view`));
    });

    const viewRenderers = {
      month: () => this.renderMonthView(),
      week: () => this.renderWeekView(),
      day: () => this.renderDayView(),
      agenda: () => this.renderAgendaView()
    };
    const activeView = document.querySelector(`.${this.currentView}-view`);
    if (activeView && viewRenderers[this.currentView]) {
      activeView.innerHTML = viewRenderers[this.currentView]();
      this.attachEventListeners();
    }

    const upcomingList = document.querySelector('.upcoming-list');
    if (upcomingList) {
      upcomingList.innerHTML = this.renderUpcomingEvents();
    }
    const mini = document.querySelector('.mini-calendar');
    if (mini) {
      mini.innerHTML = `<h3>Mini Calendar</h3>${this.renderMiniCalendar()}`;
    }
  }

  showEventModal(eventId = null) {
    const modal = document.querySelector('#eventModal');
    if (modal) {
      modal.classList.remove('hidden');
      
      if (eventId) {
        // Editing existing event
        const event = this.events.find(e => e.id === eventId);
        if (event) {
          this.populateEventForm(event);
          document.querySelector('#deleteBtn').classList.remove('hidden');
        }
      } else {
        // Creating new event
        this.clearEventForm();
        document.querySelector('#deleteBtn').classList.add('hidden');
      }
    }
  }

  hideEventModal() {
    const modal = document.querySelector('#eventModal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  populateEventForm(event) {
    this.editingEventId = event.id;
    document.querySelector('#eventTitle').value = event.title || '';
    document.querySelector('#eventDescription').value = event.description || '';
    document.querySelector('#eventDate').value = this.formatLocalDate(event.date);
    document.querySelector('#eventTime').value = this.formatClock(event.date);
    const end = event.endDate instanceof Date && !Number.isNaN(event.endDate.getTime()) ? event.endDate : null;
    document.querySelector('#eventEndDate').value = end ? this.formatLocalDate(end) : '';
    document.querySelector('#eventEndTime').value = end ? this.formatClock(end) : '';
    document.querySelector('#eventCategory').value = event.category || 'work';
    document.querySelector('#eventLocation').value = event.location || '';
    document.querySelector('#eventReminder').value = event.reminder || 15;
    document.querySelector('#eventRecurring').value = event.recurring || 'none';
    document.querySelector('#eventAttendees').value = event.attendees ? event.attendees.join(', ') : '';
    const title = document.querySelector('#modalTitle');
    if (title) title.textContent = 'Edit Event';
    this.clearEventError();
  }

  clearEventForm() {
    this.editingEventId = null;
    document.querySelector('#eventForm').reset();
    document.querySelector('#eventDate').value = this.formatLocalDate(this.selectedDate);
    const title = document.querySelector('#modalTitle');
    if (title) title.textContent = 'New Event';
    this.clearEventError();
  }

  readEventForm() {
    const form = document.querySelector('#eventForm');
    const formData = new FormData(form);
    const title = String(formData.get('title') || '').trim();
    if (!title) {
      this.showEventError('Enter a title.');
      return null;
    }
    const date = new Date(`${formData.get('date')}T${formData.get('time')}`);
    if (Number.isNaN(date.getTime())) {
      this.showEventError('Enter a valid date and time.');
      return null;
    }
    const endDateValue = String(formData.get('endDate') || '');
    const endTimeValue = String(formData.get('endTime') || '');
    let endDate = null;
    if (endDateValue || endTimeValue) {
      endDate = new Date(`${endDateValue}T${endTimeValue}`);
      if (Number.isNaN(endDate.getTime())) {
        this.showEventError('Enter a valid end date and time.');
        return null;
      }
      if (endDate <= date) {
        this.showEventError('End time must be after the start.');
        return null;
      }
    }
    const existing = this.editingEventId == null
      ? null
      : this.events.find(event => event.id === this.editingEventId);
    return {
      id: existing ? existing.id : Date.now(),
      title,
      description: formData.get('description'),
      date,
      endDate,
      category: formData.get('category'),
      location: formData.get('location'),
      reminder: parseInt(formData.get('reminder'), 10) || 0,
      recurring: formData.get('recurring'),
      attendees: formData.get('attendees')
        ? formData.get('attendees').split(',').map(email => email.trim()).filter(Boolean)
        : [],
      timezone: this.settings.timezone,
      artifactCid: existing ? existing.artifactCid || null : null,
      receiptRef: existing ? existing.receiptRef || null : null
    };
  }

  async saveEvent() {
    const eventData = this.readEventForm();
    if (!eventData) return;
    if (this.editingEventId == null) {
      this.events.push(eventData);
    } else {
      const index = this.events.findIndex(event => event.id === this.editingEventId);
      if (index >= 0) this.events[index] = eventData;
      else this.events.push(eventData);
    }
    this.editingEventId = null;
    this.clearEventError();
    this.selectedDate = new Date(eventData.date.getTime());
    this.currentDate = new Date(eventData.date.getTime());
    this.vdaG035 = this.buildVdaG035State();
    this.vdaG035.status = 'event saved locally';
    this.vdaG035.actionLog.push('save-event:local');
    this.saveEventsToStorage();
    this.saveVdaG035EvidenceToStorage();
    this.hideEventModal();
    this.updateView();
    this.refreshVdaG035WorkflowPanel();
  }

  deleteSelectedEvent() {
    if (this.editingEventId == null) return;
    this.events = this.events.filter(event => event.id !== this.editingEventId);
    this.editingEventId = null;
    this.clearEventError();
    this.vdaG035 = this.buildVdaG035State();
    this.vdaG035.status = 'event deleted locally';
    this.vdaG035.actionLog.push('delete-event:local');
    this.saveEventsToStorage();
    this.saveVdaG035EvidenceToStorage();
    this.hideEventModal();
    this.updateView();
    this.refreshVdaG035WorkflowPanel();
  }

  loadEventsFromStorage() {
    try {
      const saved = localStorage.getItem('swissknife-calendar-events');
      if (saved) {
        const events = JSON.parse(saved);
        // Convert date strings back to Date objects
        const parsedEvents = events.map(event => ({
          ...event,
          date: new Date(event.date),
          endDate: event.endDate ? new Date(event.endDate) : null
        }));
        // Legacy stored data carries fixture CID strings — treat any of
        // those as a migration signal and rebuild from defaults instead of
        // resurrecting fabricated identifiers.
        const hasLegacyFixtures = parsedEvents.some(event =>
          [event.artifactCid, event.receiptRef].some(value => String(value || '').includes('bafycalg035'))
          || String(JSON.stringify(event.receiptRef || '')).includes('receipt:calendar:g035')
        );
        this.events = hasLegacyFixtures
          ? this.buildDefaultEvents()
          : this.mergeVdaDefaultEvents(parsedEvents);
        // Scrub any lingering fixture strings that survived.
        for (const event of this.events) {
          if (String(event.artifactCid || '').includes('bafycalg035')) event.artifactCid = null;
          if (String(event.receiptRef || '').startsWith('receipt:calendar:g035')) event.receiptRef = null;
        }
      }
    } catch (error) {
      console.warn('Failed to load calendar events from storage:', error);
    }
  }

  loadViewFromStorage() {
    try {
      const value = JSON.parse(localStorage.getItem('swissknife-calendar-view') || 'null');
      if (!value || !['month', 'week', 'day', 'agenda'].includes(value.view)) return;
      const current = new Date(value.currentDate), selected = new Date(value.selectedDate);
      if (!Number.isFinite(current.getTime()) || !Number.isFinite(selected.getTime())) return;
      this.currentView = value.view;
      this.currentDate = current;
      this.selectedDate = selected;
    } catch { /* A corrupt view preference must not erase saved events. */ }
  }

  saveViewToStorage() {
    try {
      localStorage.setItem('swissknife-calendar-view', JSON.stringify({ view: this.currentView,
        currentDate: this.currentDate.toISOString(), selectedDate: this.selectedDate.toISOString() }));
    } catch { /* Storage failure leaves the current visible view usable. */ }
  }

  saveEventsToStorage() {
    try {
      localStorage.setItem('swissknife-calendar-events', JSON.stringify(this.events));
    } catch (error) {
      console.warn('Failed to save calendar events to storage:', error);
    }
  }

  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
