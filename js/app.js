// ===================================
// SCHOOL CARPOOL WEB APPLICATION
// Main JavaScript File - Conflict-Free Version
// ===================================

// 1. Configuration
const SUPABASE_URL = 'https://zjxkykvkxfrndlcirfjg.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_MsYFfGjoGA-rl8PCjF-58Q_kGkMvzuF'; 

// 2. Initialize with a unique name to avoid "already declared" errors
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
    try {
        const { data, error } = await sbClient
            .from('users')
            .select('*')
            .eq('id', currentUser.id)
            .single();
        
        if (error || !data) {
            showPage('profileSetupPage');
        } else {
            currentUserProfile = data;
            await initializeDashboard();
            showPage('dashboardPage');
        }
    } catch (err) {
        showPage('profileSetupPage');
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
// TRIP LOGIC
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
        
        let filteredTrips = data || [];
        // Filter out user's own trips
        filteredTrips = filteredTrips.filter(trip => trip.driver_id !== currentUser.id);
        
        allTrips = filteredTrips;
        return filteredTrips;
    } catch (err) {
        console.error('Load Trips Error:', err);
        return [];
    }
}

async function renderDashboard() {
    const trips = await loadTrips();
    const container = document.getElementById('tripsContainer');
    const emptyState = document.getElementById('emptyState');
    
    if (!container) return;

    if (!trips || trips.length === 0) {
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
    
    return `
        <div class="trip-card bg-white rounded-xl shadow-md p-6">
            <h3 class="text-lg font-bold text-gray-800 mb-2">${trip.title}</h3>
            <div class="text-sm text-gray-600 space-y-1 mb-4">
                <p>From: ${trip.start_point}</p>
                <p>To: ${trip.destination}</p>
                <p>Date: ${formatDate(trip.trip_date)} at ${formatTime(trip.trip_time)}</p>
            </div>
            <div class="flex gap-2 mb-4">
                <span class="badge badge-blue">${trip.gender_filter}</span>
                <span class="badge badge-green">${availableSeats} seats left</span>
            </div>
            ${isUserJoined ? 
                `<button onclick="handleLeaveTrip('${trip.id}')" class="w-full bg-red-500 text-white py-2 rounded-lg">Leave Trip</button>` :
                availableSeats <= 0 ? `<button disabled class="w-full bg-gray-300 text-gray-500 py-2 rounded-lg cursor-not-allowed">Full</button>` :
                `<button onclick="handleJoinTrip('${trip.id}')" class="w-full btn-primary text-white py-2 rounded-lg">Join Trip</button>`
            }
        </div>
    `;
}

// ===================================
// INITIALIZATION
// ===================================

document.addEventListener('DOMContentLoaded', () => {
    initializeAuth();
    
    sbClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            currentUser = session.user;
            checkUserProfile();
        } else if (event === 'SIGNED_OUT') {
            showPage('loginPage');
        }
    });

    document.getElementById('googleSignInBtn')?.addEventListener('click', signInWithGoogle);
    document.getElementById('logoutBtn')?.addEventListener('click', signOut);
});

async function initializeDashboard() {
    const userAvatar = document.getElementById('userAvatar');
    if (userAvatar && currentUserProfile) {
        userAvatar.src = currentUserProfile.profile_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUserProfile.name)}`;
    }
    await renderDashboard();
}

// Global Handlers
window.handleJoinTrip = async (tripId) => {
    const { data: trip } = await sbClient.from('trips').select('current_passengers, max_passengers').eq('id', tripId).single();
    const { error } = await sbClient.from('trip_members').insert([{ trip_id: tripId, user_id: currentUser.id, status: 'confirmed' }]);
    
    if (!error) {
        await sbClient.from('trips').update({ current_passengers: (trip.current_passengers || 0) + 1 }).eq('id', tripId);
        showToast('Joined successfully!');
        renderDashboard();
    }
};