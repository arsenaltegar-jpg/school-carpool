const client = supabase.createClient(
    'https://zjxkykvkxfrndlcirfjg.supabase.co',
    'sb_publishable_MsYFfGjoGA-rl8PCjF-58Q_kGkMvzuF'
);

let currentUser = null;
let currentProfile = null;
let allTrips = [];
let filteredTrips = [];

// INITIALIZATION & AUTH
async function init() {
    showLoading(true);
    const { data: { session } } = await client.auth.getSession();

    if (!session) {
        showLoading(false);
        showView('auth-view');
    } else {
        currentUser = session.user;
        await checkProfile(session.user);
    }

    // Listen for auth state changes
    client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            location.reload();
        }
    });
}

async function signIn() {
    await client.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: "https://arsenaltegar-jpg.github.io/school-carpool"
        }
    });
}

async function signOut() {
    await client.auth.signOut();
    location.reload();
}

async function checkProfile(user) {
    const { data: profile } = await client
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

    if (!profile) {
        showLoading(false);
        showView('profile-modal');
    } else {
        currentProfile = profile;
        document.getElementById('user-greeting').innerText = `Welcome, ${profile.name}!`;

        if (profile.role === 'Driver' || profile.role === 'Both') {
            document.getElementById('driver-actions').classList.remove('hidden');
        }

        showLoading(false);
        showView('dashboard-view');
        await loadDashboardData(user.id);
        loadNotifications(user.id);

        // Set up real-time subscriptions
        setupRealtimeSubscriptions(user.id);
    }
}

// PROFILE MANAGEMENT
function toggleDriverFields() {
    const role = document.getElementById('p-role').value;
    const driverFields = document.getElementById('driver-fields');

    if (role === 'Driver' || role === 'Both') {
        driverFields.classList.remove('hidden');
        document.getElementById('p-car-model').required = true;
        document.getElementById('p-car-plate').required = true;
        document.getElementById('p-seats').required = true;
    } else {
        driverFields.classList.add('hidden');
        document.getElementById('p-car-model').required = false;
        document.getElementById('p-car-plate').required = false;
        document.getElementById('p-seats').required = false;
    }
}

async function saveProfile(event) {
    event.preventDefault();
    showLoading(true);

    const role = document.getElementById('p-role').value;
    const profileData = {
        id: currentUser.id,
        email: currentUser.email,
        name: document.getElementById('p-name').value,
        phone: document.getElementById('p-phone').value,
        gender: document.getElementById('p-gender').value,
        role: role,
        area: document.getElementById('p-area').value
    };

    if (role === 'Driver' || role === 'Both') {
        profileData.car_model = document.getElementById('p-car-model').value;
        profileData.car_plate = document.getElementById('p-car-plate').value;
        profileData.seats_available = parseInt(document.getElementById('p-seats').value);
    }

    const { error } = await client
        .from('users')
        .upsert(profileData);

    if (error) {
        showToast('Error saving profile: ' + error.message, 'error');
        showLoading(false);
    } else {
        showToast('Profile saved successfully!', 'success');
        await checkProfile(currentUser);
    }
}

function openProfileView() {
    if (!currentProfile) return;

    const display = document.getElementById('profile-display');
    display.innerHTML = `
        <div class="profile-field">
            <label>Full Name</label>
            <p>${currentProfile.name}</p>
        </div>
        <div class="profile-field">
            <label>Email</label>
            <p>${currentProfile.email}</p>
        </div>
        <div class="profile-field">
            <label>Phone</label>
            <p>${currentProfile.phone}</p>
        </div>
        <div class="profile-field">
            <label>Gender</label>
            <p>${currentProfile.gender}</p>
        </div>
        <div class="profile-field">
            <label>Role</label>
            <p>${currentProfile.role}</p>
        </div>
        <div class="profile-field">
            <label>Home Area</label>
            <p>${currentProfile.area}</p>
        </div>
        ${currentProfile.car_model ? `
            <div class="profile-field">
                <label>Car Model</label>
                <p>${currentProfile.car_model}</p>
            </div>
            <div class="profile-field">
                <label>Car Plate</label>
                <p>${currentProfile.car_plate}</p>
            </div>
            <div class="profile-field">
                <label>Available Seats</label>
                <p>${currentProfile.seats_available}</p>
            </div>
        ` : ''}
    `;

    showView('profile-view-modal');
}

