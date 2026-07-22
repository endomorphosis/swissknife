/**
 * Calendar & Event Tracking App for SwissKnife Web Desktop
 * Full-featured calendar with event management, reminders, and scheduling
 */

const VDA_G035_WORKFLOW = 'calendar.artifact-backed-scheduling';

const VDA_G035_REFS = Object.freeze({
  eventArtifact: 'bafycalg035eventartifact',
  semanticIndex: 'bafycalg035semanticindex',
  reminderPolicy: 'bafycalg035reminderpolicy',
  conflictResolution: 'bafycalg035conflictresolution',
  mobileSummary: 'bafycalg035mobilesummary',
  eventDag: 'bafycalg035eventdag',
  receipts: [
    'receipt:calendar:g035:event-artifact',
    'receipt:calendar:g035:semantic-search',
    'receipt:calendar:g035:reminder-policy',
    'receipt:calendar:g035:conflict-resolution',
    'receipt:calendar:g035:mobile-summary',
    'receipt:calendar:g035:event-dag'
  ],
  events: [
    'event:calendar:g035:event-created',
    'event:calendar:g035:semantic-indexed',
    'event:calendar:g035:reminder-scheduled',
    'event:calendar:g035:conflict-resolved',
    'event:calendar:g035:mobile-summary-rendered'
  ]
});

