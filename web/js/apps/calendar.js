/**
 * Calendar & Event Tracking App for SwissKnife Web Desktop
 * Full-featured calendar with event management, reminders, and scheduling
 */

export class CalendarApp {
  constructor(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    this.currentView = 'month'; // 'month', 'week', 'day', 'agenda'
    this.currentDate = new Date();
    this.selectedDate = new Date();
    
    // Event storage
    this.events = [
      {
        id: 1,
        title: 'Team Meeting',
        description: 'Weekly team sync and project updates',
        date: new Date(2025, 8, 20, 10, 0), // Sept 20, 2025 10:00 AM
        endDate: new Date(2025, 8, 20, 11, 0),
        category: 'work',
        reminder: 15, // minutes before
        recurring: 'weekly',
        location: 'Conference Room A',
        attendees: ['john@company.com', 'jane@company.com']
      },
      {
        id: 2,
        title: 'SwissKnife Development',
        description: 'Continue work on P2P ML framework enhancements',
        date: new Date(2025, 8, 18, 14, 0),
        endDate: new Date(2025, 8, 18, 17, 0),
        category: 'development',
        reminder: 10,
        recurring: 'none',
        location: 'Home Office'
      },
      {
        id: 3,
        title: 'Lunch with Client',
        description: 'Discuss new AI project requirements',
        date: new Date(2025, 8, 22, 12, 30),
        endDate: new Date(2025, 8, 22, 14, 0),
        category: 'business',
        reminder: 30,
        recurring: 'none',
        location: 'Downtown Restaurant'
      },
      {
        id: 4,
        title: 'Gym Workout',
        description: 'Strength training session',
        date: new Date(2025, 8, 19, 18, 0),
        endDate: new Date(2025, 8, 19, 19, 30),
        category: 'personal',
        reminder: 15,
        recurring: 'daily',
        location: 'Local Gym'
      }
    ];
    
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
    // Week view implementation
    return `
      <div class="week-container">
        <div class="time-grid">
          <div class="time-slots">
            ${Array.from({length: 24}, (_, i) => `
              <div class="time-slot">${i.toString().padStart(2, '0')}:00</div>
            `).join('')}
          </div>
          <div class="week-days">
            <!-- Week day columns would go here -->
            <div class="week-placeholder">Week view coming soon...</div>
          </div>
        </div>
      </div>
    `;
  }

  renderDayView() {
    const selectedDate = this.currentDate;
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
                    <div class="day-event" style="background: ${event.color || '#007bff'}">
                      <div class="event-time">${event.date.toLocaleTimeString('en-US', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}</div>
                      <div class="event-title">${event.title}</div>
                      ${event.location ? `<div class="event-location">📍 ${event.location}</div>` : ''}
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
        ${upcomingEvents.map(event => `
          <div class="agenda-event" style="border-left-color: ${this.categories[event.category].color}">
            <div class="event-time">${this.formatEventTime(event)}</div>
            <div class="event-title">${event.title}</div>
            <div class="event-description">${event.description}</div>
            ${event.location ? `<div class="event-location">📍 ${event.location}</div>` : ''}
          </div>
        `).join('')}
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
          ${this.categories[event.category].icon} ${event.title}
        </div>
        <div class="event-time">${this.formatEventTime(event)}</div>
      </div>
    `).join('');
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

    // Refresh the active view content
    const activeView = document.querySelector(`.${this.currentView}-view`);
    if (activeView && this.currentView === 'month') {
      activeView.innerHTML = this.renderMonthView();
      this.attachEventListeners(); // Reattach listeners for new content
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
        : []
    };

    this.events.push(eventData);
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
        this.events = events.map(event => ({
          ...event,
          date: new Date(event.date),
          endDate: event.endDate ? new Date(event.endDate) : null
        }));
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
}