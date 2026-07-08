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
    activeStatusIssueId: null
};

// Epic Bar Colors Palette (light & dark map)
const epicColors = [
    'var(--epic-bar-1)',
    'var(--epic-bar-2)',
    'var(--epic-bar-3)',
    'var(--epic-bar-4)',
    'var(--epic-bar-5)'
];

// ==========================================================================
// Initialization & Listeners
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Check local storage for theme preference
    const savedTheme = localStorage.getItem('jira-roadmap-theme') || 'light';
    setTheme(savedTheme);

    // Bind UI controls
    document.getElementById('btn-refresh').addEventListener('click', reloadData);
    document.getElementById('btn-theme').addEventListener('click', toggleTheme);
    document.getElementById('btn-sort-red').addEventListener('click', togglePrioritizeRed);
    
    // Bind enter key on JQL input
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

    // Close popover on click outside
    document.addEventListener('click', (e) => {
        const popover = document.getElementById('status-popover');
        if (!e.target.closest('.health-badge') && !e.target.closest('.status-popover')) {
            popover.style.display = 'none';
            state.activeStatusIssueId = null;
        }
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

    // Bootstrap backend details
    bootstrapApp();
});

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
    showLoader('Connecting to Jira...');
    if (typeof window.backend !== 'undefined') {
        try {
            // Load settings
            const settingsJson = window.backend.getSettings();
            state.settings = JSON.parse(settingsJson);
            
            // Set JQL input value
            document.getElementById('jql-input').value = state.settings.jql || '';
            document.getElementById('jql-input').title = `Jira: ${state.settings.jiraUrl}`;

            // Load data
            reloadData();
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
        document.getElementById('jql-input').value = state.settings.jql;
        state.roadmapData = getMockRoadmapData();
        renderTimeline();
        hideLoader();
    }
}

function reloadData() {
    const newJql = document.getElementById('jql-input').value.trim();
    showLoader('Fetching roadmap data...');
    if (typeof window.backend !== 'undefined') {
        // Run in background to prevent UI freeze
        setTimeout(() => {
            try {
                // Update the JQL configuration on the backend
                window.backend.updateJql(newJql);
                state.settings.jql = newJql;

                const dataJson = window.backend.getRoadmapData();
                const parsed = JSON.parse(dataJson);
                
                if (parsed.success === false) {
                    showToast('Jira API Error: ' + parsed.error, 'error');
                } else {
                    state.roadmapData = parsed;
                    renderTimeline();
                    showToast('Roadmap sync completed successfully', 'success');
                }
            } catch (e) {
                showToast('Connection failed: ' + e, 'error');
            } finally {
                hideLoader();
            }
        }, 100);
    } else {
        setTimeout(() => {
            renderTimeline();
            hideLoader();
            showToast('Mock roadmap data reloaded', 'success');
        }, 800);
    }
}

function updateStatusInJira(issueId, newStatus) {
    showLoader(`Updating status for ${issueId}...`);
    if (typeof window.backend !== 'undefined') {
        setTimeout(() => {
            try {
                const responseJson = window.backend.updateIssueStatus(issueId, newStatus);
                const response = JSON.parse(responseJson);
                
                if (response.success) {
                    // Update local state and re-render
                    updateLocalStatus(issueId, newStatus);
                    showToast(`Status updated successfully for ${issueId}`, 'success');
                } else {
                    showToast(`Failed to update: ${response.error}`, 'error');
                }
            } catch (e) {
                showToast(`Failed to connect to backend: ${e}`, 'error');
            } finally {
                hideLoader();
            }
        }, 100);
    } else {
        // Mock success in browser testing
        setTimeout(() => {
            updateLocalStatus(issueId, newStatus);
            hideLoader();
            showToast(`[Mock] Status updated for ${issueId} to ${newStatus}`, 'success');
        }, 500);
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
function renderTimeline() {
    calculateTimelineBounds();
    
    // 1. Process and sort data
    let processedData = JSON.parse(JSON.stringify(state.roadmapData)); // deep clone
    
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
            // Open issue in system browser via alert bridge or redirect. 
            // In JavaFX WebView, the user clicking this can be alerted to open locally.
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

    row.appendChild(info);

    // Health Status Badge (excluding orphan category header)
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
        row.appendChild(health);
    } else {
        // Spacer for clean layout aligning
        const spacer = document.createElement('div');
        spacer.style.width = '120px';
        row.appendChild(spacer);
    }

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
    localStorage.setItem('jira-roadmap-theme', theme);
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
                    healthStatus: "none",
                    startDate: null,
                    endDate: null
                }
            ]
        }
    ];
}
