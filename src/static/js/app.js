class BadgeTrackingApp {
    constructor() {
        this.currentUser = null;
        this.handleLogin = this.handleLogin.bind(this);
        this.handleRegister = this.handleRegister.bind(this);
        this.handleLogout = this.handleLogout.bind(this);
        this.handleAwardBadge = this.handleAwardBadge.bind(this);
        this.initThemeToggle();
        this.initWebSocket();
        this.initDOMElements();
        this.loadUserFromStorage(); // Load user from localStorage first
        this.setupEventListeners();
        this.setupModals();
        this.loadInitialData();
        this.updateAuthUI();
        console.log('Badge Tracking App initialized successfully');
    }

    initDOMElements() {
        this.feedContainer = document.getElementById('feed-container');
        this.profileBadgesContainer = document.getElementById('profile-badges');
        this.availableBadgesContainer = document.getElementById('available-badges');
        this.loginForm = document.getElementById('login-form');
        this.loginUsername = document.getElementById('login-username');
        this.loginPassword = document.getElementById('login-password');
    }
    
    loadUserFromStorage() {
        // Check if user is stored in localStorage
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            try {
                this.currentUser = JSON.parse(savedUser);
                // Load user's badges if they're logged in
                setTimeout(() => {
                    this.loadUserBadges();
                }, 500); // Short delay to ensure DOM is ready
            } catch (error) {
                console.error('Error parsing saved user:', error);
                localStorage.removeItem('currentUser'); // Clear invalid data
            }
        }
    }

    initThemeToggle() {
        // Load saved theme from localStorage
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        console.log('Theme initialized to:', savedTheme);
    }

    initWebSocket() {
        this.ws = new WebSocket('ws://localhost:8080/ws');

        this.ws.onopen = () => {
            console.log('WebSocket connection established');
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
        };
    }

    async loadInitialData() {
        try {
            // Determine which page we're on
            const isBadgeManagementPage = document.querySelector('.badge-management-page') !== null;
            const isHomePage = !isBadgeManagementPage;
            
            // Always fetch badges for both pages
            const badgesPromise = fetch('/badges').catch(error => {
                console.error('Failed to fetch badges:', error);
                return { json: () => [] };
            });
            
            // Only fetch activity feed on home page
            const activityFeedPromise = isHomePage ? 
                fetch('/activity-feed').catch(error => {
                    console.error('Failed to fetch activity feed:', error);
                    return { json: () => [] };
                }) : 
                Promise.resolve({ json: () => [] });
            
            // Fetch users for both pages (needed for login info)
            const usersPromise = fetch('/users').catch(error => {
                console.error('Failed to fetch users:', error);
                return { json: () => [] };
            });
            
            const [badgesResponse, activityFeedResponse, usersResponse] = 
                await Promise.all([badgesPromise, activityFeedPromise, usersPromise]);

            const badges = await this.safeJsonParse(badgesResponse);
            const activityFeed = await this.safeJsonParse(activityFeedResponse);
            const users = await this.safeJsonParse(usersResponse);

            // Render badge management list if the element exists
            const badgeListElement = document.getElementById('badge-list');
            if (badges && badgeListElement) {
                this.renderBadgeManagementList(badges);
            }
            
            // Only try to render activity feed on home page
            if (activityFeed && isHomePage) {
                this.renderActivityFeed(activityFeed);
            }
            
            // Initialize user and badge selects if they exist
            const userSelectElement = document.getElementById('select-user');
            const badgeSelectElement = document.getElementById('select-badge');
            if (users && userSelectElement && badgeSelectElement) {
                this.populateUserSelect(users);
                this.populateBadgeSelect(badges || []);
            }
            
            // If user is logged in, load their badges separately
            if (this.currentUser) {
                this.loadUserBadges();
            }
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showErrorMessage('Failed to load initial data. Please try again.');
        }
    }

    async safeJsonParse(response) {
        try {
            return await response.json();
        } catch (error) {
            console.error('JSON parsing error:', error);
            return null;
        }
    }

    showErrorMessage(message) {
        const errorContainer = document.createElement('div');
        errorContainer.classList.add('error-message');
        errorContainer.textContent = message;
        document.body.appendChild(errorContainer);
        
        setTimeout(() => {
            errorContainer.remove();
        }, 5000);
    }

    setupEventListeners() {
        const themeToggle = document.getElementById('theme-toggle');
        const loginBtn = document.getElementById('login-btn');
        const registerBtn = document.getElementById('register-btn');
        const awardBadgeBtn = document.getElementById('award-badge-btn');
        const createBadgeBtn = document.getElementById('create-badge-btn');
        const userInfoContainer = document.getElementById('user-info');
        
        // Setup create badge form with image upload
        this.setupCreateBadgeForm();

        if (themeToggle) {
            console.debug('Attaching theme toggle listener');
            themeToggle.addEventListener('click', () => this.toggleTheme());
        } else {
            console.error('Theme toggle button not found');
        }
        
        if (loginBtn) loginBtn.addEventListener('click', () => {
            console.debug('Login button clicked');
            this.openModal('login-modal');
        });
        if (registerBtn) registerBtn.addEventListener('click', () => {
            console.debug('Register button clicked');
            this.openModal('register-modal');
        });
        if (awardBadgeBtn) awardBadgeBtn.addEventListener('click', () => {
            console.debug('Award badge button clicked');
            if (this.currentUser) {
                this.openModal('award-badge-modal');
            } else {
                alert('You need to be logged in to award badges');
                this.openModal('login-modal');
            }
        });
        if (createBadgeBtn) createBadgeBtn.addEventListener('click', () => {
            console.debug('Create badge button clicked');
            
            // Reset form fields before opening
            document.getElementById('badge-name').value = '';
            document.getElementById('badge-description').value = '';
            if (document.getElementById('create-badge-icon-name')) {
                document.getElementById('create-badge-icon-name').value = '';
            }
            if (document.getElementById('create-badge-preview')) {
                document.getElementById('create-badge-preview').innerHTML = '<span>Badge Image</span>';
            }
            if (document.getElementById('create-badge-image')) {
                document.getElementById('create-badge-image').value = null;
            }
            
            this.openModal('create-badge-modal');
        });
        if (userInfoContainer) userInfoContainer.addEventListener('click', () => {
            if (this.currentUser) {
                console.debug('User info clicked - logging out');
                this.handleLogout();
            }
        });

        this.setupFormSubmissions();
    }

    setupFormSubmissions() {
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        const awardBadgeForm = document.getElementById('award-badge-form');
        const createBadgeForm = document.getElementById('create-badge-form');

        // Add event listeners to cancel buttons
        const cancelButtons = document.querySelectorAll('.cancel-btn');
        cancelButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                // Find the closest modal parent
                const modal = btn.closest('.modal');
                if (modal) {
                    this.closeModal(modal);
                    console.debug('Cancel button clicked, closing modal');
                }
            });
        });

        if (loginForm) {
            console.debug('Attaching submit event to login form');
            loginForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                const username = document.getElementById('login-username').value;
                const password = document.getElementById('login-password').value;
                const success = await this.handleLogin(username, password);
                
                if (success) {
                    this.closeModal(document.getElementById('login-modal'));
                    // Refresh UI after login
                    this.loadUserBadges();
                } else {
                    alert('Login failed. Please check your credentials.');
                }
            });
        } else {
            console.debug('Login form not found');
        }
        if (registerForm) {
            console.debug('Attaching submit event to register form');
            registerForm.addEventListener('submit', this.handleRegister);
        } else {
            console.debug('Register form not found');
        }
        if (awardBadgeForm) {
            awardBadgeForm.addEventListener('submit', this.handleAwardBadge);
        }
        if (createBadgeForm) {
            createBadgeForm.addEventListener('submit', this.handleCreateBadge.bind(this));
        }
    }

    setupModals() {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            const closeButtons = modal.querySelectorAll('.close-modal');
            closeButtons.forEach(btn => {
                btn.addEventListener('click', () => this.closeModal(modal));
            });
        });

        window.addEventListener('click', (event) => {
            if (event.target.classList.contains('modal')) {
                this.closeModal(event.target);
            }
        });
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.style.display = 'block';
    }

    closeModal(modal) {
        modal.style.display = 'none';
    }

    async handleLogin(username, password) {
        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();
            
            if (data.success) {
                this.currentUser = {
                    id: data.user_id,
                    username: data.username,
                    display_name: data.role === 'admin' ? 'Admin' : data.display_name,
                    role: data.role || 'user'
                };
                
                localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
                this.updateAuthUI();
                
                // Check if admin and show admin features
                if (this.currentUser.role === 'admin') {
                    this.showAdminFeatures();
                } else {
                    this.hideAdminFeatures();
                }
                
                return true;
            } else {
                return false;
            }
        } catch (error) {
            console.error('Login error:', error);
            return false;
        }
    }

    async handleRegister(event) {
        event.preventDefault();
        
        // Safely get form values with fallbacks
        const registerForm = event.target;
        const username = registerForm.querySelector('#register-username')?.value || '';
        const password = registerForm.querySelector('#register-password')?.value || '';
        const email = registerForm.querySelector('#register-email')?.value || '';
        const displayName = registerForm.querySelector('#register-display-name')?.value || '';

        // Validate inputs
        if (!username || !password) {
            alert('Username and password are required');
            return;
        }

        try {
            const response = await fetch('/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                  username, 
                  password,
                  email,
                  display_name: displayName 
                })
            });

            const result = await response.json();
            if (result.success) {
                this.closeModal(document.getElementById('register-modal'));
                alert('Registration successful! Please log in');
            } else {
                alert('Registration failed: ' + (result.message || 'Unknown error'));
            }
        } catch (error) {
            console.error('Registration error:', error);
            alert('An error occurred during registration');
        }
    }

    setupCreateBadgeForm() {
        // Set up image preview functionality for create badge
        const imageInput = document.getElementById('create-badge-image');
        if (imageInput) {
            imageInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const preview = document.getElementById('create-badge-preview');
                        preview.innerHTML = `<img src="${e.target.result}" alt="Badge Preview">`;
                        
                        // Generate a filename for the icon
                        const timestamp = new Date().getTime();
                        const fileName = `badge_${timestamp}_${file.name.replace(/\s+/g, '_')}`;
                        document.getElementById('create-badge-icon-name').value = fileName;
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
    }

    async handleCreateBadge(event) {
        event.preventDefault();
        const name = document.getElementById('badge-name').value;
        const description = document.getElementById('badge-description').value;
        const iconName = document.getElementById('create-badge-icon-name')?.value;
        const imageInput = document.getElementById('create-badge-image');

        try {
            // First, upload image if one was selected
            let finalIconName = iconName || '';
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

            // Then create the badge
            const response = await fetch('/badges', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name, 
                    description,
                    icon: finalIconName
                })
            });

            const result = await response.json();
            if (result.id) {
                // Reset form fields
                document.getElementById('badge-name').value = '';
                document.getElementById('badge-description').value = '';
                document.getElementById('create-badge-icon-name').value = '';
                document.getElementById('create-badge-preview').innerHTML = '<span>Badge Image</span>';
                document.getElementById('create-badge-image').value = null;
                
                this.closeModal(document.getElementById('create-badge-modal'));
                // Refresh badge list
                this.loadInitialData();
            } else {
                alert('Failed to create badge');
            }
        } catch (error) {
            console.error('Create badge error:', error);
        }
    }
    
    handleEditBadge(badge) {
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
        document.getElementById('edit-badge-id').value = badge.id;
        document.getElementById('edit-badge-name').value = badge.name;
        document.getElementById('edit-badge-description').value = badge.description;
        document.getElementById('edit-badge-icon-name').value = badge.icon || '';
        
        // Set badge image preview
        const previewEl = document.getElementById('edit-badge-preview');
        if (previewEl) {
            if (badge.icon) {
                previewEl.innerHTML = `<img src="/static/images/${badge.icon}" alt="${badge.name}">`;
            } else {
                previewEl.innerHTML = `<span>${badge.name.charAt(0)}</span>`;
            }
        }
        
        // Show the modal
        this.openModal('edit-badge-modal');
    }
    
    async handleUpdateBadge(event) {
        event.preventDefault();
        const badgeId = document.getElementById('edit-badge-id').value;
        const name = document.getElementById('edit-badge-name').value;
        const description = document.getElementById('edit-badge-description').value;
        const iconName = document.getElementById('edit-badge-icon-name').value;
        const imageInput = document.getElementById('edit-badge-image');
        
        if (!name || !description) {
            alert('Name and description are required');
            return;
        }
        
        try {
            // First, upload image if a new one was selected
            let finalIconName = iconName;
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
                // Refresh badge lists
                this.loadInitialData();
                // Also refresh user badges if logged in
                if (this.currentUser) {
                    this.loadUserBadges();
                }
            } else {
                alert('Failed to update badge: ' + (result.message || 'Unknown error'));
            }
        } catch (error) {
            console.error('Update badge error:', error);
            alert('An error occurred while updating the badge');
        }
    }
    
    async handleDeleteBadge(badgeId) {
        if (!confirm('Are you sure you want to delete this badge? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await fetch(`/badges/${badgeId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });
            
            const result = await response.json();
            if (result.success) {
                // Refresh badge lists
                this.loadInitialData();
                // Also refresh user badges if logged in
                if (this.currentUser) {
                    this.loadUserBadges();
                }
                alert('Badge deleted successfully');
            } else {
                alert('Failed to delete badge: ' + (result.message || 'This badge may be awarded to users'));
            }
        } catch (error) {
            console.error('Delete badge error:', error);
            alert('An error occurred while deleting the badge');
        }
    }

    async handleAwardBadge(event) {
        event.preventDefault();
        
        // Check if user is logged in
        if (!this.currentUser) {
            alert('You need to be logged in to award badges');
            this.closeModal(document.getElementById('award-badge-modal'));
            this.openModal('login-modal');
            return;
        }
        
        const userId = document.getElementById('select-user').value;
        const badgeId = document.getElementById('select-badge').value;

        if (!userId || !badgeId) {
            alert('Please select both a user and a badge');
            return;
        }

        // Check if user is trying to award themselves
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
                    awarded_by: this.currentUser ? this.currentUser.id : null
                })
            });

            const result = await response.json();
            if (result.success) {
                this.closeModal(document.getElementById('award-badge-modal'));
                // Refresh activity feed and relevant badges
                fetch('/activity-feed')
                    .then(response => response.json())
                    .then(data => this.renderActivityFeed(data))
                    .catch(error => console.error('Failed to reload activity feed:', error));
                
                // If the badge was awarded to the current user, reload their badges
                if (this.currentUser && userId === this.currentUser.id) {
                    this.loadUserBadges();
                }
            } else {
                alert(result.message || 'Failed to award badge');
            }
        } catch (error) {
            console.error('Award badge error:', error);
            alert('An error occurred while awarding badge');
        }
    }

    handleLogout() {
        this.currentUser = null;
        // Clear user from localStorage on logout
        localStorage.removeItem('currentUser');
        this.updateAuthUI();
        if (this.profileBadgesContainer) {
            this.profileBadgesContainer.innerHTML = '<p>No badges</p>';
        }
    }

    updateAuthUI() {
        const loginBtn = document.getElementById('login-btn');
        const registerBtn = document.getElementById('register-btn');
        const userInfo = document.getElementById('user-info');
        const usernameDisplay = document.getElementById('username-display');

        if (this.currentUser) {
            // Update username display
            if (usernameDisplay) usernameDisplay.textContent = this.currentUser.display_name || this.currentUser.username;
            
            // Show user info and hide login/register buttons
            if (userInfo) userInfo.style.display = 'flex';
            if (loginBtn) loginBtn.style.display = 'none';
            if (registerBtn) registerBtn.style.display = 'none';
            
            // Show or hide admin features based on role
            if (this.currentUser.role === 'admin') {
                this.showAdminFeatures();
            } else {
                this.hideAdminFeatures();
            }
        } else {
            // Hide user info and show login/register buttons
            if (userInfo) userInfo.style.display = 'none';
            if (loginBtn) loginBtn.style.display = 'inline-block';
            if (registerBtn) registerBtn.style.display = 'inline-block';
            
            this.hideAdminFeatures();
        }
    }

    showAdminFeatures() {
        // Add user management section before the activity feed in the sidebar
        const sidebar = document.querySelector('.sidebar');
        const activityFeed = document.getElementById('activity-feed');
        
        if (sidebar && activityFeed && !document.getElementById('admin-section')) {
            const adminSection = document.createElement('section');
            adminSection.id = 'admin-section';
            
            const adminHeader = document.createElement('header');
            adminHeader.innerHTML = '<h2>Admin Tools</h2>';
            
            const adminContent = document.createElement('div');
            adminContent.className = 'admin-tools';
            
            const userManagementLink = document.createElement('a');
            userManagementLink.id = 'user-management-link';
            userManagementLink.href = '/user-management';
            userManagementLink.className = 'admin-button';
            userManagementLink.textContent = 'User Management';
            
            adminContent.appendChild(userManagementLink);
            adminSection.appendChild(adminHeader);
            adminSection.appendChild(adminContent);
            
            // Insert before the activity feed
            sidebar.insertBefore(adminSection, activityFeed);
        }
        
        // Show edit buttons for badges that should only be visible to admins
        const editButtons = document.querySelectorAll('.edit-button');
        editButtons.forEach(button => {
            button.style.display = 'inline-flex';
        });
        
        // Show admin badge next to the main H1 header
        const mainHeader = document.querySelector('header h1');
        if (mainHeader && !document.querySelector('.admin-badge')) {
            const adminBadge = document.createElement('span');
            adminBadge.className = 'admin-badge';
            adminBadge.textContent = 'Admin';
            mainHeader.appendChild(adminBadge);
        }
    }

    hideAdminFeatures() {
        // Remove admin section from sidebar
        const adminSection = document.getElementById('admin-section');
        if (adminSection) {
            adminSection.remove();
        }
        
        // Hide edit buttons that should only be visible to admins
        const editButtons = document.querySelectorAll('.edit-button');
        editButtons.forEach(button => {
            button.style.display = 'none';
        });
        
        // Remove admin badge
        const adminBadge = document.querySelector('.admin-badge');
        if (adminBadge) {
            adminBadge.remove();
        }
    }

    async loadUserBadges() {
        if (!this.currentUser) return;
        try {
            // Fetch user's awarded badges
            const userBadgesResponse = await fetch(`/users/${this.currentUser.id}/badges`);
            const userBadges = await userBadgesResponse.json();
            
            // Fetch all available badges
            const allBadgesResponse = await fetch('/badges');
            const allBadges = await allBadgesResponse.json();
            
            // Render user's awarded badges
            this.renderBadges(userBadges);
            
            // Find badges that haven't been awarded to the user yet
            const userBadgeIds = userBadges.map(badge => badge.id);
            const unavailableBadges = allBadges.filter(badge => !userBadgeIds.includes(badge.id));
            
            // Render badges not yet awarded to the user
            this.renderUnavailableBadges(unavailableBadges);
        } catch (error) {
            console.error('Failed to load badges:', error);
            if (this.profileBadgesContainer) {
                this.profileBadgesContainer.innerHTML = '<p>Error loading badges</p>';
            }
        }
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    }

    populateUserSelect(users) {
        const userSelect = document.getElementById('select-user');
        userSelect.innerHTML = '<option value="">Select User</option>';
        users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.username;
            userSelect.appendChild(option);
        });
    }

    populateBadgeSelect(badges) {
        const badgeSelect = document.getElementById('select-badge');
        badgeSelect.innerHTML = '<option value="">Select Badge</option>';
        badges.forEach(badge => {
            const option = document.createElement('option');
            option.value = badge.id;
            option.textContent = badge.name;
            badgeSelect.appendChild(option);
        });
    }

    // Render user's badges to the profile section
