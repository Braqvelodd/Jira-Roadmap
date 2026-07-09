// Safe localStorage helper to prevent DOM Exception 18 security crashes in JavaFX WebView
function safeGetLocalStorage(key, defaultValue) {
    try {
        return localStorage.getItem(key) || defaultValue;
    } catch (e) {
        return defaultValue;
    }
}

function safeSetLocalStorage(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        // Fallback silently if sandboxed
    }
}

// ==========================================================================
// State Management
// ==========================================================================
let state = {
    settings: {},
    roadmapData: [],
    zoomLevel: 'months', // weeks | months | quarters
    prioritizeRed: false,
    collapsedEpics: new Set(),
    timelineStart: new Date(),
    timelineEnd: new Date(),
    activeStatusIssueId: null,
    visibleColumns: ['statusName', 'fixVersions'], // Optional fields (Health is permanent now!)
    isPanelSnapped: true, // Tracks if left panel is snapped to max columns width
    columnWidths: {
        epicIssue: 250,
        healthStatus: 110,
        statusName: 100,
        priority: 85,
        assignee: 120,
        fixVersions: 110,
        startDate: 95,
        endDate: 95
    },
    filters: {
        epicIssue: '',
        statusName: '',
        priority: '',
        assignee: '',
        fixVersions: '',
        startDate: '',
        endDate: '',
        healthStatus: ''
    }
};

// Epic Bar Colors Palette (light & dark map)
const epicColors = [
    'var(--epic-bar-1)',
    'var(--epic-bar-2)',
    'var(--epic-bar-3)',
    'var(--epic-bar-4)',
    'var(--epic-bar-5)'
];

function updateHeaderGroupWidths() {
    // Group Epic/Issue
    const gEpic = document.querySelector('.group-epic-issue');
    if (gEpic) {
        gEpic.style.width = state.columnWidths.epicIssue + 'px';
        gEpic.style.minWidth = state.columnWidths.epicIssue + 'px';
        gEpic.style.maxWidth = state.columnWidths.epicIssue + 'px';
    }
    // Group Health
    const gHealth = document.querySelector('.group-healthStatus');
    if (gHealth) {
        gHealth.style.width = state.columnWidths.healthStatus + 'px';
        gHealth.style.minWidth = state.columnWidths.healthStatus + 'px';
        gHealth.style.maxWidth = state.columnWidths.healthStatus + 'px';
    }
    // Group Fields (sum of all visible fields)
    const gFields = document.querySelector('.group-fields');
    if (gFields) {
        let totalWidth = 0;
        state.visibleColumns.forEach(col => {
            totalWidth += state.columnWidths[col] || 100;
        });
        gFields.style.width = totalWidth + 'px';
        gFields.style.minWidth = totalWidth + 'px';
        gFields.style.maxWidth = totalWidth + 'px';
        
        // Hide the fields group header if no fields are visible!
        gFields.style.display = totalWidth > 0 ? 'flex' : 'none';
    }
}

function syncPanelWidth() {
    const panel = document.getElementById('issues-panel');
    if (!panel) return;
    
    let maxAllowed = (state.columnWidths.epicIssue || 250) + (state.columnWidths.healthStatus || 110);
    state.visibleColumns.forEach(col => {
        maxAllowed += state.columnWidths[col] || 100;
    });
    
    if (state.isPanelSnapped) {
        panel.style.width = maxAllowed + 'px';
        panel.style.minWidth = maxAllowed + 'px';
        panel.style.maxWidth = maxAllowed + 'px';
    } else {
        const currentWidth = panel.getBoundingClientRect().width;
        const newWidth = Math.min(currentWidth, maxAllowed);
        panel.style.width = newWidth + 'px';
        panel.style.minWidth = newWidth + 'px';
        panel.style.maxWidth = newWidth + 'px';
        
        if (newWidth >= maxAllowed) {
            state.isPanelSnapped = true;
        }
    }
}

function initColumnResizing() {
    let startX = 0;
    let startWidth = 0;
    let activeCol = null;
    let affectedCells = [];

    document.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('col-resizer')) {
            activeCol = e.target.dataset.column;
            startX = e.clientX;
            startWidth = state.columnWidths[activeCol] || 100;
            
            // Get all cells in this column to resize them live
            affectedCells = Array.from(document.querySelectorAll(`.cell-${activeCol}`));
            
            document.body.classList.add('resizing-active');
            e.target.classList.add('resizing');
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            e.preventDefault();
        }
    });

    function handleMouseMove(e) {
        if (!activeCol) return;
        const deltaX = e.clientX - startX;
        let newWidth = Math.max(50, startWidth + deltaX); // Min width 50px
        
        // Update state
        state.columnWidths[activeCol] = newWidth;
        
        // Resize affected cells live
        affectedCells.forEach(cell => {
            cell.style.width = newWidth + 'px';
            cell.style.minWidth = newWidth + 'px';
            cell.style.maxWidth = newWidth + 'px';
        });
        
        updateHeaderGroupWidths();
        syncPanelWidth(); // Keep panel size synchronized
    }

    function handleMouseUp() {
        document.body.classList.remove('resizing-active');
        const activeResizer = document.querySelector('.col-resizer.resizing');
        if (activeResizer) {
            activeResizer.classList.remove('resizing');
        }
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        activeCol = null;
        affectedCells = [];
    }

    // 2. Issues Panel Resizer (resizes the panel width independently of columns)
    const panelResizer = document.getElementById('issues-panel-resizer');
    const panel = document.getElementById('issues-panel');
    if (panelResizer && panel) {
        let pStartX = 0;
        let pStartWidth = 0;

        panelResizer.addEventListener('mousedown', (e) => {
            pStartX = e.clientX;
            pStartWidth = panel.getBoundingClientRect().width;
            
            document.body.classList.add('resizing-active');
            panelResizer.classList.add('resizing');
            
            const handlePanelMouseMove = (moveEvent) => {
                const deltaX = moveEvent.clientX - pStartX;
                
                // Calculate max allowed width (sum of all columns)
                let maxAllowed = (state.columnWidths.epicIssue || 250) + (state.columnWidths.healthStatus || 110);
                state.visibleColumns.forEach(col => {
                    maxAllowed += state.columnWidths[col] || 100;
                });

                let newWidth = pStartWidth + deltaX;
                
                if (newWidth >= maxAllowed) {
                    newWidth = maxAllowed;
                    state.isPanelSnapped = true;
                } else {
                    state.isPanelSnapped = false;
                }
                
                // Allow shrinking all the way down to 180px for maximum roadmap size
                newWidth = Math.max(180, newWidth);
                
                panel.style.width = newWidth + 'px';
                panel.style.minWidth = newWidth + 'px';
                panel.style.maxWidth = newWidth + 'px';
            };

            const handlePanelMouseUp = () => {
                document.body.classList.remove('resizing-active');
                panelResizer.classList.remove('resizing');
                document.removeEventListener('mousemove', handlePanelMouseMove);
                document.removeEventListener('mouseup', handlePanelMouseUp);
            };

            document.addEventListener('mousemove', handlePanelMouseMove);
            document.addEventListener('mouseup', handlePanelMouseUp);
            e.preventDefault();
        });
    }
}

