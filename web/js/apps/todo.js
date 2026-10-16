/**
 * Todo App - Plain Text Goal Management System
 * Handles long-term goals and their subgoals in a graph format
 * Different from Task Manager which handles AI inference jobs
 */

// Use function declaration instead of ES6 class for compatibility
function TodoApp(desktop) {
    this.desktop = desktop;
    this.swissknife = null;
    
    // Todo management
    this.todos = [];
    this.goals = [];
    this.currentView = 'todos';
    
    this.loadTodos();
}

TodoApp.prototype.initialize = function() {
    this.swissknife = this.desktop.swissknife;
    this.loadTodos();
};

TodoApp.prototype.createWindowConfig = function() {
    return `
        <style>
            .todo-app, .todo-app * {
                box-sizing: border-box;
                min-width: 0;
            }
            .todo-app {
                background: var(--sk-bg-deep, #0e1412);
                color: var(--sk-text, #edf7f2);
            }
            .todo-app .todo-header,
            .todo-app .header-controls,
            .todo-app .status-bar {
                flex-wrap: wrap;
                gap: 8px;
            }
            .todo-app .header-controls {
                display: flex;
                justify-content: flex-end;
            }
            .todo-app .quick-add-row {
                display: grid !important;
                grid-template-columns: minmax(0, 1fr) max-content max-content;
                align-items: center;
            }
            .todo-app .todo-main,
            .todo-app .todos-view,
            .todo-app .goals-view,
            .todo-app .graph-view,
            .todo-app .todo-list,
            .todo-app .goals-content,
            .todo-app .graph-content {
                overflow-x: hidden;
            }
            .todo-app .todo-item-row,
            .todo-app .todo-item-title {
                min-width: 0;
            }
            .todo-app .todo-item-title {
                overflow-wrap: anywhere;
            }
            /* Dark ops-console theme tokens for todo app */
            .todo-app .todo-item {
                background: var(--sk-bg-panel, #101b18);
                border: 1px solid var(--sk-border, #263a34);
                border-radius: 6px;
                padding: 12px;
                margin-bottom: 8px;
            }
            .todo-app .todo-item.is-completed {
                opacity: 0.7;
            }
            .todo-app .todo-item-meta {
                font-size: 11px;
                color: var(--sk-text-faint, #9eb2aa);
            }
            .todo-app .goal-item {
                background: var(--sk-bg-panel, #101b18);
                border: 1px solid var(--sk-accent, #8bd8bd);
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 16px;
            }
            .todo-app .view-switch-btn.active-view,
            .todo-app .voice-todo-btn.active-view {
                background: rgba(139, 216, 189, 0.28) !important;
                border: 1px solid var(--sk-accent, #8bd8bd) !important;
            }
            /* Baseline button styling (design-system .sk-btn refines this) */
            .todo-app .view-switch-btn,
            .todo-app .voice-todo-btn {
                padding: 6px 12px;
                border: 1px solid var(--sk-border, #263a34);
                border-radius: 6px;
                background: var(--sk-bg-header, #12211d);
                color: var(--sk-text, #edf7f2);
                cursor: pointer;
            }
            .todo-app .view-switch-btn:hover,
            .todo-app .voice-todo-btn:hover {
                background: var(--sk-bg-inset, #17241f);
            }
            .todo-app .add-todo-btn,
            .todo-app .add-goal-btn {
                padding: 10px 16px;
                border: none;
                border-radius: 6px;
                background: var(--sk-accent, #8bd8bd);
                color: #0e1412;
                cursor: pointer;
                font-weight: 600;
            }
            .todo-app .add-todo-btn:hover,
            .todo-app .add-goal-btn:hover {
                background: var(--sk-ok, #5ee3a1);
            }
            .todo-app .voice-hint {
                font-size: 11px;
                color: var(--sk-text-faint, #9eb2aa);
            }
            @media (max-width: 640px) {
                .todo-app .todo-header {
                    align-items: flex-start !important;
                }
                .todo-app .header-left,
                .todo-app .header-controls,
                .todo-app .quick-add-row,
                .todo-app .status-left,
                .todo-app .status-right {
                    width: 100%;
                }
                .todo-app .header-controls {
                    justify-content: flex-start;
                }
                .todo-app .quick-add-row {
                    grid-template-columns: minmax(0, 1fr);
                }
                .todo-app .quick-add-row select,
                .todo-app .quick-add-row button,
                .todo-app .new-goal-input,
                .todo-app .add-goal-btn {
                    width: 100% !important;
                    margin-left: 0 !important;
                }
            }
        </style>
        <div class="todo-app sk-app" style="height: 100%; display: flex; flex-direction: column;">
            <!-- Header -->
            <div class="todo-header" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--sk-border, #263a34); background: var(--sk-bg-panel, #101b18);">
                <div class="header-left">
                    <h2 style="margin: 0; font-size: 20px; font-weight: 600; color: var(--sk-text, #edf7f2);">📋 Todo & Goals</h2>
                    <span style="font-size: 12px; color: var(--sk-text-faint, #9eb2aa);">Plain Text Goal Management</span>
                </div>
                <div class="header-controls">
                    <button class="voice-todo-btn sk-btn" id="voice-todo-btn" onclick="window.todoApp.startVoiceInput()" style="margin-right: 8px; font-size: 12px;">🎤 Voice</button>
                    <button class="view-switch-btn sk-btn active-view" data-view="todos" style="margin-right: 4px; font-size: 12px;">📝 Todos</button>
                    <button class="view-switch-btn sk-btn" data-view="goals" style="margin-right: 4px; font-size: 12px;">🎯 Goals</button>
                    <button class="view-switch-btn sk-btn" data-view="graph" style="font-size: 12px;">📊 Graph</button>
                </div>
            </div>

            <!-- Main Content -->
            <div class="todo-main" style="flex: 1; display: flex; height: calc(100% - 70px);">
                <!-- Todos View -->
                <div class="todos-view" id="todos-view" style="width: 100%; display: flex; flex-direction: column;">
                    <!-- Quick Add -->
                    <div class="quick-add" style="padding: 16px; background: var(--sk-bg-panel, #101b18); border-bottom: 1px solid var(--sk-border, #263a34);">
                        <div class="quick-add-row" style="display: flex; gap: 8px; margin-bottom: 8px;">
                            <input type="text" class="new-todo-input sk-input" placeholder="Add a new todo... (voice commands supported)" style="flex: 1;">
                            <select class="todo-priority sk-select">
                                <option value="low">💡 Low</option>
                                <option value="medium" selected>📋 Medium</option>
                                <option value="high">🔥 High</option>
                                <option value="urgent">⚡ Urgent</option>
                            </select>
                            <button class="add-todo-btn sk-btn sk-btn-primary">Add Todo</button>
                        </div>
                        <div class="voice-hint">
                            💡 Voice commands: "Add todo: [task]" | "Mark [task] complete" | "Set [task] priority high"
                        </div>
                    </div>

                    <!-- Todo List -->
                    <div class="todo-list" style="flex: 1; overflow-y: auto; padding: 16px;">
                        <div class="todo-categories">
                            <!-- Urgent Todos -->
                            <div class="todo-category" id="urgent-todos">
                                <h3 class="sk-section-head" style="color: var(--sk-err, #ff6b6b); margin: 0 0 12px 0; font-size: 16px; display: flex; align-items: center;">
                                    ⚡ Urgent Tasks
                                    <span class="count-badge sk-badge" style="margin-left: 8px; background: var(--sk-err, #ff6b6b); color: #0e1412;">0</span>
                                </h3>
                                <div class="todos-container urgent-container"></div>
                            </div>

                            <!-- High Priority Todos -->
                            <div class="todo-category" id="high-todos" style="margin-top: 20px;">
                                <h3 class="sk-section-head" style="color: var(--sk-warn, #ffd166); margin: 0 0 12px 0; font-size: 16px; display: flex; align-items: center;">
                                    🔥 High Priority
                                    <span class="count-badge sk-badge" style="margin-left: 8px; background: var(--sk-warn, #ffd166); color: #0e1412;">0</span>
                                </h3>
                                <div class="todos-container high-container"></div>
                            </div>

                            <!-- Medium Priority Todos -->
                            <div class="todo-category" id="medium-todos" style="margin-top: 20px;">
                                <h3 class="sk-section-head" style="color: var(--sk-accent, #8bd8bd); margin: 0 0 12px 0; font-size: 16px; display: flex; align-items: center;">
                                    📋 Medium Priority  
                                    <span class="count-badge sk-badge" style="margin-left: 8px; background: var(--sk-accent, #8bd8bd); color: #0e1412;">0</span>
                                </h3>
                                <div class="todos-container medium-container"></div>
                            </div>

                            <!-- Low Priority Todos -->
                            <div class="todo-category" id="low-todos" style="margin-top: 20px;">
                                <h3 class="sk-section-head" style="color: var(--sk-ok, #5ee3a1); margin: 0 0 12px 0; font-size: 16px; display: flex; align-items: center;">
                                    💡 Low Priority
                                    <span class="count-badge sk-badge" style="margin-left: 8px; background: var(--sk-ok, #5ee3a1); color: #0e1412;">0</span>
                                </h3>
                                <div class="todos-container low-container"></div>
                            </div>

                            <!-- Completed Todos -->
                            <div class="todo-category" id="completed-todos" style="margin-top: 20px;">
                                <h3 class="sk-section-head" style="color: var(--sk-idle, #7c8f87); margin: 0 0 12px 0; font-size: 16px; display: flex; align-items: center;">
                                    ✅ Completed
                                    <span class="count-badge sk-badge" style="margin-left: 8px; background: var(--sk-idle, #7c8f87); color: #0e1412;">0</span>
                                </h3>
                                <div class="todos-container completed-container"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Goals View (Hidden by default) -->
                <div class="goals-view" id="goals-view" style="width: 100%; display: none; flex-direction: column;">
                    <div class="goals-content" style="padding: 20px;">
                        <h3 class="sk-section-head">🎯 Long-term Goals & Subgoals</h3>
                        <div class="goal-input" style="margin-bottom: 20px; display: flex; gap: 8px; flex-wrap: wrap;">
                            <input type="text" class="new-goal-input sk-input" placeholder="Add a long-term goal..." style="flex: 1; min-width: 200px; margin-bottom: 8px;">
                            <button class="add-goal-btn sk-btn sk-btn-primary" style="margin-bottom: 8px;">Add Goal</button>
                        </div>
                        <div class="goals-list" id="goals-list"></div>
                    </div>
                </div>

                <!-- Graph View (Hidden by default) -->
                <div class="graph-view" id="graph-view" style="width: 100%; display: none; flex-direction: column;">
                    <div class="graph-content" style="padding: 20px;">
                        <h3 class="sk-section-head">📊 Goal Dependency Graph</h3>
                        <div class="sk-empty" style="min-height: 300px; border: 1px dashed var(--sk-border, #263a34); border-radius: 8px; background: var(--sk-bg-panel, #101b18);">
                            <div style="font-size: 32px; margin-bottom: 12px;">📊</div>
                            <div>Interactive goal dependency graph will be displayed here</div>
                            <div style="font-size: 12px; margin-top: 8px; opacity: 0.7;">Shows relationships between goals and subgoals</div>
                            <div class="sk-honest-note" style="margin-top: 8px;">Future implementation will use D3.js or similar visualization library</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Status Bar -->
            <div class="status-bar" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 16px; background: var(--sk-bg-panel, #101b18); border-top: 1px solid var(--sk-border, #263a34); color: var(--sk-text-faint, #9eb2aa); font-size: 12px;">
                <span class="status-left">📋 <span class="total-todos">0</span> todos • 🎯 <span class="total-goals">0</span> goals</span>
                <span class="status-right">🎤 Voice: <span class="voice-status">Ready</span> • Last updated: <span class="last-updated">Never</span></span>
            </div>
        </div>
    `;
};

