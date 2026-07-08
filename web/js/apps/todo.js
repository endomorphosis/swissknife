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
        <div class="todo-app" style="height: 100%; display: flex; flex-direction: column; background: #f8f9fa;">
            <!-- Header -->
            <div class="todo-header" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 2px solid #e9ecef; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                <div class="header-left">
                    <h2 style="margin: 0; font-size: 20px; font-weight: 600;">📋 Todo & Goals</h2>
                    <span style="font-size: 12px; opacity: 0.9;">Plain Text Goal Management</span>
                </div>
                <div class="header-controls">
                    <button class="voice-todo-btn" id="voice-todo-btn" style="margin-right: 8px; padding: 6px 12px; background: rgba(255,255,255,0.2); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🎤 Voice</button>
                    <button class="view-switch-btn" data-view="todos" style="margin-right: 4px; padding: 6px 12px; background: rgba(255,255,255,0.3); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">📝 Todos</button>
                    <button class="view-switch-btn" data-view="goals" style="margin-right: 4px; padding: 6px 12px; background: rgba(255,255,255,0.2); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">🎯 Goals</button>
                    <button class="view-switch-btn" data-view="graph" style="padding: 6px 12px; background: rgba(255,255,255,0.2); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">📊 Graph</button>
                </div>
            </div>

            <!-- Main Content -->
            <div class="todo-main" style="flex: 1; display: flex; height: calc(100% - 70px);">
                <!-- Todos View -->
                <div class="todos-view" id="todos-view" style="width: 100%; display: flex; flex-direction: column;">
                    <!-- Quick Add -->
                    <div class="quick-add" style="padding: 16px; background: white; border-bottom: 1px solid #e9ecef;">
                        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                            <input type="text" class="new-todo-input" placeholder="Add a new todo... (voice commands supported)" style="flex: 1; padding: 10px; border: 2px solid #e9ecef; border-radius: 6px; font-size: 14px;">
                            <select class="todo-priority" style="padding: 10px; border: 2px solid #e9ecef; border-radius: 6px; background: white;">
                                <option value="low">💡 Low</option>
                                <option value="medium" selected>📋 Medium</option>
                                <option value="high">🔥 High</option>
                                <option value="urgent">⚡ Urgent</option>
                            </select>
                            <button class="add-todo-btn" style="padding: 10px 16px; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">Add Todo</button>
                        </div>
                        <div style="font-size: 11px; color: #6c757d;">
                            💡 Voice commands: "Add todo: [task]" | "Mark [task] complete" | "Set [task] priority high"
                        </div>
                    </div>

                    <!-- Todo List -->
                    <div class="todo-list" style="flex: 1; overflow-y: auto; padding: 16px;">
                        <div class="todo-categories">
                            <!-- Urgent Todos -->
                            <div class="todo-category" id="urgent-todos">
                                <h3 style="color: #dc3545; margin: 0 0 12px 0; font-size: 16px; display: flex; align-items: center;">
                                    ⚡ Urgent Tasks
                                    <span class="count-badge" style="margin-left: 8px; background: #dc3545; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px;">0</span>
                                </h3>
                                <div class="todos-container urgent-container"></div>
                            </div>

                            <!-- High Priority Todos -->
                            <div class="todo-category" id="high-todos" style="margin-top: 20px;">
                                <h3 style="color: #fd7e14; margin: 0 0 12px 0; font-size: 16px; display: flex; align-items: center;">
                                    🔥 High Priority
                                    <span class="count-badge" style="margin-left: 8px; background: #fd7e14; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px;">0</span>
                                </h3>
                                <div class="todos-container high-container"></div>
                            </div>

                            <!-- Medium Priority Todos -->
                            <div class="todo-category" id="medium-todos" style="margin-top: 20px;">
                                <h3 style="color: #0d6efd; margin: 0 0 12px 0; font-size: 16px; display: flex; align-items: center;">
                                    📋 Medium Priority  
                                    <span class="count-badge" style="margin-left: 8px; background: #0d6efd; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px;">0</span>
                                </h3>
                                <div class="todos-container medium-container"></div>
                            </div>

                            <!-- Low Priority Todos -->
                            <div class="todo-category" id="low-todos" style="margin-top: 20px;">
                                <h3 style="color: #198754; margin: 0 0 12px 0; font-size: 16px; display: flex; align-items: center;">
                                    💡 Low Priority
                                    <span class="count-badge" style="margin-left: 8px; background: #198754; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px;">0</span>
                                </h3>
                                <div class="todos-container low-container"></div>
                            </div>

                            <!-- Completed Todos -->
                            <div class="todo-category" id="completed-todos" style="margin-top: 20px;">
                                <h3 style="color: #6c757d; margin: 0 0 12px 0; font-size: 16px; display: flex; align-items: center;">
                                    ✅ Completed
                                    <span class="count-badge" style="margin-left: 8px; background: #6c757d; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px;">0</span>
                                </h3>
                                <div class="todos-container completed-container"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Goals View (Hidden by default) -->
                <div class="goals-view" id="goals-view" style="width: 100%; display: none; flex-direction: column;">
                    <div class="goals-content" style="padding: 20px;">
                        <h3>🎯 Long-term Goals & Subgoals</h3>
                        <div class="goal-input" style="margin-bottom: 20px;">
                            <input type="text" class="new-goal-input" placeholder="Add a long-term goal..." style="width: 70%; padding: 12px; border: 2px solid #e9ecef; border-radius: 6px; margin-bottom: 8px;">
                            <button class="add-goal-btn" style="padding: 12px 16px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; margin-left: 8px;">Add Goal</button>
                        </div>
                        <div class="goals-list" id="goals-list"></div>
                    </div>
                </div>

                <!-- Graph View (Hidden by default) -->
                <div class="graph-view" id="graph-view" style="width: 100%; display: none; flex-direction: column;">
                    <div class="graph-content" style="padding: 20px; text-align: center;">
                        <h3>📊 Goal Dependency Graph</h3>
                        <div class="graph-container" style="width: 100%; height: 400px; border: 2px solid #e9ecef; border-radius: 8px; background: white; display: flex; align-items: center; justify-content: center;">
                            <div style="color: #6c757d; text-align: center;">
                                📊 Interactive goal dependency graph will be displayed here
                                <br><br>
                                Shows relationships between goals and subgoals
                                <br><br>
                                <em>Future implementation will use D3.js or similar visualization library</em>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Status Bar -->
            <div class="status-bar" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 16px; background: #495057; color: white; font-size: 12px;">
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
        btns[i].style.background = 'rgba(255,255,255,0.2)';
    }
    var activeBtn = document.querySelector('[data-view="' + view + '"]');
    if (activeBtn) {
        activeBtn.style.background = 'rgba(255,255,255,0.3)';
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
};