// ==========================================================================
// Initialization & Listeners
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Check local storage for theme preference
    const savedTheme = safeGetLocalStorage('jira-roadmap-theme', 'light');
    setTheme(savedTheme);

    // Bind UI controls
    document.getElementById('btn-refresh').addEventListener('click', reloadData);
    document.getElementById('btn-theme').addEventListener('click', toggleTheme);
    document.getElementById('btn-sort-red').addEventListener('click', togglePrioritizeRed);
    
    // Bind enter key on JQL and URL settings inputs
    document.getElementById('url-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            reloadData();
        }
    });
    document.getElementById('jql-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            reloadData();
        }
    });
    
    // Zoom control listeners
    document.querySelectorAll('#zoom-controls .btn-zoom').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#zoom-controls .btn-zoom').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            state.zoomLevel = e.currentTarget.dataset.zoom;
            renderTimeline();
        });
    });

    // Close popovers on click outside
    document.addEventListener('click', (e) => {
        const statusPopover = document.getElementById('status-popover');
        if (!e.target.closest('.health-badge') && !e.target.closest('.status-popover')) {
            statusPopover.style.display = 'none';
            state.activeStatusIssueId = null;
        }

        const fieldsPopover = document.getElementById('fields-popover');
        if (!e.target.closest('#btn-fields-inline') && !e.target.closest('.fields-popover')) {
            fieldsPopover.style.display = 'none';
        }
    });

    // Bind checkbox items inside fields-popover
    document.querySelectorAll('.fields-popover input[type="checkbox"]').forEach(cb => {
        const colName = cb.dataset.column;
        cb.checked = state.visibleColumns.includes(colName);

        cb.addEventListener('change', () => {
            const visible = [];
            document.querySelectorAll('.fields-popover input[type="checkbox"]').forEach(c => {
                if (c.checked) {
                    visible.push(c.dataset.column);
                }
            });
            state.visibleColumns = visible;
            renderTimeline();
        });
    });

    // Handle status popover items click
    document.querySelectorAll('.popover-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const newStatus = e.currentTarget.dataset.status;
            if (state.activeStatusIssueId) {
                updateStatusInJira(state.activeStatusIssueId, newStatus);
            }
            document.getElementById('status-popover').style.display = 'none';
        });
    });

    // Synchronize vertical scrolling between issues panel and timeline panel
    const issuesContainer = document.getElementById('issues-list-container');
    const timelinePanel = document.getElementById('timeline-panel');
    const gridContainer = document.getElementById('timeline-grid-container');

    timelinePanel.addEventListener('scroll', () => {
        // Keep left panel scroll position aligned with the right panel vertical scroll
        issuesContainer.scrollTop = timelinePanel.scrollTop;
    });

    // Initialize live column resizing drag handlers
    initColumnResizing();

    // Bootstrap backend details
    bootstrapApp();
});

function toggleFields(e) {
    if (e) e.stopPropagation();
    const popover = document.getElementById('fields-popover');
    const isHidden = popover.style.display === 'none';
    popover.style.display = isHidden ? 'flex' : 'none';
    if (isHidden && e) {
        const trigger = e.currentTarget;
        const rect = trigger.getBoundingClientRect();
        popover.style.top = `${rect.bottom + window.scrollY + 6}px`;
        popover.style.left = `${rect.left + window.scrollX - 60}px`;
    }
}

function showLoader(text) {
    document.getElementById('loader-text').innerText = text || 'Loading...';
    document.getElementById('loader-overlay').style.display = 'flex';
    document.getElementById('btn-refresh').querySelector('.icon-refresh').classList.add('spinning');
}

function hideLoader() {
    document.getElementById('loader-overlay').style.display = 'none';
    document.getElementById('btn-refresh').querySelector('.icon-refresh').classList.remove('spinning');
}

// ==========================================================================
// Backend Integrations (JS-to-Java)
// ==========================================================================
function bootstrapApp() {
    showLoader('Bootstrapping Settings...');
    if (typeof window.backend !== 'undefined') {
        try {
            // Load settings
            const settingsJson = window.backend.getSettings();
            state.settings = JSON.parse(settingsJson);
            
            // Set URL and JQL input values
            document.getElementById('url-input').value = state.settings.jiraUrl || '';
            document.getElementById('jql-input').value = state.settings.jql || '';

            // Load local mock data immediately on start to support offline UI testing
            state.roadmapData = getMockRoadmapData();
            renderTimeline();
            hideLoader();
            showToast('Settings loaded. Click Refresh to query Jira.', 'success');
        } catch (e) {
            showToast('Error bootstrapping settings: ' + e, 'error');
            hideLoader();
        }
    } else {
        // Mock data for debugging if loaded outside JavaFX container
        console.log("Running in browser mockup mode");
        state.settings = {
            jiraUrl: "https://jira.mock.com",
            jql: "project = MOCK JQL",
            epicLinkField: "customfield_10014",
            startDateField: "customfield_10015",
            endDateField: "duedate"
        };
        document.getElementById('url-input').value = state.settings.jiraUrl;
        document.getElementById('jql-input').value = state.settings.jql;
        state.roadmapData = getMockRoadmapData();
        renderTimeline();
        hideLoader();
    }
}

