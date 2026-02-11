// ===================================
// SCHOOL CARPOOL WEB APPLICATION
// Main JavaScript File - Complete Integrated Version
// ===================================

// 1. Configuration
const SUPABASE_URL = 'https://zjxkykvkxfrndlcirfjg.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_MsYFfGjoGA-rl8PCjF-58Q_kGkMvzuF'; 

// 2. Initialize client with a unique name to avoid declaration conflicts
const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global state
let currentUser = null;
let currentUserProfile = null;
let allTrips = [];

// ===================================
// UTILITY FUNCTIONS
// ===================================

function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    if (!toast || !toastMessage) return;
    toastMessage.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), duration);
}

function showPage(pageId) {
    const pages = ['loginPage', 'profileSetupPage', 'dashboardPage', 'myTripsPage'];
    pages.forEach(page => {
        const el = document.getElementById(page);
        if (el) el.classList.add('hidden');
    });
    const targetPage = document.getElementById(pageId);
    if (targetPage) targetPage.classList.remove('hidden');
    
    const navbar = document.getElementById('navbar');
    if (pageId === 'loginPage' || pageId === 'profileSetupPage') {
        navbar?.classList.add('hidden');
    } else {
        navbar?.classList.remove('hidden');
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(timeString) {
    if (!timeString) return "";
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
}

// ===================================
// AUTHENTICATION FUNCTIONS
// ===================================

async function initializeAuth() {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) loadingScreen.classList.remove('hidden');
    
    try {
        const { data: { session }, error } = await sbClient.auth.getSession();
        if (error) throw error;

        if (session) {
            currentUser = session.user;
            await checkUserProfile();
        } else {
            showPage('loginPage');
        }
    } catch (err) {
        console.error('Auth Error:', err);
        showPage('loginPage');
    } finally {
        if (loadingScreen) loadingScreen.classList.add('hidden');
    }
}

async function checkUserProfile() {
    const { data, error } = await sbClient
        .from('users')
        .select('*')
        .eq('id', currentUser.id)
        .single();
    
    if (error || !data) {
        showPage('profileSetupPage');
        prefillProfileForm();
    } else {
        currentUserProfile = data;
        initializeDashboard();
        showPage('dashboardPage');
    }
}

function prefillProfileForm() {
    if (currentUser?.user_metadata) {
        const nameInput = document.getElementById('nameInput');
        if (nameInput && currentUser.user_metadata.full_name) {
            nameInput.value = currentUser.user_metadata.full_name;
        }
        const avatar = document.getElementById('userAvatar');
        if (avatar && currentUser.user_metadata.avatar_url) {
            avatar.src = currentUser.user_metadata.avatar_url;
        }
    }
}

async function signInWithGoogle() {
    const redirectUrl = window.location.origin + window.location.pathname;
    const { error } = await sbClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl }
    });
    if (error) showToast('Sign in failed: ' + error.message);
}

async function signOut() {
    const { error } = await sbClient.auth.signOut();
    if (!error) {
        currentUser = null;
        currentUserProfile = null;
        showPage('loginPage');
        showToast('Signed out successfully');
    }
}

// ===================================
// TRIP DISCOVERY & DASHBOARD
// ===================================

async function loadTrips(filters = {}) {
    try {
        let query = sbClient
            .from('trips')
            .select(`
                *,
                driver:users!trips_driver_id_fkey(name, phone, profile_image_url, car_model, car_plate),
                trip_members(user_id, status)
            `)
            .eq('is_active', true)
            .gte('trip_date', new Date().toISOString().split('T')[0])
            .order('trip_date', { ascending: true });
        
        const { data, error } = await query;
        if (error) throw error;
        
        // Filter: Hide user's own trips from the discovery dashboard
        let filteredTrips = (data || []).filter(trip => trip.driver_id !== currentUser.id);
        
        allTrips = filteredTrips;
        return filteredTrips;
    } catch (err) {
        console.error('Load Trips Error:', err);
        return [];
    }
}

