class PyNote {
    constructor() {
        this.currentFile = null;
        this.selectedFolder = null;
        this.files = [];
        this.vaultName = null;
        this.unsavedChanges = false;
        this.editor = null;
        this.similarityTimeout = null;
        this.availableModels = [];
        this.currentModel = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.initEditor();
        this.loadAvailableModels();
        this.updateUI();
    }

    initEditor() {
        const editorElement = document.getElementById('editor');
        
        // Create textarea element for CodeMirror
        const textarea = document.createElement('textarea');
        textarea.id = 'markdown-editor';
        textarea.placeholder = 'Start writing your markdown here...';
        editorElement.appendChild(textarea);
        
        // Initialize CodeMirror
        this.codeMirror = CodeMirror.fromTextArea(textarea, {
            mode: 'gfm',
            lineNumbers: true,
            lineWrapping: true,
            theme: 'default',
            indentUnit: 4,
            tabSize: 4,
            indentWithTabs: false,
            autofocus: false,
            placeholder: 'Start writing your markdown here...',
            viewportMargin: Infinity,
            extraKeys: {
                'Ctrl-S': () => this.saveFile(),
                'Cmd-S': () => this.saveFile(),
                'Tab': (cm) => {
                    if (cm.somethingSelected()) {
                        cm.indentSelection('add');
                    } else {
                        cm.replaceSelection(cm.getOption('indentWithTabs') ? '\t' : 
                            Array(cm.getOption('indentUnit') + 1).join(' '), 'end', '+input');
                    }
                },
                'Shift-Tab': (cm) => cm.indentSelection('subtract')
            }
        });
        
        // Set initial size
        this.resizeEditor();
        
        // Setup resize observer for better responsiveness
        if (window.ResizeObserver) {
            const resizeObserver = new ResizeObserver(() => {
                this.resizeEditor();
                this.codeMirror.refresh();
            });
            resizeObserver.observe(editorElement);
        }
        
        // Add change listener
        this.codeMirror.on('change', () => {
            this.unsavedChanges = true;
            this.updatePreview();
            this.updateUI();
            this.debouncedSimilaritySearch();
        });
        
        // Create editor interface
        this.editor = {
            getValue: () => this.codeMirror.getValue(),
            setValue: (value) => { 
                this.codeMirror.setValue(value);
                this.updatePreview();
                // Refresh CodeMirror to ensure proper sizing
                setTimeout(() => {
                    this.resizeEditor();
                    this.codeMirror.refresh();
                }, 50);
            },
            focus: () => this.codeMirror.focus(),
            getElement: () => this.codeMirror.getWrapperElement(),
            refresh: () => {
                this.resizeEditor();
                this.codeMirror.refresh();
            }
        };
    }

    resizeEditor() {
        if (!this.codeMirror) return;
        
        const editorContainer = document.getElementById('editor');
        if (editorContainer) {
            const containerHeight = editorContainer.clientHeight;
            this.codeMirror.setSize(null, containerHeight);
        }
    }