function reloadData() {
    const newUrl = document.getElementById('url-input').value.trim();
    const newJql = document.getElementById('jql-input').value.trim();
    
    showLoader('Fetching roadmap data...');
    if (typeof window.backend !== 'undefined') {
        try {
            // Update the settings configuration on the backend
            window.backend.updateSettings(newUrl, newJql);
            state.settings.jiraUrl = newUrl;
            state.settings.jql = newJql;

            // Trigger non-blocking asynchronous fetch
            window.backend.fetchRoadmapData();
        } catch (e) {
            showToast('Failed to trigger update: ' + e, 'error');
            hideLoader();
        }
    } else {
        state.settings.jiraUrl = newUrl;
        state.settings.jql = newJql;
        setTimeout(() => {
            renderTimeline();
            hideLoader();
            showToast('Mock roadmap data reloaded', 'success');
        }, 800);
    }
}

// Global asynchronous callback hooks called by the Java Controller background thread
window.onRoadmapDataLoaded = function(dataJson) {
    hideLoader();
    try {
        const parsed = JSON.parse(dataJson);
        if (parsed.success === false) {
            showToast('Jira API Error: ' + parsed.error, 'error');
        } else {
            state.roadmapData = parsed;
            renderTimeline();
            showToast('Roadmap sync completed successfully', 'success');
        }
    } catch (e) {
        showToast('Failed to parse data: ' + e, 'error');
    }
};

window.onRoadmapDataError = function(errorMessage) {
    hideLoader();
    showToast('Connection failed: ' + errorMessage, 'error');
};

function updateStatusInJira(issueId, newStatus) {
    showLoader(`Updating status for ${issueId}...`);
    if (typeof window.backend !== 'undefined') {
        try {
            // Trigger non-blocking asynchronous status update
            window.backend.updateIssueStatus(issueId, newStatus);
        } catch (e) {
            showToast('Failed to request status change: ' + e, 'error');
            hideLoader();
        }
    } else {
        // Mock success in browser testing
        setTimeout(() => {
            updateLocalStatus(issueId, newStatus);
            hideLoader();
            showToast(`[Mock] Status updated for ${issueId} to ${newStatus}`, 'success');
        }, 500);
    }
}

// Global asynchronous callback hook for status updates called by the Java Controller background thread
window.onStatusUpdated = function(responseJson) {
    hideLoader();
    try {
        const response = JSON.parse(responseJson);
        if (response.success) {
            updateLocalStatus(response.issueId, response.healthStatus);
            showToast(`Status updated successfully for ${response.issueId}`, 'success');
        } else {
            showToast(`Failed to update status: ${response.error}`, 'error');
        }
    } catch (e) {
        showToast('Error parsing status response: ' + e, 'error');
    }
}

function updateLocalStatus(issueId, newStatus) {
    for (let epic of state.roadmapData) {
        if (epic.key === issueId) {
            epic.healthStatus = newStatus;
            break;
        }
        if (epic.childIssues) {
            for (let child of epic.childIssues) {
                if (child.key === issueId) {
                    child.healthStatus = newStatus;
                    break;
                }
            }
        }
    }
    renderTimeline();
}

// ==========================================================================
// Date Range & Timeline Mathematics
// ==========================================================================
function calculateTimelineBounds() {
    let minDate = null;
    let maxDate = null;

    // Helper to compare dates
    const checkDate = (dateStr) => {
        if (!dateStr) return;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return;
        if (!minDate || d < minDate) minDate = d;
        if (!maxDate || d > maxDate) maxDate = d;
    };

    state.roadmapData.forEach(epic => {
        checkDate(epic.startDate);
        checkDate(epic.endDate);
        if (epic.childIssues) {
            epic.childIssues.forEach(child => {
                checkDate(child.startDate);
                checkDate(child.endDate);
            });
        }
    });

    // Default fallbacks if no dates found
    if (!minDate || !maxDate) {
        minDate = new Date();
        minDate.setMonth(minDate.getMonth() - 2);
        maxDate = new Date();
        maxDate.setMonth(maxDate.getMonth() + 6);
    } else {
        // Buffer of 1 month before min date and 2 months after max date
        minDate.setMonth(minDate.getMonth() - 1);
        maxDate.setMonth(maxDate.getMonth() + 2);
    }

    // Align bounds to start of month and end of month
    state.timelineStart = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    state.timelineEnd = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);
}

// Get column width based on zoom level
function getColWidth() {
    switch (state.zoomLevel) {
        case 'weeks': return 80;
        case 'months': return 120;
        case 'quarters': return 240;
        default: return 120;
    }
}

// ==========================================================================
// UI Rendering Engines
// ==========================================================================
function matchIssue(issue, filters) {
    for (const [key, value] of Object.entries(filters)) {
        if (!value) continue;
        
        if (key === 'epicIssue') {
            const keyMatch = (issue.key || '').toLowerCase().includes(value);
            const summaryMatch = (issue.summary || '').toLowerCase().includes(value);
            if (!keyMatch && !summaryMatch) return false;
        } else {
            const val = String(issue[key] || '').toLowerCase();
            if (!val.includes(value)) return false;
        }
    }
    return true;
}

