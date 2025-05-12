import asyncio
import os
import json
import uuid
import aiofiles
import shutil
from pathlib import Path
from datetime import datetime, timezone
from aiohttp import web
from aiohttp.web import Request
from passlib.hash import pbkdf2_sha256
import jinja2
import aiohttp_jinja2

# Data Management
class DataManager:
    def __init__(self, data_dir):
        self.data_dir = data_dir
        self.users_file = os.path.join(data_dir, 'users.json')
        self.badges_file = os.path.join(data_dir, 'badges.json')
        self.awards_file = os.path.join(data_dir, 'awards.json')
        self.ensure_data_files()

    def ensure_data_files(self):
        # Initialize data files if they don't exist
        for file_path in [self.users_file, self.badges_file, self.awards_file]:
            if not os.path.exists(file_path):
                with open(file_path, 'w') as f:
                    json.dump([], f)

    async def read_json(self, file_path):
        async with aiofiles.open(file_path, mode='r') as f:
            content = await f.read()
            return json.loads(content) if content else []

    async def write_json(self, file_path, data):
        async with aiofiles.open(file_path, mode='w') as f:
            await f.write(json.dumps(data, indent=2, ensure_ascii=False))
        return True

    async def create_default_admin(self):
        users = await self.read_json(self.users_file)
        if not any(user.get('role') == 'admin' for user in users):
            admin_user = {
                'id': str(uuid.uuid4()),
                'username': 'admin',
                'password': pbkdf2_sha256.hash('admin_password'),
                'role': 'admin',
                'display_name': 'Administrator',
                'email': 'admin@fpgabadges.com'
            }
            users.append(admin_user)
            await self.write_json(self.users_file, users)

    async def create_default_badge(self):
        badges = await self.read_json(self.badges_file)
        if not badges:
            default_badge = {
                'id': str(uuid.uuid4()),
                'name': 'First FPGA Design',
                'description': 'Completed first FPGA design project',
                'icon': 'chip.svg'
            }
            badges.append(default_badge)
            await self.write_json(self.badges_file, badges)

    async def create_badge(self, badge_data):
        badges = await self.read_json(self.badges_file)
        badge_data['id'] = str(uuid.uuid4())
        badges.append(badge_data)
        await self.write_json(self.badges_file, badges)
        return badge_data

    async def update_badge(self, badge_id, update_data):
        badges = await self.read_json(self.badges_file)
        for i, badge in enumerate(badges):
            if badge['id'] == badge_id:
                badges[i].update(update_data)
                await self.write_json(self.badges_file, badges)
                return True
        return False

    async def delete_badge(self, badge_id):
        badges = await self.read_json(self.badges_file)
        
        # Find the badge to be deleted to get its icon filename
        badge_to_delete = next((badge for badge in badges if badge['id'] == badge_id), None)
        
        if badge_to_delete and 'icon' in badge_to_delete:
            # Check if this is a custom uploaded icon (not a default icon)
            icon_filename = badge_to_delete['icon']
            if icon_filename and not icon_filename in ['chip.svg', 'star.svg', 'pencil.svg', 'trash.svg']:
                # Delete the associated image file
                image_path = os.path.join('src', 'static', 'images', icon_filename)
                try:
                    if os.path.exists(image_path):
                        os.remove(image_path)
                        print(f"Deleted badge image: {image_path}")
                except Exception as e:
                    print(f"Error deleting badge image: {str(e)}")
        
        # Remove badge from list and save
        badges = [badge for badge in badges if badge['id'] != badge_id]
        await self.write_json(self.badges_file, badges)
        return True

    async def award_badge(self, user_id, badge_id, awarded_by=None):
        awards = await self.read_json(self.awards_file)
        award = {
            'id': str(uuid.uuid4()),
            'user_id': user_id,
            'badge_id': badge_id,
            'awarded_at': datetime.now(timezone.utc).isoformat(),
            'awarded_by': awarded_by  # Store the ID of the user who awarded the badge
        }
        awards.append(award)
        await self.write_json(self.awards_file, awards)
        return award

    async def remove_badge_from_user(self, user_id, badge_id):
        awards = await self.read_json(self.awards_file)
        awards = [award for award in awards if not (award['user_id'] == user_id and award['badge_id'] == badge_id)]
        await self.write_json(self.awards_file, awards)
        return True

    async def get_user_badges(self, user_id):
        awards = await self.read_json(self.awards_file)
        badges = await self.read_json(self.badges_file)
        
        # Count how many times each badge has been awarded to the user
        badge_counts = {}
        for award in awards:
            if award['user_id'] == user_id:
                badge_id = award['badge_id']
                badge_counts[badge_id] = badge_counts.get(badge_id, 0) + 1
        
        # Get unique badge IDs awarded to this user
        user_badge_ids = list(badge_counts.keys())
        
        # Create badges with count information
        user_badges = []
        for badge in badges:
            if badge['id'] in user_badge_ids:
                # Create a copy of the badge with count added
                badge_with_count = badge.copy()
                badge_with_count['count'] = badge_counts[badge['id']]
                user_badges.append(badge_with_count)
        
        return user_badges

    async def authenticate_user(self, username, password):
        users = await self.read_json(self.users_file)
        for user in users:
            if user['username'] == username and pbkdf2_sha256.verify(password, user['password']):
                return user
        return None

    async def get_user_by_id(self, user_id):
        users = await self.read_json(self.users_file)
        return next((user for user in users if user['id'] == user_id), None)

    async def update_user(self, user_id, update_data):
        users = await self.read_json(self.users_file)
        for i, user in enumerate(users):
            if user['id'] == user_id:
                users[i].update(update_data)
                await self.write_json(self.users_file, users)
                return True
        return False