function closeProfileView() {
    showView('dashboard-view');
}

function editProfile() {
    // Populate form with current data
    document.getElementById('p-name').value = currentProfile.name;
    document.getElementById('p-phone').value = currentProfile.phone;
    document.getElementById('p-gender').value = currentProfile.gender;
    document.getElementById('p-role').value = currentProfile.role;
    document.getElementById('p-area').value = currentProfile.area;

    if (currentProfile.car_model) {
        document.getElementById('p-car-model').value = currentProfile.car_model;
        document.getElementById('p-car-plate').value = currentProfile.car_plate;
        document.getElementById('p-seats').value = currentProfile.seats_available;
    }

    toggleDriverFields();
    closeProfileView();
    showView('profile-modal');
}

// DATA LOADING
async function loadDashboardData(userId) {
    // Load Available Trips using the View
    const { data: trips, error: tripsError } = await client
        .from('trips_with_driver')
        .select('*')
        .eq('is_active', true)
        .order('trip_date', { ascending: true })
        .order('trip_time', { ascending: true });

    if (tripsError) {
        console.error('Error loading trips:', tripsError);
        allTrips = [];
    } else {
        allTrips = trips || [];
    }

    // Load User's Joined Trips
    const { data: myRides } = await client
        .from('trip_members')
        .select('trip_id')
        .eq('user_id', userId)
        .eq('status', 'confirmed');

    // Load Trips where User is the Driver
    const { data: myDriving } = await client
        .from('trips')
        .select('id')
        .eq('driver_id', userId)
        .eq('is_active', true);

    // Update stats
    document.getElementById('stat-avail').innerText = allTrips.length;
    document.getElementById('stat-rides').innerText = myRides?.length || 0;
    document.getElementById('stat-driving').innerText = myDriving?.length || 0;
    document.getElementById('stat-total').innerText = allTrips.length + (myRides?.length || 0);

    applyFilters();
}