function renderHeadersRow() {
    const headerContainer = document.getElementById('issues-panel-header');
    headerContainer.innerHTML = '';
    
    // Create Row 1: Group Headers
    const groupRow = document.createElement('div');
    groupRow.className = 'header-group-row';
    
    // Group 1: Epic / Issue
    const gEpic = document.createElement('div');
    gEpic.className = 'header-cell group-epic-issue';
    gEpic.innerText = 'Epic / Issue';
    groupRow.appendChild(gEpic);
    
    // Group 2: Health Status
    const gHealth = document.createElement('div');
    gHealth.className = 'header-cell group-healthStatus';
    gHealth.innerText = 'Health Status';
    groupRow.appendChild(gHealth);
    
    // Group 3: Grouped Fields (Status, Priority, Assignee, Fix Version, Dates, etc.)
    const gFields = document.createElement('div');
    gFields.className = 'header-cell group-fields';
    gFields.innerHTML = `
        <span>Fields</span>
        <button id="btn-fields-inline" class="dots-btn" title="Toggle Visible Columns/Fields">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <circle cx="12" cy="7" r="2.5"/>
                <circle cx="12" cy="17" r="2.5"/>
            </svg>
        </button>
    `;
    groupRow.appendChild(gFields);
    headerContainer.appendChild(groupRow);
    
    // Create Row 2: Sub-headers (Filter row)
    const subRow = document.createElement('div');
    subRow.className = 'header-sub-row';
    
    // Sub-header 1: Epic / Issue search input
    const subEpic = document.createElement('div');
    subEpic.className = 'header-cell cell-epic-issue';
    subEpic.innerHTML = `
        <input type="text" class="col-filter-input" data-filter="epicIssue" placeholder="Search..." value="${state.filters.epicIssue || ''}">
        <div class="col-resizer" data-column="epicIssue"></div>
    `;
    subRow.appendChild(subEpic);
    
    // Sub-header 2: Health Status filter dropdown
    const subHealth = document.createElement('div');
    subHealth.className = 'header-cell cell-healthStatus';
    subHealth.innerHTML = `
        <input type="text" class="col-filter-input" data-filter="healthStatus" placeholder="Filter..." value="${state.filters.healthStatus || ''}">
        <div class="col-resizer" data-column="healthStatus"></div>
    `;
    subRow.appendChild(subHealth);
    
    // Sub-headers 3+: Grouped Fields
    const columnMeta = {
        statusName: 'Status',
        priority: 'Priority',
        assignee: 'Assignee',
        fixVersions: 'Fix Version',
        startDate: 'Start Date',
        endDate: 'Due Date'
    };
    
    state.visibleColumns.forEach(col => {
        const label = columnMeta[col] || col;
        const colHeader = document.createElement('div');
        colHeader.className = `header-cell cell-${col}`;
        colHeader.innerHTML = `
            <input type="text" class="col-filter-input" data-filter="${col}" placeholder="${label}..." value="${state.filters[col] || ''}">
            <div class="col-resizer" data-column="${col}"></div>
        `;
        subRow.appendChild(colHeader);
    });
    headerContainer.appendChild(subRow);
    
    // Apply styling widths to all header cells
    gEpic.style.width = state.columnWidths.epicIssue + 'px';
    gEpic.style.minWidth = state.columnWidths.epicIssue + 'px';
    gEpic.style.maxWidth = state.columnWidths.epicIssue + 'px';
    subEpic.style.width = state.columnWidths.epicIssue + 'px';
    subEpic.style.minWidth = state.columnWidths.epicIssue + 'px';
    subEpic.style.maxWidth = state.columnWidths.epicIssue + 'px';
    
    gHealth.style.width = state.columnWidths.healthStatus + 'px';
    gHealth.style.minWidth = state.columnWidths.healthStatus + 'px';
    gHealth.style.maxWidth = state.columnWidths.healthStatus + 'px';
    subHealth.style.width = state.columnWidths.healthStatus + 'px';
    subHealth.style.minWidth = state.columnWidths.healthStatus + 'px';
    subHealth.style.maxWidth = state.columnWidths.healthStatus + 'px';
    
    let totalFieldsWidth = 0;
    state.visibleColumns.forEach(col => {
        const width = state.columnWidths[col] || 100;
        totalFieldsWidth += width;
        const subCol = subRow.querySelector(`.cell-${col}`);
        if (subCol) {
            subCol.style.width = width + 'px';
            subCol.style.minWidth = width + 'px';
            subCol.style.maxWidth = width + 'px';
        }
    });
    
    gFields.style.width = totalFieldsWidth + 'px';
    gFields.style.minWidth = totalFieldsWidth + 'px';
    gFields.style.maxWidth = totalFieldsWidth + 'px';
    gFields.style.display = totalFieldsWidth > 0 ? 'flex' : 'none';
    
    // Bind click listener for inline "+ Add Field" button
    const inlineAddBtn = gFields.querySelector('#btn-fields-inline');
    if (inlineAddBtn) {
        inlineAddBtn.addEventListener('click', toggleFields);
    }
    
    // Bind filter input listeners
    subRow.querySelectorAll('.col-filter-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const filterType = e.currentTarget.dataset.filter;
            state.filters[filterType] = e.currentTarget.value.trim().toLowerCase();
            renderTimeline();
            
            // Retain focus on the input after re-rendering
            const activeId = e.currentTarget.dataset.filter;
            setTimeout(() => {
                const refreshedInput = document.querySelector(`.col-filter-input[data-filter="${activeId}"]`);
                if (refreshedInput) {
                    refreshedInput.focus();
                    // Set cursor to the end
                    const val = refreshedInput.value;
                    refreshedInput.value = '';
                    refreshedInput.value = val;
                }
            }, 10);
        });
    });
}

