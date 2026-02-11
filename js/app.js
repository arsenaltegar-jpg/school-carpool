// ===================================
// SCHOOL CARPOOL WEB APPLICATION
// Main JavaScript File - Fixed Version
// ===================================

// Configuration
const SUPABASE_URL = 'https://zjxkykvkxfrndlcirfjg.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_MsYFfGjoGA-rl8PCjF-58Q_kGkMvzuF'; 

// Initialize Supabase client - Renamed to avoid conflict with the CDN global object
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    toastMessage.textContent = message;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, duration);
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
        navbar.classList.add('hidden');
    } else {
        navbar.classList.remove('hidden');
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-MY', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

function formatTime(timeString) {
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
    document.getElementById('loadingScreen').classList.remove('hidden');
    
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    
    if (error) {
        console.error('Session error:', error);
        showPage('loginPage');
        document.getElementById('loadingScreen').classList.add('hidden');
        return;
    }
    
    if (session) {
        currentUser = session.user;
        await checkUserProfile();
    } else {
        showPage('loginPage');
    }
    
    document.getElementById('loadingScreen').classList.add('hidden');
}

async function checkUserProfile() {
    const { data, error } = await supabaseClient
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
    if (currentUser.user_metadata) {
        const nameInput = document.getElementById('nameInput');
        if (currentUser.user_metadata.full_name) {
            nameInput.value = currentUser.user_metadata.full_name;
        }
        
        if (currentUser.user_metadata.avatar_url) {
            document.getElementById('userAvatar').src = currentUser.user_metadata.avatar_url;
        }
    }
}

async function signInWithGoogle() {
    // Dynamically get the current origin (e.g., your GitHub Pages URL or localhost)
    const redirectUrl = window.location.origin + window.location.pathname;

    const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            // This must match one of the URLs in your Supabase "Redirect URLs" list
            redirectTo: redirectUrl 
        }
    });
    
    if (error) {
        showToast('Sign in failed: ' + error.message);
        console.error('Sign in error:', error);
    }
}

async function signOut() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        showToast('Sign out failed');
        console.error('Sign out error:', error);
    } else {
        currentUser = null;
        currentUserProfile = null;
        showPage('loginPage');
        showToast('Signed out successfully');
    }
}

// ===================================
// PROFILE MANAGEMENT
// ===================================

async function saveUserProfile(profileData) {
    const { data, error } = await supabaseClient
        .from('users')
        .insert([{
            id: currentUser.id,
            email: currentUser.email,
            google_id: currentUser.user_metadata.sub,
            profile_image_url: currentUser.user_metadata.avatar_url,
            ...profileData
        }])
        .select()
        .single();
    
    if (error) {
        console.error('Profile save error:', error);
        showToast('Failed to save profile');
        return false;
    }
    
    currentUserProfile = data;
    return true;
}

// ===================================
// BUSINESS LOGIC FUNCTIONS
// ===================================

function canJoinTrip(passengerGender, tripGenderFilter) {
    return tripGenderFilter === 'Mixed' || passengerGender === tripGenderFilter;
}

function matchesArea(userArea, tripArea) {
    if (!tripArea) return true;
    return userArea.toLowerCase().includes(tripArea.toLowerCase()) ||
           tripArea.toLowerCase().includes(userArea.toLowerCase());
}

function isTripFull(trip) {
    return trip.current_passengers >= trip.max_passengers;
}

// ===================================
// TRIP FUNCTIONS
// ===================================

async function loadTrips(filters = {}) {
    let query = supabaseClient
        .from('trips')
        .select(`
            *,
            driver:users!trips_driver_id_fkey(name, phone, profile_image_url, car_model, car_plate),
            trip_members(user_id, status)
        `)
        .eq('is_active', true)
        .gte('trip_date', new Date().toISOString().split('T')[0])
        .order('trip_date', { ascending: true });
    
    if (filters.trip_type) {
        query = query.eq('trip_type', filters.trip_type);
    }
    
    if (filters.gender_filter) {
        query = query.eq('gender_filter', filters.gender_filter);
    }
    
    const { data, error } = await query;
    
    if (error) {
        console.error('Error loading trips:', error);
        showToast('Failed to load trips');
        return [];
    }
    
    let filteredTrips = data || [];
    
    if (filters.area_filter) {
        filteredTrips = filteredTrips.filter(trip => 
            matchesArea(filters.area_filter, trip.area_filter) ||
            matchesArea(filters.area_filter, trip.start_point) ||
            matchesArea(filters.area_filter, trip.destination)
        );
    }
    
    filteredTrips = filteredTrips.filter(trip => 
        canJoinTrip(currentUserProfile.gender, trip.gender_filter)
    );
    
    filteredTrips = filteredTrips.filter(trip => 
        trip.driver_id !== currentUser.id
    );
    
    allTrips = filteredTrips;
    return filteredTrips;
}

async function createTrip(tripData) {
    const { data, error } = await supabaseClient
        .from('trips')
        .insert([{
            ...tripData,
            driver_id: currentUser.id,
            area_filter: currentUserProfile.area,
            current_passengers: 0
        }])
        .select()
        .single();
    
    if (error) {
        console.error('Error creating trip:', error);
        showToast('Failed to create trip');
        return null;
    }
    
    showToast('Trip created successfully!');
    return data;
}