# WebSocket Manager for Real-time Updates
class WebSocketManager:
    def __init__(self):
        self.active_connections = set()

    async def websocket_handler(self, request):
        ws = web.WebSocketResponse()
        await ws.prepare(request)

        self.active_connections.add(ws)

        try:
            async for msg in ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    # Handle incoming WebSocket messages
                    try:
                        data = json.loads(msg.data)
                        # Implement message handling logic here
                        print(f'Received WebSocket message: {data}')
                    except json.JSONDecodeError:
                        print('Invalid JSON received')
                elif msg.type == aiohttp.WSMsgType.ERROR:
                    print('WebSocket connection closed with exception %s' % ws.exception())
                    break
        except Exception as e:
            print(f'WebSocket error: {e}')
        finally:
            if ws in self.active_connections:
                self.active_connections.remove(ws)
            await ws.close()

        return ws

    async def broadcast(self, message):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f'Error broadcasting message: {e}')

# Main Application
class BadgeTrackingApp:
    def __init__(self):
        self.data_manager = DataManager('src/data')
        self.ws_manager = WebSocketManager()

    async def init_app(self):
        await self.data_manager.create_default_admin()
        await self.data_manager.create_default_badge()

# Application Setup
async def main():
    # Initialize the aiohttp web app
    app = web.Application()
    aiohttp_jinja2.setup(app, loader=jinja2.FileSystemLoader('src/templates'))

    # Initialize the data manager
    data_manager = DataManager()
    
    # Initialize the badge app
    badge_app = BadgeApp(data_manager)
    await badge_app.init_app()
    
    # Create directory for badge images if it doesn't exist
    image_dir = os.path.join('src', 'static', 'images')
    if not os.path.exists(image_dir):
        os.makedirs(image_dir)
        print(f"Created image directory: {image_dir}")

    # WebSocket route
    app.router.add_get('/ws', badge_app.ws_manager.websocket_handler)

    # Static routes
    app.router.add_static('/static/', path='src/static', name='static')

    return app

