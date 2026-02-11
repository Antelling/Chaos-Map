// Double Pendulum Chaos Map - Stack UI Methods (Part 3)
// These methods extend ChaosMapRenderer

// Stack UI Management
ChaosMapRenderer.prototype.updateStackUI = function() {
    const container = document.getElementById('stackList');
    if (!container) return;
    
    container.innerHTML = '';
    
    this.stack.getItems().forEach((item, index) => {
        const el = document.createElement('div');
        const isSelected = index === this.selectedIndex;
        const isLayer = item.type === 'layer';
        const isSampled = item.type === 'sampled';
        
        el.className = `stack-item ${isSelected ? 'selected' : ''} ${isLayer ? 'layer-item' : 'sampled-item'}`;
        el.dataset.index = index;
        
        let content = '';
        if (isLayer) {
            const dim1Info = DIM_INFO[item.dim1];
            const dim2Info = DIM_INFO[item.dim2];
            content = `
                <div class="stack-info">
                    <div class="stack-name">${item.name}</div>
                    <div class="stack-params">
                        ${dim1Info ? dim1Info.label : item.dim1}: [${item.min1.toFixed(1)}, ${item.max1.toFixed(1)}] 
                        ${dim2Info ? dim2Info.label : item.dim2}: [${item.min2.toFixed(1)}, ${item.max2.toFixed(1)}]
                    </div>
                </div>
            `;
        } else {
            content = `
                <div class="stack-info">
                    <div class="stack-name">${item.name}</div>
                    <div class="stack-params" title="${item.getStateDisplay()}">
                        ${item.getStateDisplay()}
                    </div>
                </div>
            `;
        }
        
        // Delete button (not for initial sampled point)
        const canDelete = index > 0;
        
        el.innerHTML = content + `
            <button class="delete-btn ${canDelete ? '' : 'disabled'}" data-index="${index}" ${canDelete ? '' : 'disabled'}>
                ×
            </button>
        `;
        
        // Click to select
        el.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-btn')) {
                e.stopPropagation();
                if (canDelete) {
                    this.stack.removeItem(index);
                    this.selectedIndex = Math.min(this.selectedIndex, this.stack.items.length - 1);
                    this.updateStackUI();
                    this.generateMap();
                }
            } else {
                this.selectItem(index);
            }
        });
        
        container.appendChild(el);
    });
    
    // Show/hide layer editor based on selection
    this.updateLayerEditor();
};

ChaosMapRenderer.prototype.selectItem = function(index) {
    this.selectedIndex = index;
    this.updateStackUI();
};

ChaosMapRenderer.prototype.updateLayerEditor = function() {
    const editor = document.getElementById('layerEditor');
    const title = document.getElementById('editorTitle');
    const params = document.getElementById('editorParams');
    
    if (!editor || !title || !params) return;
    
    const item = this.selectedIndex >= 0 ? this.stack.getItems()[this.selectedIndex] : null;
    
    if (!item || item.type !== 'layer') {
        editor.style.display = 'none';
        return;
    }
    
    // Only regenerate the editor if it's a different layer or first time showing
    const currentLayerId = editor.dataset.layerId;
    if (currentLayerId === item.id) {
        // Just update the title in case it changed
        title.textContent = item.name;
        return;
    }
    
    editor.style.display = 'block';
    editor.dataset.layerId = item.id;
    title.textContent = item.name;
    
    const dim1 = item.dim1;
    const dim2 = item.dim2;
    const dim1Info = DIM_INFO[dim1] || { label: dim1, unit: '' };
    const dim2Info = DIM_INFO[dim2] || { label: dim2, unit: '' };
    
    // Create range editors with clear dimension labels
    params.innerHTML = `
        <div class="form-group">
            <label>Min / Max for ${dim1Info.label}</label>
            <div class="range-inputs">
                <input type="number" value="${item.min1}" id="min1Input" step="0.1">
                <span>to</span>
                <input type="number" value="${item.max1}" id="max1Input" step="0.1">
            </div>
        </div>
        <div class="form-group">
            <label>Min / Max for ${dim2Info.label}</label>
            <div class="range-inputs">
                <input type="number" value="${item.min2}" id="min2Input" step="0.1">
                <span>to</span>
                <input type="number" value="${item.max2}" id="max2Input" step="0.1">
            </div>
        </div>
    `;
    
    // Event listeners - update values and regenerate map automatically
    const updateItemValues = () => {
        const min1 = parseFloat(document.getElementById('min1Input').value) || 0;
        const max1 = parseFloat(document.getElementById('max1Input').value) || 1;
        const min2 = parseFloat(document.getElementById('min2Input').value) || 0;
        const max2 = parseFloat(document.getElementById('max2Input').value) || 1;
        
        item.min1 = Math.min(min1, max1);
        item.max1 = Math.max(min1, max1);
        item.min2 = Math.min(min2, max2);
        item.max2 = Math.max(min2, max2);
        
        // Update the stack UI display
        this.updateStackItemDisplay(this.selectedIndex, item);
    };
    
    const min1Input = document.getElementById('min1Input');
    const max1Input = document.getElementById('max1Input');
    const min2Input = document.getElementById('min2Input');
    const max2Input = document.getElementById('max2Input');
    
    // Use 'change' to regenerate map when user finishes editing
    const onInputChange = () => {
        updateItemValues();
        this.generateMap();
    };
    
    min1Input.addEventListener('change', onInputChange);
    max1Input.addEventListener('change', onInputChange);
    min2Input.addEventListener('change', onInputChange);
    max2Input.addEventListener('change', onInputChange);
};

// Update just a single stack item's display without regenerating the whole UI
ChaosMapRenderer.prototype.updateStackItemDisplay = function(index, item) {
    const container = document.getElementById('stackList');
    if (!container) return;
    
    const el = container.children[index];
    if (!el) return;
    
    const paramsEl = el.querySelector('.stack-params');
    if (!paramsEl) return;
    
    if (item.type === 'layer') {
        const dim1Info = DIM_INFO[item.dim1];
        const dim2Info = DIM_INFO[item.dim2];
        paramsEl.textContent = `${dim1Info ? dim1Info.label : item.dim1}: [${item.min1.toFixed(1)}, ${item.max1.toFixed(1)}] ${dim2Info ? dim2Info.label : item.dim2}: [${item.min2.toFixed(1)}, ${item.max2.toFixed(1)}]`;
    }
};