TodoApp.prototype.loadTodos = function() {
    try {
        var savedTodos = localStorage.getItem('swissknife-todos');
        var savedGoals = localStorage.getItem('swissknife-goals');
        
        this.todos = savedTodos ? JSON.parse(savedTodos) : this.getDefaultTodos();
        this.goals = savedGoals ? JSON.parse(savedGoals) : this.getDefaultGoals();
        
    } catch (error) {
        console.error('Failed to load todos:', error);
        this.todos = this.getDefaultTodos();
        this.goals = this.getDefaultGoals();
    }
};

TodoApp.prototype.getDefaultTodos = function() {
    return [
        {
            id: 1,
            text: "Review VibeCode voice control implementation",
            priority: "high",
            completed: false,
            createdAt: new Date().toISOString(),
            tags: ["coding", "review"]
        },
        {
            id: 2,
            text: "Test all 28 desktop applications",
            priority: "medium",  
            completed: false,
            createdAt: new Date().toISOString(),
            tags: ["testing", "applications"]
        },
        {
            id: 3,
            text: "Implement AI computer control for mouse actions",
            priority: "high",
            completed: false,
            createdAt: new Date().toISOString(),
            tags: ["ai", "computer-control"]
        },
        {
            id: 4,
            text: "Create goal dependency graph visualization",
            priority: "medium",
            completed: false,
            createdAt: new Date().toISOString(),
            tags: ["visualization", "goals"]
        }
    ];
};