function applyFilters() {
    const typeFilter = document.getElementById('filter-type')?.value || 'all';
    const dateFilter = document.getElementById('filter-date')?.value || 'all';

    filteredTrips = allTrips.filter(trip => {
        // Type filter
        if (typeFilter !== 'all' && trip.trip_type !== typeFilter) {
            return false;
        }

        // Date filter
        if (dateFilter !== 'all') {
            const tripDate = new Date(trip.trip_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (dateFilter === 'today' && tripDate.toDateString() !== today.toDateString()) {
                return false;
            }
            if (dateFilter === 'week') {
                const weekFromNow = new Date(today);
                weekFromNow.setDate(weekFromNow.getDate() + 7);
                if (tripDate < today || tripDate > weekFromNow) {
                    return false;
                }
            }
        }

        return true;
    });

    renderTrips();
}

function renderTrips() {
    const container = document.getElementById('trips-container');

    if (!filteredTrips || filteredTrips.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🚗</div>
                <p>No trips available</p>
                <p style="margin-top: 0.5rem; opacity: 0.7;">Try adjusting your filters</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filteredTrips.map(trip => `
        <div class="trip-card" onclick="viewTripDetails('${trip.id}')">
            <div class="trip-header">
                <span class="badge badge-${trip.trip_type}">${trip.trip_type}</span>
                <span class="badge ${trip.current_passengers >= trip.max_passengers ? 'badge-full' : 'badge-available'}">
                    ${trip.current_passengers || 0}/${trip.max_passengers} seats
                </span>
            </div>
            <h3 class="trip-title">${escapeHtml(trip.title)}</h3>
            <div class="trip-info">
                <div class="info-row">
                    <span class="icon">👤</span>
                    <span>Driver: ${escapeHtml(trip.driver_name)}</span>
                </div>
                <div class="info-row">
                    <span class="icon">📍</span>
                    <span>${escapeHtml(trip.start_point)} → ${escapeHtml(trip.destination)}</span>
                </div>
                <div class="info-row">
                    <span class="icon">📅</span>
                    <span>${new Date(trip.trip_date).toLocaleDateString()}</span>
                </div>
                <div class="info-row">
                    <span class="icon">⏰</span>
                    <span>${formatTime(trip.trip_time)}</span>
                </div>
                <div class="info-row">
                    <span class="icon">👥</span>
                    <span>${trip.gender_filter}</span>
                </div>
            </div>
        </div>
    `).join('');
}

// TRIP DETAILS
async function viewTripDetails(tripId) {
    showLoading(true);

    // Get trip details with driver info
    const { data: trip, error: tripError } = await client
        .from('trips_with_driver')
        .select('*')
        .eq('id', tripId)
        .single();

    if (tripError || !trip) {
        showToast('Error loading trip details', 'error');
        showLoading(false);
        return;
    }

    // Get trip members
    const { data: members } = await client
        .from('trip_members')
        .select(`
            id,
            user_id,
            status,
            users (
                name,
                phone,
                gender
            )
        `)
        .eq('trip_id', tripId)
        .eq('status', 'confirmed');

    // Check if current user is already a member
    const { data: userMembership } = await client
        .from('trip_members')
        .select('id, status')
        .eq('trip_id', tripId)
        .eq('user_id', currentUser.id)
        .eq('status', 'confirmed')
        .maybeSingle();

    const isDriver = trip.driver_id === currentUser.id;
    const isMember = !!userMembership;
    const isFull = (trip.current_passengers || 0) >= trip.max_passengers;

    // Render trip details
    const detailsContent = document.getElementById('trip-details-content');
    detailsContent.innerHTML = `
        <div class="trip-detail-header">
            <h2>${escapeHtml(trip.title)}</h2>
            <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                <span class="badge badge-${trip.trip_type}">${trip.trip_type}</span>
                <span class="badge ${isFull ? 'badge-full' : 'badge-available'}">
                    ${trip.current_passengers || 0}/${trip.max_passengers} seats
                </span>
            </div>
        </div>

        <div class="trip-detail-section">
            <h3>Trip Information</h3>
            <div class="info-row">
                <span class="icon">👤</span>
                <span><strong>Driver:</strong> ${escapeHtml(trip.driver_name)}</span>
            </div>
            <div class="info-row">
                <span class="icon">📞</span>
                <span><strong>Phone:</strong> ${escapeHtml(trip.driver_phone)}</span>
            </div>
            <div class="info-row">
                <span class="icon">🚗</span>
                <span><strong>Vehicle:</strong> ${escapeHtml(trip.driver_car_model || 'N/A')} (${escapeHtml(trip.driver_car_plate || 'N/A')})</span>
            </div>
            <div class="info-row">
                <span class="icon">📍</span>
                <span><strong>From:</strong> ${escapeHtml(trip.start_point)}</span>
            </div>
            <div class="info-row">
                <span class="icon">🎯</span>
                <span><strong>To:</strong> ${escapeHtml(trip.destination)}</span>
            </div>
            <div class="info-row">
                <span class="icon">📅</span>
                <span><strong>Date:</strong> ${new Date(trip.trip_date).toLocaleDateString()}</span>
            </div>
            <div class="info-row">
                <span class="icon">⏰</span>
                <span><strong>Time:</strong> ${formatTime(trip.trip_time)}</span>
            </div>
            <div class="info-row">
                <span class="icon">👥</span>
                <span><strong>Gender Filter:</strong> ${trip.gender_filter}</span>
            </div>
            ${trip.area_filter ? `
                <div class="info-row">
                    <span class="icon">🏘️</span>
                    <span><strong>Area:</strong> ${escapeHtml(trip.area_filter)}</span>
                </div>
            ` : ''}
            ${trip.notes ? `
                <div class="info-row">
                    <span class="icon">📝</span>
                    <span><strong>Notes:</strong> ${escapeHtml(trip.notes)}</span>
                </div>
            ` : ''}
        </div>

        ${members && members.length > 0 ? `
            <div class="trip-detail-section">
                <h3>Passengers (${members.length})</h3>
                ${members.map(m => `
                    <div class="passenger-item">
                        <span>👤 ${escapeHtml(m.users?.name || 'Unknown')}</span>
                        <span class="badge">${m.users?.gender || 'N/A'}</span>
                    </div>
                `).join('')}
            </div>
        ` : ''}

        <div class="modal-actions" style="margin-top: 1.5rem;">
            ${!isDriver && !isMember && !isFull ? `
                <button onclick="joinTrip('${tripId}')" class="btn-primary">Join Trip</button>
            ` : ''}
            ${!isDriver && isMember ? `
                <button onclick="cancelTrip('${tripId}', '${userMembership.id}')" class="btn-danger">Cancel Trip</button>
            ` : ''}
            ${isDriver ? `
                <div style="display: flex; gap: 0.5rem;">
                    <button onclick="editTrip('${tripId}')" class="btn-secondary" style="flex: 1;">Edit Trip</button>
                    <button onclick="deleteTrip('${tripId}')" class="btn-danger" style="flex: 1;">Delete Trip</button>
                </div>
            ` : ''}
            <button onclick="closeModal()" class="btn-secondary">Close</button>
        </div>
    `;

    showLoading(false);
    showView('trip-details-modal');
}

// TRIP ACTIONS
async function joinTrip(tripId) {
    if (!confirm('Join this trip?')) return;

    showLoading(true);

    const { error } = await client
        .from('trip_members')
        .insert({
            trip_id: tripId,
            user_id: currentUser.id,
            status: 'confirmed'
        });

    if (error) {
        showToast('Error joining trip: ' + error.message, 'error');
    } else {
        showToast('Successfully joined trip!', 'success');
        await loadDashboardData(currentUser.id);
        closeModal();
    }

    showLoading(false);
}

async function cancelTrip(tripId, membershipId) {
    if (!confirm('Are you sure you want to cancel this trip?')) return;

    showLoading(true);

    const { error } = await client
        .from('trip_members')
        .delete()
        .eq('id', membershipId);

    if (error) {
        showToast('Error canceling trip: ' + error.message, 'error');
    } else {
        showToast('Trip canceled successfully', 'success');
        await loadDashboardData(currentUser.id);
        closeModal();
    }

    showLoading(false);
}

// TRIP CREATION & EDITING
function openTripModal() {
    document.getElementById('trip-form').reset();
    document.getElementById('trip-id').value = '';
    document.getElementById('modal-title').innerText = 'Create New Trip';
    showView('trip-modal');
}

async function editTrip(tripId) {
    showLoading(true);

    const { data: trip, error } = await client
        .from('trips')
        .select('*')
        .eq('id', tripId)
        .single();

    if (error || !trip) {
        showToast('Error loading trip', 'error');
        showLoading(false);
        return;
    }

    // Populate form
    document.getElementById('trip-id').value = trip.id;
    document.getElementById('trip-title').value = trip.title;
    document.getElementById('trip-start').value = trip.start_point;
    document.getElementById('trip-dest').value = trip.destination;
    document.getElementById('trip-date').value = trip.trip_date;
    document.getElementById('trip-time').value = trip.trip_time;
    document.getElementById('trip-type').value = trip.trip_type;
    document.getElementById('trip-gender').value = trip.gender_filter;
    document.getElementById('trip-area').value = trip.area_filter || '';
    document.getElementById('trip-max-pass').value = trip.max_passengers;
    document.getElementById('trip-notes').value = trip.notes || '';

    document.getElementById('modal-title').innerText = 'Edit Trip';
    showLoading(false);
    showView('trip-modal');
}

async function saveTrip(event) {
    event.preventDefault();
    showLoading(true);

    const tripId = document.getElementById('trip-id').value;
    const tripData = {
        title: document.getElementById('trip-title').value,
        start_point: document.getElementById('trip-start').value,
        destination: document.getElementById('trip-dest').value,
        trip_date: document.getElementById('trip-date').value,
        trip_time: document.getElementById('trip-time').value,
        trip_type: document.getElementById('trip-type').value,
        gender_filter: document.getElementById('trip-gender').value,
        area_filter: document.getElementById('trip-area').value || null,
        max_passengers: parseInt(document.getElementById('trip-max-pass').value),
        notes: document.getElementById('trip-notes').value || null
    };

    let error;

    if (tripId) {
        // Update existing trip
        ({ error } = await client
            .from('trips')
            .update(tripData)
            .eq('id', tripId));
    } else {
        // Create new trip
        tripData.driver_id = currentUser.id;
        ({ error } = await client
            .from('trips')
            .insert(tripData));
    }

    if (error) {
        showToast('Error saving trip: ' + error.message, 'error');
        showLoading(false);
    } else {
        showToast(tripId ? 'Trip updated!' : 'Trip created!', 'success');
        await loadDashboardData(currentUser.id);
        closeModal();
        showLoading(false);
    }
}

async function deleteTrip(tripId) {
    if (!confirm('Are you sure you want to delete this trip? This action cannot be undone.')) {
        return;
    }

    showLoading(true);

    const { error } = await client
        .from('trips')
        .update({ is_active: false })
        .eq('id', tripId);

    if (error) {
        showToast('Error deleting trip: ' + error.message, 'error');
    } else {
        showToast('Trip deleted successfully', 'success');
        await loadDashboardData(currentUser.id);
        closeModal();
    }

    showLoading(false);
}

// MY TRIPS
async function openMyTrips() {
    showLoading(true);

    // Get trips user has joined
    const { data: joined } = await client
        .from('trip_members')
        .select(`
            *,
            trips_with_driver (*)
        `)
        .eq('user_id', currentUser.id)
        .eq('status', 'confirmed')
        .order('joined_at', { ascending: false });

    // Get trips user is driving
    const { data: driving } = await client
        .from('trips')
        .select('*')
        .eq('driver_id', currentUser.id)
        .eq('is_active', true)
        .order('trip_date', { ascending: true })
        .order('trip_time', { ascending: true });

    // Render joined trips
    const joinedList = document.getElementById('joined-trips-list');
    if (!joined || joined.length === 0) {
        joinedList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🚙</div>
                <p>You haven't joined any trips yet</p>
            </div>
        `;
    } else {
        joinedList.innerHTML = joined.map(({ trips_with_driver: t }) => `
            <div class="card" style="margin-bottom: 1rem;">
                <span class="badge badge-${t.trip_type}">${t.trip_type}</span>
                <h3>${t.title}</h3>
                <p>👤 Driver: ${t.driver_name}</p>
                <p>📍 ${t.start_point} → ${t.destination}</p>
                <p>📅 ${new Date(t.trip_date).toLocaleDateString()} | ⏰ ${formatTime(t.trip_time)}</p>
                <button onclick="viewTripDetails('${t.id}')" class="btn-primary" style="margin-top: 1rem; width: 100%;">View Details</button>
            </div>
        `).join('');
    }

    // Render driving trips
    const drivingList = document.getElementById('driving-trips-list');
    if (!driving || driving.length === 0) {
        drivingList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🚙</div>
                <p>You haven't created any trips yet</p>
            </div>
        `;
    } else {
        drivingList.innerHTML = driving.map(t => `
            <div class="card" style="margin-bottom: 1rem;">
                <span class="badge badge-${t.trip_type}">${t.trip_type}</span>
                <h3>${t.title}</h3>
                <p>📍 ${t.start_point} → ${t.destination}</p>
                <p>📅 ${new Date(t.trip_date).toLocaleDateString()} | ⏰ ${formatTime(t.trip_time)}</p>
                <p>💺 ${t.current_passengers || 0}/${t.max_passengers} seats filled</p>
                <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                    <button onclick="viewTripDetails('${t.id}')" class="btn-primary" style="flex: 1;">View Details</button>
                    <button onclick="editTrip('${t.id}'); closeMyTrips();" class="btn-secondary" style="flex: 1;">Edit</button>
                </div>
            </div>
        `).join('');
    }

    showLoading(false);
    showView('my-trips-modal');
}

function switchTab(tab) {
    const tabs = document.querySelectorAll('.tab');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(t => t.classList.remove('active'));
    contents.forEach(c => c.classList.add('hidden'));

    if (tab === 'joined') {
        tabs[0].classList.add('active');
        document.getElementById('joined-trips').classList.remove('hidden');
    } else {
        tabs[1].classList.add('active');
        document.getElementById('driving-trips').classList.remove('hidden');
    }
}

function closeMyTrips() {
    showView('dashboard-view');
}

// NOTIFICATIONS
async function loadNotifications(userId) {
    const { data: notifications } = await client
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

    if (notifications && notifications.length > 0) {
        const unreadCount = notifications.filter(n => !n.is_read).length;
        if (unreadCount > 0) {
            const badge = document.getElementById('notification-badge');
            badge.innerText = unreadCount;
            badge.classList.remove('hidden');
        }
    }
}

function openNotifications() {
    const panel = document.getElementById('notifications-panel');
    panel.classList.remove('hidden');
    loadNotificationsList();
}

function closeNotifications() {
    const panel = document.getElementById('notifications-panel');
    panel.classList.add('hidden');
}

async function loadNotificationsList() {
    const { data: notifications } = await client
        .from('notifications')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(50);

    const content = document.getElementById('notifications-content');

    if (!notifications || notifications.length === 0) {
        content.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🔔</div>
                <p>No notifications yet</p>
            </div>
        `;
        return;
    }

    content.innerHTML = notifications.map(n => `
        <div class="notification-item ${n.is_read ? '' : 'unread'}" onclick="markAsRead('${n.id}')">
            <h4>${n.title}</h4>
            <p>${n.message}</p>
            <span class="notification-time">${formatTimeAgo(n.created_at)}</span>
        </div>
    `).join('');

    // Mark all as read after viewing
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length > 0) {
        await client
            .from('notifications')
            .update({ is_read: true })
            .in('id', unreadIds);

        document.getElementById('notification-badge').classList.add('hidden');
    }
}

async function markAsRead(notificationId) {
    await client
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);
}

// REAL-TIME SUBSCRIPTIONS
function setupRealtimeSubscriptions(userId) {
    // Subscribe to trips changes
    client
        .channel('trips-changes')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'trips' },
            () => loadDashboardData(userId)
        )
        .subscribe();

    // Subscribe to trip_members changes to update passenger counts in real-time
    client
        .channel('trip-members-changes')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'trip_members' },
            () => loadDashboardData(userId)
        )
        .subscribe();

    // Subscribe to new notifications
    client
        .channel('notifications-changes')
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
            (payload) => {
                loadNotifications(userId);
                showToast(payload.new.title, 'info');
            }
        )
        .subscribe();
}

// HELPER FUNCTIONS
function showView(viewId) {
    ['auth-view', 'dashboard-view', 'profile-modal', 'profile-view-modal', 'trip-modal', 'trip-details-modal', 'my-trips-modal'].forEach(id => {
        const elem = document.getElementById(id);
        if (elem) elem.classList.add('hidden');
    });
    const view = document.getElementById(viewId);
    if (view) view.classList.remove('hidden');
}

function closeModal() {
    showView('dashboard-view');
}

function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (show) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    toast.innerHTML = `
        <div class="toast-content">
            <span class="toast-icon">${icons[type]}</span>
            <span class="toast-message">${message}</span>
        </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s ease-out reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function formatTime(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
}

function formatTimeAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize on load
init();