    bindEvents() {
        document.getElementById('select-vault').addEventListener('click', () => this.openVaultDialog());
        document.getElementById('new-file').addEventListener('click', () => this.newFile());
        document.getElementById('save-file').addEventListener('click', () => this.saveFile());
        document.getElementById('delete-file').addEventListener('click', () => this.deleteFile());
        document.getElementById('reindex').addEventListener('click', () => this.reindexVault());
        document.getElementById('model-selector').addEventListener('change', (e) => this.changeModel(e.target.value));
        
        document.getElementById('cancel-vault').addEventListener('click', () => this.closeVaultDialog());
        document.getElementById('confirm-vault').addEventListener('click', () => this.selectVault());
        document.getElementById('browse-vault').addEventListener('click', () => this.browseVault());
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.file-item') && !e.target.closest('#new-file')) {
                this.unselectFolder();
            }
        });

        const sidebarHeader = document.querySelector('.sidebar h3');
        sidebarHeader.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            sidebarHeader.classList.add('drag-over');
        });
        
        sidebarHeader.addEventListener('dragleave', () => {
            sidebarHeader.classList.remove('drag-over');
        });
        
        sidebarHeader.addEventListener('drop', (e) => {
            e.preventDefault();
            sidebarHeader.classList.remove('drag-over');
            const draggedFilePath = e.dataTransfer.getData('text/plain');
            this.moveFileToRoot(draggedFilePath);
        });

        window.addEventListener('beforeunload', (e) => {
            if (this.unsavedChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        // Handle window resize to refresh CodeMirror
        window.addEventListener('resize', () => {
            if (this.editor && this.editor.refresh) {
                setTimeout(() => this.editor.refresh(), 100);
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey)) {
                switch(e.key) {
                    case 's':
                        e.preventDefault();
                        this.saveFile();
                        break;
                    case 'n':
                        e.preventDefault();
                        this.newFile();
                        break;
                }
            }
        });
    }

    openVaultDialog() {
        const dialog = document.getElementById('vault-dialog');
        const pathInput = document.getElementById('vault-path');
        pathInput.value = '';
        dialog.showModal();
        pathInput.focus();
    }

    closeVaultDialog() {
        const dialog = document.getElementById('vault-dialog');
        dialog.close();
    }

    async browseVault() {
        if ('showDirectoryPicker' in window) {
            try {
                const dirHandle = await window.showDirectoryPicker();
                const pathInput = document.getElementById('vault-path');
                pathInput.value = dirHandle.name;
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Error selecting directory:', error);
                }
            }
        } else {
            alert('Directory picker not supported in this browser. Please enter the path manually.');
        }
    }

    async selectVault() {
        const pathInput = document.getElementById('vault-path');
        const path = pathInput.value.trim();
        
        if (!path) {
            alert('Please enter a vault path');
            return;
        }

        try {
            const response = await fetch('/api/set-vault', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path })
            });

            const result = await response.json();
            if (result.success) {
                this.vaultName = path.split('/').pop();
                this.closeVaultDialog();
                await this.loadFiles();
                this.updateUI();
                alert('Vault selected successfully!');
            } else {
                alert('Error: ' + result.error);
            }
        } catch (error) {
            alert('Error selecting vault: ' + error.message);
        }
    }

    async loadFiles() {
        try {
            const response = await fetch('/api/files');
            const files = await response.json();
            
            if (Array.isArray(files)) {
                this.files = files;
                this.renderFileTree();
                this.updateUI();
            } else {
                alert('Error loading files: ' + files.error);
            }
        } catch (error) {
            alert('Error loading files: ' + error.message);
        }
    }

    renderFileTree() {
        const fileTree = document.getElementById('file-tree');
        fileTree.innerHTML = '';

        this.files.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = `file-item ${file.type}`;
            fileItem.style.paddingLeft = `${(file.level || 0) * 20 + 8}px`;
            
            if (file.type === 'file') {
                fileItem.draggable = true;
                fileItem.setAttribute('data-file-path', file.path);
            }
            
            const icon = document.createElement('span');
            icon.className = 'file-icon';
            icon.textContent = file.type === 'folder' ? '📁' : '📄';
            
            const name = document.createElement('span');
            name.className = 'file-name';
            name.textContent = file.name;
            
            fileItem.appendChild(icon);
            fileItem.appendChild(name);
            
            if (file.type === 'file') {
                fileItem.addEventListener('click', () => {
                    this.openFile(file);
                    this.selectParentFolder(file);
                });
                
                fileItem.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', file.path);
                    e.dataTransfer.effectAllowed = 'move';
                    fileItem.classList.add('dragging');
                });
                
                fileItem.addEventListener('dragend', () => {
                    fileItem.classList.remove('dragging');
                });
            } else {
                fileItem.addEventListener('click', (e) => {
                    if (e.ctrlKey || e.metaKey) {
                        this.selectFolder(fileItem, file);
                    } else {
                        this.toggleFolder(fileItem, file);
                    }
                });
                fileItem.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    this.selectFolder(fileItem, file);
                });
                
                fileItem.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    fileItem.classList.add('drag-over');
                });
                
                fileItem.addEventListener('dragleave', () => {
                    fileItem.classList.remove('drag-over');
                });
                
                fileItem.addEventListener('drop', (e) => {
                    e.preventDefault();
                    fileItem.classList.remove('drag-over');
                    const draggedFilePath = e.dataTransfer.getData('text/plain');
                    this.moveFile(draggedFilePath, file.path);
                });
            }
            
            fileTree.appendChild(fileItem);
        });
    }

    toggleFolder(folderElement, folder) {
        const isExpanded = folderElement.classList.contains('expanded');
        const icon = folderElement.querySelector('.file-icon');
        
        if (isExpanded) {
            folderElement.classList.remove('expanded');
            icon.textContent = '📁';
            this.hideChildItems(folder.path);
        } else {
            folderElement.classList.add('expanded');
            icon.textContent = '📂';
            this.showChildItems(folder.path);
        }
    }

    hideChildItems(folderPath) {
        const items = document.querySelectorAll('.file-item');
        items.forEach(item => {
            const itemData = this.files.find(f => 
                item.querySelector('.file-name').textContent === f.name
            );
            if (itemData && itemData.path.startsWith(folderPath + '/')) {
                item.style.display = 'none';
                if (itemData.type === 'folder') {
                    item.classList.remove('expanded');
                    const icon = item.querySelector('.file-icon');
                    if (icon) icon.textContent = '📁';
                }
            }
        });
    }

    showChildItems(folderPath) {
        const items = document.querySelectorAll('.file-item');
        const folderLevel = folderPath.split('/').length - 1;
        
        items.forEach(item => {
            const itemData = this.files.find(f => 
                item.querySelector('.file-name').textContent === f.name
            );
            if (itemData && 
                itemData.path.startsWith(folderPath + '/') && 
                itemData.level === folderLevel + 1) {
                item.style.display = 'flex';
            }
        });
    }

    selectFolder(folderElement, folder) {
        const isAlreadySelected = folderElement.classList.contains('selected-folder');
        
        document.querySelectorAll('.file-item.selected-folder').forEach(item => {
            item.classList.remove('selected-folder');
        });
        
        if (!isAlreadySelected) {
            folderElement.classList.add('selected-folder');
            this.selectedFolder = folder;
        } else {
            this.selectedFolder = null;
        }
        
        this.updateUI();
    }

    unselectFolder() {
        document.querySelectorAll('.file-item.selected-folder').forEach(item => {
            item.classList.remove('selected-folder');
        });
        this.selectedFolder = null;
        this.updateUI();
    }

    selectParentFolder(file) {
        const filePath = file.path;
        const pathParts = filePath.split('/');
        
        if (pathParts.length > 1) {
            pathParts.pop();
            const parentPath = pathParts.join('/');
            
            const parentFolder = this.files.find(f => 
                f.type === 'folder' && f.path === parentPath
            );
            
            if (parentFolder) {
                const parentElement = Array.from(document.querySelectorAll('.file-item.folder'))
                    .find(el => el.querySelector('.file-name').textContent === parentFolder.name);
                
                if (parentElement) {
                    this.selectFolder(parentElement, parentFolder);
                }
            }
        } else {
            this.unselectFolder();
        }
    }

    async moveFile(sourceFilePath, targetFolderPath) {
        const fileName = sourceFilePath.split('/').pop();
        const newFilePath = targetFolderPath + '/' + fileName;
        
        if (sourceFilePath === newFilePath) {
            return;
        }
        
        try {
            const response = await fetch('/api/move-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    source: sourceFilePath, 
                    target: newFilePath 
                })
            });

            const result = await response.json();
            if (result.success) {
                await this.loadFiles();
                if (this.currentFile && this.currentFile.path === sourceFilePath) {
                    this.currentFile.path = newFilePath;
                    this.updateUI();
                }
                alert('File moved successfully!');
            } else {
                alert('Error moving file: ' + result.error);
            }
        } catch (error) {
            alert('Error moving file: ' + error.message);
        }
    }

    async moveFileToRoot(sourceFilePath) {
        const fileName = sourceFilePath.split('/').pop();
        
        if (!sourceFilePath.includes('/')) {
            return;
        }
        
        try {
            const response = await fetch('/api/move-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    source: sourceFilePath, 
                    target: fileName 
                })
            });

            const result = await response.json();
            if (result.success) {
                await this.loadFiles();
                if (this.currentFile && this.currentFile.path === sourceFilePath) {
                    this.currentFile.path = fileName;
                    this.updateUI();
                }
                alert('File moved to vault root successfully!');
            } else {
                alert('Error moving file: ' + result.error);
            }
        } catch (error) {
            alert('Error moving file: ' + error.message);
        }
    }

    async openFile(file) {
        if (this.unsavedChanges) {
            if (!confirm('You have unsaved changes. Continue without saving?')) {
                return;
            }
        }

        try {
            const response = await fetch(`/api/file/${file.path}`);
            const result = await response.json();
            
            if (result.content !== undefined) {
                this.currentFile = file;
                
                if (this.editor) {
                    this.editor.setValue(result.content);
                    this.unsavedChanges = false;
                    this.updateUI();
                    this.highlightActiveFile();
                    this.editor.focus();
                    // Ensure proper sizing after content load
                    this.editor.refresh();
                }
            } else {
                alert('Error opening file: ' + result.error);
            }
        } catch (error) {
            alert('Error opening file: ' + error.message);
        }
    }

    highlightActiveFile() {
        document.querySelectorAll('.file-item').forEach(item => {
            item.classList.remove('active');
            if (this.currentFile && item.textContent === this.currentFile.name) {
                item.classList.add('active');
            }
        });
    }

    async newFile() {
        const fileName = prompt('Enter file name (with .md extension):');
        if (!fileName) return;
        
        if (!fileName.endsWith('.md')) {
            alert('File name must end with .md');
            return;
        }

        if (this.unsavedChanges) {
            if (!confirm('You have unsaved changes. Continue without saving?')) {
                return;
            }
        }

        let filePath = fileName;
        if (this.selectedFolder) {
            filePath = this.selectedFolder.path + '/' + fileName;
        }

        const newFile = {
            name: fileName,
            path: filePath,
            full_path: filePath,
            type: 'file'
        };

        this.currentFile = newFile;
        if (this.editor) {
            this.editor.setValue('');
            this.editor.focus();
        }
        this.unsavedChanges = true;
        this.updatePreview();
        this.updateUI();
    }

    async saveFile() {
        if (!this.currentFile || !this.editor) return;

        const content = this.editor.getValue();
        
        try {
            const response = await fetch(`/api/file/${this.currentFile.path}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });

            const result = await response.json();
            if (result.success) {
                this.unsavedChanges = false;
                this.updateUI();
                await this.loadFiles();
                alert('File saved successfully!');
            } else {
                alert('Error saving file: ' + result.error);
            }
        } catch (error) {
            alert('Error saving file: ' + error.message);
        }
    }

    async deleteFile() {
        if (!this.currentFile) return;

        if (!confirm(`Are you sure you want to delete "${this.currentFile.name}"?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/file/${this.currentFile.path}`, {
                method: 'DELETE'
            });

            const result = await response.json();
            if (result.success) {
                this.currentFile = null;
                if (this.editor) {
                    this.editor.setValue('');
                }
                this.unsavedChanges = false;
                this.updatePreview();
                this.updateUI();
                await this.loadFiles();
                alert('File deleted successfully!');
            } else {
                alert('Error deleting file: ' + result.error);
            }
        } catch (error) {
            alert('Error deleting file: ' + error.message);
        }
    }

    async updatePreview() {
        if (!this.editor) return;
        
        const content = this.editor.getValue();
        
        try {
            const response = await fetch('/api/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });

            const result = await response.json();
            if (result.html !== undefined) {
                document.getElementById('preview').innerHTML = result.html;
            }
        } catch (error) {
            console.error('Error updating preview:', error);
        }
    }

    updateUI() {
        const currentFileEl = document.getElementById('current-file');
        const saveBtn = document.getElementById('save-file');
        const deleteBtn = document.getElementById('delete-file');
        const newFileBtn = document.getElementById('new-file');
        const sidebarHeader = document.querySelector('.sidebar h3');

        const hasVault = this.files && this.files.length > 0;
        newFileBtn.disabled = !hasVault;

        if (this.vaultName) {
            sidebarHeader.textContent = `🗄️ ${this.vaultName.toUpperCase()}`;
        } else {
            sidebarHeader.textContent = 'Files';
        }

        if (this.currentFile) {
            let displayName = this.currentFile.name;
            if (this.selectedFolder) {
                displayName = `${this.selectedFolder.name}/${this.currentFile.name}`;
            }
            displayName += this.unsavedChanges ? ' *' : '';
            currentFileEl.textContent = displayName;
            saveBtn.disabled = !this.unsavedChanges;
            deleteBtn.disabled = false;
        } else {
            let statusText = 'No file selected';
            if (this.selectedFolder) {
                statusText += ` • Selected folder: ${this.selectedFolder.name}`;
            }
            currentFileEl.textContent = statusText;
            saveBtn.disabled = true;
            deleteBtn.disabled = true;
        }
    }

    debouncedSimilaritySearch() {
        if (this.similarityTimeout) {
            clearTimeout(this.similarityTimeout);
        }
        
        this.similarityTimeout = setTimeout(() => {
            this.searchSimilarContent();
        }, 1000); // Wait 1 second after user stops typing
    }

    async searchSimilarContent() {
        if (!this.currentFile || !this.editor) {
            this.updateSimilarContentDisplay([]);
            return;
        }

        const content = this.editor.getValue().trim();
        if (content.length < 50) { // Only search if there's substantial content
            this.updateSimilarContentDisplay([]);
            return;
        }

        try {
            const response = await fetch('/api/similar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    query: content,
                    current_file: this.currentFile.path,
                    limit: 5
                })
            });

            const result = await response.json();
            if (result.similar) {
                this.updateSimilarContentDisplay(result.similar);
            } else {
                console.error('Error searching similar content:', result.error);
                this.updateSimilarContentDisplay([]);
            }
        } catch (error) {
            console.error('Error searching similar content:', error);
            this.updateSimilarContentDisplay([]);
        }
    }

    updateSimilarContentDisplay(similarItems) {
        const container = document.getElementById('similar-content');
        
        if (similarItems.length === 0) {
            container.innerHTML = '<p class="empty-state">Type to see related content...</p>';
            return;
        }

        container.innerHTML = '';
        
        similarItems.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = 'similar-item';
            
            const headerEl = document.createElement('div');
            headerEl.className = 'similar-item-header';
            
            const fileEl = document.createElement('span');
            fileEl.className = 'similar-item-file';
            fileEl.textContent = item.file_path;
            
            const scoreEl = document.createElement('span');
            scoreEl.className = 'similar-item-score';
            scoreEl.textContent = Math.round(item.similarity * 100) + '%';
            
            const snippetEl = document.createElement('div');
            snippetEl.className = 'similar-item-snippet';
            snippetEl.textContent = item.snippet;
            
            headerEl.appendChild(fileEl);
            headerEl.appendChild(scoreEl);
            
            itemEl.appendChild(headerEl);
            itemEl.appendChild(snippetEl);
            
            // Add click handler to open the similar file
            itemEl.addEventListener('click', () => {
                this.openSimilarFile(item.file_path);
            });
            
            container.appendChild(itemEl);
        });
    }

    async openSimilarFile(filePath) {
        const file = this.files.find(f => f.path === filePath);
        if (file) {
            await this.openFile(file);
        }
    }

    async reindexVault() {
        if (!this.vaultName) {
            alert('No vault selected');
            return;
        }

        const button = document.getElementById('reindex');
        const originalText = button.textContent;
        button.textContent = 'Indexing...';
        button.disabled = true;

        try {
            const response = await fetch('/api/reindex', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();
            if (result.success) {
                alert(`Successfully indexed ${result.processed} files!`);
                // Trigger a new similarity search if we have content
                if (this.currentFile && this.editor) {
                    this.searchSimilarContent();
                }
            } else {
                alert('Error indexing vault: ' + result.error);
            }
        } catch (error) {
            alert('Error indexing vault: ' + error.message);
        } finally {
            button.textContent = originalText;
            button.disabled = false;
        }
    }

    async loadAvailableModels() {
        try {
            const response = await fetch('/api/models');
            const result = await response.json();
            
            this.availableModels = result.models;
            this.currentModel = result.current_model;
            this.updateModelSelector();
        } catch (error) {
            console.error('Error loading available models:', error);
        }
    }

    updateModelSelector() {
        const selector = document.getElementById('model-selector');
        selector.innerHTML = '';
        
        this.availableModels.forEach(model => {
            const option = document.createElement('option');
            option.value = model.name;
            option.textContent = model.name;
            option.selected = model.name === this.currentModel;
            selector.appendChild(option);
        });
        
        this.updateModelInfo();
    }

    updateModelInfo() {
        const infoDiv = document.getElementById('model-info');
        const currentModelData = this.availableModels.find(m => m.name === this.currentModel);
        
        if (currentModelData) {
            infoDiv.innerHTML = `
                <div class="model-desc">${currentModelData.description}</div>
                <div class="model-meta">
                    <span>Size: ${currentModelData.size}</span>
                    <span>Max: ${currentModelData.max_seq_length}</span>
                </div>
            `;
        } else {
            infoDiv.innerHTML = '';
        }
    }

    async changeModel(modelName) {
        if (!modelName || modelName === this.currentModel) return;
        
        const selector = document.getElementById('model-selector');
        selector.disabled = true;
        
        try {
            const response = await fetch('/api/models/current', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model_name: modelName })
            });
            
            const result = await response.json();
            if (result.success) {
                this.currentModel = modelName;
                this.updateModelInfo();
                
                // Show notification about reindexing
                if (this.vaultName) {
                    const shouldReindex = confirm(`Model changed to ${modelName}. Would you like to reindex the vault now to use the new embeddings?`);
                    if (shouldReindex) {
                        await this.reindexVault();
                    }
                }
            } else {
                alert('Error changing model: ' + result.error);
                // Revert selection
                selector.value = this.currentModel;
            }
        } catch (error) {
            alert('Error changing model: ' + error.message);
            selector.value = this.currentModel;
        } finally {
            selector.disabled = false;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PyNote();
});