async function joinTrip(tripId, pickupPoint = '') {
    const { data: trip } = await supabaseClient
        .from('trips')
        .select('current_passengers, max_passengers')
        .eq('id', tripId)
        .single();
    
    if (trip.current_passengers >= trip.max_passengers) {
        showToast('This trip is full');
        return false;
    }
    
    const { error: memberError } = await supabaseClient
        .from('trip_members')
        .insert([{
            trip_id: tripId,
            user_id: currentUser.id,
            pickup_point: pickupPoint,
            status: 'confirmed'
        }]);
    
    if (memberError) {
        if (memberError.code === '23505') {
            showToast('You have already joined this trip');
        } else {
            console.error('Error joining trip:', memberError);
            showToast('Failed to join trip');
        }
        return false;
    }
    
    const { error: updateError } = await supabaseClient
        .from('trips')
        .update({ current_passengers: trip.current_passengers + 1 })
        .eq('id', tripId);
    
    if (updateError) {
        console.error('Error updating passenger count:', updateError);
    }
    
    await createNotification(
        tripId,
        'trip_joined',
        `${currentUserProfile.name} has joined your trip`
    );
    
    showToast('Successfully joined trip!');
    return true;
}

async function leaveTrip(tripId) {
    const { error: deleteError } = await supabaseClient
        .from('trip_members')
        .delete()
        .eq('trip_id', tripId)
        .eq('user_id', currentUser.id);
    
    if (deleteError) {
        console.error('Error leaving trip:', deleteError);
        showToast('Failed to leave trip');
        return false;
    }
    
    const { data: trip } = await supabaseClient
        .from('trips')
        .select('current_passengers, driver_id')
        .eq('id', tripId)
        .single();
    
    if (trip && trip.current_passengers > 0) {
        await supabaseClient
            .from('trips')
            .update({ current_passengers: trip.current_passengers - 1 })
            .eq('id', tripId);
        
        await createNotification(
            tripId,
            'trip_cancelled',
            `${currentUserProfile.name} has left your trip`
        );
    }
    
    showToast('Left trip successfully');
    return true;
}

async function deleteTrip(tripId) {
    const { data: members } = await supabaseClient
        .from('trip_members')
        .select('user_id')
        .eq('trip_id', tripId);
    
    if (members && members.length > 0) {
        showToast('Cannot delete trip with active passengers');
        return false;
    }
    
    const { error } = await supabaseClient
        .from('trips')
        .delete()
        .eq('id', tripId);
    
    if (error) {
        console.error('Error deleting trip:', error);
        showToast('Failed to delete trip');
        return false;
    }
    
    showToast('Trip deleted successfully');
    return true;
}

// ===================================
// NOTIFICATION FUNCTIONS
// ===================================

async function createNotification(tripId, type, message) {
    const { data: trip } = await supabaseClient
        .from('trips')
        .select('driver_id, title')
        .eq('id', tripId)
        .single();
    
    if (!trip) return;
    
    await supabaseClient
        .from('notifications')
        .insert([{
            user_id: trip.driver_id,
            type: type,
            title: trip.title,
            message: message,
            related_trip_id: tripId
        }]);
}

async function loadNotifications() {
    const { data, error } = await supabaseClient
        .from('notifications')
        .select('*')
        .eq('user_id', currentUser.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error('Error loading notifications:', error);
        return [];
    }
    
    return data || [];
}

// ===================================
// UI RENDERING FUNCTIONS
// ===================================