renderBadges(badges) {
        if (!this.profileBadgesContainer) return;
        
        this.profileBadgesContainer.innerHTML = '';

        if (!badges || badges.length === 0) {
            this.profileBadgesContainer.innerHTML = '<p>No badges awarded yet</p>';
            return;
        }

        badges.forEach(badge => {
            const badgeCard = document.createElement('div');
            badgeCard.classList.add('badge-card');
            badgeCard.setAttribute('data-badge-id', badge.id);
            
            // Create image/icon for the badge
            const badgeInitial = badge.name.charAt(0);
            const badgeIcon = badge.icon ? `<img src="/static/images/${badge.icon}" alt="${badge.name}">` : badgeInitial;
            
            badgeCard.innerHTML = `
                <button class="icon-button delete-button" data-badge-id="${badge.id}" title="Reject Award">
                    <img src="/static/images/forbidden.svg" alt="Reject">
                </button>
                <div class="badge-count" title="Awarded ${badge.count} time${badge.count !== 1 ? 's' : ''}">${badge.count}</div>
                <div class="badge-image">${badgeIcon}</div>
                <h3>${badge.name}</h3>
                <p>${badge.description}</p>
            `;

            // Add click handlers
            const deleteBtn = badgeCard.querySelector('.delete-button');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent badge card click when delete button is clicked
                    this.removeBadge(badge.id);
                });
            }
            
            // Make the entire badge card clickable to view details
            badgeCard.addEventListener('click', () => {
                window.location.href = `/badge-details/${badge.id}`;
            });
            
            this.profileBadgesContainer.appendChild(badgeCard);
        });
    }
    
    // Render badges not yet awarded to the user
    renderUnavailableBadges(badges) {
        if (!this.availableBadgesContainer) return;
        
        this.availableBadgesContainer.innerHTML = '';

        if (!badges || badges.length === 0) {
            this.availableBadgesContainer.innerHTML = '<p>All badges have been awarded</p>';
            return;
        }

        badges.forEach(badge => {
            const badgeCard = document.createElement('div');
            badgeCard.classList.add('badge-card');
            badgeCard.setAttribute('data-badge-id', badge.id);
            
            // Create image/icon for the badge
            const badgeInitial = badge.name.charAt(0);
            const badgeIcon = badge.icon ? `<img src="/static/images/${badge.icon}" alt="${badge.name}">` : badgeInitial;
            
            badgeCard.innerHTML = `
                <div class="badge-image">${badgeIcon}</div>
                <h3>${badge.name}</h3>
                <p>${badge.description}</p>
            `;
            
            // Make the entire badge card clickable to view details
            badgeCard.addEventListener('click', () => {
                window.location.href = `/badge-details/${badge.id}`;
            });
            
            this.availableBadgesContainer.appendChild(badgeCard);
        });
    }
    
    // Render all badges to the badge management list
    renderBadgeManagementList(badges) {
        const badgeList = document.getElementById('badge-list');
        if (!badgeList) return;

        badgeList.innerHTML = '';

        if (!badges || badges.length === 0) {
            const noDataRow = document.createElement('tr');
            noDataRow.innerHTML = '<td colspan="4">No badges available</td>';
            badgeList.appendChild(noDataRow);
            return;
        }

        // Check if current user is admin for edit permissions
        const isAdmin = this.currentUser && this.currentUser.role === 'admin';

        badges.forEach(badge => {
            const badgeRow = document.createElement('tr');
            badgeRow.classList.add('badge-row');
            badgeRow.setAttribute('data-badge-id', badge.id);
            
            // Create image/icon for the badge
            const badgeInitial = badge.name.charAt(0);
            const badgeIcon = badge.icon ? `<img src="/static/images/${badge.icon}" alt="${badge.name}">` : badgeInitial;
            
            // Add award count to badge
            const awardCount = badge.count || 0;
            
            // Create actions based on user role
            const editButton = isAdmin ? `
                <button class="icon-button edit-button" data-badge-id="${badge.id}" title="Edit Badge">
                    <img src="/static/images/pencil.svg" alt="Edit">
                </button>` : '';
                
            const deleteButton = isAdmin ? `
                <button class="icon-button delete-button" data-badge-id="${badge.id}" title="Delete Badge">
                    <img src="/static/images/trash.svg" alt="Delete">
                </button>` : '';
            
            badgeRow.innerHTML = `
                <td class="badge-image-cell">
                    <div class="badge-image table-badge-image">${badgeIcon}</div>
                </td>
                <td class="badge-info-cell">
                    <h3>${badge.name}</h3>
                    <p>${badge.description}</p>
                </td>
                <td class="badge-count-cell">
                    <div class="badge-count" title="${awardCount} user${awardCount !== 1 ? 's' : ''} awarded">${awardCount}</div>
                </td>
                <td class="badge-actions-cell">
                    <div class="badge-actions">
                        ${editButton}
                        ${deleteButton}
                    </div>
                </td>
            `;

            // Only add event listeners if buttons exist (for admin users)
            const editBtn = badgeRow.querySelector('.edit-button');
            const deleteBtn = badgeRow.querySelector('.delete-button');

            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.handleEditBadge(badge);
                });
            }

            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.handleDeleteBadge(badge.id);
                });
            }
            
            // Make the whole row clickable to view details except for action buttons
            badgeRow.addEventListener('click', (e) => {
                // Only navigate if they didn't click on buttons or their images
                if (!e.target.closest('.icon-button') && 
                    !e.target.closest('.badge-actions') &&
                    e.target.tagName !== 'IMG') {
                    window.location.href = `/badge-details/${badge.id}`;
                }
            });

            badgeList.appendChild(badgeRow);
        });
    }
    renderActivityFeed(activities) {
        const feedContainer = document.getElementById('feed-container');
        if (!feedContainer) return; // Skip if container doesn't exist (e.g., on badge management page)
        
        feedContainer.innerHTML = '';

        activities.forEach(activity => {
            const activityItem = document.createElement('div');
            activityItem.classList.add('activity-item');
            activityItem.textContent = `${activity.user} earned ${activity.badge}`;
            feedContainer.appendChild(activityItem);
        });
    }

    async removeBadge(badgeId) {
        try {
            // Prefer current logged in user
            let userId = this.currentUser ? this.currentUser.id : null;
            if (!userId) {
                userId = prompt('Enter the user ID to remove badge from:');
                if (!userId) {
                    this.showErrorMessage('User ID is required to remove a badge.');
                    return;
                }
            }
            const response = await fetch('/badges/remove', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, badge_id: badgeId })
            });

            const result = await response.json();
            if (result.success) {
                // Remove card from UI immediately
                const card = this.profileBadgesContainer?.querySelector(`[data-badge-id="${badgeId}"]`);
                if (card) {
                    card.closest('.badge-card').remove();
                }
            } else {
                alert('Failed to remove badge');
            }
        } catch (error) {
            console.error('Remove badge error:', error);
        }
    }

    handleWebSocketMessage(data) {
        switch(data.type) {
            case 'badge_awarded':
                this.handleBadgeAwarded(data.badge);
                break;
            case 'badge_removed':
                this.handleBadgeRemoved(data.badge);
                break;
            default:
                console.log('Unhandled message type:', data.type);
        }
    }

    handleBadgeAwarded(badge) {
        // Update activity feed and badges
        if (this.feedContainer) {
            const newActivityItem = document.createElement('div');
            newActivityItem.classList.add('activity-item');
            newActivityItem.innerHTML = `<p>${badge.user} was awarded ${badge.name} on ${new Date().toLocaleString()}</p>`;
            this.feedContainer.prepend(newActivityItem);
        }

        if (this.profileBadgesContainer) {
            const newBadgeCard = document.createElement('div');
            newBadgeCard.classList.add('badge-card');
            newBadgeCard.innerHTML = `
                <h3>${badge.name}</h3>
                <p>${badge.description}</p>
                <button class="remove-badge" data-badge-id="${badge.id}">Remove</button>
            `;
            this.profileBadgesContainer.appendChild(newBadgeCard);
        }
    }

    handleBadgeRemoved(badge) {
        // Remove badge from UI
        if (this.profileBadgesContainer) {
            const badgeToRemove = this.profileBadgesContainer.querySelector(`[data-badge-id="${badge.id}"]`);
            if (badgeToRemove) {
                badgeToRemove.closest('.badge-card').remove();
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new BadgeTrackingApp();
});