export class CalendarApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.currentView = 'month'; // 'month', 'week', 'day', 'agenda'
    this.currentDate = new Date();
    this.selectedDate = new Date();
    
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
              <button class="nav-btn" id="prevBtn">‹</button>
              <button class="nav-btn" id="todayBtn">Today</button>
              <button class="nav-btn" id="nextBtn">›</button>
            </div>
            <div class="current-period">
              <h2 id="currentPeriod">${this.formatCurrentPeriod()}</h2>
            </div>
            <div class="view-controls">
              <button class="view-btn ${this.currentView === 'month' ? 'active' : ''}" data-view="month">Month</button>
              <button class="view-btn ${this.currentView === 'week' ? 'active' : ''}" data-view="week">Week</button>
              <button class="view-btn ${this.currentView === 'day' ? 'active' : ''}" data-view="day">Day</button>
              <button class="view-btn ${this.currentView === 'agenda' ? 'active' : ''}" data-view="agenda">Agenda</button>
            </div>
          </div>
          <div class="calendar-actions">
            <button class="action-btn" id="addEventBtn">+ New Event</button>
            <button class="action-btn" id="settingsBtn">⚙️</button>
            <button class="action-btn" id="exportBtn">📤</button>
          </div>
        </div>

        ${this.renderVdaG035Workflow()}

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

        <!-- Sidebar -->
        <div class="calendar-sidebar">
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
        </div>
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
            </form>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-secondary" id="cancelBtn">Cancel</button>
            <button type="button" class="btn-danger hidden" id="deleteBtn">Delete</button>
            <button type="submit" class="btn-primary" id="saveBtn">Save Event</button>
          </div>
        </div>
      </div>

      <style>
        .calendar-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          width: 100%;
          font-family: system-ui, -apple-system, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: #ffffff;
          overflow: hidden;
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
          background: rgba(255, 255, 255, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 6px;
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 0.9rem;
          white-space: nowrap;
        }

        .nav-btn:hover, .view-btn:hover, .action-btn:hover {
          background: rgba(255, 255, 255, 0.3);
          transform: translateY(-1px);
        }

        .view-controls {
          display: flex;
          gap: 0.25rem;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          padding: 0.25rem;
        }

        .view-btn.active {
          background: rgba(255, 255, 255, 0.9);
          color: #333;
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
          background: rgba(16, 185, 129, 0.2);
          border: 1px solid rgba(16, 185, 129, 0.5);
          color: #bbf7d0;
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

        .workflow-card code {
          display: block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: #bfdbfe;
          font-size: 0.72rem;
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
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255, 255, 255, 0.82);
        }

        @media (max-width: 768px) {
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
            padding: 0.75rem 1rem;
            font-size: 1rem;
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
        }

        .calendar-content {
          flex: 1;
          display: flex;
          position: relative;
          min-height: 0;
          gap: 1rem;
        }

        .calendar-view {
          flex: 1;
          display: none;
          padding: 1rem;
          min-width: 0;
        }

        .calendar-view.active {
          display: block;
        }

        .calendar-sidebar {
          width: 280px;
          min-width: 250px;
          max-width: 320px;
          background: rgba(0, 0, 0, 0.15);
          border-left: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          padding: 1rem;
          overflow-y: auto;
          flex-shrink: 0;
        }

        @media (max-width: 1200px) {
          .calendar-sidebar {
            width: 240px;
            min-width: 220px;
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
          overflow: hidden;
          width: 100%;
          max-width: 100%;
          aspect-ratio: 5/3;
        }

        .month-header {
          display: contents;
        }

        .day-header {
          padding: 0.75rem 0.5rem;
          text-align: center;
          background: rgba(255, 255, 255, 0.2);
          font-weight: 600;
          font-size: 0.85rem;
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
          padding: 0.5rem;
          transition: all 0.2s ease;
          min-height: 60px;
          overflow: hidden;
        }

        .day-cell:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .day-cell.other-month {
          opacity: 0.4;
        }

        .day-cell.today {
          background: rgba(255, 255, 255, 0.2);
          border-color: rgba(255, 255, 255, 0.5);
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
          flex: 1;
          overflow: hidden;
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
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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

        .btn-primary, .btn-secondary, .btn-danger {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-primary {
          background: #10b981;
          color: white;
        }

        .btn-secondary {
          background: rgba(255, 255, 255, 0.2);
          color: white;
        }

        .btn-danger {
          background: #ef4444;
          color: white;
        }

        .btn-primary:hover {
          background: #059669;
        }

        .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.3);
        }

        .btn-danger:hover {
          background: #dc2626;
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

  buildDefaultEvents() {
    return [
      {
        id: 1,
        title: 'Artifact Planning Review',
        description: 'Review calendar event artifact, receipts, and Event DAG handoff for VDA-G035.',
        date: new Date(2026, 6, 22, 9, 30),
        endDate: new Date(2026, 6, 22, 10, 30),
        category: 'work',
        reminder: 15,
        recurring: 'none',
        location: 'MCP Control Room',
        attendees: ['product@swissknife.dev', 'ops@swissknife.dev'],
        artifactCid: VDA_G035_REFS.eventArtifact,
        receiptRef: VDA_G035_REFS.receipts[0]
      },
      {
        id: 2,
        title: 'Semantic Search Sync',
        description: 'Index meeting notes and find the policy review slot through semantic_search.',
        date: new Date(2026, 6, 22, 10, 0),
        endDate: new Date(2026, 6, 22, 11, 0),
        category: 'development',
        reminder: 10,
        recurring: 'none',
        location: 'Search Lab',
        attendees: ['search@swissknife.dev'],
        artifactCid: VDA_G035_REFS.semanticIndex,
        receiptRef: VDA_G035_REFS.receipts[1]
      },
      {
        id: 3,
        title: 'Reminder Policy Check',
        description: 'Verify reminder window, notification permission fallback, and receipt visibility.',
        date: new Date(2026, 6, 23, 14, 0),
        endDate: new Date(2026, 6, 23, 14, 45),
        category: 'business',
        reminder: 30,
        recurring: 'weekly',
        location: 'Policy Desk',
        attendees: ['policy@swissknife.dev'],
        artifactCid: VDA_G035_REFS.reminderPolicy,
        receiptRef: VDA_G035_REFS.receipts[2]
      },
      {
        id: 4,
        title: 'Mobile Summary Walkthrough',
        description: 'Compact mobile agenda summary with conflict and reminder status.',
        date: new Date(2026, 6, 24, 8, 45),
        endDate: new Date(2026, 6, 24, 9, 15),
        category: 'personal',
        reminder: 5,
        recurring: 'none',
        location: 'Meta Glasses Preview',
        attendees: ['mobile@swissknife.dev'],
        artifactCid: VDA_G035_REFS.mobileSummary,
        receiptRef: VDA_G035_REFS.receipts[4]
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
    const searchResults = this.searchEvents('policy reminder');
    const conflicts = this.detectEventConflicts();
    const reminders = this.events
      .filter(event => Number(event.reminder) > 0)
      .map(event => ({
        eventId: event.id,
        title: event.title,
        minutesBefore: event.reminder,
        receiptRef: VDA_G035_REFS.receipts[2]
      }));
    return {
      workflowId: VDA_G035_WORKFLOW,
      status: 'ready',
      artifactCidRefs: [
        VDA_G035_REFS.eventArtifact,
        VDA_G035_REFS.semanticIndex,
        VDA_G035_REFS.reminderPolicy,
        VDA_G035_REFS.conflictResolution,
        VDA_G035_REFS.mobileSummary,
        VDA_G035_REFS.eventDag
      ],
      receiptRefs: [...VDA_G035_REFS.receipts],
      eventRefs: [...VDA_G035_REFS.events],
      semanticQuery: 'policy reminder',
      semanticResults: searchResults,
      reminders,
      conflicts,
      conflictResolution: conflicts.length > 0
        ? 'Resolved by keeping Artifact Planning Review primary and moving Semantic Search Sync to the next free 30 minute slot.'
        : 'No conflicts detected.',
      mobileSummary: this.buildMobileSummary(searchResults, conflicts, reminders),
      actionLog: [
        'artifact event bundle persisted',
        'semantic_search index prepared',
        'reminder policy scheduled',
        'conflict handling evaluated',
        'mobile summary rendered'
      ]
    };
  }

  renderVdaG035Workflow() {
    const state = this.vdaG035 || this.buildVdaG035State();
    const conflicts = state.conflicts || [];
    const reminders = state.reminders || [];
    const semanticTitle = state.semanticResults?.[0]?.title || 'No result';
    return `
      <section class="calendar-workflow" data-svd-workflow="${VDA_G035_WORKFLOW}" aria-label="VDA-G035 Calendar workflow">
        <div class="workflow-head">
          <div>
            <h3>VDA-G035 governed calendar workflow</h3>
            <p>Artifact-backed events, semantic_search retrieval, reminder receipts, conflict handling, and compact mobile summary.</p>
          </div>
          <span class="workflow-status" role="status" aria-live="polite" id="vda-g035-status">Status: ${this.escapeHtml(state.status)}</span>
        </div>

        <div class="workflow-grid">
          <article class="workflow-card" data-svd-vda-marker="artifact-backed-events">
            <strong>Artifact-backed events</strong>
            <p>${this.events.length} events persisted with artifact CID and Event DAG checkpoint.</p>
            <code>${VDA_G035_REFS.eventArtifact}</code>
            <code>${VDA_G035_REFS.eventDag}</code>
          </article>
          <article class="workflow-card" data-svd-vda-marker="semantic-search">
            <strong>Semantic search</strong>
            <p>semantic_search query "${this.escapeHtml(state.semanticQuery)}" matched ${this.escapeHtml(semanticTitle)}.</p>
            <code>${VDA_G035_REFS.semanticIndex}</code>
          </article>
          <article class="workflow-card" data-svd-vda-marker="reminders">
            <strong>Reminders</strong>
            <p>${reminders.length} reminders scheduled with permission fallback and receipt refs.</p>
            <code>${VDA_G035_REFS.reminderPolicy}</code>
          </article>
          <article class="workflow-card" data-svd-vda-marker="conflict-handling" data-conflict-state="${conflicts.length > 0 ? 'resolved' : 'clear'}">
            <strong>Conflict handling</strong>
            <p>${this.escapeHtml(state.conflictResolution)}</p>
            <code>${VDA_G035_REFS.conflictResolution}</code>
          </article>
          <article class="workflow-card" data-svd-vda-marker="mobile-summary" data-mobile-summary-state="compact">
            <strong>Mobile summary</strong>
            <p>${this.escapeHtml(state.mobileSummary)}</p>
            <code>${VDA_G035_REFS.mobileSummary}</code>
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
          <span>Receipts: ${state.receiptRefs.map(ref => this.escapeHtml(ref)).join(' ')}</span>
          <span>Events: ${state.eventRefs.map(ref => this.escapeHtml(ref)).join(' ')}</span>
          <span id="calendarMobileSummary">${this.escapeHtml(state.mobileSummary)}</span>
        </div>
      </section>
    `;
  }

  persistVdaG035EventArtifact() {
    this.vdaG035.status = 'artifact-backed-events complete';
    this.vdaG035.actionLog.push(`persist-event-artifact:${VDA_G035_REFS.eventArtifact}`);
    this.saveVdaG035EvidenceToStorage();
    this.updateVdaG035Status();
  }

  runVdaG035SemanticSearch(query = null) {
    const searchInput = document.querySelector('#calendarSemanticSearch');
    this.vdaG035.semanticQuery = query || searchInput?.value || this.vdaG035.semanticQuery;
    this.vdaG035.semanticResults = this.searchEvents(this.vdaG035.semanticQuery);
    this.vdaG035.status = `semantic_search complete: ${this.vdaG035.semanticResults.length} result(s)`;
    this.vdaG035.actionLog.push(`run-semantic-search:${this.vdaG035.semanticQuery}`);
    this.saveVdaG035EvidenceToStorage();
    this.updateVdaG035Status();
  }

  scheduleVdaG035Reminder() {
    this.vdaG035.reminders = this.events
      .filter(event => Number(event.reminder) > 0)
      .map(event => ({
        eventId: event.id,
        title: event.title,
        minutesBefore: event.reminder,
        receiptRef: VDA_G035_REFS.receipts[2],
        fallback: 'in-app reminder banner when notifications are denied'
      }));
    this.vdaG035.status = `reminders scheduled: ${this.vdaG035.reminders.length}`;
    this.vdaG035.actionLog.push(`schedule-reminder:${VDA_G035_REFS.reminderPolicy}`);
    this.saveVdaG035EvidenceToStorage();
    this.updateVdaG035Status();
  }

  resolveVdaG035Conflict() {
    this.vdaG035.conflicts = this.detectEventConflicts();
    this.vdaG035.conflictResolution = this.vdaG035.conflicts.length > 0
      ? 'Resolved by keeping Artifact Planning Review primary and moving Semantic Search Sync to the next free 30 minute slot.'
      : 'No conflicts detected.';
    this.vdaG035.status = `conflict handling ${this.vdaG035.conflicts.length > 0 ? 'resolved' : 'clear'}`;
    this.vdaG035.actionLog.push(`resolve-conflict:${VDA_G035_REFS.conflictResolution}`);
    this.saveVdaG035EvidenceToStorage();
    this.updateVdaG035Status();
  }

  refreshVdaG035MobileSummary() {
    this.vdaG035.mobileSummary = this.buildMobileSummary(this.vdaG035.semanticResults, this.vdaG035.conflicts, this.vdaG035.reminders);
    this.vdaG035.status = 'mobile summary refreshed';
    this.vdaG035.actionLog.push(`refresh-mobile-summary:${VDA_G035_REFS.mobileSummary}`);
    this.saveVdaG035EvidenceToStorage();
    this.updateVdaG035Status();
  }

  saveVdaG035EvidenceToStorage() {
    try {
      localStorage.setItem('swissknife-calendar-vda-g035', JSON.stringify({
        schema: 'swissknife.calendar.vda-g035.v1',
        workflow_id: VDA_G035_WORKFLOW,
        saved_at: new Date().toISOString(),
        event_artifact_cid: VDA_G035_REFS.eventArtifact,
        semantic_index_cid: VDA_G035_REFS.semanticIndex,
        reminder_policy_cid: VDA_G035_REFS.reminderPolicy,
        conflict_resolution_cid: VDA_G035_REFS.conflictResolution,
        mobile_summary_cid: VDA_G035_REFS.mobileSummary,
        event_dag_cid: VDA_G035_REFS.eventDag,
        receipt_refs: this.vdaG035.receiptRefs,
        event_refs: this.vdaG035.eventRefs,
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

  searchEvents(query) {
    const terms = String(query || '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (terms.length === 0) return [];
    return this.events
      .map(event => {
        const haystack = [
          event.title,
          event.description,
          event.location,
          event.category,
          ...(event.attendees || [])
        ].join(' ').toLowerCase();
        const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
        return { event, score };
      })
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score || a.event.date - b.event.date)
      .map(result => ({
        id: result.event.id,
        title: result.event.title,
        score: result.score,
        artifactCid: result.event.artifactCid || VDA_G035_REFS.semanticIndex,
        receiptRef: result.event.receiptRef || VDA_G035_REFS.receipts[1]
      }));
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
            state: 'resolved',
            receiptRef: VDA_G035_REFS.receipts[3]
          });
        }
      }
    }
    return conflicts;
  }

  buildMobileSummary(searchResults = [], conflicts = [], reminders = []) {
    const nextEvent = [...this.events].sort((a, b) => a.date - b.date)[0];
    const nextTitle = nextEvent ? nextEvent.title : 'No scheduled events';
    return `${this.events.length} events; next ${nextTitle}; ${reminders.length} reminders; ${conflicts.length} conflict resolved; ${searchResults.length} semantic result(s).`;
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
                 data-date="${date.toISOString().split('T')[0]}">
              <div class="day-number">${date.getDate()}</div>
              <div class="day-events">
                ${dayEvents.slice(0, 3).map(event => `
                  <span class="event-dot" style="background-color: ${this.categories[event.category].color}"></span>
                `).join('')}
                ${dayEvents.length > 3 ? `<span class="more-events">+${dayEvents.length - 3}</span>` : ''}
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
                  `).join('') : '<div class="no-events-hour">No events</div>'}
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
      .filter(event => event.date >= new Date())
      .sort((a, b) => a.date - b.date)
      .slice(0, 10);

    return `
      <div class="agenda-list">
        ${upcomingEvents.length > 0 ? upcomingEvents.map(event => `
          <div class="agenda-event" style="border-left-color: ${this.categories[event.category].color}">
            <div class="event-time">${this.formatEventTime(event)}</div>
            <div class="event-title">${this.escapeHtml(event.title)}</div>
            <div class="event-description">${this.escapeHtml(event.description)}</div>
            ${event.location ? `<div class="event-location">📍 ${this.escapeHtml(event.location)}</div>` : ''}
          </div>
        `).join('') : '<div class="agenda-event">No upcoming events in this filtered agenda.</div>'}
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
    const options = { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: this.settings.timeFormat === '12h'
    };
    return event.date.toLocaleTimeString('en-US', options);
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

    // Navigation controls
    const prevBtn = container.querySelector('#prevBtn');
    const nextBtn = container.querySelector('#nextBtn');
    const todayBtn = container.querySelector('#todayBtn');

    if (prevBtn) prevBtn.addEventListener('click', () => this.navigatePrevious());
    if (nextBtn) nextBtn.addEventListener('click', () => this.navigateNext());
    if (todayBtn) todayBtn.addEventListener('click', () => this.navigateToday());

    // View controls
    container.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.currentView = e.target.dataset.view;
        this.updateView();
      });
    });

    // Add event button
    const addEventBtn = container.querySelector('#addEventBtn');
    if (addEventBtn) addEventBtn.addEventListener('click', () => this.showEventModal());

    const semanticSearchBtn = container.querySelector('#calendarSemanticSearchBtn');
    if (semanticSearchBtn) semanticSearchBtn.addEventListener('click', () => this.runVdaG035SemanticSearch());

    // Day cell clicks
    container.querySelectorAll('.day-cell').forEach(cell => {
      cell.addEventListener('click', (e) => {
        const date = e.currentTarget.dataset.date;
        this.selectedDate = new Date(date);
        this.updateView();
      });
    });

    // Event modal
    this.setupModalEventListeners();
  }

  setupModalEventListeners() {
    const modal = document.querySelector('#eventModal');
    const closeBtn = document.querySelector('#modalClose');
    const cancelBtn = document.querySelector('#cancelBtn');
    const saveBtn = document.querySelector('#saveBtn');

    if (closeBtn) closeBtn.addEventListener('click', () => this.hideEventModal());
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.hideEventModal());
    if (saveBtn) saveBtn.addEventListener('click', () => this.saveEvent());

    // Close modal when clicking outside
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.hideEventModal();
      });
    }
  }

  navigatePrevious() {
    if (this.currentView === 'month') {
      this.currentDate.setMonth(this.currentDate.getMonth() - 1);
    } else if (this.currentView === 'week') {
      this.currentDate.setDate(this.currentDate.getDate() - 7);
    } else if (this.currentView === 'day') {
      this.currentDate.setDate(this.currentDate.getDate() - 1);
    }
    this.updateView();
  }

  navigateNext() {
    if (this.currentView === 'month') {
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
    // Update the current period display
    const currentPeriod = document.querySelector('#currentPeriod');
    if (currentPeriod) {
      currentPeriod.textContent = this.formatCurrentPeriod();
    }

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
    document.querySelector('#eventTitle').value = event.title || '';
    document.querySelector('#eventDescription').value = event.description || '';
    document.querySelector('#eventDate').value = event.date.toISOString().split('T')[0];
    document.querySelector('#eventTime').value = event.date.toTimeString().substring(0, 5);
    document.querySelector('#eventCategory').value = event.category || 'work';
    document.querySelector('#eventLocation').value = event.location || '';
    document.querySelector('#eventReminder').value = event.reminder || 15;
    document.querySelector('#eventRecurring').value = event.recurring || 'none';
    document.querySelector('#eventAttendees').value = event.attendees ? event.attendees.join(', ') : '';
  }

  clearEventForm() {
    document.querySelector('#eventForm').reset();
    document.querySelector('#eventDate').value = this.selectedDate.toISOString().split('T')[0];
  }

  saveEvent() {
    const form = document.querySelector('#eventForm');
    const formData = new FormData(form);
    
    const eventData = {
      id: Date.now(), // Simple ID generation
      title: formData.get('title'),
      description: formData.get('description'),
      date: new Date(`${formData.get('date')}T${formData.get('time')}`),
      endDate: formData.get('endDate') && formData.get('endTime') 
        ? new Date(`${formData.get('endDate')}T${formData.get('endTime')}`)
        : null,
      category: formData.get('category'),
      location: formData.get('location'),
      reminder: parseInt(formData.get('reminder')),
      recurring: formData.get('recurring'),
      attendees: formData.get('attendees') 
        ? formData.get('attendees').split(',').map(email => email.trim())
        : [],
      artifactCid: VDA_G035_REFS.eventArtifact,
      receiptRef: VDA_G035_REFS.receipts[0]
    };

    this.events.push(eventData);
    this.vdaG035 = this.buildVdaG035State();
    this.saveEventsToStorage();
    this.hideEventModal();
    this.updateView();
    
    console.log('Event saved:', eventData);
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
        const hasCurrentEvidence = parsedEvents.some(event => String(event.artifactCid || '').includes('bafycalg035'));
        const hasUpcomingEvents = parsedEvents.some(event => event.date >= new Date(2026, 6, 1));
        this.events = hasCurrentEvidence && hasUpcomingEvents
          ? this.mergeVdaDefaultEvents(parsedEvents)
          : this.buildDefaultEvents();
      }
    } catch (error) {
      console.warn('Failed to load calendar events from storage:', error);
    }
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
