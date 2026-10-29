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
                grid-template-columns: minmax(0, 1fr) minmax(0, max-content) minmax(0, max-content) max-content;
                align-items: center;
            }
            .todo-app .todo-main,
            .todo-app .todos-view,
            .todo-app .goals-view,
            .todo-app .graph-view,
            .todo-app .todo-list,
            .todo-app .goals-content,
            .todo-app .graph-content {
                min-height: 0;
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
            .todo-app button:focus-visible,
            .todo-app input:focus-visible,
            .todo-app select:focus-visible {
                outline: 2px solid var(--sk-accent, #8bd8bd);
                outline-offset: 2px;
            }
            .todo-app .todo-error {
                margin-top: 8px;
                color: var(--sk-err, #ff6b6b);
                font-size: 13px;
            }
            .todo-app .todo-item-actions {
                display: flex;
                flex-shrink: 0;
                gap: 4px;
            }
            @media (max-width: 900px) {
                .todo-app .quick-add-row {
                    grid-template-columns: minmax(0, 1fr);
                }
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
            <div class="todo-main" style="flex: 1; display: flex; min-height: 0; overflow: hidden;">
                <!-- Todos View -->
                <div class="todos-view" id="todos-view" style="width: 100%; display: flex; flex-direction: column;">
                    <!-- Quick Add -->
                    <div class="quick-add" style="padding: 16px; background: var(--sk-bg-panel, #101b18); border-bottom: 1px solid var(--sk-border, #263a34);">
                        <div class="quick-add-row" style="display: flex; gap: 8px; margin-bottom: 8px;">
                            <input type="text" class="new-todo-input sk-input" aria-label="New todo title" placeholder="Add a todo" style="flex: 1;">
                            <select class="todo-priority sk-select" aria-label="Priority">
                                <option value="low">💡 Low</option>
                                <option value="medium" selected>📋 Medium</option>
                                <option value="high">🔥 High</option>
                                <option value="urgent">⚡ Urgent</option>
                            </select>
                            <select class="todo-depends sk-select" aria-label="Depends on">
                                <option value="">No dependency</option>
                            </select>
                            <button type="button" class="add-todo-btn sk-btn sk-btn-primary">Add Todo</button>
                        </div>
                        <div class="voice-hint">
                            💡 Voice commands: "Add todo: [task]" | "Mark [task] complete" | "Set [task] priority high"
                        </div>
                        <div class="todo-error" role="alert" hidden></div>
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
    var previousTodos = this.todos || [];
    var previousGoals = this.goals || [];
    try {
        var savedTodos = localStorage.getItem('swissknife-todos');
        var savedGoals = localStorage.getItem('swissknife-goals');

        this.todos = savedTodos ? JSON.parse(savedTodos) : (previousTodos.length ? previousTodos : this.getDefaultTodos());
        this.goals = savedGoals ? JSON.parse(savedGoals) : (previousGoals.length ? previousGoals : this.getDefaultGoals());
        this._storageError = '';
    } catch (error) {
        console.error('Failed to load todos:', error);
        this.todos = previousTodos.length ? previousTodos : this.getDefaultTodos();
        this.goals = previousGoals.length ? previousGoals : this.getDefaultGoals();
        this._storageError = 'Local storage is unavailable. Existing tasks were kept.';
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
    var dependsSelect = contentElement.querySelector('.todo-depends');

    var addTodoHandler = function() {
        var text = todoInput.value.trim();
        var priority = prioritySelect.value;
        var dependsOnTitle = dependsSelect ? dependsSelect.value : '';

        if (!text) {
            self.showError('Title is empty. Existing tasks were kept.');
            return;
        }
        if (self.addTodo(text, priority, dependsOnTitle)) {
            todoInput.value = '';
            prioritySelect.value = 'medium';
            if (dependsSelect) dependsSelect.value = '';
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
    if (this._storageError) this.showError(this._storageError);
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

TodoApp.prototype.addTodo = function(text, priority, dependsOnTitle) {
    var trimmed = (text || '').trim();
    if (!trimmed) {
        this.showError('Title is empty. Existing tasks were kept.');
        return false;
    }
    var dependsOnId = null;
    if (dependsOnTitle) {
        var dep = this.findTodoByTitle(dependsOnTitle);
        if (dep) dependsOnId = dep.id;
    }
    var snapshot = JSON.stringify(this.todos);
    this.todos.push({
        id: this.nextTodoId(),
        text: trimmed,
        priority: priority || 'medium',
        completed: false,
        createdAt: new Date().toISOString(),
        tags: [],
        dependsOnId: dependsOnId
    });
    if (!this.saveTodos()) {
        this.todos = JSON.parse(snapshot);
        this.showError(this._storageError || 'Local storage is unavailable. Existing tasks were kept.');
        this.renderTodos();
        this.updateCounts();
        return false;
    }
    this.clearError();
    this.renderTodos();
    this.updateCounts();
    return true;
};

TodoApp.prototype.saveTodos = function() {
    var hadTodos = false;
    var hadGoals = false;
    var previousTodos = null;
    var previousGoals = null;
    var stage = 'read';
    try {
        previousTodos = localStorage.getItem('swissknife-todos');
        previousGoals = localStorage.getItem('swissknife-goals');
        hadTodos = previousTodos !== null;
        hadGoals = previousGoals !== null;
        stage = 'write-todos';
        localStorage.setItem('swissknife-todos', JSON.stringify(this.todos));
        stage = 'write-goals';
        localStorage.setItem('swissknife-goals', JSON.stringify(this.goals));
        this._storageError = '';
        this.updateLastUpdated();
        return true;
    } catch (error) {
        if (stage === 'write-goals') {
            try {
                if (hadTodos) localStorage.setItem('swissknife-todos', previousTodos);
                else localStorage.removeItem('swissknife-todos');
            } catch (restoreError) {
                console.error('Failed to restore todos:', restoreError);
            }
        }
        this._storageError = 'Local storage is unavailable. Existing tasks were kept.';
        console.error('Failed to save todos:', error);
        return false;
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

    var anyVisible = false;
    for (var key in containers) {
        var c = containers[key];
        if (!c) continue;
        var category = c.parentElement;
        if (c.children.length === 0) {
            if (category) category.hidden = true;
        } else {
            anyVisible = true;
            if (category) category.hidden = false;
        }
    }
    var list = document.querySelector('.todo-categories');
    var staleEmpty = list ? list.querySelector('.todo-empty-all') : null;
    if (!anyVisible && list) {
        if (!staleEmpty) {
            var emptyAll = document.createElement('div');
            emptyAll.className = 'sk-empty todo-empty-all';
            emptyAll.textContent = 'No todos yet.';
            list.appendChild(emptyAll);
        }
    } else if (staleEmpty) {
        staleEmpty.remove();
    }
    this.renderDependsOptions();
};

TodoApp.prototype.createTodoElement = function(todo) {
    var div = document.createElement('div');
    div.className = 'todo-item sk-card' + (todo.completed ? ' is-completed' : '');
    div.setAttribute('data-todo-id', String(todo.id));
    div.setAttribute('data-todo-title', todo.text);

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
    var safeText = this.escapeHtml(todo.text);

    div.innerHTML = `
        <div class="todo-item-row" style="display: flex; align-items: flex-start; gap: 12px;">
            <input type="checkbox" class="todo-complete" ${todo.completed ? 'checked' : ''}
                   aria-label="Mark ${safeText} complete"
                   onchange="window.todoApp.toggleTodo(${todo.id})"
                   style="margin-top: 2px;">
            <div style="flex: 1; min-width: 0;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span style="color: ${priorityColors[todo.priority]}; font-size: 14px;">
                        ${priorityIcons[todo.priority]}
                    </span>
                    <span class="todo-item-title" style="font-weight: 500; ${todo.completed ? 'text-decoration: line-through;' : ''}">${safeText}</span>
                </div>
                <div class="todo-dependency">${this.escapeHtml(this.dependencyText(todo))}</div>
                <div class="todo-item-meta">
                    Created: ${new Date(todo.createdAt).toLocaleDateString()}
                    ${todo.completedAt ? ' • Completed: ' + new Date(todo.completedAt).toLocaleDateString() : ''}
                </div>
            </div>
            <div class="todo-item-actions">
                <button type="button" class="todo-edit-btn sk-btn" onclick="window.todoApp.beginEdit(${todo.id})"
                        aria-label="Edit ${safeText}">Edit</button>
                <button type="button" onclick="window.todoApp.deleteTodo(${todo.id})" class="sk-btn sk-btn-danger"
                        style="padding: 4px 10px; font-size: 14px; line-height: 1;" title="Delete ${safeText}" aria-label="Delete ${safeText}">×</button>
            </div>
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
    var snapshot = JSON.stringify(this.todos);
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
    if (!this.saveTodos()) {
        this.todos = JSON.parse(snapshot);
        this.showError(this._storageError || 'Local storage is unavailable. Existing tasks were kept.');
    } else {
        this.clearError();
    }
    this.renderTodos();
    this.updateCounts();
};

TodoApp.prototype.deleteTodo = function(id) {
    var snapshot = JSON.stringify(this.todos);
    this.todos = this.todos.filter(function(t) {
        return t.id !== id;
    });
    if (!this.saveTodos()) {
        this.todos = JSON.parse(snapshot);
        this.showError(this._storageError || 'Local storage is unavailable. Existing tasks were kept.');
    } else {
        this.clearError();
    }
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

TodoApp.prototype.nextTodoId = function() {
    var maxId = 0;
    for (var i = 0; i < this.todos.length; i++) {
        var id = this.todos[i].id;
        if (typeof id === 'number' && id > maxId) maxId = id;
    }
    return maxId + 1;
};

TodoApp.prototype.findTodoByTitle = function(title) {
    for (var i = 0; i < this.todos.length; i++) {
        if (this.todos[i].text === title) return this.todos[i];
    }
    return null;
};

TodoApp.prototype.dependencyText = function(todo) {
    if (!todo.dependsOnId) {
        return 'No dependency. Stored in this browser only.';
    }
    var dep = null;
    for (var i = 0; i < this.todos.length; i++) {
        if (this.todos[i].id === todo.dependsOnId) dep = this.todos[i];
    }
    if (!dep) {
        return 'Dependency id ' + todo.dependsOnId + ' is missing. Stored in this browser only.';
    }
    var state = dep.completed ? 'completed' : 'open';
    return 'Depends on ' + dep.text + ' (id ' + dep.id + ', ' + state + '). This task is id ' + todo.id + '. Stored in this browser only.';
};

TodoApp.prototype.escapeHtml = function(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
};

TodoApp.prototype.renderDependsOptions = function() {
    var select = document.querySelector('.todo-depends');
    if (!select) return;
    var current = select.value;
    while (select.firstChild) select.removeChild(select.firstChild);
    var none = document.createElement('option');
    none.value = '';
    none.textContent = 'No dependency';
    select.appendChild(none);
    for (var i = 0; i < this.todos.length; i++) {
        var opt = document.createElement('option');
        opt.value = this.todos[i].text;
        opt.textContent = this.todos[i].text;
        select.appendChild(opt);
    }
    if (current) select.value = current;
};

TodoApp.prototype.showError = function(message) {
    var el = document.querySelector('.todo-error');
    if (!el) return;
    el.hidden = false;
    el.textContent = message;
};

TodoApp.prototype.clearError = function() {
    var el = document.querySelector('.todo-error');
    if (!el) return;
    el.hidden = true;
    el.textContent = '';
};

TodoApp.prototype.beginEdit = function(id) {
    var self = this;
    var row = document.querySelector('[data-todo-id="' + id + '"]');
    if (!row || row.querySelector('.todo-edit-input')) return;
    var titleEl = row.querySelector('.todo-item-title');
    if (!titleEl) return;
    var current = titleEl.textContent;
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'todo-edit-input sk-input';
    input.value = current;
    input.setAttribute('aria-label', 'Edit title for ' + current);
    titleEl.replaceWith(input);
    input.focus();
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            self.commitEdit(id, input.value);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            self.renderTodos();
        }
    });
};

TodoApp.prototype.commitEdit = function(id, raw) {
    var text = (raw || '').trim();
    if (!text) {
        this.showError('Title is empty. Existing tasks were kept.');
        this.renderTodos();
        return;
    }
    var snapshot = JSON.stringify(this.todos);
    var found = false;
    for (var i = 0; i < this.todos.length; i++) {
        if (this.todos[i].id === id) {
            this.todos[i].text = text;
            found = true;
            break;
        }
    }
    if (!found) return;
    if (!this.saveTodos()) {
        this.todos = JSON.parse(snapshot);
        this.showError(this._storageError || 'Local storage is unavailable. Existing tasks were kept.');
    } else {
        this.clearError();
    }
    this.renderTodos();
    this.updateCounts();
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