function renderTimeline() {
    calculateTimelineBounds();
    
    // Render dynamic table column headers
    renderHeadersRow();
    
    // 1. Process, filter, and sort data
    let processedData = [];
    
    state.roadmapData.forEach(epic => {
        const epicCopy = JSON.parse(JSON.stringify(epic)); // deep clone
        
        // Filter child issues first
        if (epicCopy.childIssues) {
            epicCopy.childIssues = epicCopy.childIssues.filter(child => matchIssue(child, state.filters));
        }
        
        const epicMatches = matchIssue(epicCopy, state.filters);
        const hasMatchingChildren = epicCopy.childIssues && epicCopy.childIssues.length > 0;
        
        if (epicMatches || hasMatchingChildren) {
            processedData.push(epicCopy);
        }
    });
    
    if (state.prioritizeRed) {
        // Sort epics: float those with RED status or containing child with RED status to top
        processedData.sort((a, b) => {
            const aHasRed = a.healthStatus === 'red' || (a.childIssues && a.childIssues.some(c => c.healthStatus === 'red'));
            const bHasRed = b.healthStatus === 'red' || (b.childIssues && b.childIssues.some(c => c.healthStatus === 'red'));
            return (bHasRed ? 1 : 0) - (aHasRed ? 1 : 0);
        });
    }

    const colWidth = getColWidth();
    const headers = generateTimelineHeaders();
    const totalCols = headers.totalColumns;

    // Set right panel width to hold the full scrollable grid
    const totalGridWidth = totalCols * colWidth;
    
    // 2. Render Timeline Headers
    renderHeadersUI(headers, colWidth, totalGridWidth);

    // 3. Render left rows & right Gantt rows in parallel
    const issuesContainer = document.getElementById('issues-list-container');
    const gridContainer = document.getElementById('timeline-grid-container');

    issuesContainer.innerHTML = '';
    gridContainer.innerHTML = '';

    // Render background column stripes
    const bgGrid = document.createElement('div');
    bgGrid.className = 'timeline-bg-grid';
    bgGrid.style.width = `${totalGridWidth}px`;
    for (let i = 0; i < totalCols; i++) {
        const col = document.createElement('div');
        col.className = 'grid-col';
        col.style.width = `${colWidth}px`;
        bgGrid.appendChild(col);
    }
    gridContainer.appendChild(bgGrid);

    // Container for Gantt bars
    const barsContainer = document.createElement('div');
    barsContainer.className = 'timeline-bars-container';
    barsContainer.style.width = `${totalGridWidth}px`;

    let rowIndex = 0;

    processedData.forEach((epic, epicIndex) => {
        const isCollapsed = state.collapsedEpics.has(epic.key);
        const epicColor = epicColors[epicIndex % epicColors.length];

        // RENDER EPIC (Left + Right)
        const leftEpicRow = createLeftRow(epic, false, false, isCollapsed);
        const rightEpicRow = createRightRow(epic, true, rowIndex, epicColor);
        
        issuesContainer.appendChild(leftEpicRow);
        barsContainer.appendChild(rightEpicRow);
        
        rowIndex++;

        // RENDER CHILDREN (if Epic is not collapsed and has children)
        if (epic.childIssues && epic.childIssues.length > 0) {
            epic.childIssues.forEach(child => {
                const childCollapsedClass = isCollapsed ? 'child-collapsed-row' : '';
                const leftChildRow = createLeftRow(child, true, childCollapsedClass);
                const rightChildRow = createRightRow(child, false, rowIndex, null, childCollapsedClass);

                issuesContainer.appendChild(leftChildRow);
                barsContainer.appendChild(rightChildRow);

                rowIndex++;
            });
        }
    });

    gridContainer.appendChild(barsContainer);
    
    // Re-trigger scroll sync to fix alignment
    issuesContainer.scrollTop = document.getElementById('timeline-panel').scrollTop;
    
    // Snaps the left issues-panel width exactly to the sum of all columns
    syncPanelWidth();
}

// Generate columns, groups, headers metadata
function generateTimelineHeaders() {
    let headers = {
        topRow: [],
        bottomRow: [],
        totalColumns: 0
    };

    const start = new Date(state.timelineStart);
    const end = new Date(state.timelineEnd);

    if (state.zoomLevel === 'weeks') {
        // Weeks scale: Top Row = Months (grouped), Bottom Row = Weeks
        let currentWeek = getStartOfWeek(start);
        let columnsCount = 0;
        let monthsGroup = {};

        while (currentWeek <= end) {
            const weekStr = `W${getWeekNumber(currentWeek)} (${currentWeek.getMonth() + 1}/${currentWeek.getDate()})`;
            headers.bottomRow.push(weekStr);
            
            const monthLabel = currentWeek.toLocaleString('default', { month: 'long', year: 'numeric' });
            if (!monthsGroup[monthLabel]) {
                monthsGroup[monthLabel] = 0;
            }
            monthsGroup[monthLabel]++;
            
            columnsCount++;
            currentWeek.setDate(currentWeek.getDate() + 7);
        }
        
        for (let month in monthsGroup) {
            headers.topRow.push({ label: month, span: monthsGroup[month] });
        }
        headers.totalColumns = columnsCount;

    } else if (state.zoomLevel === 'quarters') {
        // Quarters scale: Top Row = Years (grouped), Bottom Row = Quarters
        let currentMonth = new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3, 1);
        let columnsCount = 0;
        let yearsGroup = {};

        while (currentMonth <= end) {
            const q = Math.floor(currentMonth.getMonth() / 3) + 1;
            const quarterStr = `Q${q}`;
            headers.bottomRow.push(quarterStr);

            const yearLabel = `${currentMonth.getFullYear()}`;
            if (!yearsGroup[yearLabel]) {
                yearsGroup[yearLabel] = 0;
            }
            yearsGroup[yearLabel]++;

            columnsCount++;
            currentMonth.setMonth(currentMonth.getMonth() + 3);
        }

        for (let year in yearsGroup) {
            headers.topRow.push({ label: year, span: yearsGroup[year] });
        }
        headers.totalColumns = columnsCount;

    } else {
        // Months scale (default): Top Row = Quarters (grouped), Bottom Row = Months
        let currentMonth = new Date(start.getFullYear(), start.getMonth(), 1);
        let columnsCount = 0;
        let quartersGroup = {};

        while (currentMonth <= end) {
            const monthStr = currentMonth.toLocaleString('default', { month: 'short' });
            headers.bottomRow.push(monthStr);

            const q = Math.floor(currentMonth.getMonth() / 3) + 1;
            const quarterLabel = `Q${q} ${currentMonth.getFullYear()}`;
            if (!quartersGroup[quarterLabel]) {
                quartersGroup[quarterLabel] = 0;
            }
            quartersGroup[quarterLabel]++;

            columnsCount++;
            currentMonth.setMonth(currentMonth.getMonth() + 1);
        }

        for (let quarter in quartersGroup) {
            headers.topRow.push({ label: quarter, span: quartersGroup[quarter] });
        }
        headers.totalColumns = columnsCount;
    }

    return headers;
}

