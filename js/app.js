// ===================================
// SCHOOL CARPOOL WEB APPLICATION
// Main JavaScript File
// ===================================

// Configuration
const SUPABASE_URL = 'https://zjxkykvkxfrndlcirfjg.supabase.co'; // Replace with your Supabase URL
const SUPABASE_ANON_KEY = 'sb_publishable_MsYFfGjoGA-rl8PCjF-58Q_kGkMvzuF'; // Replace with your Supabase anon key

let supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabase = supabaseClient;

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
        document.getElementById(page).classList.add('hidden');
    });
    document.getElementById(pageId).classList.remove('hidden');
    
    // Show/hide navbar
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
    
    // Check for existing session
    const { data: { session }, error } = await supabase.auth.getSession();
    
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
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', currentUser.id)
        .single();
    
    if (error || !data) {
        // User needs to complete profile
        showPage('profileSetupPage');
        prefillProfileForm();
    } else {
        currentUserProfile = data;
        initializeDashboard();
        showPage('dashboardPage');
    }
}

function prefillProfileForm() {
    // Pre-fill with Google data
    if (currentUser.user_metadata) {
        const nameInput = document.getElementById('nameInput');
        if (currentUser.user_metadata.full_name) {
            nameInput.value = currentUser.user_metadata.full_name;
        }
        
        // Set profile image
        if (currentUser.user_metadata.avatar_url) {
            document.getElementById('userAvatar').src = currentUser.user_metadata.avatar_url;
        }
    }
}

async function signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin + '/auth/callback'
        }
    });
    
    if (error) {
        showToast('Sign in failed: ' + error.message);
        console.error('Sign in error:', error);
    }
}

async function signOut() {
    const { error } = await supabase.auth.signOut();
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
    const { data, error } = await supabase
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
    
    // Apply filters
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
    
    // Additional client-side filtering
    let filteredTrips = data || [];
    
    if (filters.area_filter) {
        filteredTrips = filteredTrips.filter(trip => 
            matchesArea(filters.area_filter, trip.area_filter) ||
            matchesArea(filters.area_filter, trip.start_point) ||
            matchesArea(filters.area_filter, trip.destination)
        );
    }
    
    // Filter out trips user can't join due to gender
    filteredTrips = filteredTrips.filter(trip => 
        canJoinTrip(currentUserProfile.gender, trip.gender_filter)
    );
    
    // Filter out user's own trips
    filteredTrips = filteredTrips.filter(trip => 
        trip.driver_id !== currentUser.id
    );
    
    allTrips = filteredTrips;
    return filteredTrips;
}

async function createTrip(tripData) {
    const { data, error } = await supabase
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
    // Check if trip is full
    const { data: trip } = await supabase
        .from('trips')
        .select('current_passengers, max_passengers')
        .eq('id', tripId)
        .single();
    
    if (trip.current_passengers >= trip.max_passengers) {
        showToast('This trip is full');
        return false;
    }
    
    // Add user to trip
    const { error: memberError } = await supabase
        .from('trip_members')
        .insert([{
            trip_id: tripId,
            user_id: currentUser.id,
            pickup_point: pickupPoint,
            status: 'confirmed'
        }]);
    
    if (memberError) {
        if (memberError.code === '23505') { // Unique violation
            showToast('You have already joined this trip');
        } else {
            console.error('Error joining trip:', memberError);
            showToast('Failed to join trip');
        }
        return false;
    }
    
    // Update passenger count
    const { error: updateError } = await supabase
        .from('trips')
        .update({ current_passengers: trip.current_passengers + 1 })
        .eq('id', tripId);
    
    if (updateError) {
        console.error('Error updating passenger count:', updateError);
    }
    
    // Create notification for driver
    await createNotification(
        tripId,
        'trip_joined',
        `${currentUserProfile.name} has joined your trip`
    );
    
    showToast('Successfully joined trip!');
    return true;
}