async function initializeDashboard() {
    const avatar = document.getElementById('userAvatar');
    if (avatar && currentUserProfile) {
        avatar.src = currentUserProfile.profile_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUserProfile.name)}`;
    }
    
    const createBtn = document.getElementById('createTripBtnContainer');
    if (createBtn) {
        const isDriver = ['Driver', 'Both'].includes(currentUserProfile?.role);
        isDriver ? createBtn.classList.remove('hidden') : createBtn.classList.add('hidden');
    }
    await renderDashboard();
}

async function renderDashboard() {
    const trips = await loadTrips();
    const container = document.getElementById('tripsContainer');
    const emptyState = document.getElementById('emptyState');
    
    if (!container) return;

    if (trips.length === 0) {
        container.innerHTML = '';
        emptyState?.classList.remove('hidden');
    } else {
        emptyState?.classList.add('hidden');
        container.innerHTML = trips.map(trip => renderTripCard(trip)).join('');
    }
}

function renderTripCard(trip) {
    const isUserJoined = trip.trip_members?.some(m => m.user_id === currentUser.id);
    const availableSeats = trip.max_passengers - (trip.current_passengers || 0);
    const isFull = availableSeats <= 0;
    
    return `
        <div class="trip-card bg-white rounded-xl shadow-md p-6 border">
            <h3 class="text-lg font-bold text-gray-800 mb-2">${trip.title}</h3>
            <div class="text-sm text-gray-600 space-y-1 mb-4">
                <p><i class="fas fa-map-marker-alt text-blue-500 mr-2"></i>From: ${trip.start_point}</p>
                <p><i class="fas fa-flag-checkered text-green-500 mr-2"></i>To: ${trip.destination}</p>
                <p><i class="fas fa-calendar mr-2"></i>${formatDate(trip.trip_date)} @ ${formatTime(trip.trip_time)}</p>
            </div>
            <div class="flex gap-2 mb-4">
                <span class="badge badge-blue">${trip.gender_filter}</span>
                <span class="badge badge-green">${availableSeats} seats left</span>
            </div>
            ${isUserJoined ? 
                `<button onclick="handleLeaveTrip('${trip.id}')" class="w-full bg-red-500 text-white py-2 rounded-lg">Leave Trip</button>` :
                isFull ? `<button disabled class="w-full bg-gray-300 text-gray-500 py-2 rounded-lg cursor-not-allowed">Full</button>` :
                `<button onclick="handleJoinTrip('${trip.id}')" class="w-full btn-primary text-white py-2 rounded-lg">Join Trip</button>`
            }
        </div>
    `;
}

// ===================================
// MY TRIPS LOGIC (DRIVER & PASSENGER)
// ===================================

async function renderMyTrips() {
    // 1. Fetch trips where I am the Driver
    const { data: dTrips } = await sbClient
        .from('trips')
        .select(`*, trip_members(user_id, status, user:users(name))`)
        .eq('driver_id', currentUser.id);

    const driverContainer = document.getElementById('driverTripsContainer');
    if (driverContainer) {
        driverContainer.innerHTML = dTrips?.length ? dTrips.map(t => `
            <div class="bg-white p-4 rounded-lg shadow border">
                <div class="flex justify-between">
                    <strong>${t.title}</strong>
                    <button onclick="handleDeleteTrip('${t.id}')" class="text-red-500"><i class="fas fa-trash"></i></button>
                </div>
                <p class="text-sm text-gray-500">${t.trip_date} | ${t.current_passengers}/${t.max_passengers} Seats</p>
            </div>
        `).join('') : '<div class="col-span-full text-center py-8 text-gray-500">No trips created as driver.</div>';
    }

    // 2. Fetch trips where I am a Passenger
    const { data: pTrips } = await sbClient
        .from('trip_members')
        .select(`*, trip:trips(*, driver:users(name))`)
        .eq('user_id', currentUser.id);

    const passengerContainer = document.getElementById('passengerTripsContainer');
    if (passengerContainer) {
        passengerContainer.innerHTML = pTrips?.length ? pTrips.map(m => `
            <div class="bg-white p-4 rounded-lg shadow border">
                <strong>${m.trip.title}</strong>
                <p class="text-sm text-gray-500">Driver: ${m.trip.driver.name}</p>
                <button onclick="handleLeaveTrip('${m.trip.id}')" class="mt-2 text-red-500 text-sm">Leave Trip</button>
            </div>
        `).join('') : '<div class="col-span-full text-center py-8 text-gray-500">No trips joined as passenger.</div>';
    }
}

// ===================================
// INITIALIZATION & EVENT LISTENERS
// ===================================

document.addEventListener('DOMContentLoaded', () => {
    initializeAuth();

    // Auth Change Listener
    sbClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            currentUser = session.user;
            if (window.location.hash) window.history.replaceState(null, null, window.location.pathname);
            checkUserProfile();
        } else if (event === 'SIGNED_OUT') {
            showPage('loginPage');
        }
    });

    // Login & Profile UI
    document.getElementById('googleSignInBtn')?.addEventListener('click', signInWithGoogle);
    document.getElementById('logoutBtn')?.addEventListener('click', signOut);
    document.getElementById('userMenuBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('userDropdown')?.classList.toggle('hidden');
    });
    window.addEventListener('click', () => document.getElementById('userDropdown')?.classList.add('hidden'));

    // Navigation Links
    document.getElementById('myTripsLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        showPage('myTripsPage');
        renderMyTrips();
    });
    document.getElementById('backToDashboard')?.addEventListener('click', () => {
        showPage('dashboardPage');
        renderDashboard();
    });
    document.getElementById('viewProfile')?.addEventListener('click', (e) => {
        e.preventDefault();
        showPage('profileSetupPage');
    });

    // Profile Form
    document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const profileData = {
            id: currentUser.id,
            email: currentUser.email,
            name: document.getElementById('nameInput').value,
            phone: document.getElementById('phoneInput').value,
            gender: document.getElementById('genderInput').value,
            area: document.getElementById('areaInput').value,
            role: document.getElementById('roleInput').value,
            profile_image_url: currentUser.user_metadata?.avatar_url
        };
        const { error } = await sbClient.from('users').upsert([profileData]);
        if (!error) {
            showToast('Profile Saved!');
            checkUserProfile();
        }
    });

    // Create Trip Logic
    document.getElementById('createTripBtn')?.addEventListener('click', () => {
        document.getElementById('createTripModal')?.classList.remove('hidden');
    });
    document.getElementById('closeTripModal')?.addEventListener('click', () => {
        document.getElementById('createTripModal')?.classList.add('hidden');
    });
    document.getElementById('createTripForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const tripData = {
            driver_id: currentUser.id,
            title: document.getElementById('tripTitle').value,
            start_point: document.getElementById('startPoint').value,
            destination: document.getElementById('destination').value,
            trip_date: document.getElementById('tripDate').value,
            trip_time: document.getElementById('tripTime').value,
            trip_type: document.getElementById('tripType').value,
            gender_filter: document.getElementById('genderFilter').value,
            max_passengers: parseInt(document.getElementById('maxPassengers').value),
            current_passengers: 0,
            is_active: true
        };
        const { error } = await sbClient.from('trips').insert([tripData]);
        if (!error) {
            showToast('Trip Created!');
            document.getElementById('createTripModal').classList.add('hidden');
            document.getElementById('createTripForm').reset();
            renderDashboard();
        }
    });

    // Tab Switching
    document.getElementById('tabAsDriver')?.addEventListener('click', () => {
        document.getElementById('tabAsDriver').className = 'border-b-2 border-blue-500 py-4 px-1 text-blue-600 font-semibold';
        document.getElementById('tabAsPassenger').className = 'border-b-2 border-transparent py-4 px-1 text-gray-500';
        document.getElementById('driverTripsContainer').classList.remove('hidden');
        document.getElementById('passengerTripsContainer').classList.add('hidden');
    });
    document.getElementById('tabAsPassenger')?.addEventListener('click', () => {
        document.getElementById('tabAsPassenger').className = 'border-b-2 border-blue-500 py-4 px-1 text-blue-600 font-semibold';
        document.getElementById('tabAsDriver').className = 'border-b-2 border-transparent py-4 px-1 text-gray-500';
        document.getElementById('passengerTripsContainer').classList.remove('hidden');
        document.getElementById('driverTripsContainer').classList.add('hidden');
    });
});

// ===================================
// GLOBAL BUTTON HANDLERS
// ===================================

window.handleJoinTrip = async (tripId) => {
    const { data: trip } = await sbClient.from('trips').select('current_passengers, max_passengers').eq('id', tripId).single();
    if (trip.current_passengers >= trip.max_passengers) return showToast('Trip is full!');

    const { error } = await sbClient.from('trip_members').insert([{ trip_id: tripId, user_id: currentUser.id, status: 'confirmed' }]);
    if (error) return showToast('Already joined or error occurred.');

    await sbClient.from('trips').update({ current_passengers: (trip.current_passengers || 0) + 1 }).eq('id', tripId);
    showToast('Joined Trip!');
    renderDashboard();
};

window.handleLeaveTrip = async (tripId) => {
    if (!confirm('Leave this trip?')) return;
    const { error } = await sbClient.from('trip_members').delete().eq('trip_id', tripId).eq('user_id', currentUser.id);
    if (!error) {
        const { data: trip } = await sbClient.from('trips').select('current_passengers').eq('id', tripId).single();
        await sbClient.from('trips').update({ current_passengers: Math.max(0, trip.current_passengers - 1) }).eq('id', tripId);
        showToast('Left Trip');
        renderDashboard();
        renderMyTrips();
    }
};

window.handleDeleteTrip = async (tripId) => {
    if (!confirm('Delete this trip? All passengers will be removed.')) return;
    const { error } = await sbClient.from('trips').delete().eq('id', tripId);
    if (!error) {
        showToast('Trip Deleted');
        renderMyTrips();
        renderDashboard();
    }
};