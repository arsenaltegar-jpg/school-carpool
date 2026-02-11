const client = supabase.createClient(
    'https://zjxkykvkxfrndlcirfjg.supabase.co',
    'sb_publishable_MsYFfGjoGA-rl8PCjF-58Q_kGkMvzuF'
);

// INITIALIZATION & AUTH
async function init() {
    const { data: { session } } = await client.auth.getSession();
    if (!session) {
        showView('auth-view');
    } else {
        await checkProfile(session.user);
    }
}

async function signIn() {
    await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin }
    });
}

async function signOut() {
    await client.auth.signOut();
    location.reload();
}

async function checkProfile(user) {
    const { data: profile } = await client.from('users').select('*').eq('id', user.id).single();[cite: 2, 7]
    if (!profile) {
        showView('profile-modal');
    } else {
        showView('dashboard-view');
        if (profile.role !== 'Passenger') document.getElementById('driver-actions').classList.remove('hidden');
        loadDashboardData(user.id);
    }
}

// DATA LOADING
async function loadDashboardData(userId) {
    // Load Available Trips using the View 
    const { data: allTrips } = await client.from('trips_with_driver').select('*').eq('is_active', true);[cite: 13, 40]

    // Load User's Joined Trips [cite: 17, 41]
    const { data: myRides } = await client.from('trip_members').select('trip_id').eq('user_id', userId).eq('status', 'confirmed');[cite: 18, 41]

    // Load Trips where User is the Driver [cite: 8, 10]
    const { data: myDriving } = await client.from('trips').select('id').eq('driver_id', userId).eq('is_active', true);[cite: 10]

    document.getElementById('stat-avail').innerText = allTrips?.length || 0;
    document.getElementById('stat-rides').innerText = myRides?.length || 0;
    document.getElementById('stat-driving').innerText = myDriving?.length || 0;
    document.getElementById('stat-total').innerText = (allTrips?.length || 0) + (myRides?.length || 0);

    renderTrips(allTrips, userId);
}

function renderTrips(trips, userId) {
    const container = document.getElementById('trips-container');
    container.innerHTML = trips.map(t => `
        <div class="card">
            <span class="badge badge-${t.trip_type}">${t.trip_type.toUpperCase()}</span>
            <h3>${t.title}</h3>
            <p>👤 Driver: ${t.driver_name}</p>
            <p>📍 ${t.start_point} → ${t.destination}</p>
            <p>📅 ${t.trip_date} | ⏰ ${t.trip_time}</p>
            <p>💺 Seats: ${t.current_passengers}/${t.max_passengers}</p>
            ${t.driver_id === userId ?
            `<button onclick="deleteTrip('${t.id}', '${t.title}')" class="btn-danger">Cancel My Trip</button>` :
            `<button onclick="joinTrip('${t.id}')" class="btn-primary">Join Trip →</button>`
        }
        </div>
    `).join('');
}

// ACTIONS: JOIN, CREATE, DELETE
async function joinTrip(tripId) {
    const { data: { user } } = await client.auth.getUser();
    const { error } = await client.from('trip_members').insert({
        [cite: 17, 21]
        trip_id: tripId,
        user_id: user.id,
        status: 'confirmed'
    });

    if (error) alert(error.message); // Trigger check_trip_capacity 
    else { alert("Joined successfully!"); loadDashboardData(user.id); }
}

async function deleteTrip(tripId, title) {
    if (!confirm(`Cancel trip: ${title}? Passengers will be notified.`)) return;

    // Notify passengers before deactivating [cite: 24, 28]
    const { data: members } = await client.from('trip_members').select('user_id').eq('trip_id', tripId);
    if (members?.length > 0) {
        const notes = members.map(m => ({
            user_id: m.user_id,
            type: 'trip_cancelled',
            title: 'Trip Cancelled',
            message: `The trip "${title}" was cancelled by the driver.`,
            related_trip_id: tripId
        }));
        await client.from('notifications').insert(notes);[cite: 24, 28]
    }

    await client.from('trips').update({ is_active: false }).eq('id', tripId);[cite: 15]
    location.reload();
}

// HELPER UI
function showView(id) {
    ['auth-view', 'dashboard-view', 'profile-modal', 'trip-modal'].forEach(v => {
        document.getElementById(v).classList.add('hidden');
    });
    document.getElementById(id).classList.remove('hidden');
}

function openTripModal() { showView('trip-modal'); }
function closeModal() { showView('dashboard-view'); }

// Run
init();