function renderTripCard(trip) {
    const isUserJoined = trip.trip_members && trip.trip_members.some(m => m.user_id === currentUser.id);
    const isFull = isTripFull(trip);
    const availableSeats = trip.max_passengers - trip.current_passengers;
    
    const genderBadgeClass = trip.gender_filter === 'Lelaki' ? 'badge-blue' : 
                             trip.gender_filter === 'Perempuan' ? 'badge-pink' : 'badge-green';
    
    const tripTypeBadgeClass = trip.trip_type === 'morning' ? 'badge-orange' : 'badge-blue';
    
    return `
        <div class="trip-card bg-white rounded-xl shadow-md p-6 card-shadow">
            <div class="flex justify-between items-start mb-4">
                <h3 class="text-lg font-bold text-gray-800">${trip.title}</h3>
                ${isFull ? '<span class="badge bg-red-100 text-red-700">FULL</span>' : ''}
            </div>
            
            <div class="space-y-3 mb-4">
                <div class="flex items-center text-gray-600">
                    <i class="fas fa-map-marker-alt text-blue-500 w-5"></i>
                    <span class="text-sm ml-2">${trip.start_point}</span>
                </div>
                <div class="flex items-center text-gray-600">
                    <i class="fas fa-flag-checkered text-green-500 w-5"></i>
                    <span class="text-sm ml-2">${trip.destination}</span>
                </div>
                <div class="flex items-center text-gray-600">
                    <i class="fas fa-calendar text-blue-500 w-5"></i>
                    <span class="text-sm ml-2">${formatDate(trip.trip_date)}</span>
                </div>
                <div class="flex items-center text-gray-600">
                    <i class="fas fa-clock text-blue-500 w-5"></i>
                    <span class="text-sm ml-2">${formatTime(trip.trip_time)}</span>
                </div>
            </div>
            
            <div class="flex flex-wrap gap-2 mb-4">
                <span class="badge ${genderBadgeClass}">${trip.gender_filter}</span>
                <span class="badge ${tripTypeBadgeClass}">${trip.trip_type}</span>
                <span class="badge badge-green">
                    <i class="fas fa-users mr-1"></i>${availableSeats} left
                </span>
            </div>
            
            <div class="flex items-center mb-4 pb-4 border-b border-gray-200">
                <img src="${trip.driver.profile_image_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(trip.driver.name)}" 
                     class="w-10 h-10 rounded-full mr-3">
                <div>
                    <p class="font-semibold text-gray-800">${trip.driver.name}</p>
                    <p class="text-sm text-gray-500">${trip.driver.car_model || 'Driver'}</p>
                </div>
            </div>
            
            ${isUserJoined ? `
                <button onclick="handleLeaveTrip('${trip.id}')" class="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg">Leave</button>
            ` : isFull ? `
                <button disabled class="w-full bg-gray-300 text-gray-500 font-semibold py-2 px-4 rounded-lg">Full</button>
            ` : `
                <button onclick="handleJoinTrip('${trip.id}')" class="w-full btn-primary text-white font-semibold py-2 px-4 rounded-lg">Join</button>
            `}
        </div>
    `;
}

async function renderDashboard() {
    const trips = await loadTrips();
    const container = document.getElementById('tripsContainer');
    const emptyState = document.getElementById('emptyState');
    
    if (trips.length === 0) {
        container.innerHTML = '';
        emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
        container.innerHTML = trips.map(trip => renderTripCard(trip)).join('');
    }
}

async function renderMyTrips() {
    const { data: driverTrips } = await supabaseClient
        .from('trips')
        .select(`*, trip_members(user_id, status, user:users(name, profile_image_url))`)
        .eq('driver_id', currentUser.id)
        .eq('is_active', true);
    
    const { data: passengerTrips } = await supabaseClient
        .from('trip_members')
        .select(`*, trip:trips(*, driver:users!trips_driver_id_fkey(name, profile_image_url, car_model))`)
        .eq('user_id', currentUser.id);

    const driverContainer = document.getElementById('driverTripsContainer');
    driverContainer.innerHTML = (driverTrips || []).map(trip => renderTripCard(trip)).join('');
    
    const passengerContainer = document.getElementById('passengerTripsContainer');
    passengerContainer.innerHTML = (passengerTrips || []).map(m => renderTripCard(m.trip)).join('');
}

// ===================================
// INITIALIZATION & EVENT LISTENERS
// ===================================

async function initializeDashboard() {
    const userAvatar = document.getElementById('userAvatar');
    userAvatar.src = currentUserProfile.profile_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUserProfile.name)}`;
    
    if (['Driver', 'Both'].includes(currentUserProfile.role)) {
        document.getElementById('createTripBtnContainer').classList.remove('hidden');
    }
    await renderDashboard();
}

document.addEventListener('DOMContentLoaded', () => {
    initializeAuth();
    
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
            currentUser = session.user;
            checkUserProfile();
        } else if (event === 'SIGNED_OUT') {
            showPage('loginPage');
        }
    });

    document.getElementById('googleSignInBtn').addEventListener('click', signInWithGoogle);
    document.getElementById('logoutBtn').addEventListener('click', signOut);
    document.getElementById('userMenuBtn').addEventListener('click', () => document.getElementById('userDropdown').classList.toggle('hidden'));
    
    document.getElementById('profileForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const profileData = {
            name: document.getElementById('nameInput').value,
            phone: document.getElementById('phoneInput').value,
            gender: document.getElementById('genderInput').value,
            area: document.getElementById('areaInput').value,
            role: document.getElementById('roleInput').value
        };
        if (await saveUserProfile(profileData)) {
            showPage('dashboardPage');
            initializeDashboard();
        }
    });

    document.getElementById('createTripBtn').addEventListener('click', () => {
        document.getElementById('createTripModal').classList.remove('hidden');
    });

    document.getElementById('createTripForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const tripData = {
            title: document.getElementById('tripTitle').value,
            start_point: document.getElementById('startPoint').value,
            destination: document.getElementById('destination').value,
            trip_date: document.getElementById('tripDate').value,
            trip_time: document.getElementById('tripTime').value,
            trip_type: document.getElementById('tripType').value,
            gender_filter: document.getElementById('genderFilter').value,
            max_passengers: parseInt(document.getElementById('maxPassengers').value)
        };
        if (await createTrip(tripData)) {
            document.getElementById('createTripModal').classList.add('hidden');
            renderDashboard();
        }
    });
});

window.handleJoinTrip = joinTrip;
window.handleLeaveTrip = leaveTrip;