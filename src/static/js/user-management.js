class UserManagementPage {
    constructor() {
        this.currentUser = null;
        this.users = [];
        this.loadUserFromStorage();
        this.initTheme();
        this.setupEventListeners();
        this.loadUsers();
    }

    loadUserFromStorage() {
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            try {
                this.currentUser = JSON.parse(storedUser);
                // Check if user is admin
                if (this.currentUser.role !== 'admin') {
                    // Redirect non-admin users back to home
                    window.location.href = '/';
                    alert('Admin access required');
                } else {
                    // Make sure admin display_name is always 'Admin', not 'Administrator'
                    if (this.currentUser.display_name === 'Administrator') {
                        this.currentUser.display_name = 'Admin';
                        localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
                    }
                    // Update UI with user info
                    this.updateAuthUI();
                }
            } catch (e) {
                console.error('Failed to parse user from localStorage:', e);
                localStorage.removeItem('currentUser');
                window.location.href = '/';
            }
        } else {
            // Redirect users who aren't logged in
            window.location.href = '/';
            alert('Please login as an administrator');
        }
    }

    initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
    }

    setupEventListeners() {
        const themeToggle = document.getElementById('theme-toggle');
        const userInfoContainer = document.getElementById('user-info');
        
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }
        
        if (userInfoContainer) {
            userInfoContainer.addEventListener('click', () => {
                if (this.currentUser) {
                    this.handleLogout();
                }
            });
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
        
        // Setup reset password form
        const resetPasswordForm = document.getElementById('reset-password-form');
        if (resetPasswordForm) {
            resetPasswordForm.addEventListener('submit', this.handleResetPassword.bind(this));
        }
    }
    
    async loadUsers() {
        try {
            // API call to get all users with their roles
            const response = await fetch('/admin/users');
            const users = await response.json();
            this.users = users;
            this.renderUsers(users);
        } catch (error) {
            console.error('Failed to load users:', error);
            document.getElementById('users-list').innerHTML = '<tr><td colspan="4">Error loading users</td></tr>';
        }
    }
    
    renderUsers(users) {
        const usersList = document.getElementById('users-list');
        usersList.innerHTML = '';
        
        if (!users || users.length === 0) {
            usersList.innerHTML = '<tr><td colspan="4">No users found</td></tr>';
            return;
        }
        
        users.forEach(user => {
            const userRow = document.createElement('tr');
            userRow.classList.add('user-row');
            
            userRow.innerHTML = `
                <td>${user.username}</td>
                <td>${user.display_name || user.username}</td>
                <td>${user.role || 'user'}</td>
                <td class="user-actions">
                    <button class="action-btn reset-password-btn" data-user-id="${user.id}" data-username="${user.username}">Reset Password</button>
                    ${user.role !== 'admin' ? `<button class="action-btn remove-user-btn" data-user-id="${user.id}">Remove User</button>` : ''}
                </td>
            `;
            
            usersList.appendChild(userRow);
        });
        
        // Add event listeners to buttons
        const resetPasswordButtons = document.querySelectorAll('.reset-password-btn');
        resetPasswordButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const userId = e.target.getAttribute('data-user-id');
                const username = e.target.getAttribute('data-username');
                this.openResetPasswordModal(userId, username);
            });
        });
        
        const removeUserButtons = document.querySelectorAll('.remove-user-btn');
        removeUserButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const userId = e.target.getAttribute('data-user-id');
                this.handleRemoveUser(userId);
            });
        });
    }
    
    openResetPasswordModal(userId, username) {
        document.getElementById('reset-password-user-id').value = userId;
        document.getElementById('reset-password-username').textContent = `Reset password for: ${username}`;
        this.openModal('reset-password-modal');
    }
    
    async handleResetPassword(event) {
        event.preventDefault();
        
        const userId = document.getElementById('reset-password-user-id').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-new-password').value;
        
        if (newPassword !== confirmPassword) {
            alert('Passwords do not match');
            return;
        }
        
        try {
            const response = await fetch(`/admin/users/${userId}/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: newPassword })
            });
            
            const result = await response.json();
            if (result.success) {
                alert('Password has been reset successfully');
                this.closeModal(document.getElementById('reset-password-modal'));
            } else {
                alert(result.message || 'Failed to reset password');
            }
        } catch (error) {
            console.error('Reset password error:', error);
            alert('An error occurred while resetting the password');
        }
    }
    
    async handleRemoveUser(userId) {
        if (!confirm('Are you sure you want to remove this user? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await fetch(`/admin/users/${userId}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            if (result.success) {
                alert('User has been removed successfully');
                this.loadUsers(); // Reload the user list
            } else {
                alert(result.message || 'Failed to remove user');
            }
        } catch (error) {
            console.error('Remove user error:', error);
            alert('An error occurred while removing the user');
        }
    }
    
    handleLogout() {
        this.currentUser = null;
        localStorage.removeItem('currentUser');
        window.location.href = '/';
    }
    
    updateAuthUI() {
        const loginBtn = document.getElementById('login-btn');
        const registerBtn = document.getElementById('register-btn');
        const userInfo = document.getElementById('user-info');
        const usernameDisplay = document.getElementById('username-display');
        
        if (this.currentUser) {
            // Set username display
            if (usernameDisplay) {
                usernameDisplay.textContent = this.currentUser.display_name || this.currentUser.username;
            }
            
            // Show user info container and hide login/register buttons
            if (userInfo) userInfo.style.display = 'flex';
            if (loginBtn) loginBtn.style.display = 'none';
            if (registerBtn) registerBtn.style.display = 'none';
            
            // Add admin badge next to the main H1 header
            const mainHeader = document.querySelector('header h1');
            if (mainHeader && !document.querySelector('.admin-badge')) {
                const adminBadge = document.createElement('span');
                adminBadge.className = 'admin-badge';
                adminBadge.textContent = 'Admin';
                mainHeader.appendChild(adminBadge);
            }
            
            // Ensure the logout functionality is properly set up
            const logoutBtn = userInfo.querySelector('.user-info-logout');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', () => this.handleLogout());
            }
        } else {
            // Hide user info and show login/register buttons
            if (userInfo) userInfo.style.display = 'none';
            if (loginBtn) loginBtn.style.display = 'inline-block';
            if (registerBtn) registerBtn.style.display = 'inline-block';
        }
    }
    
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    }
    
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'block';
    }
    
    closeModal(modal) {
        modal.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new UserManagementPage();
});
