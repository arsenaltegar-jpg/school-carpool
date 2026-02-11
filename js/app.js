// ===================================
// SCHOOL CARPOOL WEB APPLICATION
// Main JavaScript File - FULL FIX
// ===================================

// 1. Configuration
const SUPABASE_URL = 'https://zjxkykvkxfrndlcirfjg.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_MsYFfGjoGA-rl8PCjF-58Q_kGkMvzuF'; 

// 2. Initialize Supabase client 
// Standardizing name to 'supabase' globally to match your function calls
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
        const { data: { session }, error } = await supabase.auth.getSession();
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
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', currentUser.id)
            .single();
        
        if (error || !data) {
            showPage('profileSetupPage');
            prefillProfileForm();
        } else {
            currentUserProfile = data;
            await initializeDashboard();
            showPage('dashboardPage');
        }
    } catch (err) {
        showPage('profileSetupPage');
    }
}

function prefillProfileForm() {
    if (currentUser?.user_metadata) {
        const nameInput = document.getElementById('nameInput');
        if (nameInput && currentUser.user_metadata.full_name) {
            nameInput.value = currentUser.user_metadata.full_name;
        }
    }
}

async function signInWithGoogle() {
    const redirectUrl = window.location.origin + window.location.pathname;
    const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl }
    });
    if (error) showToast('Sign in failed: ' + error.message);
}

async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        showToast('Sign out failed');
    } else {
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
        // We use the 'supabase' variable initialized at the top
        let query = supabase
            .from('trips')
            .select(`
                *,
                driver:users!trips_driver_id_fkey(name, phone, profile_image_url, car_model, car_plate),
                trip_members(user_id, status)
            `)
            .eq('is_active', true)
            .gte('trip_date', new Date().toISOString().split('T')[0])
            .order('trip_date', { ascending: true });
        
        if (filters.trip_type) query = query.eq('trip_type', filters.trip_type);
        if (filters.gender_filter) query = query.eq('gender_filter', filters.gender_filter);
        
        const { data, error } = await query;
        if (error) throw error;
        
        let filteredTrips = data || [];
        
        // Hide user's own trips from the discovery dashboard
        filteredTrips = filteredTrips.filter(trip => trip.driver_id !== currentUser.id);
        
        allTrips = filteredTrips;
        return filteredTrips;
    } catch (err) {
        console.error('Load Trips Error:', err);
        return [];
    }
}

async function initializeDashboard() {
    const userAvatar = document.getElementById('userAvatar');
    if (userAvatar && currentUserProfile) {
        userAvatar.src = currentUserProfile.profile_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUserProfile.name)}`;
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
    const isFull = availableSeats <= 0;
    
    return `
        <div class="trip-card bg-white rounded-xl shadow-md p-6">
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
// EVENT LISTENERS & INITIALIZATION
// ===================================

document.addEventListener('DOMContentLoaded', () => {
    // Start the auth process
    initializeAuth();
    
    // Listen for auth state changes
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            currentUser = session.user;
            if (window.location.hash) window.history.replaceState(null, null, window.location.pathname);
            checkUserProfile();
        } else if (event === 'SIGNED_OUT') {
            showPage('loginPage');
        }
    });

    // UI Listeners
    document.getElementById('googleSignInBtn')?.addEventListener('click', signInWithGoogle);
    document.getElementById('logoutBtn')?.addEventListener('click', signOut);
    document.getElementById('userMenuBtn')?.addEventListener('click', () => {
        document.getElementById('userDropdown')?.classList.toggle('hidden');
    });

    document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const profileData = {
            name: document.getElementById('nameInput').value,
            phone: document.getElementById('phoneInput').value,
            gender: document.getElementById('genderInput').value,
            area: document.getElementById('areaInput').value,
            role: document.getElementById('roleInput').value
        };
        
        const { error } = await supabase
            .from('users')
            .upsert([{
                id: currentUser.id,
                email: currentUser.email,
                profile_image_url: currentUser.user_metadata.avatar_url,
                ...profileData
            }]);
            
        if (!error) {
            await checkUserProfile();
        } else {
            showToast('Error saving profile');
        }
    });
});

// Make handlers global so HTML onclick can find them
window.handleJoinTrip = async (tripId) => {
    const { data: trip } = await supabase.from('trips').select('current_passengers, max_passengers').eq('id', tripId).single();
    if (trip.current_passengers >= trip.max_passengers) return showToast('Trip is full');

    const { error } = await supabase.from('trip_members').insert([{ trip_id: tripId, user_id: currentUser.id, status: 'confirmed' }]);
    if (error) return showToast('You already joined or there was an error');

    await supabase.from('trips').update({ current_passengers: (trip.current_passengers || 0) + 1 }).eq('id', tripId);
    showToast('Joined successfully!');
    renderDashboard();
};