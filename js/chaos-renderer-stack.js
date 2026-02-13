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
            const deltaBadge = item.deltaMode ? '<span style="color: #fc8; font-size: 0.65rem;"> Δ</span>' : '';
            content = `
                <div class="stack-info">
                    <div class="stack-name">${item.name}${deltaBadge}</div>
                    <div class="stack-params">
                        ${dim1Info ? dim1Info.label : item.dim1}: [${item.min1.toFixed(1)}, ${item.max1.toFixed(1)}] 
                        ${dim2Info ? dim2Info.label : item.dim2}: [${item.min2.toFixed(1)}, ${item.max2.toFixed(1)}]
                        ${item.deltaMode ? ' • Δ mode' : ''}
                    </div>
                </div>
            `;
        } else {
            const isInitial = index === 0;
            content = `
                <div class="stack-info">
                    <div class="stack-name">${isInitial ? '📍 Initial State' : '📍 Sampled State'}</div>
                    <div class="stack-params" title="${item.getStateDisplay()}">
                        ${item.getShortDisplay()}
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
    
    if (!item) {
        editor.style.display = 'none';
        return;
    }
    
    // Handle SampledPoint editing (including initial state at index 0)
    if (item.type === 'sampled') {
        this.updateSampledPointEditor(editor, title, params, item);
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
        <div class="form-group" style="margin-bottom: 0.75rem;">
            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                <input type="checkbox" id="deltaModeInput" ${item.deltaMode ? 'checked' : ''} style="width: auto;">
                <span>Delta mode (add to basis instead of replace)</span>
            </label>
            <div style="font-size: 0.7rem; color: #888; margin-top: 0.25rem; padding-left: 1.25rem;">
                ${item.deltaMode ? 'Values are added to the sampled point state' : 'Values replace the sampled point state'}
            </div>
        </div>
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
    const deltaModeInput = document.getElementById('deltaModeInput');
    
    // Use 'change' to regenerate map when user finishes editing
    const onInputChange = () => {
        updateItemValues();
        this.generateMap();
    };
    
    min1Input.addEventListener('change', onInputChange);
    max1Input.addEventListener('change', onInputChange);
    min2Input.addEventListener('change', onInputChange);
    max2Input.addEventListener('change', onInputChange);
    
    // Delta mode toggle
    if (deltaModeInput) {
        deltaModeInput.addEventListener('change', () => {
            item.deltaMode = deltaModeInput.checked;
            // Update the help text
            const helpText = deltaModeInput.closest('.form-group').querySelector('div:last-child');
            if (helpText) {
                helpText.textContent = item.deltaMode 
                    ? 'Values are added to the sampled point state' 
                    : 'Values replace the sampled point state';
            }
            this.updateStackUI();
            this.generateMap();
        });
    }
};

// Editor for SampledPoint - allows editing individual state parameters
ChaosMapRenderer.prototype.updateSampledPointEditor = function(editor, title, params, item) {
    editor.style.display = 'block';
    editor.dataset.layerId = item.id;
    title.textContent = 'Edit Sampled State';
    
    const s = item.state;
    const dims = [
        { key: 'theta1', label: 'θ₁', unit: 'rad', step: 0.01 },
        { key: 'theta2', label: 'θ₂', unit: 'rad', step: 0.01 },
        { key: 'omega1', label: 'ω₁', unit: 'rad/s', step: 0.1 },
        { key: 'omega2', label: 'ω₂', unit: 'rad/s', step: 0.1 },
        { key: 'l1', label: 'L₁', unit: 'm', step: 0.1, min: 0.1 },
        { key: 'l2', label: 'L₂', unit: 'm', step: 0.1, min: 0.1 },
        { key: 'm1', label: 'm₁', unit: 'kg', step: 0.1, min: 0.1 },
        { key: 'm2', label: 'm₂', unit: 'kg', step: 0.1, min: 0.1 }
    ];
    
    // Create editor inputs for each dimension
    let html = '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">';
    dims.forEach(dim => {
        const value = s[dim.key];
        const minAttr = dim.min !== undefined ? `min="${dim.min}"` : '';
        html += `
            <div class="form-group" style="margin-bottom: 0.3rem;">
                <label style="font-size: 0.7rem; display: flex; justify-content: space-between;">
                    <span>${dim.label}</span>
                    <span style="color: #666; font-size: 0.65rem;">${dim.unit}</span>
                </label>
                <input type="number" id="sp_${dim.key}" value="${value.toFixed(4)}" step="${dim.step}" ${minAttr}
                    style="width: 100%; padding: 0.3rem; font-size: 0.75rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); border-radius: 4px; color: #fff;">
            </div>
        `;
    });
    html += '</div>';
    
    // Add info text
    html += `
        <div style="margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.1);">
            <div style="font-size: 0.7rem; color: #888;">
                Changes propagate to all subsequent layers
            </div>
        </div>
    `;
    
    params.innerHTML = html;
    
    // Add event listeners to inputs
    dims.forEach(dim => {
        const input = document.getElementById(`sp_${dim.key}`);
        if (input) {
            input.addEventListener('change', () => {
                let value = parseFloat(input.value) || 0;
                if (dim.min !== undefined && value < dim.min) value = dim.min;
                item.state[dim.key] = value;
                
                // Update the stack UI display for this item
                this.updateStackItemDisplay(this.selectedIndex, item);
                
                // Regenerate the map with the new state
                this.generateMap();
            });
        }
    });
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
        const deltaSuffix = item.deltaMode ? ' • Δ mode' : '';
        paramsEl.textContent = `${dim1Info ? dim1Info.label : item.dim1}: [${item.min1.toFixed(1)}, ${item.max1.toFixed(1)}] ${dim2Info ? dim2Info.label : item.dim2}: [${item.min2.toFixed(1)}, ${item.max2.toFixed(1)}]${deltaSuffix}`;
    } else if (item.type === 'sampled') {
        // Update the sampled point display with the new state
        paramsEl.textContent = item.getShortDisplay();
        paramsEl.title = item.getStateDisplay();
    }
};