TodoApp.prototype.getDefaultGoals = function() {
    return [
        {
            id: 1,
            title: "Complete SwissKnife Desktop Enhancement",
            description: "Enhance all applications and ensure full functionality",
            subgoals: [
                "Test all 28 applications",
                "Implement voice control for desktop",
                "Add AI computer control",
                "Create todo management system"
            ],
            priority: "high",
            status: "in-progress",
            createdAt: new Date().toISOString()
        },
        {
            id: 2,
            title: "AI-Powered Development Environment",
            description: "Create maximally agentic development tools",
            subgoals: [
                "Voice-controlled coding",
                "AI task prioritization", 
                "Computer control integration",
                "Visual goal tracking"
            ],
            priority: "high",
            status: "planning",
            createdAt: new Date().toISOString()
        }
    ];
};

TodoApp.prototype.setupEventListeners = function(contentElement) {
    var self = this;
    
    // Set global reference for HTML onclick handlers
    window.todoApp = this;

    // View switching
    var viewBtns = contentElement.querySelectorAll('.view-switch-btn');
    for (var i = 0; i < viewBtns.length; i++) {
        viewBtns[i].addEventListener('click', function() {
            var view = this.dataset.view;
            self.switchView(view);
        });
    }

    // Add todo
    var addBtn = contentElement.querySelector('.add-todo-btn');
    var todoInput = contentElement.querySelector('.new-todo-input');
    var prioritySelect = contentElement.querySelector('.todo-priority');

    var addTodoHandler = function() {
        var text = todoInput.value.trim();
        var priority = prioritySelect.value;
        
        if (text) {
            self.addTodo(text, priority);
            todoInput.value = '';
            prioritySelect.value = 'medium';
        }
    };

    if (addBtn) addBtn.addEventListener('click', addTodoHandler);
    if (todoInput) {
        todoInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') addTodoHandler();
        });
    }

    // Add goal
    var addGoalBtn = contentElement.querySelector('.add-goal-btn');
    var goalInput = contentElement.querySelector('.new-goal-input');

    if (addGoalBtn && goalInput) {
        addGoalBtn.addEventListener('click', function() {
            var title = goalInput.value.trim();
            if (title) {
                var newGoal = {
                    id: Date.now(),
                    title: title,
                    description: '',
                    subgoals: [],
                    priority: 'medium',
                    status: 'planning',
                    createdAt: new Date().toISOString()
                };
                
                self.goals.push(newGoal);
                self.saveTodos();
                self.renderGoals();
                self.updateCounts();
                goalInput.value = '';
            }
        });
    }

    // Initial render
    this.renderTodos();
    this.updateCounts();
};