async def init_app():
    app = web.Application()
    aiohttp_jinja2.setup(app, loader=jinja2.FileSystemLoader('src/templates'))

    # Initialize data manager
    data_manager = DataManager('src/data')
    await data_manager.create_default_admin()
    await data_manager.create_default_badge()

    # WebSocket Manager
    ws_manager = WebSocketManager()

    # Static routes
    app.router.add_static('/static/', path='src/static', name='static')

    # WebSocket route
    app.router.add_get('/ws', ws_manager.websocket_handler)

    # Home route
    async def home(request):
        return aiohttp_jinja2.render_template('index.html', request, {})
    app.router.add_get('/', home)

    # Users route
    async def get_users(request):
        users = await data_manager.read_json(data_manager.users_file)
        # Remove sensitive information like passwords
        sanitized_users = [{'id': user['id'], 'username': user['username'], 'display_name': user.get('display_name', user['username'])} for user in users]
        return web.json_response(sanitized_users)
    app.router.add_get('/users', get_users)
    
    # Admin users route - returns all user details including roles
    async def get_admin_users(request):
        users = await data_manager.read_json(data_manager.users_file)
        # Remove passwords but include other admin fields
        admin_users = [{
            'id': user['id'], 
            'username': user['username'],
            'display_name': user.get('display_name', user['username']),
            'email': user.get('email', ''),
            'role': user.get('role', 'user')
        } for user in users]
        return web.json_response(admin_users)
    app.router.add_get('/admin/users', get_admin_users)
    
    # Admin reset user password
    async def reset_user_password(request):
        user_id = request.match_info['user_id']
        try:
            data = await request.json()
            new_password = data.get('password')
            if not new_password:
                return web.json_response({'success': False, 'message': 'Password is required'}, status=400)
                
            users = await data_manager.read_json(data_manager.users_file)
            user_index = next((i for i, u in enumerate(users) if u['id'] == user_id), None)
            
            if user_index is None:
                return web.json_response({'success': False, 'message': 'User not found'}, status=404)
                
            # Update user's password
            users[user_index]['password'] = pbkdf2_sha256.hash(new_password)
            await data_manager.write_json(data_manager.users_file, users)
            
            return web.json_response({'success': True, 'message': 'Password updated successfully'})
        except Exception as e:
            return web.json_response({'success': False, 'message': str(e)}, status=500)
    app.router.add_post('/admin/users/{user_id}/reset-password', reset_user_password)
    
    # Admin remove user
    async def remove_user(request):
        user_id = request.match_info['user_id']
        try:
            users = await data_manager.read_json(data_manager.users_file)
            
            # Check if user is admin, don't allow removing admins
            user = next((u for u in users if u['id'] == user_id), None)
            if not user:
                return web.json_response({'success': False, 'message': 'User not found'}, status=404)
                
            if user.get('role') == 'admin':
                return web.json_response({'success': False, 'message': 'Cannot remove administrator accounts'}, status=400)
            
            # Remove user from the users list
            users = [u for u in users if u['id'] != user_id]
            await data_manager.write_json(data_manager.users_file, users)
            
            # Also remove user's badge awards
            awards = await data_manager.read_json(data_manager.awards_file)
            awards = [a for a in awards if a.get('user_id') != user_id]
            await data_manager.write_json(data_manager.awards_file, awards)
            
            return web.json_response({'success': True, 'message': 'User removed successfully'})
        except Exception as e:
            return web.json_response({'success': False, 'message': str(e)}, status=500)
    app.router.add_delete('/admin/users/{user_id}', remove_user)

    # User badges route
    async def get_user_badges_route(request):
        user_id = request.match_info['user_id']
        try:
            badges = await data_manager.get_user_badges(user_id)
            return web.json_response(badges)
        except Exception as e:
            return web.json_response({'success': False, 'message': str(e)}, status=500)
    app.router.add_get('/users/{user_id}/badges', get_user_badges_route)

    # Login route
    async def login(request):
        try:
            data = await request.json()
            username = data.get('username')
            password = data.get('password')
            users = await data_manager.read_json(data_manager.users_file)
            user = next((u for u in users if u['username'] == username and pbkdf2_sha256.verify(password, u['password'])), None)
            if user:
                return web.json_response({
                    'success': True, 
                    'user_id': user['id'],
                    'username': user['username'],
                    'display_name': user.get('display_name', user['username']),
                    'role': user.get('role', 'user')
                })
            return web.json_response({'success': False, 'message': 'Invalid credentials'}, status=401)
        except Exception as e:
            return web.json_response({'success': False, 'message': str(e)}, status=500)
    app.router.add_post('/login', login)

    # Register route
    async def register(request):
        try:
            data = await request.json()
            username = data.get('username')
            password = data.get('password')
            email = data.get('email', '')
            display_name = data.get('display_name', username)

            # Validate required fields
            if not username or not password:
                return web.json_response({'success': False, 'message': 'Username and password are required'}, status=400)

            users = await data_manager.read_json(data_manager.users_file)
            if any(u['username'] == username for u in users):
                return web.json_response({'success': False, 'message': 'Username already exists'}, status=400)

            new_user = {
                'id': str(uuid.uuid4()),
                'username': username,
                'password': pbkdf2_sha256.hash(password),
                'email': email,
                'display_name': display_name,
                'role': 'user'  # Default role for new users
            }
            users.append(new_user)
            await data_manager.write_json(data_manager.users_file, users)
            return web.json_response({'success': True, 'user_id': new_user['id']})
        except Exception as e:
            return web.json_response({'success': False, 'message': str(e)}, status=500)
    app.router.add_post('/register', register)

    # Badge endpoints
    async def index(request):
        index_html = os.path.join('src', 'templates', 'index.html')
        with open(index_html, 'rb') as f:
            return web.Response(body=f.read(), content_type='text/html')
    app.router.add_get('/', index)
    
    async def badge_management(request):
        badge_mgmt_html = os.path.join('src', 'templates', 'badge-management.html')
        with open(badge_mgmt_html, 'rb') as f:
            return web.Response(body=f.read(), content_type='text/html')
    app.router.add_get('/badge-management', badge_management)
    
    async def user_management_page(request):
        user_mgmt_html = os.path.join('src', 'templates', 'user-management.html')
        with open(user_mgmt_html, 'rb') as f:
            return web.Response(body=f.read(), content_type='text/html')
    app.router.add_get('/user-management', user_management_page)
    
    async def badge_details_page(request):
        badge_details_html = os.path.join('src', 'templates', 'badge-details.html')
        with open(badge_details_html, 'rb') as f:
            return web.Response(body=f.read(), content_type='text/html')
    app.router.add_get('/badge-details/{badge_id}', badge_details_page)

    async def get_badges(request):
        badges = await data_manager.read_json(data_manager.badges_file)
        
        # Get award counts for each badge
        awards = await data_manager.read_json(data_manager.awards_file)
        badge_counts = {}
        for award in awards:
            badge_id = award.get('badge_id')
            if badge_id:
                badge_counts[badge_id] = badge_counts.get(badge_id, 0) + 1
        
        # Add count to each badge
        for badge in badges:
            badge['count'] = badge_counts.get(badge['id'], 0)
            
        return web.json_response(badges)
    app.router.add_get('/badges', get_badges)
    
    async def get_badge_details(request):
        badge_id = request.match_info['badge_id']
        
        # Get badge details
        badges = await data_manager.read_json(data_manager.badges_file)
        badge = next((b for b in badges if b['id'] == badge_id), None)
        
        if not badge:
            return web.json_response({'error': 'Badge not found'}, status=404)
        
        # Get awards for this badge
        awards = await data_manager.read_json(data_manager.awards_file)
        badge_awards = [a for a in awards if a['badge_id'] == badge_id]
        
        # Get user details for the awards
        users = await data_manager.read_json(data_manager.users_file)
        award_users = []
        unique_user_ids = set()
        
        for award in badge_awards:
            user_id = award.get('user_id')
            awarded_by_id = award.get('awarded_by')
            
            if user_id and user_id not in unique_user_ids:
                user = next((u for u in users if u['id'] == user_id), None)
                awarded_by_user = None
                
                # Find the user who awarded this badge
                if awarded_by_id:
                    awarded_by_user = next((u for u in users if u['id'] == awarded_by_id), None)
                
                if user:
                    award_info = {
                        'id': user['id'],
                        'username': user['username'],
                        'display_name': user.get('display_name', ''),
                        'award_date': award.get('awarded_at', '')
                    }
                    
                    # Add information about who awarded the badge
                    if awarded_by_user:
                        award_info['awarded_by'] = {
                            'id': awarded_by_user['id'],
                            'username': awarded_by_user['username'],
                            'display_name': awarded_by_user.get('display_name', '')
                        }
                    
                    award_users.append(award_info)
                    unique_user_ids.add(user_id)
        
        # Sort users by username
        award_users.sort(key=lambda x: x['username'])
        
        result = {
            'badge': badge,
            'award_count': len(badge_awards),
            'unique_user_count': len(award_users),
            'users': award_users
        }
        
        return web.json_response(result)
    app.router.add_get('/badge-details-api/{badge_id}', get_badge_details)
    
    # Badge image upload endpoint
    async def upload_badge_image(request):
        try:
            # Make sure image directory exists
            image_dir = os.path.join('src', 'static', 'images')
            if not os.path.exists(image_dir):
                os.makedirs(image_dir)
                print(f"Created image directory during upload: {image_dir}")
            
            print("Processing file upload...")
            data = await request.post()
            
            # Check if the image file is in the request
            if 'image' not in data:
                print("No image file found in request")
                return web.json_response({'success': False, 'message': 'No image file found'}, status=400)
            
            # Get the file and filename
            file_field = data['image']
            filename = data.get('filename')
            
            # Debug log the file info
            print(f"Received file: {file_field.filename}, Content-Type: {file_field.content_type}")
            
            # Ensure filename is safe
            if not filename or '..' in filename or '/' in filename:
                filename = file_field.filename
                if not filename or '..' in filename or '/' in filename:
                    filename = f'badge_{uuid.uuid4()}.jpg'
            
            print(f"Using filename: {filename}")
            
            # Save file to images directory
            file_path = os.path.join(image_dir, filename)
            
            # Get the content as bytes and save to file
            file_content = file_field.file.read()
            file_size = len(file_content)
            
            print(f"Writing {file_size} bytes to {file_path}")
            with open(file_path, 'wb') as f:
                f.write(file_content)
            
            return web.json_response({
                'success': True,
                'filename': filename,
                'size': file_size
            })
        except Exception as e:
            print(f"Error uploading file: {str(e)}")
            return web.json_response({'success': False, 'message': str(e)}, status=500)
    app.router.add_post('/upload/badge-image', upload_badge_image)

    async def create_badge(request):
        data = await request.json()
        badge = await data_manager.create_badge(data)
        return web.json_response(badge)
    app.router.add_post('/badges', create_badge)

    async def update_badge(request):
        badge_id = request.match_info['badge_id']
        data = await request.json()
        success = await data_manager.update_badge(badge_id, data)
        return web.json_response({'success': success})
    app.router.add_put('/badges/{badge_id}', update_badge)

    async def delete_badge(request):
        badge_id = request.match_info['badge_id']
        success = await data_manager.delete_badge(badge_id)
        return web.json_response({'success': success})
    app.router.add_delete('/badges/{badge_id}', delete_badge)

    # Activity Feed route - limited to 10 most recent awards
    async def get_activity_feed(request):
        awards = await data_manager.read_json(data_manager.awards_file)
        badges = await data_manager.read_json(data_manager.badges_file)
        users = await data_manager.read_json(data_manager.users_file)
        
        # Sort awards by date (most recent first)
        try:
            awards = sorted(awards, key=lambda x: x.get('awarded_at', ''), reverse=True)
        except Exception as e:
            print(f"Error sorting awards: {str(e)}")
        
        # Limit to 10 most recent
        recent_awards = awards[:10]
        
        feed = []
        for award in recent_awards:
            user = next((u for u in users if u['id'] == award['user_id']), {'username': 'Unknown'})
            badge = next((b for b in badges if b['id'] == award['badge_id']), {'name': 'Unknown Badge'})
            feed.append({
                'user': user['username'],
                'badge': badge['name'],
                'date': award.get('awarded_at', 'Unknown Date')
            })
        
        return web.json_response(feed)
    app.router.add_get('/activity-feed', get_activity_feed)

    # Badge Award route
    async def award_badge(request):
        data = await request.json()
        user_id = data.get('user_id')
        badge_id = data.get('badge_id')
        awarded_by = data.get('awarded_by')
        
        # Prevent users from awarding badges to themselves
        if awarded_by and awarded_by == user_id:
            return web.json_response({
                'success': False, 
                'message': 'You cannot award badges to yourself'
            }, status=400)
        
        award = await data_manager.award_badge(user_id, badge_id, awarded_by)
        return web.json_response({'success': True, 'award': award})
    app.router.add_post('/badges/award', award_badge)

    # Remove Badge from User route
    async def remove_badge_from_user(request):
        try:
            data = await request.json()
            user_id = data.get('user_id')
            badge_id = data.get('badge_id')
            if not user_id or not badge_id:
                return web.json_response({'success': False, 'message': 'user_id and badge_id required'}, status=400)
            success = await data_manager.remove_badge_from_user(user_id, badge_id)
            return web.json_response({'success': success})
        except Exception as e:
            return web.json_response({'success': False, 'message': str(e)}, status=500)
    app.router.add_post('/badges/remove', remove_badge_from_user)

    return app

def main():
    app = asyncio.run(init_app())
    web.run_app(app, port=8080)

if __name__ == '__main__':
    main()