function renderHeadersUI(headers, colWidth, totalGridWidth) {
    const headerContainer = document.getElementById('timeline-header-container');
    headerContainer.innerHTML = '';

    // Create top row header
    const topRowEl = document.createElement('div');
    topRowEl.className = 'timeline-scale-row';
    topRowEl.style.width = `${totalGridWidth}px`;
    headers.topRow.forEach(item => {
        const cell = document.createElement('div');
        cell.className = 'scale-cell';
        cell.style.width = `${item.span * colWidth}px`;
        cell.innerText = item.label;
        topRowEl.appendChild(cell);
    });
    headerContainer.appendChild(topRowEl);

    // Create bottom row header
    const bottomRowEl = document.createElement('div');
    bottomRowEl.className = 'timeline-scale-row';
    bottomRowEl.style.width = `${totalGridWidth}px`;
    headers.bottomRow.forEach(label => {
        const cell = document.createElement('div');
        cell.className = 'scale-cell';
        cell.style.width = `${colWidth}px`;
        cell.innerText = label;
        bottomRowEl.appendChild(cell);
    });
    headerContainer.appendChild(bottomRowEl);
}

// Left side panel rows builder
function createLeftRow(issue, isChild = false, extraClass = '', isCollapsed = false) {
    const row = document.createElement('div');
    row.className = `row-item issue-row ${extraClass}`;
    row.dataset.key = issue.key;

    // 1. Epic / Issue Column
    const summaryCell = document.createElement('div');
    summaryCell.className = 'body-cell cell-epic-issue';
    const wEpic = state.columnWidths.epicIssue || 250;
    summaryCell.style.width = wEpic + 'px';
    summaryCell.style.minWidth = wEpic + 'px';
    summaryCell.style.maxWidth = wEpic + 'px';

    const info = document.createElement('div');
    info.className = 'issue-info';

    // Child indentation lines
    if (isChild) {
        const indent = document.createElement('div');
        indent.className = 'issue-indent';
        info.appendChild(indent);
    }

    // Collapse/Expand button for Epics
    if (!isChild && issue.key !== 'ISSUES-WITHOUT-EPICS') {
        const expander = document.createElement('div');
        expander.className = `expander-btn ${isCollapsed ? 'collapsed' : ''}`;
        expander.innerHTML = `
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3">
                <path d="M6 9l6 6 6-6"/>
            </svg>
        `;
        expander.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleEpicCollapse(issue.key);
        });
        info.appendChild(expander);
    } else if (issue.key === 'ISSUES-WITHOUT-EPICS') {
        // Placeholder space for indentation
        const space = document.createElement('div');
        space.style.width = '18px';
        info.appendChild(space);
    }

    // Issue Type icon
    const icon = document.createElement('div');
    const type = (issue.issueType || 'story').toLowerCase();
    icon.className = `issue-type-icon ${type}`;
    icon.innerText = type.charAt(0).toUpperCase();
    info.appendChild(icon);

    // Issue Key
    const keyLink = document.createElement('span');
    keyLink.className = 'issue-key';
    keyLink.innerText = issue.key;
    if (state.settings.jiraUrl && issue.key !== 'ISSUES-WITHOUT-EPICS') {
        keyLink.style.cursor = 'pointer';
        keyLink.addEventListener('click', () => {
            // Open issue in system browser via alert bridge
            alert(`Opening Issue: ${state.settings.jiraUrl}/browse/${issue.key}`);
        });
    }
    info.appendChild(keyLink);

    // Issue Summary
    const summary = document.createElement('span');
    summary.className = 'issue-summary';
    summary.innerText = issue.summary;
    summary.title = issue.summary;
    info.appendChild(summary);

    summaryCell.appendChild(info);
    row.appendChild(summaryCell);

    // 2. Health Status Column (Always rendered as the 2nd column)
    const healthCell = document.createElement('div');
    healthCell.className = 'body-cell cell-healthStatus';
    const wHealth = state.columnWidths.healthStatus || 110;
    healthCell.style.width = wHealth + 'px';
    healthCell.style.minWidth = wHealth + 'px';
    healthCell.style.maxWidth = wHealth + 'px';

    if (issue.key !== 'ISSUES-WITHOUT-EPICS') {
        const health = document.createElement('div');
        const badgeStatus = issue.healthStatus || 'none';
        health.className = `health-badge ${badgeStatus}`;
        
        let labelText = 'No problems';
        if (badgeStatus === 'yellow') labelText = 'Minor problems';
        else if (badgeStatus === 'red') labelText = 'Severe limitations';
        else if (badgeStatus === 'none') labelText = 'Set status';

        health.innerHTML = `
            <span class="badge-dot"></span>
            <span>${labelText}</span>
        `;
        
        // Show status update popover
        health.addEventListener('click', (e) => {
            e.stopPropagation();
            showStatusPopover(e, issue.key);
        });
        healthCell.appendChild(health);
    }
    row.appendChild(healthCell);

    // 3. Other Grouped Columns Cells
    state.visibleColumns.forEach(col => {
        const cell = document.createElement('div');
        cell.className = `body-cell cell-${col}`;
        const wCol = state.columnWidths[col] || 100;
        cell.style.width = wCol + 'px';
        cell.style.minWidth = wCol + 'px';
        cell.style.maxWidth = wCol + 'px';

        if (issue.key === 'ISSUES-WITHOUT-EPICS') {
            row.appendChild(cell);
            return;
        }

        if (col === 'statusName') {
            const statusSpan = document.createElement('span');
            let catClass = 'status-new';
            if (issue.statusCategory === 'done') catClass = 'status-done';
            else if (issue.statusCategory === 'indeterminate') catClass = 'status-indeterminate';
            
            statusSpan.className = `status-badge ${catClass}`;
            statusSpan.innerText = issue.statusName || '';
            cell.appendChild(statusSpan);
        } else {
            cell.innerText = issue[col] || '';
        }
        
        row.appendChild(cell);
    });

    return row;
}

