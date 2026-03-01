// Double Pendulum Chaos Map - Main Entry Point
// Initialize when DOM is ready

document.addEventListener('DOMContentLoaded', () => {
    window.chaosRenderer = new ChaosMapRenderer();
    initCollapsiblePanels();
});

// Initialize collapsible panels
function initCollapsiblePanels() {
    const panels = document.querySelectorAll('.panel');
    
    // Load saved collapse states
    const savedStates = JSON.parse(localStorage.getItem('panelCollapseStates') || '{}');
    
    panels.forEach((panel, index) => {
        const header = panel.querySelector('.panel-header');
        if (!header) return;
        
        // Apply saved state
        const panelId = panel.id || `panel-${index}`;
        if (savedStates[panelId] === true) {
            panel.classList.add('collapsed');
        }
        
        // Click handler
        header.addEventListener('click', (e) => {
            // Don't collapse if clicking on a button or input inside the header
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
                return;
            }
            
            panel.classList.toggle('collapsed');
            
            // Save state
            savedStates[panelId] = panel.classList.contains('collapsed');
            localStorage.setItem('panelCollapseStates', JSON.stringify(savedStates));
        });
    });
}