async function leaveTrip(tripId) {
    const { error: deleteError } = await supabase
        .from('trip_members')
        .delete()
        .eq('trip_id', tripId)
        .eq('user_id', currentUser.id);
    
    if (deleteError) {
        console.error('Error leaving trip:', deleteError);
        showToast('Failed to leave trip');
        return false;
    }
    
    // Decrement passenger count
    const { data: trip } = await supabase
        .from('trips')
        .select('current_passengers, driver_id')
        .eq('id', tripId)
        .single();
    
    if (trip && trip.current_passengers > 0) {
        await supabase
            .from('trips')
            .update({ current_passengers: trip.current_passengers - 1 })
            .eq('id', tripId);
        
        // Notify driver
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
    // Check if trip has passengers
    const { data: members } = await supabase
        .from('trip_members')
        .select('user_id')
        .eq('trip_id', tripId);
    
    if (members && members.length > 0) {
        showToast('Cannot delete trip with active passengers');
        return false;
    }
    
    const { error } = await supabase
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
    // Get trip driver
    const { data: trip } = await supabase
        .from('trips')
        .select('driver_id, title')
        .eq('id', tripId)
        .single();
    
    if (!trip) return;
    
    await supabase
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
    const { data, error } = await supabase
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
    const isUserJoined = trip.trip_members.some(m => m.user_id === currentUser.id);
    const isFull = isTripFull(trip);
    const availableSeats = trip.max_passengers - trip.current_passengers;
    
    const genderBadgeClass = trip.gender_filter === 'Lelaki' ? 'badge-blue' : 
                             trip.gender_filter === 'Perempuan' ? 'badge-pink' : 'badge-green';
    
    const tripTypeBadgeClass = trip.trip_type === 'morning' ? 'badge-orange' : 'badge-blue';
    
    return `
        <div class="trip-card bg-white rounded-xl shadow-md p-6 card-shadow">
            <div class="flex justify-between items-start mb-4">
                <h3 class="text-lg font-bold text-gray-800">${trip.title}</h3>
                ${isFull ? '<span class="badge badge-red">FULL</span>' : ''}
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
                <span class="badge ${genderBadgeClass}">
                    ${trip.gender_filter}
                </span>
                <span class="badge ${tripTypeBadgeClass}">
                    ${trip.trip_type.charAt(0).toUpperCase() + trip.trip_type.slice(1)}
                </span>
                <span class="badge badge-green">
                    <i class="fas fa-users mr-1"></i>${availableSeats} seat${availableSeats !== 1 ? 's' : ''} left
                </span>
            </div>
            
            <div class="flex items-center mb-4 pb-4 border-b border-gray-200">
                <img src="${trip.driver.profile_image_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(trip.driver.name)}" 
                     alt="Driver" 
                     class="w-10 h-10 rounded-full mr-3">
                <div>
                    <p class="font-semibold text-gray-800">${trip.driver.name}</p>
                    <p class="text-sm text-gray-500">${trip.driver.car_model || 'Driver'}</p>
                </div>
            </div>
            
            ${isUserJoined ? `
                <button onclick="handleLeaveTrip('${trip.id}')" 
                        class="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition">
                    Leave Trip
                </button>
            ` : isFull ? `
                <button disabled class="w-full bg-gray-300 text-gray-500 font-semibold py-2 px-4 rounded-lg cursor-not-allowed">
                    Trip Full
                </button>
            ` : `
                <button onclick="handleJoinTrip('${trip.id}')" 
                        class="w-full btn-primary text-white font-semibold py-2 px-4 rounded-lg">
                    Join Trip
                </button>
            `}
        </div>
    `;
}

function renderDriverTripCard(trip) {
    const passengerCount = trip.trip_members.filter(m => m.status === 'confirmed').length;
    
    return `
        <div class="trip-card bg-white rounded-xl shadow-md p-6 card-shadow">
            <div class="flex justify-between items-start mb-4">
                <h3 class="text-lg font-bold text-gray-800">${trip.title}</h3>
                <button onclick="handleDeleteTrip('${trip.id}')" 
                        class="text-red-500 hover:text-red-600">
                    <i class="fas fa-trash"></i>
                </button>
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
            
            <div class="bg-blue-50 rounded-lg p-3 mb-4">
                <p class="text-sm font-semibold text-gray-700">
                    <i class="fas fa-users text-blue-500 mr-2"></i>
                    ${passengerCount} / ${trip.max_passengers} passengers
                </p>
            </div>
            
            ${passengerCount > 0 ? `
                <div class="mt-4">
                    <p class="text-sm font-semibold text-gray-700 mb-2">Passengers:</p>
                    <div class="space-y-2">
                        ${trip.passenger_details.map(p => `
                            <div class="flex items-center text-sm text-gray-600">
                                <img src="${p.profile_image_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(p.name)}" 
                                     alt="${p.name}" 
                                     class="w-6 h-6 rounded-full mr-2">
                                <span>${p.name}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
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
    // Load driver trips
    const { data: driverTrips } = await supabase
        .from('trips')
        .select(`
            *,
            trip_members(
                user_id,
                status,
                user:users(name, profile_image_url)
            )
        `)
        .eq('driver_id', currentUser.id)
        .eq('is_active', true)
        .order('trip_date', { ascending: true });
    
    // Load passenger trips
    const { data: passengerTrips } = await supabase
        .from('trip_members')
        .select(`
            *,
            trip:trips(
                *,
                driver:users!trips_driver_id_fkey(name, phone, profile_image_url, car_model)
            )
        `)
        .eq('user_id', currentUser.id)
        .eq('status', 'confirmed');
    
    // Render driver trips
    const driverContainer = document.getElementById('driverTripsContainer');
    if (driverTrips && driverTrips.length > 0) {
        // Add passenger details to trips
        const tripsWithDetails = driverTrips.map(trip => ({
            ...trip,
            passenger_details: trip.trip_members
                .filter(m => m.status === 'confirmed')
                .map(m => m.user)
        }));
        
        driverContainer.innerHTML = tripsWithDetails
            .map(trip => renderDriverTripCard(trip))
            .join('');
    } else {
        driverContainer.innerHTML = `
            <div class="col-span-full text-center py-12">
                <i class="fas fa-car text-gray-300 text-6xl mb-4"></i>
                <p class="text-gray-500">No trips created yet</p>
            </div>
        `;
    }
    
    // Render passenger trips
    const passengerContainer = document.getElementById('passengerTripsContainer');
    if (passengerTrips && passengerTrips.length > 0) {
        passengerContainer.innerHTML = passengerTrips
            .map(member => renderTripCard(member.trip))
            .join('');
    } else {
        passengerContainer.innerHTML = `
            <div class="col-span-full text-center py-12">
                <i class="fas fa-users text-gray-300 text-6xl mb-4"></i>
                <p class="text-gray-500">No trips joined yet</p>
            </div>
        `;
    }
}

// ===================================
// INITIALIZATION
// ===================================

async function initializeDashboard() {
    // Set user info in navbar
    const userAvatar = document.getElementById('userAvatar');
    userAvatar.src = currentUserProfile.profile_image_url || 
                     `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUserProfile.name)}`;
    
    // Show create trip button for drivers
    if (currentUserProfile.role === 'Driver' || currentUserProfile.role === 'Both') {
        document.getElementById('createTripBtnContainer').classList.remove('hidden');
    }
    
    // Load initial trips
    await renderDashboard();
    
    // Load notifications
    const notifications = await loadNotifications();
    if (notifications.length > 0) {
        document.getElementById('notificationBadge').classList.remove('hidden');
        document.getElementById('notificationBadge').textContent = notifications.length;
    }
}

// ===================================
// EVENT HANDLERS
// ===================================

async function handleJoinTrip(tripId) {
    const pickupPoint = prompt('Enter your pickup point (optional):');
    const success = await joinTrip(tripId, pickupPoint || '');
    if (success) {
        await renderDashboard();
    }
}

async function handleLeaveTrip(tripId) {
    if (confirm('Are you sure you want to leave this trip?')) {
        const success = await leaveTrip(tripId);
        if (success) {
            await renderDashboard();
        }
    }
}

async function handleDeleteTrip(tripId) {
    if (confirm('Are you sure you want to delete this trip?')) {
        const success = await deleteTrip(tripId);
        if (success) {
            await renderMyTrips();
        }
    }
}

// ===================================
// EVENT LISTENERS
// ===================================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize auth on load
    initializeAuth();
    
    // Listen for auth state changes
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
            currentUser = session.user;
            checkUserProfile();
        } else if (event === 'SIGNED_OUT') {
            currentUser = null;
            currentUserProfile = null;
            showPage('loginPage');
        }
    });
    
    // Google Sign In
    document.getElementById('googleSignInBtn').addEventListener('click', signInWithGoogle);
    
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', signOut);
    
    // User menu dropdown
    document.getElementById('userMenuBtn').addEventListener('click', () => {
        document.getElementById('userDropdown').classList.toggle('hidden');
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const userMenu = document.getElementById('userMenuBtn');
        const dropdown = document.getElementById('userDropdown');
        if (!userMenu.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });
    
    // Profile Form
    document.getElementById('profileForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const profileData = {
            name: document.getElementById('nameInput').value,
            phone: document.getElementById('phoneInput').value,
            gender: document.getElementById('genderInput').value,
            area: document.getElementById('areaInput').value,
            role: document.getElementById('roleInput').value
        };
        
        // Add driver-specific fields if role is Driver or Both
        const role = document.getElementById('roleInput').value;
        if (role === 'Driver' || role === 'Both') {
            profileData.seats_available = parseInt(document.getElementById('seatsInput').value);
            profileData.car_model = document.getElementById('carModelInput').value;
            profileData.car_plate = document.getElementById('carPlateInput').value;
        }
        
        const success = await saveUserProfile(profileData);
        if (success) {
            showToast('Profile saved successfully!');
            initializeDashboard();
            showPage('dashboardPage');
        }
    });
    
    // Show/hide driver fields based on role
    document.getElementById('roleInput').addEventListener('change', (e) => {
        const driverFields = document.getElementById('driverFields');
        if (e.target.value === 'Driver' || e.target.value === 'Both') {
            driverFields.classList.remove('hidden');
            document.getElementById('seatsInput').required = true;
        } else {
            driverFields.classList.add('hidden');
            document.getElementById('seatsInput').required = false;
        }
    });
    
    // Create Trip Button
    document.getElementById('createTripBtn').addEventListener('click', () => {
        document.getElementById('createTripModal').classList.remove('hidden');
        // Set minimum date to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('tripDate').setAttribute('min', today);
    });
    
    // Close Trip Modal
    document.getElementById('closeTripModal').addEventListener('click', () => {
        document.getElementById('createTripModal').classList.add('hidden');
        document.getElementById('createTripForm').reset();
    });
    
    // Create Trip Form
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
            max_passengers: parseInt(document.getElementById('maxPassengers').value),
            notes: document.getElementById('tripNotes').value || null
        };
        
        const trip = await createTrip(tripData);
        if (trip) {
            document.getElementById('createTripModal').classList.add('hidden');
            document.getElementById('createTripForm').reset();
            await renderDashboard();
        }
    });
    
    // Apply Filters
    document.getElementById('applyFiltersBtn').addEventListener('click', async () => {
        const filters = {
            trip_type: document.getElementById('filterTripType').value,
            gender_filter: document.getElementById('filterGender').value,
            area_filter: document.getElementById('filterArea').value
        };
        
        const trips = await loadTrips(filters);
        const container = document.getElementById('tripsContainer');
        const emptyState = document.getElementById('emptyState');
        
        if (trips.length === 0) {
            container.innerHTML = '';
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
            container.innerHTML = trips.map(trip => renderTripCard(trip)).join('');
        }
    });
    
    // My Trips Link
    document.getElementById('myTripsLink').addEventListener('click', (e) => {
        e.preventDefault();
        showPage('myTripsPage');
        renderMyTrips();
        document.getElementById('userDropdown').classList.add('hidden');
    });
    
    // Back to Dashboard
    document.getElementById('backToDashboard').addEventListener('click', () => {
        showPage('dashboardPage');
        renderDashboard();
    });
    
    // My Trips Tabs
    document.getElementById('tabAsDriver').addEventListener('click', () => {
        document.getElementById('tabAsDriver').classList.add('border-blue-500', 'text-blue-600', 'font-semibold');
        document.getElementById('tabAsDriver').classList.remove('border-transparent', 'text-gray-500');
        document.getElementById('tabAsPassenger').classList.remove('border-blue-500', 'text-blue-600', 'font-semibold');
        document.getElementById('tabAsPassenger').classList.add('border-transparent', 'text-gray-500');
        
        document.getElementById('driverTripsContainer').classList.remove('hidden');
        document.getElementById('passengerTripsContainer').classList.add('hidden');
    });
    
    document.getElementById('tabAsPassenger').addEventListener('click', () => {
        document.getElementById('tabAsPassenger').classList.add('border-blue-500', 'text-blue-600', 'font-semibold');
        document.getElementById('tabAsPassenger').classList.remove('border-transparent', 'text-gray-500');
        document.getElementById('tabAsDriver').classList.remove('border-blue-500', 'text-blue-600', 'font-semibold');
        document.getElementById('tabAsDriver').classList.add('border-transparent', 'text-gray-500');
        
        document.getElementById('passengerTripsContainer').classList.remove('hidden');
        document.getElementById('driverTripsContainer').classList.add('hidden');
    });
});

// Make functions globally accessible for onclick handlers
window.handleJoinTrip = handleJoinTrip;
window.handleLeaveTrip = handleLeaveTrip;
window.handleDeleteTrip = handleDeleteTrip;