// Right timeline panel rows builder containing Gantt bars
function createRightRow(issue, isEpic = true, rowIndex = 0, barColor = null, extraClass = '') {
    const row = document.createElement('div');
    row.className = `row-item timeline-row ${extraClass}`;
    row.style.width = '100%';

    // Don't render bars for dummy grouping headers
    if (issue.key === 'ISSUES-WITHOUT-EPICS') {
        return row;
    }

    // Position of bar
    const start = new Date(state.timelineStart);
    const end = new Date(state.timelineEnd);
    const totalDuration = end.getTime() - start.getTime();

    const iStart = issue.startDate ? new Date(issue.startDate) : null;
    const iEnd = issue.endDate ? new Date(issue.endDate) : null;

    const bar = document.createElement('div');

    if (iStart && iEnd && !isNaN(iStart.getTime()) && !isNaN(iEnd.getTime())) {
        // Clamp dates to visible bounds
        const clampedStart = new Date(Math.max(iStart.getTime(), start.getTime()));
        const clampedEnd = new Date(Math.min(iEnd.getTime(), end.getTime()));

        if (clampedEnd >= clampedStart) {
            const leftOffset = ((clampedStart.getTime() - start.getTime()) / totalDuration) * 100;
            const barWidth = ((clampedEnd.getTime() - clampedStart.getTime()) / totalDuration) * 100;

            bar.className = `gantt-bar ${isEpic ? 'epic-bar' : 'child-bar'}`;
            bar.style.left = `${leftOffset}%`;
            bar.style.width = `${barWidth}%`;
            
            if (isEpic && barColor) {
                bar.style.backgroundColor = barColor;
            }

            bar.innerHTML = `<span class="gantt-bar-label">${issue.key}: ${issue.summary}</span>`;
            bar.title = `${issue.key} (${issue.startDate} to ${issue.endDate})\n${issue.summary}`;
            
            row.appendChild(bar);
        }
    } else {
        // Render a subtle "No scheduled dates" placeholder bar
        bar.className = 'gantt-bar no-dates';
        bar.style.left = '40%';
        bar.style.width = '20%';
        bar.innerHTML = `<span class="gantt-bar-label">No dates scheduled</span>`;
        bar.title = `${issue.key}: No start or end dates scheduled in Jira.`;
        row.appendChild(bar);
    }

    return row;
}

// Toggle Epic Collapse state
function toggleEpicCollapse(epicKey) {
    if (state.collapsedEpics.has(epicKey)) {
        state.collapsedEpics.delete(epicKey);
    } else {
        state.collapsedEpics.add(epicKey);
    }
    renderTimeline();
}

// Display context status selector popover
function showStatusPopover(event, issueId) {
    state.activeStatusIssueId = issueId;
    
    const popover = document.getElementById('status-popover');
    popover.style.display = 'block';
    
    // Position popover relative to clicked badge coordinates
    const rect = event.currentTarget.getBoundingClientRect();
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    
    popover.style.top = `${rect.bottom + scrollTop + 4}px`;
    popover.style.left = `${rect.left - 40}px`;
}

// Toggle "Sort Red to Top" blocker priorities
function togglePrioritizeRed() {
    state.prioritizeRed = !state.prioritizeRed;
    const btn = document.getElementById('btn-sort-red');
    if (state.prioritizeRed) {
        btn.classList.add('active');
        showToast('Sorting blockers to top', 'warning');
    } else {
        btn.classList.remove('active');
    }
    renderTimeline();
}