TodoApp.prototype.switchView = function(view) {
    this.currentView = view;
    
    // Hide all views
    document.getElementById('todos-view').style.display = 'none';
    document.getElementById('goals-view').style.display = 'none';
    document.getElementById('graph-view').style.display = 'none';
    
    // Show selected view
    document.getElementById(view + '-view').style.display = 'flex';
    
    // Update button states
    var btns = document.querySelectorAll('.view-switch-btn');
    for (var i = 0; i < btns.length; i++) {
        btns[i].classList.remove('active-view');
    }
    var activeBtn = document.querySelector('[data-view="' + view + '"]');
    if (activeBtn) {
        activeBtn.classList.add('active-view');
    }
    
    if (view === 'goals') {
        this.renderGoals();
    } else if (view === 'graph') {
        this.renderGraph();
    }
};

TodoApp.prototype.addTodo = function(text, priority) {
    priority = priority || 'medium';
    var newTodo = {
        id: Date.now(),
        text: text,
        priority: priority,
        completed: false,
        createdAt: new Date().toISOString(),
        tags: []
    };

    this.todos.push(newTodo);
    this.saveTodos();
    this.renderTodos();
    this.updateCounts();
};

TodoApp.prototype.saveTodos = function() {
    try {
        localStorage.setItem('swissknife-todos', JSON.stringify(this.todos));
        localStorage.setItem('swissknife-goals', JSON.stringify(this.goals));
        this.updateLastUpdated();
    } catch (error) {
        console.error('Failed to save todos:', error);
    }
};

