# Trigs-Triumph-Trophy-Tracker 🏅
A badge tracking system, "Trig's Triumph Trophy Tracker," designed to allow coworkers to recognise and celebrate each other's achievements. 

A modern, full-stack web application for issuing, tracking, and managing digital badges within a community or organisation.  
Admins can create badges, award them to users in real time, and manage users; regular members can view their own badges, see what’s still available, and browse a live activity feed.

---

## ✨ Key Features

| Role |  Capability |
| ------ | ------------|
|**Public / Guest**| Browse all public badges, view recent awards, register, log in, toggle light/dark theme |
|**Authenticated User**| View personal badge collection, see unavailable badges, receive live updates as badges are awarded |
|**Administrator**| Create, edit, delete badges • Award & revoke badges • Manage users (promote/demote, reset password, delete) • Live admin tools panel |

Additional highlights
- **Real-time updates** via WebSockets: activity feed & user badge lists refresh instantly.
- **Responsive UI** built with vanilla JS + CSS variables; one-click light/dark theme.
- **Secure auth**: login/register, hashed passwords, role-based UI.
- **Drag-and-drop badge image upload** with automatic filename generation.
- **Clean REST API** (Python / FastAPI) and intuitive WS message schema.


## Prerequisites
- Python 3.9+
- pip

## Setup
1. Clone the repository
2. Create a virtual environment:
   ```
   python -m venv venv
   source venv/bin/activate  # On Windows use `venv\Scripts\activate`
   ```
3. Install dependencies:
   ```
   pip install -r src/requirements.txt
   ```

## Running the Application
```
python src/main.py
```

## Default Credentials
- **Admin Account**
  - Username: `admin`
  - Password: `admin_password`
