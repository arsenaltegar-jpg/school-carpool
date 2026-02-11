// ===================================
// SCHOOL CARPOOL WEB APPLICATION
// Main JavaScript File - FULL FEATURE FIX
// ===================================

// 1. Configuration
const SUPABASE_URL = 'https://zjxkykvkxfrndlcirfjg.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_MsYFfGjoGA-rl8PCjF-58Q_kGkMvzuF'; 

// 2. Initialize with unique name to avoid conflicts
const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global state
let currentUser = null;
let currentUserProfile = null;

// ===================================
// UTILITY & NAVIGATION
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
        document.getElementById(page)?.classList.add('hidden');
    });
    
    document.getElementById(pageId)?.classList.remove('hidden');
    
    // Toggle Navbar visibility
    const navbar = document.getElementById('navbar');
    if (pageId === 'loginPage' || pageId === 'profileSetupPage') {
        navbar?.classList.add('hidden');
    } else {
        navbar?.classList.remove('hidden');
    }
}

// ===================================
// AUTH & PROFILE LOGIC
// ===================================

async function initializeAuth() {
    try {
        const { data: { session }, error } = await sbClient.auth.getSession();
        if (session) {
            currentUser = session.user;
            await checkUserProfile();
        } else {
            showPage('loginPage');
        }
    } catch (err) {
        showPage('loginPage');
    } finally {
        document.getElementById('loadingScreen')?.classList.add('hidden');
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
        // Pre-fill name from Google if available
        const nameInput = document.getElementById('nameInput');
        if (nameInput && currentUser.user_metadata?.full_name) {
            nameInput.value = currentUser.user_metadata.full_name;
        }
    } else {
        currentUserProfile = data;
        updateUIWithProfile();
        showPage('dashboardPage');
        renderDashboard();
    }
}

function updateUIWithProfile() {
    const avatar = document.getElementById('userAvatar');
    if (avatar && currentUserProfile) {
        avatar.src = currentUserProfile.profile_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUserProfile.name)}`;
    }
    
    // Show "Create Trip" only for drivers
    const createBtn = document.getElementById('createTripBtnContainer');
    if (createBtn) {
        const isDriver = ['Driver', 'Both'].includes(currentUserProfile?.role);
        isDriver ? createBtn.classList.remove('hidden') : createBtn.classList.add('hidden');
    }
}

// ===================================
// TRIP DISCOVERY
// ===================================

async function loadTrips() {
    const { data, error } = await sbClient
        .from('trips')
        .select(`*, driver:users!trips_driver_id_fkey(name, profile_image_url), trip_members(user_id)`)
        .eq('is_active', true)
        .order('trip_date', { ascending: true });

    if (error) return [];
    // Hide own trips
    return (data || []).filter(t => t.driver_id !== currentUser.id);
}

async function renderDashboard() {
    const trips = await loadTrips();
    const container = document.getElementById('tripsContainer');
    if (!container) return;

    if (trips.length === 0) {
        container.innerHTML = '';
        document.getElementById('emptyState')?.classList.remove('hidden');
    } else {
        document.getElementById('emptyState')?.classList.add('hidden');
        container.innerHTML = trips.map(trip => `
            <div class="bg-white p-6 rounded-xl shadow-md">
                <h3 class="font-bold text-lg">${trip.title}</h3>
                <p class="text-sm text-gray-600">${trip.start_point} → ${trip.destination}</p>
                <p class="text-xs mt-2 text-blue-500">${trip.trip_date}</p>
                <button onclick="handleJoinTrip('${trip.id}')" class="w-full mt-4 bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600 transition">
                    Join Trip
                </button>
            </div>
        `).join('');
    }
}

// ===================================
// EVENT LISTENERS (The "Dropdown Fix")
// ===================================

document.addEventListener('DOMContentLoaded', () => {
    initializeAuth();

    // 1. Google Login
    document.getElementById('googleSignInBtn')?.addEventListener('click', async () => {
        const { error } = await sbClient.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin + window.location.pathname }
        });
    });

    // 2. Profile Dropdown Toggle
    document.getElementById('userMenuBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('userDropdown')?.classList.toggle('hidden');
    });

    // Close dropdown when clicking outside
    window.addEventListener('click', () => {
        document.getElementById('userDropdown')?.classList.add('hidden');
    });

    // 3. Dropdown Links
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        await sbClient.auth.signOut();
        window.location.reload();
    });

    document.getElementById('myTripsLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        showPage('myTripsPage');
        // You can call renderMyTrips() here if defined
    });

    document.getElementById('viewProfile')?.addEventListener('click', (e) => {
        e.preventDefault();
        showPage('profileSetupPage');
        // Fill form with existing data
        if (currentUserProfile) {
            document.getElementById('nameInput').value = currentUserProfile.name;
            document.getElementById('phoneInput').value = currentUserProfile.phone;
            document.getElementById('genderInput').value = currentUserProfile.gender;
            document.getElementById('areaInput').value = currentUserProfile.area;
            document.getElementById('roleInput').value = currentUserProfile.role;
        }
    });

    // 4. Profile Form Submission
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
            await checkUserProfile(); // Refresh and go to dashboard
        } else {
            showToast('Error saving profile');
        }
    });
});

// Global Function for HTML onclick
window.handleJoinTrip = async (tripId) => {
    const { error } = await sbClient.from('trip_members').insert([{ trip_id: tripId, user_id: currentUser.id, status: 'confirmed' }]);
    if (error) return showToast('Could not join trip');
    showToast('Joined successfully!');
    renderDashboard();
};