TodoApp.prototype.renderTodos = function() {
    var containers = {
        urgent: document.querySelector('.urgent-container'),
        high: document.querySelector('.high-container'),
        medium: document.querySelector('.medium-container'),
        low: document.querySelector('.low-container'),
        completed: document.querySelector('.completed-container')
    };

    // Clear containers
    for (var key in containers) {
        if (containers[key]) {
            containers[key].innerHTML = '';
        }
    }

    // Sort todos by priority and render
    for (var i = 0; i < this.todos.length; i++) {
        var todo = this.todos[i];
        var todoElement = this.createTodoElement(todo);
        var containerKey = todo.completed ? 'completed' : todo.priority;
        var container = containers[containerKey];
        
        if (container) {
            container.appendChild(todoElement);
        }
    }

    // Empty states per priority bucket
    var emptyLabels = {
        urgent: 'No urgent todos — everything can wait.',
        high: 'No high-priority todos.',
        medium: 'No medium-priority todos.',
        low: 'No low-priority todos.',
        completed: 'Nothing completed yet.'
    };
    for (var key in containers) {
        var c = containers[key];
        if (c && c.children.length === 0) {
            var emptyDiv = document.createElement('div');
            emptyDiv.className = 'sk-empty todo-empty';
            emptyDiv.textContent = emptyLabels[key] || 'Nothing here yet.';
            c.appendChild(emptyDiv);
        }
    }
};

TodoApp.prototype.createTodoElement = function(todo) {
    var div = document.createElement('div');
    div.className = 'todo-item sk-card' + (todo.completed ? ' is-completed' : '');

    var priorityColors = {
        urgent: 'var(--sk-err, #ff6b6b)',
        high: 'var(--sk-warn, #ffd166)',
        medium: 'var(--sk-accent, #8bd8bd)',
        low: 'var(--sk-ok, #5ee3a1)'
    };

    var priorityIcons = {
        urgent: '⚡',
        high: '🔥',
        medium: '📋',
        low: '💡'
    };

    div.innerHTML = `
        <div class="todo-item-row" style="display: flex; align-items: flex-start; gap: 12px;">
            <input type="checkbox" ${todo.completed ? 'checked' : ''} 
                   onchange="window.todoApp.toggleTodo(${todo.id})"
                   style="margin-top: 2px;">
            <div style="flex: 1; min-width: 0;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span style="color: ${priorityColors[todo.priority]}; font-size: 14px;">
                        ${priorityIcons[todo.priority]}
                    </span>
                    <span class="todo-item-title" style="font-weight: 500; ${todo.completed ? 'text-decoration: line-through;' : ''}">${todo.text}</span>
                </div>
                <div class="todo-item-meta">
                    Created: ${new Date(todo.createdAt).toLocaleDateString()}
                    ${todo.completedAt ? ' • Completed: ' + new Date(todo.completedAt).toLocaleDateString() : ''}
                </div>
            </div>
            <button onclick="window.todoApp.deleteTodo(${todo.id})" class="sk-btn sk-btn-danger"
                    style="padding: 4px 10px; font-size: 14px; line-height: 1;" title="Delete todo" aria-label="Delete todo">×</button>
        </div>
    `;

    return div;
};

TodoApp.prototype.renderGoals = function() {
    var goalsList = document.getElementById('goals-list');
    if (!goalsList) return;

    goalsList.innerHTML = '';

    if (this.goals.length === 0) {
        goalsList.innerHTML = '<div class="sk-empty">No goals yet — add your first long-term goal above.</div>';
        return;
    }

    for (var i = 0; i < this.goals.length; i++) {
        var goal = this.goals[i];
        var goalElement = this.createGoalElement(goal);
        goalsList.appendChild(goalElement);
    }
};