TodoApp.prototype.createTodoElement = function(todo) {
    var div = document.createElement('div');
    div.className = 'todo-item';
    div.style.cssText = 'background: white; border: 1px solid #e9ecef; border-radius: 6px; padding: 12px; margin-bottom: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);' + (todo.completed ? ' opacity: 0.7;' : '');

    var priorityColors = {
        urgent: '#dc3545',
        high: '#fd7e14', 
        medium: '#0d6efd',
        low: '#198754'
    };

    var priorityIcons = {
        urgent: '⚡',
        high: '🔥',
        medium: '📋',
        low: '💡'
    };

    div.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 12px;">
            <input type="checkbox" ${todo.completed ? 'checked' : ''} 
                   onchange="window.todoApp.toggleTodo(${todo.id})"
                   style="margin-top: 2px;">
            <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span style="color: ${priorityColors[todo.priority]}; font-size: 14px;">
                        ${priorityIcons[todo.priority]}
                    </span>
                    <span style="font-weight: 500; ${todo.completed ? 'text-decoration: line-through;' : ''}">${todo.text}</span>
                </div>
                <div style="font-size: 11px; color: #6c757d;">
                    Created: ${new Date(todo.createdAt).toLocaleDateString()}
                    ${todo.completedAt ? ' • Completed: ' + new Date(todo.completedAt).toLocaleDateString() : ''}
                </div>
            </div>
            <button onclick="window.todoApp.deleteTodo(${todo.id})" 
                    style="background: none; border: none; color: #dc3545; cursor: pointer; padding: 4px;">×</button>
        </div>
    `;

    return div;
};

TodoApp.prototype.renderGoals = function() {
    var goalsList = document.getElementById('goals-list');
    if (!goalsList) return;

    goalsList.innerHTML = '';

    for (var i = 0; i < this.goals.length; i++) {
        var goal = this.goals[i];
        var goalElement = this.createGoalElement(goal);
        goalsList.appendChild(goalElement);
    }
};

TodoApp.prototype.createGoalElement = function(goal) {
    var div = document.createElement('div');
    div.className = 'goal-item';
    div.style.cssText = 'background: white; border: 2px solid #667eea; border-radius: 8px; padding: 16px; margin-bottom: 16px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);';

    var subgoalsList = '';
    for (var i = 0; i < goal.subgoals.length; i++) {
        subgoalsList += '<li style="font-size: 13px; margin-bottom: 4px;">' + goal.subgoals[i] + '</li>';
    }

    div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
            <h4 style="margin: 0; color: #667eea; font-size: 16px;">${goal.title}</h4>
            <span style="background: #667eea; color: white; padding: 4px 8px; border-radius: 12px; font-size: 11px;">${goal.status}</span>
        </div>
        <p style="margin: 0 0 12px 0; color: #6c757d; font-size: 14px;">${goal.description}</p>
        <div style="margin-bottom: 12px;">
            <strong style="font-size: 13px; color: #495057;">Subgoals:</strong>
            <ul style="margin: 8px 0; padding-left: 20px;">
                ${subgoalsList}
            </ul>
        </div>
        <div style="font-size: 11px; color: #6c757d;">
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

// Export for module compatibility
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TodoApp: TodoApp };
}

// ES6 export for dynamic imports
export { TodoApp };