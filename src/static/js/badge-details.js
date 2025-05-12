class BadgeDetailsPage {
    constructor() {
        this.badgeId = this.getBadgeIdFromUrl();
        this.currentBadge = null;
        this.currentUser = null;
        this.loadInitialData();
        this.initTheme();
        this.setupEventListeners();
    }

    async loadInitialData() {
        try {
            // Load badge details
            const response = await fetch(`/badge-details-api/${this.badgeId}`);
            const data = await response.json();
            
            if (data.error) {
                document.getElementById('badge-title').textContent = 'Badge Not Found';
                document.getElementById('badge-users').innerHTML = '<p>This badge could not be found.</p>';
                return;
            }
            
            this.currentBadge = data.badge;
            this.renderBadgeDetails(data);
            this.renderUsersList(data.users);
            
            // Check if user is logged in
            this.loadUserFromStorage();
            this.updateAuthUI();
            
        } catch (error) {
            console.error('Error loading badge details:', error);
            document.getElementById('badge-users').innerHTML = '<p>Error loading badge details.</p>';
        }
    }
    
    getBadgeIdFromUrl() {
        const pathParts = window.location.pathname.split('/');
        return pathParts[pathParts.length - 1];
    }
    
    renderBadgeDetails(data) {
        const badge = data.badge;
        const badgeTitle = document.getElementById('badge-title');
        const badgeName = document.getElementById('badge-name');
        const badgeDescription = document.getElementById('badge-description');
        const badgeCount = document.getElementById('badge-count');
        const badgeImage = document.getElementById('badge-image');
        
        // Set badge title
        badgeTitle.textContent = badge.name;
        
        // Set badge details
        badgeName.textContent = badge.name;
        badgeDescription.textContent = badge.description;
        badgeCount.textContent = data.award_count;
        
        // Set badge image
        if (badge.icon) {
            badgeImage.innerHTML = `<img src="/static/images/${badge.icon}" alt="${badge.name}">`;
        } else {
            badgeImage.textContent = badge.name.charAt(0);
        }
    }
    
    renderUsersList(users) {
        const usersList = document.getElementById('badge-users');
        usersList.innerHTML = '';
        
        if (!users || users.length === 0) {
            usersList.innerHTML = '<p>No users have been awarded this badge yet.</p>';
            return;
        }
        
        users.forEach(user => {
            const userItem = document.createElement('div');
            userItem.classList.add('user-item');
            
            const displayName = user.display_name || user.username;
            const userInitial = displayName.charAt(0).toUpperCase();
            
            // Check if badge was awarded by someone
            let awardedByHTML = '';
            if (user.awarded_by) {
                const awarderName = user.awarded_by.display_name || user.awarded_by.username;
                awardedByHTML = `<div class="awarded-by">Awarded by ${awarderName}</div>`;
            }
            
            // Format the award date if available
            let awardDateHTML = '';
            if (user.award_date) {
                const date = new Date(user.award_date);
                const formattedDate = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                awardDateHTML = `<div class="award-date">${formattedDate}</div>`;
            }
            
            userItem.innerHTML = `
                <div class="user-icon">${userInitial}</div>
                <div class="user-info">
                    <div class="user-name">${displayName}</div>
                    ${awardedByHTML}
                    ${awardDateHTML}
                </div>
            `;
            
            usersList.appendChild(userItem);
        });
    }
    
    loadUserFromStorage() {
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            try {
                this.currentUser = JSON.parse(storedUser);
            } catch (e) {
                console.error('Failed to parse user from localStorage:', e);
                localStorage.removeItem('currentUser');
            }
        }
    }
    
    initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
    }
    
    setupEventListeners() {
        const themeToggle = document.getElementById('theme-toggle');
        const loginBtn = document.getElementById('login-btn');
        const registerBtn = document.getElementById('register-btn');
        const userInfoContainer = document.getElementById('user-info');
        const editBadgeBtn = document.getElementById('edit-badge-btn');
        const awardBadgeBtn = document.getElementById('award-badge-btn');
        const confirmAwardBtn = document.getElementById('confirm-award-badge');
        
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }
        
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                this.openModal('login-modal');
            });
        }
        
        if (registerBtn) {
            registerBtn.addEventListener('click', () => {
                this.openModal('register-modal');
            });
        }
        
        if (userInfoContainer) {
            userInfoContainer.addEventListener('click', () => {
                if (this.currentUser) {
                    this.handleLogout();
                }
            });
        }
        
        if (editBadgeBtn) {
            editBadgeBtn.addEventListener('click', () => {
                this.handleEditBadge();
            });
        }
        
        if (awardBadgeBtn) {
            awardBadgeBtn.addEventListener('click', () => {
                this.handleOpenAwardBadge();
            });
        }
        
        if (confirmAwardBtn) {
            confirmAwardBtn.addEventListener('click', () => {
                this.handleAwardBadge();
            });
        }
        
        // Setup login form submission
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', this.handleLogin.bind(this));
        }
        
        // Setup register form submission
        const registerForm = document.getElementById('register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', this.handleRegister.bind(this));
        }
        
        // Setup modal close buttons
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            const closeButtons = modal.querySelectorAll('.close-modal');
            closeButtons.forEach(btn => {
                btn.addEventListener('click', () => this.closeModal(modal));
            });
        });
        
        // Close modal when clicking outside
        window.addEventListener('click', (event) => {
            if (event.target.classList.contains('modal')) {
                this.closeModal(event.target);
            }
        });
    }
    
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'block';
    }
    
    closeModal(modal) {
        modal.style.display = 'none';
    }
    
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    }
    
    async handleLogin(event) {
        event.preventDefault();
        const username = document.getElementById('login-username').value;
        const password = document.getElementById('login-password').value;
        
        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const result = await response.json();
            if (result.success) {
                this.currentUser = { id: result.user_id, username: username };
                localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
                this.updateAuthUI();
                this.closeModal(document.getElementById('login-modal'));
            } else {
                alert(result.message || 'Login failed');
            }
        } catch (error) {
            console.error('Login error:', error);
            alert('An error occurred during login');
        }
    }
    
    async handleRegister(event) {
        event.preventDefault();
        const username = document.getElementById('register-username').value;
        const password = document.getElementById('register-password').value;
        const confirmPassword = document.getElementById('register-confirm-password').value;
        
        if (password !== confirmPassword) {
            alert('Passwords do not match');
            return;
        }
        
        try {
            const response = await fetch('/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            const result = await response.json();
            if (result.success) {
                this.closeModal(document.getElementById('register-modal'));
                alert('Registration successful! You can now log in.');
            } else {
                alert(result.message || 'Registration failed');
            }
        } catch (error) {
            console.error('Registration error:', error);
            alert('An error occurred during registration');
        }
    }
    
    handleLogout() {
        this.currentUser = null;
        localStorage.removeItem('currentUser');
        this.updateAuthUI();
    }
    
    updateAuthUI() {
        const loginBtn = document.getElementById('login-btn');
        const registerBtn = document.getElementById('register-btn');
        const userInfo = document.getElementById('user-info');
        const usernameDisplay = document.getElementById('username-display');
        const editBadgeBtn = document.getElementById('edit-badge-btn');
        
        if (this.currentUser) {
            if (usernameDisplay) usernameDisplay.textContent = this.currentUser.display_name || this.currentUser.username;
            if (userInfo) userInfo.style.display = 'flex';
            if (loginBtn) loginBtn.style.display = 'none';
            if (registerBtn) registerBtn.style.display = 'none';
            
            // Show admin badge next to the main H1 header for admin users
            if (this.currentUser.role === 'admin') {
                const mainHeader = document.querySelector('header h1');
                if (mainHeader && !document.querySelector('.admin-badge')) {
                    const adminBadge = document.createElement('span');
                    adminBadge.className = 'admin-badge';
                    adminBadge.textContent = 'Admin';
                    mainHeader.appendChild(adminBadge);
                }
                
                // Show edit button only for admins
                if (editBadgeBtn) {
                    editBadgeBtn.style.display = 'inline-block';
                }
            } else {
                // Hide edit button for non-admin users
                if (editBadgeBtn) {
                    editBadgeBtn.style.display = 'none';
                }
            }
        } else {
            if (userInfo) userInfo.style.display = 'none';
            if (loginBtn) loginBtn.style.display = 'inline-block';
            if (registerBtn) registerBtn.style.display = 'inline-block';
            
            // Hide edit button for logged out users
            if (editBadgeBtn) {
                editBadgeBtn.style.display = 'none';
            }
        }
    }
    
    handleEditBadge() {
        if (!this.currentBadge) {
            console.error('Cannot edit badge: no badge data available');
            return;
        }
        
        // Check if edit modal exists, create it if it doesn't
        let editModal = document.getElementById('edit-badge-modal');
        if (!editModal) {
            // Create modal if it doesn't exist
            editModal = document.createElement('div');
            editModal.id = 'edit-badge-modal';
            editModal.className = 'modal';
            editModal.innerHTML = `
                <form id="edit-badge-form" class="modal-content">
                    <h2>Edit Badge</h2>
                    <input type="hidden" id="edit-badge-id">
                    <div class="badge-upload-preview" id="edit-badge-preview">
                        <span>Badge Image</span>
                    </div>
                    <div class="file-input-container">
                        <label for="edit-badge-image">Choose Image</label>
                        <input type="file" id="edit-badge-image" accept="image/*">
                        <input type="hidden" id="edit-badge-icon-name">
                    </div>
                    <input type="text" id="edit-badge-name" placeholder="Badge Name" maxlength="60" required>
                    <textarea id="edit-badge-description" placeholder="Badge Description" required></textarea>
                    <button type="submit">Update Badge</button>
                    <button type="button" class="close-modal">Cancel</button>
                </form>
            `;
            document.querySelector('.container').appendChild(editModal);
            
            // Add event listeners
            const form = editModal.querySelector('#edit-badge-form');
            form.addEventListener('submit', this.handleUpdateBadge.bind(this));
            
            const closeBtn = editModal.querySelector('.close-modal');
            closeBtn.addEventListener('click', () => this.closeModal(editModal));
            
            // Set up image preview functionality
            const imageInput = document.getElementById('edit-badge-image');
            if (imageInput) {
                imageInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            const preview = document.getElementById('edit-badge-preview');
                            preview.innerHTML = `<img src="${e.target.result}" alt="Badge Preview">`;
                            
                            // Generate a filename for the icon
                            const timestamp = new Date().getTime();
                            const fileName = `badge_${timestamp}_${file.name.replace(/\s+/g, '_')}`;
                            document.getElementById('edit-badge-icon-name').value = fileName;
                        };
                        reader.readAsDataURL(file);
                    }
                });
            }
        }
        
        // Populate the form with badge data
        document.getElementById('edit-badge-id').value = this.currentBadge.id;
        document.getElementById('edit-badge-name').value = this.currentBadge.name;
        document.getElementById('edit-badge-description').value = this.currentBadge.description || '';
        
        // Set badge image in preview
        const preview = document.getElementById('edit-badge-preview');
        if (this.currentBadge.icon) {
            preview.innerHTML = `<img src="/static/images/${this.currentBadge.icon}" alt="${this.currentBadge.name}">`;
        } else {
            preview.innerHTML = `<span>${this.currentBadge.name.charAt(0)}</span>`;
        }
        
        this.openModal('edit-badge-modal');
    }
    
    async handleUpdateBadge(event) {
        event.preventDefault();
        const badgeId = document.getElementById('edit-badge-id').value;
        const name = document.getElementById('edit-badge-name').value;
        const description = document.getElementById('edit-badge-description').value;
        const iconName = document.getElementById('edit-badge-icon-name')?.value;
        const imageInput = document.getElementById('edit-badge-image');

        try {
            // First, upload image if one was selected
            let finalIconName = iconName || this.currentBadge.icon || '';
            if (imageInput && imageInput.files.length > 0) {
                const formData = new FormData();
                formData.append('image', imageInput.files[0]);
                formData.append('filename', iconName);
                
                console.log('Uploading file:', imageInput.files[0].name, 'size:', imageInput.files[0].size);
                
                try {
                    const uploadResponse = await fetch('/upload/badge-image', {
                        method: 'POST',
                        body: formData
                    });
                    
                    const uploadResult = await uploadResponse.json();
                    if (uploadResult.success) {
                        finalIconName = uploadResult.filename;
                    } else {
                        alert('Image upload failed, proceeding without image');
                    }
                } catch (uploadError) {
                    console.error('Image upload error:', uploadError);
                    alert('Image upload failed, proceeding without image');
                }
            }
            
            // Then update the badge data
            const response = await fetch(`/badges/${badgeId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name, 
                    description,
                    icon: finalIconName
                })
            });
            
            const result = await response.json();
            if (result.success) {
                this.closeModal(document.getElementById('edit-badge-modal'));
                // Refresh page to see the updates
                window.location.reload();
            } else {
                alert('Failed to update badge: ' + (result.message || 'Unknown error'));
            }
        } catch (error) {
            console.error('Update badge error:', error);
            alert('An error occurred while updating the badge');
        }
    }
    
    async handleOpenAwardBadge() {
        if (!this.currentUser) {
            alert('You must be logged in to award badges');
            return;
        }
        
        if (!this.currentBadge) {
            alert('Badge information not available');
            return;
        }
        
        try {
            // Fetch all users to populate the dropdown
            const response = await fetch('/users');
            const users = await response.json();
            
            const userSelect = document.getElementById('award-user-select');
            userSelect.innerHTML = '<option value="">Select User</option>';
            
            // Add all users except the current user
            users.forEach(user => {
                // Skip the current user to prevent self-awarding
                if (user.id === this.currentUser.id) return;
                
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = user.display_name || user.username;
                userSelect.appendChild(option);
            });
            
            this.openModal('award-badge-modal');
        } catch (error) {
            console.error('Error loading users:', error);
            alert('Failed to load users');
        }
    }
    
    async handleAwardBadge() {
        if (!this.currentUser) {
            alert('You must be logged in to award badges');
            return;
        }
        
        const userId = document.getElementById('award-user-select').value;
        const badgeId = this.currentBadge?.id;
        
        if (!userId || !badgeId) {
            alert('Please select a user to award this badge to');
            return;
        }
        
        // Prevent awarding to self (double-check)
        if (userId === this.currentUser.id) {
            alert('You cannot award badges to yourself');
            return;
        }
        
        try {
            const response = await fetch('/badges/award', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    user_id: userId, 
                    badge_id: badgeId,
                    awarded_by: this.currentUser.id 
                })
            });

            const result = await response.json();
            if (result.success) {
                this.closeModal(document.getElementById('award-badge-modal'));
                alert(`Badge ${this.currentBadge.name} successfully awarded!`);
                
                // Refresh the badge details to update the user list
                this.loadInitialData();
            } else {
                alert(result.message || 'Failed to award badge');
            }
        } catch (error) {
            console.error('Award badge error:', error);
            alert('An error occurred while awarding badge');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new BadgeDetailsPage();
});