TodoApp.prototype.createGoalElement = function(goal) {
    var div = document.createElement('div');
    div.className = 'goal-item sk-card';

    var subgoalsList = '';
    for (var i = 0; i < goal.subgoals.length; i++) {
        subgoalsList += '<li style="font-size: 13px; margin-bottom: 4px;">' + goal.subgoals[i] + '</li>';
    }

    div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 12px;">
            <h4 style="margin: 0; color: var(--sk-accent, #8bd8bd); font-size: 16px; overflow-wrap: anywhere;">${goal.title}</h4>
            <span class="sk-badge" style="background: var(--sk-bg-inset, #17241f); color: var(--sk-accent, #8bd8bd); border: 1px solid var(--sk-accent, #8bd8bd); flex-shrink: 0;">${goal.status}</span>
        </div>
        <p style="margin: 0 0 12px 0; color: var(--sk-text-faint, #9eb2aa); font-size: 14px; overflow-wrap: anywhere;">${goal.description}</p>
        <div style="margin-bottom: 12px;">
            <strong style="font-size: 13px; color: var(--sk-text, #edf7f2);">Subgoals:</strong>
            <ul style="margin: 8px 0; padding-left: 20px; color: var(--sk-text, #edf7f2);">
                ${subgoalsList}
            </ul>
        </div>
        <div class="todo-item-meta">
            Created: ${new Date(goal.createdAt).toLocaleDateString()} • Priority: ${goal.priority}
        </div>
    `;

    return div;
};

TodoApp.prototype.renderGraph = function() {
    // Placeholder for graph visualization
    console.log('Rendering goal dependency graph...');
};

TodoApp.prototype.toggleTodo = function(id) {
    for (var i = 0; i < this.todos.length; i++) {
        if (this.todos[i].id === id) {
            this.todos[i].completed = !this.todos[i].completed;
            if (this.todos[i].completed) {
                this.todos[i].completedAt = new Date().toISOString();
            } else {
                delete this.todos[i].completedAt;
            }
            break;
        }
    }
    this.saveTodos();
    this.renderTodos();
    this.updateCounts();
};

TodoApp.prototype.deleteTodo = function(id) {
    this.todos = this.todos.filter(function(t) {
        return t.id !== id;
    });
    this.saveTodos();
    this.renderTodos();
    this.updateCounts();
};

TodoApp.prototype.updateCounts = function() {
    var self = this;
    var counts = {
        urgent: 0,
        high: 0,
        medium: 0,
        low: 0,
        completed: 0
    };

    for (var i = 0; i < this.todos.length; i++) {
        var todo = this.todos[i];
        if (todo.completed) {
            counts.completed++;
        } else {
            counts[todo.priority]++;
        }
    }

    // Update count badges
    for (var priority in counts) {
        var badge = document.querySelector('#' + priority + '-todos .count-badge');
        if (badge) {
            badge.textContent = counts[priority];
        }
    }

    // Update status bar
    var totalTodos = document.querySelector('.total-todos');
    var totalGoals = document.querySelector('.total-goals');
    
    if (totalTodos) {
        var activeTodos = this.todos.filter(function(t) { return !t.completed; }).length;
        totalTodos.textContent = activeTodos;
    }
    if (totalGoals) {
        totalGoals.textContent = this.goals.length;
    }
};

TodoApp.prototype.updateLastUpdated = function() {
    var lastUpdated = document.querySelector('.last-updated');
    if (lastUpdated) {
        lastUpdated.textContent = new Date().toLocaleTimeString();
    }
};

// Real local voice input via the browser SpeechRecognition API. Honestly
// local: if the browser exposes no recognizer, the user is told so.
TodoApp.prototype.startVoiceInput = function() {
    var self = this;
    var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
        alert('Voice input is not available: this browser exposes no SpeechRecognition API.');
        return;
    }
    try {
        var recognition = new Recognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.onresult = function(event) {
            var transcript = event.results[0][0].transcript;
            var input = document.querySelector('.new-todo-input');
            if (input) {
                input.value = transcript;
                input.focus();
            }
        };
        recognition.onerror = function(event) {
            alert('Voice input failed: ' + (event.error || 'unknown error'));
        };
        recognition.start();
    } catch (error) {
        alert('Voice input failed: ' + error.message);
    }
};

// Export for module compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TodoApp: TodoApp };
}

// ES6 export for dynamic imports
export { TodoApp };
