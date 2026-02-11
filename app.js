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

            if (dateFilter === 'today') {
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                if (tripDate < today || tripDate >= tomorrow) return false;
            } else if (dateFilter === 'tomorrow') {
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                const dayAfter = new Date(tomorrow);
                dayAfter.setDate(dayAfter.getDate() + 1);
                if (tripDate < tomorrow || tripDate >= dayAfter) return false;
            } else if (dateFilter === 'week') {
                const nextWeek = new Date(today);
                nextWeek.setDate(nextWeek.getDate() + 7);
                if (tripDate < today || tripDate > nextWeek) return false;
            }
        }

        return true;
    });

    renderTrips(filteredTrips);
}

function renderTrips(trips) {
    const container = document.getElementById('trips-container');

    if (!trips || trips.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🚗</div>
                <h3>No trips available</h3>
                <p>Check back later or create your own trip!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = trips.map(t => {
        const isDriver = t.driver_id === currentUser.id;
        const isFull = t.current_passengers >= t.max_passengers;
        const tripDate = new Date(t.trip_date);
        const formattedDate = tripDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        return `
            <div class="card" onclick="viewTripDetails('${t.id}')">
                <span class="badge badge-${t.trip_type}">${t.trip_type}</span>
                <h3>${t.title}</h3>
                <p>👤 ${t.driver_name}</p>
                <p>📍 ${t.start_point}</p>
                <p>🎯 ${t.destination}</p>
                <p>📅 ${formattedDate}</p>
                <p>⏰ ${formatTime(t.trip_time)}</p>
                <p>💺 ${t.current_passengers}/${t.max_passengers} seats</p>
                ${t.notes ? `<p style="font-style: italic; font-size: 0.85rem;">💬 ${t.notes}</p>` : ''}
                <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
                    ${isDriver ?
                `<button onclick="event.stopPropagation(); editTrip('${t.id}')" class="btn-secondary" style="flex: 1;">Edit</button>
                         <button onclick="event.stopPropagation(); deleteTrip('${t.id}', '${escapeHtml(t.title)}')" class="btn-danger" style="flex: 1;">Cancel</button>` :
                `<button onclick="event.stopPropagation(); joinTrip('${t.id}')" class="btn-primary" style="flex: 1;" ${isFull ? 'disabled' : ''}>
                            ${isFull ? 'Full' : 'Join Trip →'}
                         </button>`
            }
                </div>
            </div>
        `;
    }).join('');
}

// TRIP MANAGEMENT
function openTripModal() {
    document.getElementById('modal-title').innerText = 'Create Trip';
    document.getElementById('trip-form').reset();
    document.getElementById('t-id').value = '';

    // Set minimum date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('t-date').min = today;

    // Set default gender filter
    document.getElementById('t-gender').value = 'Mixed';

    showView('trip-modal');
}

async function saveTrip(event) {
    event.preventDefault();
    showLoading(true);

    const tripId = document.getElementById('t-id').value;
    const tripData = {
        title: document.getElementById('t-title').value,
        start_point: document.getElementById('t-start').value,
        destination: document.getElementById('t-dest').value,
        trip_date: document.getElementById('t-date').value,
        trip_time: document.getElementById('t-time').value,
        trip_type: document.getElementById('t-type').value,
        gender_filter: document.getElementById('t-gender').value,
        max_passengers: parseInt(document.getElementById('t-seats').value),
        notes: document.getElementById('t-notes').value || null
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

    showLoading(false);

    if (error) {
        showToast('Error saving trip: ' + error.message, 'error');
    } else {
        showToast(tripId ? 'Trip updated successfully!' : 'Trip created successfully!', 'success');
        closeModal();
        await loadDashboardData(currentUser.id);
    }
}

async function editTrip(tripId) {
    const { data: trip, error } = await client
        .from('trips')
        .select('*')
        .eq('id', tripId)
        .single();

    if (error || !trip) {
        showToast('Error loading trip details', 'error');
        return;
    }

    // Populate form
    document.getElementById('modal-title').innerText = 'Edit Trip';
    document.getElementById('t-id').value = trip.id;
    document.getElementById('t-title').value = trip.title;
    document.getElementById('t-start').value = trip.start_point;
    document.getElementById('t-dest').value = trip.destination;
    document.getElementById('t-date').value = trip.trip_date;
    document.getElementById('t-time').value = trip.trip_time;
    document.getElementById('t-type').value = trip.trip_type;
    document.getElementById('t-gender').value = trip.gender_filter;
    document.getElementById('t-seats').value = trip.max_passengers;
    document.getElementById('t-notes').value = trip.notes || '';

    showView('trip-modal');
}

async function joinTrip(tripId) {
    showLoading(true);

    const { error } = await client
        .from('trip_members')
        .insert({
            trip_id: tripId,
            user_id: currentUser.id,
            status: 'confirmed'
        });

    if (error) {
        showLoading(false);
        showToast(error.message.includes('full') ? 'Trip is full!' : 'Error joining trip: ' + error.message, 'error');
    } else {
        // Update passenger count
        const { data: trip } = await client
            .from('trips')
            .select('current_passengers, max_passengers')
            .eq('id', tripId)
            .single();

        if (trip) {
            await client
                .from('trips')
                .update({ current_passengers: trip.current_passengers + 1 })
                .eq('id', tripId);
        }

        showLoading(false);
        showToast('Joined trip successfully!', 'success');
        await loadDashboardData(currentUser.id);
    }
}

async function deleteTrip(tripId, title) {
    if (!confirm(`Cancel trip: ${title}?\n\nPassengers will be notified.`)) return;

    showLoading(true);

    // Get trip members to notify
    const { data: members } = await client
        .from('trip_members')
        .select('user_id')
        .eq('trip_id', tripId);

    if (members && members.length > 0) {
        const notifications = members.map(m => ({
            user_id: m.user_id,
            type: 'trip_cancelled',
            title: 'Trip Cancelled',
            message: `The trip "${title}" was cancelled by the driver.`,
            related_trip_id: tripId
        }));

        await client.from('notifications').insert(notifications);
    }

    // Deactivate trip instead of deleting
    const { error } = await client
        .from('trips')
        .update({ is_active: false })
        .eq('id', tripId);

    showLoading(false);

    if (error) {
        showToast('Error cancelling trip', 'error');
    } else {
        showToast('Trip cancelled successfully', 'success');
        await loadDashboardData(currentUser.id);
    }
}

async function viewTripDetails(tripId) {
    showLoading(true);

    const { data: trip, error } = await client
        .from('trips_with_driver')
        .select('*')
        .eq('id', tripId)
        .single();

    if (error || !trip) {
        showLoading(false);
        showToast('Error loading trip details', 'error');
        return;
    }

    // Get trip members
    const { data: members } = await client
        .from('trip_members_detailed')
        .select('*')
        .eq('trip_id', tripId);

    showLoading(false);

    const tripDate = new Date(trip.trip_date);
    const formattedDate = tripDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const content = document.getElementById('trip-details-content');
    content.innerHTML = `
        <div style="padding: 2rem;">
            <div class="badge badge-${trip.trip_type}" style="margin-bottom: 1rem;">${trip.trip_type}</div>
            <h2 style="font-size: 1.75rem; margin-bottom: 1.5rem; font-family: 'Outfit', sans-serif;">${trip.title}</h2>
            
            <div style="display: grid; gap: 1.5rem; margin-bottom: 2rem;">
                <div>
                    <h4 style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.25rem;">Driver</h4>
                    <p style="font-size: 1.1rem; font-weight: 600;">👤 ${trip.driver_name}</p>
                    ${trip.driver_phone ? `<p style="font-size: 0.95rem; color: var(--text-secondary);">📞 ${trip.driver_phone}</p>` : ''}
                    ${trip.car_model ? `<p style="font-size: 0.95rem; color: var(--text-secondary);">🚗 ${trip.car_model} (${trip.car_plate})</p>` : ''}
                </div>
                
                <div>
                    <h4 style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.25rem;">Route</h4>
                    <p style="font-size: 1rem;">📍 From: <strong>${trip.start_point}</strong></p>
                    <p style="font-size: 1rem;">🎯 To: <strong>${trip.destination}</strong></p>
                </div>
                
                <div>
                    <h4 style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.25rem;">Schedule</h4>
                    <p style="font-size: 1rem;">📅 ${formattedDate}</p>
                    <p style="font-size: 1rem;">⏰ ${formatTime(trip.trip_time)}</p>
                </div>
                
                <div>
                    <h4 style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.25rem;">Capacity</h4>
                    <p style="font-size: 1rem;">💺 ${trip.current_passengers} / ${trip.max_passengers} seats filled</p>
                    <p style="font-size: 0.9rem; color: var(--text-secondary);">Gender: ${trip.gender_filter}</p>
                </div>
                
                ${trip.notes ? `
                    <div>
                        <h4 style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.25rem;">Notes</h4>
                        <p style="font-size: 0.95rem; font-style: italic; color: var(--text-secondary);">${trip.notes}</p>
                    </div>
                ` : ''}
            </div>
            
            ${members && members.length > 0 ? `
                <div style="margin-top: 2rem; padding-top: 2rem; border-top: 2px solid var(--border-color);">
                    <h3 style="font-size: 1.25rem; margin-bottom: 1rem; font-family: 'Outfit', sans-serif;">Passengers (${members.length})</h3>
                    <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                        ${members.map(m => `
                            <div style="background: var(--bg-accent); padding: 1rem; border-radius: var(--radius-md);">
                                <p style="font-weight: 600; margin-bottom: 0.25rem;">👤 ${m.passenger_name}</p>
                                <p style="font-size: 0.9rem; color: var(--text-secondary);">📞 ${m.passenger_phone}</p>
                                ${m.pickup_point ? `<p style="font-size: 0.9rem; color: var(--text-secondary);">📍 ${m.pickup_point}</p>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <button onclick="closeTripDetails()" class="btn-outline btn-full" style="margin-top: 2rem;">Close</button>
        </div>
    `;

    showView('trip-details-modal');
}

function closeTripDetails() {
    showView('dashboard-view');
}

// MY TRIPS
async function showMyTrips() {
    showLoading(true);

    // Load joined trips
    const { data: joinedTrips } = await client
        .from('trip_members')
        .select('trip_id, trips_with_driver(*)')
        .eq('user_id', currentUser.id)
        .eq('status', 'confirmed');

    // Load driving trips
    const { data: drivingTrips } = await client
        .from('trips_with_driver')
        .select('*')
        .eq('driver_id', currentUser.id)
        .eq('is_active', true);

    showLoading(false);

    renderMyTrips(joinedTrips, drivingTrips);
    showView('my-trips-modal');
}

function renderMyTrips(joined, driving) {
    // Render joined trips
    const joinedList = document.getElementById('joined-trips-list');
    if (!joined || joined.length === 0) {
        joinedList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🎫</div>
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
                <p>💺 ${t.current_passengers}/${t.max_passengers} seats filled</p>
                <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                    <button onclick="viewTripDetails('${t.id}')" class="btn-primary" style="flex: 1;">View Details</button>
                    <button onclick="editTrip('${t.id}'); closeMyTrips();" class="btn-secondary" style="flex: 1;">Edit</button>
                </div>
            </div>
        `).join('');
    }
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