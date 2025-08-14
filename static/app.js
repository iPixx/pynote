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
        this.aiStatus = null;
        this.aiModels = [];
        this.selectedText = '';
        this.contextMenu = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.initEditor();
        this.loadAvailableModels();
        this.initAI();
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
        document.getElementById('new-folder').addEventListener('click', () => this.newFolder());
        document.getElementById('save-file').addEventListener('click', () => this.saveFile());
        document.getElementById('delete-file').addEventListener('click', () => this.deleteFile());
        document.getElementById('reindex').addEventListener('click', () => this.reindexVault());
        document.getElementById('model-selector').addEventListener('change', (e) => this.changeModel(e.target.value));
        
        // AI Assistant events
        document.getElementById('ai-generate').addEventListener('click', () => this.generateAIResponse());
        document.getElementById('ai-prompt').addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.generateAIResponse();
            }
        });
        document.getElementById('ai-save-prompt').addEventListener('click', () => this.saveSystemPrompt());
        document.getElementById('ai-reset-prompt').addEventListener('click', () => this.resetSystemPrompt());
        
        document.getElementById('cancel-vault').addEventListener('click', () => this.closeVaultDialog());
        document.getElementById('confirm-vault').addEventListener('click', () => this.selectVault());
        document.getElementById('browse-vault').addEventListener('click', () => this.browseVault());
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.file-item') && !e.target.closest('.file-controls')) {
                this.unselectFolder();
            }
            
            // Hide context menu on click outside
            if (!e.target.closest('.context-menu')) {
                this.hideContextMenu();
            }
        });
        
        // Context menu events
        document.addEventListener('contextmenu', (e) => this.handleContextMenu(e));
        document.addEventListener('click', (e) => {
            if (e.target.closest('.context-menu-item')) {
                const action = e.target.closest('.context-menu-item').dataset.action;
                this.handleContextAction(action);
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
                return '';
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
            fileItem.setAttribute('data-path', file.path);
            fileItem.setAttribute('data-level', file.level || 0);
            fileItem.setAttribute('data-type', file.type);
            
            // Show root level items by default, hide nested ones
            if ((file.level || 0) === 0) {
                fileItem.style.display = 'flex';
            } else {
                fileItem.style.display = 'none';
            }
            
            if (file.type === 'file') {
                fileItem.draggable = true;
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
                
                fileItem.addEventListener('dblclick', () => {
                    this.renameItem(file);
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
                fileItem.addEventListener('click', () => {
                    this.toggleFolder(fileItem, file);
                });
                
                fileItem.addEventListener('dblclick', () => {
                    this.renameItem(file);
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
            const itemPath = item.getAttribute('data-path');
            if (itemPath && itemPath.startsWith(folderPath + '/')) {
                item.style.display = 'none';
                if (item.getAttribute('data-type') === 'folder') {
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
            const itemPath = item.getAttribute('data-path');
            const itemLevel = parseInt(item.getAttribute('data-level'));
            if (itemPath && 
                itemPath.startsWith(folderPath + '/') && 
                itemLevel === folderLevel + 1) {
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

    async newFolder() {
        const folderName = prompt('Enter folder name:');
        if (!folderName) return;

        let parentPath = '';
        if (this.selectedFolder) {
            parentPath = this.selectedFolder.path;
        }

        try {
            const response = await fetch('/api/create-folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    folder_name: folderName,
                    parent_path: parentPath
                })
            });

            const result = await response.json();
            if (result.success) {
                await this.loadFiles();
                alert('Folder created successfully!');
            } else {
                alert('Error creating folder: ' + result.error);
            }
        } catch (error) {
            alert('Error creating folder: ' + error.message);
        }
    }

    async renameItem(item) {
        const currentName = item.name;
        const newName = prompt(`Rename ${item.type}:`, currentName);
        if (!newName || newName === currentName) return;

        try {
            const response = await fetch('/api/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    old_path: item.path,
                    new_name: newName
                })
            });

            const result = await response.json();
            if (result.success) {
                await this.loadFiles();
                
                // Update current file path if this was the current file
                if (this.currentFile && this.currentFile.path === item.path) {
                    this.currentFile.path = result.new_path;
                    this.currentFile.name = newName;
                }
                
                alert(`${item.type.charAt(0).toUpperCase() + item.type.slice(1)} renamed successfully!`);
            } else {
                alert('Error renaming: ' + result.error);
            }
        } catch (error) {
            alert('Error renaming: ' + error.message);
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
        const newFolderBtn = document.getElementById('new-folder');
        const sidebarHeader = document.querySelector('.sidebar h3');

        const hasVault = this.files && this.files.length > 0;
        newFileBtn.disabled = !hasVault;
        newFolderBtn.disabled = !hasVault;

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
            const percentage = Math.round(item.similarity * 100);
            scoreEl.textContent = percentage + '%';
            
            // Add confidence-based color class
            const confidenceClass = this.getConfidenceClass(percentage);
            scoreEl.classList.add(confidenceClass);
            
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

    getConfidenceClass(percentage) {
        if (percentage >= 80) {
            return 'confidence-very-high';  // 80-100%: Green
        } else if (percentage >= 60) {
            return 'confidence-high';       // 60-79%: Teal
        } else if (percentage >= 40) {
            return 'confidence-medium';     // 40-59%: Yellow
        } else if (percentage >= 20) {
            return 'confidence-low';        // 20-39%: Orange
        } else {
            return 'confidence-very-low';   // 0-19%: Red
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

    // AI Assistant Methods
    async initAI() {
        this.contextMenu = document.getElementById('context-menu');
        await this.checkAIStatus();
        await this.loadSystemPrompt();
    }

    async checkAIStatus() {
        try {
            const response = await fetch('/api/ai/status');
            const status = await response.json();
            this.aiStatus = status;
            this.aiModels = status.available_models;
            this.updateAIStatus();
            this.updateAIModelSelector();
        } catch (error) {
            console.error('Error checking AI status:', error);
            this.updateAIStatus(false);
        }
    }

    updateAIStatus(isOnline = null) {
        const statusElement = document.getElementById('ai-status');
        const indicator = statusElement.querySelector('.status-indicator');
        const text = statusElement.querySelector('.status-text');
        
        const online = isOnline !== null ? isOnline : this.aiStatus?.ollama_available;
        
        if (online) {
            statusElement.className = 'ai-status online';
            indicator.textContent = '🟢';
            indicator.className = 'status-indicator online';
            text.textContent = 'Ollama Connected';
        } else {
            statusElement.className = 'ai-status offline';
            indicator.textContent = '🔴';
            indicator.className = 'status-indicator offline';
            text.textContent = 'Ollama Offline';
        }
    }

    updateAIModelSelector() {
        const selector = document.getElementById('ai-model-selector');
        selector.innerHTML = '';
        
        if (this.aiModels.length > 0) {
            this.aiModels.forEach(model => {
                const option = document.createElement('option');
                option.value = model;
                option.textContent = model;
                if (model === this.aiStatus?.default_model) {
                    option.selected = true;
                }
                selector.appendChild(option);
            });
        } else {
            const option = document.createElement('option');
            option.textContent = 'No models available';
            option.disabled = true;
            selector.appendChild(option);
        }
    }

    async generateAIResponse(useStreaming = true) {
        const promptElement = document.getElementById('ai-prompt');
        const generateBtn = document.getElementById('ai-generate');
        const responseContent = document.querySelector('.ai-response-content');
        const responseMeta = document.querySelector('.ai-response-meta');
        const useContext = document.getElementById('ai-use-context').checked;
        const model = document.getElementById('ai-model-selector').value;
        
        const prompt = promptElement.value.trim();
        if (!prompt) return;
        
        // Disable UI
        generateBtn.disabled = true;
        generateBtn.textContent = 'Generating...';
        
        // Clear previous response
        responseContent.textContent = '';
        responseContent.className = 'ai-response-content loading';
        responseMeta.textContent = '';
        
        if (useStreaming) {
            try {
                responseContent.textContent = 'Thinking...';
                responseContent.className = 'ai-response-content streaming';
                
                const response = await fetch('/api/ai/stream', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt, use_context: useContext, model })
                });
                
                if (!response.ok) {
                    throw new Error('Failed to generate response');
                }
                
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let contextCount = 0;
                
                responseContent.textContent = '';
                
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                if (data.type === 'context') {
                                    contextCount = data.items;
                                } else if (data.type === 'token') {
                                    responseContent.textContent += data.content;
                                } else if (data.type === 'done') {
                                    responseContent.className = 'ai-response-content';
                                    responseMeta.textContent = contextCount > 0 ? 
                                        `Used context from ${contextCount} notes` : 'No context used';
                                } else if (data.type === 'error') {
                                    throw new Error(data.message);
                                }
                            } catch (e) {
                                console.error('Error parsing SSE data:', e);
                            }
                        }
                    }
                }
            } catch (error) {
                responseContent.textContent = `Error: ${error.message}`;
                responseContent.className = 'ai-response-content error';
                responseMeta.textContent = '';
            }
        } else {
            // Fallback to non-streaming
            try {
                responseContent.textContent = 'Generating response...';
                
                const response = await fetch('/api/ai/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ prompt, use_context: useContext, model })
                });
                
                const result = await response.json();
                
                if (result.error) {
                    throw new Error(result.error);
                }
                
                responseContent.textContent = result.response;
                responseContent.className = 'ai-response-content';
                responseMeta.textContent = result.context_used > 0 ? 
                    `Used context from ${result.context_used} notes` : 'No context used';
                    
            } catch (error) {
                responseContent.textContent = `Error: ${error.message}`;
                responseContent.className = 'ai-response-content error';
                responseMeta.textContent = '';
            }
        }
        
        // Re-enable UI
        generateBtn.disabled = false;
        generateBtn.textContent = 'Generate';
    }

    handleContextMenu(e) {
        if (!this.codeMirror) return;
        
        // Check if right-click is inside editor
        const editorElement = this.codeMirror.getWrapperElement();
        if (!editorElement.contains(e.target)) return;
        
        // Get selected text
        const selectedText = this.codeMirror.getSelection();
        if (!selectedText.trim()) return;
        
        e.preventDefault();
        this.selectedText = selectedText;
        this.showContextMenu(e.pageX, e.pageY);
    }

    showContextMenu(x, y) {
        if (!this.contextMenu) return;
        
        this.contextMenu.style.left = x + 'px';
        this.contextMenu.style.top = y + 'px';
        this.contextMenu.style.display = 'block';
        
        // Adjust position if menu goes off screen
        const rect = this.contextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            this.contextMenu.style.left = (x - rect.width) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            this.contextMenu.style.top = (y - rect.height) + 'px';
        }
    }

    hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.style.display = 'none';
        }
    }

    async handleContextAction(action) {
        this.hideContextMenu();
        
        if (!this.selectedText.trim()) return;
        
        const model = document.getElementById('ai-model-selector').value;
        const context = this.editor ? this.editor.getValue() : '';
        
        try {
            let endpoint, payload;
            
            switch (action) {
                case 'expand':
                    endpoint = '/api/ai/expand';
                    payload = { text: this.selectedText, context, model };
                    break;
                case 'summarize':
                    endpoint = '/api/ai/summarize';
                    payload = { text: this.selectedText, model };
                    break;
                case 'rephrase-professional':
                    endpoint = '/api/ai/rephrase';
                    payload = { text: this.selectedText, tone: 'professional', model };
                    break;
                case 'rephrase-casual':
                    endpoint = '/api/ai/rephrase';
                    payload = { text: this.selectedText, tone: 'casual', model };
                    break;
                case 'rephrase-academic':
                    endpoint = '/api/ai/rephrase';
                    payload = { text: this.selectedText, tone: 'academic', model };
                    break;
                default:
                    return;
            }
            
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const result = await response.json();
            
            if (result.error) {
                throw new Error(result.error);
            }
            
            // Get the result text based on action
            let resultText;
            if (action === 'expand') {
                resultText = result.expanded_text;
            } else if (action === 'summarize') {
                resultText = result.summary;
            } else if (action.startsWith('rephrase')) {
                resultText = result.rephrased_text;
            }
            
            // Replace selected text with result
            if (this.codeMirror && resultText) {
                this.codeMirror.replaceSelection(resultText);
                this.unsavedChanges = true;
                this.updateUI();
            }
            
        } catch (error) {
            alert(`Error processing text: ${error.message}`);
        }
    }

    async loadSystemPrompt() {
        try {
            const response = await fetch('/api/ai/system-prompt');
            const data = await response.json();
            
            document.getElementById('ai-system-prompt').value = data.system_prompt;
        } catch (error) {
            console.error('Error loading system prompt:', error);
        }
    }

    async saveSystemPrompt() {
        const promptElement = document.getElementById('ai-system-prompt');
        const prompt = promptElement.value.trim();
        
        try {
            const response = await fetch('/api/ai/system-prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });
            
            const result = await response.json();
            if (result.success) {
                alert('System prompt saved successfully!');
            } else {
                alert('Error saving system prompt');
            }
        } catch (error) {
            alert(`Error saving system prompt: ${error.message}`);
        }
    }

    async resetSystemPrompt() {
        try {
            const response = await fetch('/api/ai/system-prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: '' })
            });
            
            const result = await response.json();
            if (result.success) {
                document.getElementById('ai-system-prompt').value = result.system_prompt;
                alert('System prompt reset to default!');
            } else {
                alert('Error resetting system prompt');
            }
        } catch (error) {
            alert(`Error resetting system prompt: ${error.message}`);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PyNote();
});