// ==========================================================================
// Theme Engine
// ==========================================================================
function setTheme(theme) {
    const html = document.documentElement;
    const sunIcon = document.querySelector('.icon-sun');
    const moonIcon = document.querySelector('.icon-moon');

    if (theme === 'dark') {
        html.className = 'dark-theme';
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
    } else {
        html.className = 'light-theme';
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
    }
    safeSetLocalStorage('jira-roadmap-theme', theme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.className.includes('dark-theme') ? 'light' : 'dark';
    setTheme(currentTheme);
}

// ==========================================================================
// Toast Engine
// ==========================================================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    toast.innerHTML = `
        <span>${message}</span>
        <button class="toast-close">&times;</button>
    `;
    
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.remove();
    });

    container.appendChild(toast);

    // Auto dismiss after 4 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 4000);
}

// ==========================================================================
// Helper Date Functions
// ==========================================================================
function getStartOfWeek(d) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    return new Date(date.setDate(diff));
}

function getWeekNumber(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

// ==========================================================================
// Mock Data Generator (offline/browser development testing)
// ==========================================================================
function getMockRoadmapData() {
    return [
        {
            key: "PROJ-101",
            summary: "Implement Enterprise SSO & CAC Access",
            issueType: "Epic",
            statusName: "In Progress",
            statusCategory: "indeterminate",
            priority: "High",
            assignee: "Sarah Jenkins",
            fixVersions: "2026.10.20",
            healthStatus: "red",
            startDate: "2026-06-01",
            endDate: "2026-08-15",
            childIssues: [
                {
                    key: "PROJ-102",
                    summary: "Extract client certificate metadata from MSCAPI",
                    issueType: "Story",
                    statusName: "Done",
                    statusCategory: "done",
                    priority: "High",
                    assignee: "Sarah Jenkins",
                    fixVersions: "2026.10.20",
                    healthStatus: "green",
                    startDate: "2026-06-01",
                    endDate: "2026-06-15"
                },
                {
                    key: "PROJ-103",
                    summary: "Design user certificate choice selector dialog UI",
                    issueType: "Story",
                    statusName: "In Progress",
                    statusCategory: "indeterminate",
                    priority: "Medium",
                    assignee: "Alex River",
                    fixVersions: "2026.10.20",
                    healthStatus: "yellow",
                    startDate: "2026-06-10",
                    endDate: "2026-07-05"
                },
                {
                    key: "PROJ-104",
                    summary: "Configure trust-all certificates manager to bypass Intranet CA check",
                    issueType: "Story",
                    statusName: "To Do",
                    statusCategory: "new",
                    priority: "High",
                    assignee: "Sarah Jenkins",
                    fixVersions: "2026.10.20",
                    healthStatus: "red",
                    startDate: "2026-07-06",
                    endDate: "2026-08-15"
                }
            ]
        },
        {
            key: "PROJ-201",
            summary: "Roadmap Timeline UI Interactive Design",
            issueType: "Epic",
            statusName: "In Progress",
            statusCategory: "indeterminate",
            priority: "Medium",
            assignee: "Alex River",
            fixVersions: "2026.11.00",
            healthStatus: "yellow",
            startDate: "2026-06-15",
            endDate: "2026-09-01",
            childIssues: [
                {
                    key: "PROJ-202",
                    summary: "Pixel perfect CSS layout matching standard Jira dashboard style",
                    issueType: "Story",
                    statusName: "Done",
                    statusCategory: "done",
                    priority: "Medium",
                    assignee: "David Chen",
                    fixVersions: "2026.11.00",
                    healthStatus: "green",
                    startDate: "2026-06-15",
                    endDate: "2026-07-01"
                },
                {
                    key: "PROJ-203",
                    summary: "Synchronized vertical scrolling between left tree pane and right Gantt pane",
                    issueType: "Story",
                    statusName: "Done",
                    statusCategory: "done",
                    priority: "Low",
                    assignee: "Alex River",
                    fixVersions: "2026.11.00",
                    healthStatus: "green",
                    startDate: "2026-07-02",
                    endDate: "2026-07-07"
                },
                {
                    key: "PROJ-204",
                    summary: "Scale zoom levels selector (Weeks, Months, Quarters) JS functions",
                    issueType: "Story",
                    statusName: "In Progress",
                    statusCategory: "indeterminate",
                    priority: "Medium",
                    assignee: "Alex River",
                    fixVersions: "2026.11.00",
                    healthStatus: "none",
                    startDate: "2026-07-08",
                    endDate: "2026-07-28"
                },
                {
                    key: "PROJ-205",
                    summary: "Add priority filter to auto float Red items to top",
                    issueType: "Story",
                    statusName: "To Do",
                    statusCategory: "new",
                    priority: "High",
                    assignee: "David Chen",
                    fixVersions: "2026.11.00",
                    healthStatus: "none",
                    startDate: "2026-08-01",
                    endDate: "2026-09-01"
                }
            ]
        },
        {
            key: "PROJ-301",
            summary: "Intranet Deployment Prep",
            issueType: "Epic",
            statusName: "To Do",
            statusCategory: "new",
            priority: "High",
            assignee: "Emma Watson",
            fixVersions: "2026.12.00",
            healthStatus: "none",
            startDate: "2026-08-20",
            endDate: "2026-09-30",
            childIssues: [
                {
                    key: "PROJ-302",
                    summary: "Bundle dependencies into single self-contained runnable JAR executable",
                    issueType: "Story",
                    statusName: "To Do",
                    statusCategory: "new",
                    priority: "High",
                    assignee: "Emma Watson",
                    fixVersions: "2026.12.00",
                    healthStatus: "none",
                    startDate: null,
                    endDate: null
                }
            ]
        },
        {
            key: "PROJ-401",
            summary: "Empty Epic with no child issues",
            issueType: "Epic",
            statusName: "To Do",
            statusCategory: "new",
            priority: "Low",
            assignee: "Marcus Aurelius",
            fixVersions: "2026.10.20",
            healthStatus: "green",
            startDate: "2026-07-01",
            endDate: "2026-07-20",
            childIssues: []
        },
        {
            key: "ISSUES-WITHOUT-EPICS",
            summary: "Issues Without Epics",
            issueType: "Epic",
            statusName: "",
            statusCategory: "new",
            priority: "Low",
            assignee: "",
            fixVersions: "",
            healthStatus: "none",
            startDate: null,
            endDate: null,
            childIssues: [
                {
                    key: "PROJ-501",
                    summary: "Update security policies document (Orphan Issue)",
                    issueType: "Story",
                    statusName: "In Progress",
                    statusCategory: "indeterminate",
                    priority: "High",
                    assignee: "Sarah Jenkins",
                    fixVersions: "2026.10.20",
                    healthStatus: "red",
                    startDate: "2026-07-05",
                    endDate: "2026-07-15"
                },
                {
                    key: "PROJ-502",
                    summary: "General developer workspace setup (Orphan Issue)",
                    issueType: "Story",
                    statusName: "Done",
                    statusCategory: "done",
                    priority: "Low",
                    assignee: "David Chen",
                    fixVersions: "2026.09.00",
                    healthStatus: "green",
                    startDate: "2026-05-15",
                    endDate: "2026-05-30"
                }
            ]
        }
    ];
}
