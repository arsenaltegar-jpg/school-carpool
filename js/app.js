// ===================================
// SCHOOL CARPOOL WEB APPLICATION
// Enhanced Version with Modern UI
// ===================================

const SUPABASE_URL = 'https://zjxkykvkxfrndlcirfjg.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_MsYFfGjoGA-rl8PCjF-58Q_kGkMvzuF'; 

const sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    pages.forEach(p => document.getElementById(p)?.classList.add('hidden'));
    document.getElementById(pageId)?.classList.remove('hidden');
    
    const navbar = document.getElementById('navbar');
    (pageId === 'loginPage' || pageId === 'profileSetupPage') ? navbar?.classList.add('hidden') : navbar?.classList.remove('hidden');
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const options = { weekday: 'short', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

function formatTime(timeString) {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
}

function getTripTypeIcon(type) {
    const icons = {
        'morning': '<i class="fas fa-sun"></i>',
        'afternoon': '<i class="fas fa-moon"></i>',
        'both': '<i class="fas fa-clock"></i>'
    };
    return icons[type] || icons['morning'];
}

function getTripTypeBadge(type) {
    const badges = {
        'morning': 'badge-orange',
        'afternoon': 'badge-blue',
        'both': 'badge-purple'
    };
    return badges[type] || 'badge-orange';
}

// ===================================
// AUTH & PROFILE DATA LOGIC
// ===================================

async function initializeAuth() {
    try {
        const { data: { session } } = await sbClient.auth.getSession();
        if (session) {
            currentUser = session.user;
            await checkUserProfile();
        } else {
            showPage('loginPage');
        }
    } catch (err) {
        console.error('Auth error:', err);
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
        prefillProfileForm();
    } else {
        currentUserProfile = data;
        updateUIWithProfile();
        showPage('dashboardPage');
        renderDashboard();
    }
}

function prefillProfileForm() {
    const nameInput = document.getElementById('nameInput');
    if (nameInput && currentUser.user_metadata?.full_name) {
        nameInput.value = currentUser.user_metadata.full_name;
    }
    
    if (currentUserProfile) {
        if (document.getElementById('nameInput')) document.getElementById('nameInput').value = currentUserProfile.name || '';
        if (document.getElementById('phoneInput')) document.getElementById('phoneInput').value = currentUserProfile.phone || '';
        if (document.getElementById('genderInput')) document.getElementById('genderInput').value = currentUserProfile.gender || '';
        if (document.getElementById('areaInput')) document.getElementById('areaInput').value = currentUserProfile.area || '';
        if (document.getElementById('roleInput')) document.getElementById('roleInput').value = currentUserProfile.role || '';
    }
}

function updateUIWithProfile() {
    const avatar = document.getElementById('userAvatar');
    if (avatar && currentUserProfile) {
        avatar.src = currentUserProfile.profile_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUserProfile.name)}&background=FF6B35&color=fff&bold=true`;
    }
    
    const createBtn = document.getElementById('createTripBtnContainer');
    if (createBtn) {
        const isDriver = ['Driver', 'Both'].includes(currentUserProfile?.role);
        isDriver ? createBtn.classList.remove('hidden') : createBtn.classList.add('hidden');
    }
}

// ===================================
// GOOGLE LOGIN
// ===================================

window.handleGoogleLogin = async function() {
    try {
        const { data, error } = await sbClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin
            }
        });
        
        if (error) throw error;
    } catch (error) {
        console.error('Login error:', error);
        showToast('Login failed. Please try again.');
    }
};

// ===================================
// TRIP OPERATIONS
// ===================================

async function renderDashboard() {
    console.log('Rendering dashboard...');
    
    const { data, error } = await sbClient
        .from('trips')
        .select(`
            *,
            driver:users!trips_driver_id_fkey(name, profile_image_url),
            trip_members(user_id)
        `)
        .eq('is_active', true)
        .gte('trip_date', new Date().toISOString().split('T')[0])
        .order('trip_date', { ascending: true })
        .order('trip_time', { ascending: true });

    console.log('Trips data:', data);
    console.log('Trips error:', error);

    const container = document.getElementById('tripsContainer');
    const emptyState = document.getElementById('emptyState');
    
    if (!container) return;

    if (error) {
        console.error('Error fetching trips:', error);
        container.innerHTML = '<div class="col-span-full text-center text-red-500 py-10">Error loading trips. Please refresh.</div>';
        emptyState?.classList.add('hidden');
        return;
    }

    if (!data || data.length === 0) {
        container.innerHTML = '';
        emptyState?.classList.remove('hidden');
        return;
    }

    emptyState?.classList.add('hidden');
    
    // Filter out own trips for discovery
    const discoveryTrips = data.filter(t => t.driver_id !== currentUser.id);
    
    if (discoveryTrips.length === 0) {
        container.innerHTML = '';
        emptyState?.classList.remove('hidden');
        return;
    }
    
    container.innerHTML = discoveryTrips.map((trip, index) => {
        const isJoined = trip.trip_members?.some(m => m.user_id === currentUser.id);
        const seatsLeft = trip.max_passengers - (trip.current_passengers || 0);
        const driverAvatar = trip.driver?.profile_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(trip.driver?.name || 'Driver')}&background=004E89&color=fff&bold=true`;
        
        return `
        <div class="trip-card glass-card rounded-2xl p-6 animate-slide-up" style="animation-delay: ${index * 0.1}s;">
            <!-- Driver Info -->
            <div class="flex items-center space-x-3 mb-4">
                <img src="${driverAvatar}" alt="${trip.driver?.name}" class="w-10 h-10 rounded-full object-cover ring-2 ring-orange-200">
                <div class="flex-1 min-w-0">
                    <p class="font-semibold text-gray-900 truncate">${trip.driver?.name || 'Driver'}</p>
                    <p class="text-xs text-gray-500">Driver</p>
                </div>
                <span class="badge ${getTripTypeBadge(trip.trip_type)}">
                    ${getTripTypeIcon(trip.trip_type)} ${trip.trip_type}
                </span>
            </div>
            
            <!-- Trip Title -->
            <h3 class="heading-font font-bold text-xl text-gray-900 mb-3">${trip.title}</h3>
            
            <!-- Route -->
            <div class="bg-gradient-to-r from-orange-50 to-blue-50 rounded-xl p-3 mb-4">
                <div class="flex items-center text-sm">
                    <div class="flex-1">
                        <div class="flex items-center text-gray-700 mb-1">
                            <i class="fas fa-map-marker-alt text-orange-500 w-4"></i>
                            <span class="ml-2 font-medium truncate">${trip.start_point}</span>
                        </div>
                        <div class="flex items-center text-gray-700">
                            <i class="fas fa-flag-checkered text-blue-600 w-4"></i>
                            <span class="ml-2 font-medium truncate">${trip.destination}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Trip Details -->
            <div class="grid grid-cols-2 gap-3 mb-4">
                <div class="flex items-center text-sm text-gray-600">
                    <i class="fas fa-calendar text-orange-500 w-4"></i>
                    <span class="ml-2 font-medium">${formatDate(trip.trip_date)}</span>
                </div>
                <div class="flex items-center text-sm text-gray-600">
                    <i class="fas fa-clock text-orange-500 w-4"></i>
                    <span class="ml-2 font-medium">${formatTime(trip.trip_time)}</span>
                </div>
                <div class="flex items-center text-sm text-gray-600">
                    <i class="fas fa-users text-orange-500 w-4"></i>
                    <span class="ml-2 font-medium">${seatsLeft} seats left</span>
                </div>
                <div class="flex items-center text-sm text-gray-600">
                    <i class="fas fa-venus-mars text-orange-500 w-4"></i>
                    <span class="ml-2 font-medium">${trip.gender_filter}</span>
                </div>
            </div>
            
            <!-- Action Button -->
            <div class="pt-4 border-t border-gray-100">
                ${isJoined ? 
                    `<button onclick="handleLeaveTrip('${trip.id}')" class="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded-xl transition-all hover:shadow-lg">
                        <i class="fas fa-times mr-2"></i>Leave Trip
                    </button>` :
                    seatsLeft <= 0 ? 
                    `<button disabled class="w-full bg-gray-200 text-gray-500 font-semibold py-3 rounded-xl cursor-not-allowed">
                        <i class="fas fa-ban mr-2"></i>Trip Full
                    </button>` :
                    `<button onclick="handleJoinTrip('${trip.id}')" class="w-full btn-primary py-3 rounded-xl font-semibold hover:shadow-lg">
                        <i class="fas fa-plus mr-2"></i>Join Trip
                    </button>`
                }
            </div>
        </div>`;
    }).join('');
}

async function renderMyTrips() {
    // Driver View
    const { data: dTrips } = await sbClient
        .from('trips')
        .select('*, trip_members(user_id)')
        .eq('driver_id', currentUser.id)
        .gte('trip_date', new Date().toISOString().split('T')[0])
        .order('trip_date', { ascending: true });
    
    const dContainer = document.getElementById('driverTripsContainer');
    if (dContainer) {
        if (!dTrips || dTrips.length === 0) {
            dContainer.innerHTML = `
                <div class="col-span-full text-center py-16">
                    <div class="inline-block mb-4">
                        <div class="w-20 h-20 bg-gradient-to-br from-orange-100 to-orange-200 rounded-full flex items-center justify-center">
                            <i class="fas fa-steering-wheel text-orange-500 text-3xl"></i>
                        </div>
                    </div>
                    <h3 class="text-xl heading-font font-bold text-gray-800 mb-2">No trips created</h3>
                    <p class="text-gray-600 mb-6">Start sharing rides with your community</p>
                    <button onclick="document.getElementById('createTripBtn')?.click()" class="btn-primary py-3 px-8 rounded-xl inline-flex items-center">
                        <i class="fas fa-plus mr-2"></i>Create Your First Trip
                    </button>
                </div>
            `;
        } else {
            dContainer.innerHTML = dTrips.map((trip, index) => {
                const seatsLeft = trip.max_passengers - (trip.current_passengers || 0);
                const memberCount = trip.trip_members?.length || 0;
                
                return `
                <div class="trip-card glass-card rounded-2xl p-6 animate-slide-up" style="animation-delay: ${index * 0.1}s;">
                    <div class="flex justify-between items-start mb-4">
                        <span class="badge ${getTripTypeBadge(trip.trip_type)}">
                            ${getTripTypeIcon(trip.trip_type)} ${trip.trip_type}
                        </span>
                        <button onclick="handleDeleteTrip('${trip.id}')" class="w-9 h-9 flex items-center justify-center rounded-full hover:bg-red-50 text-red-500 transition-colors">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    
                    <h4 class="heading-font font-bold text-xl text-gray-900 mb-3">${trip.title}</h4>
                    
                    <div class="bg-gradient-to-r from-orange-50 to-blue-50 rounded-xl p-3 mb-4">
                        <div class="text-sm">
                            <div class="flex items-center text-gray-700 mb-1">
                                <i class="fas fa-map-marker-alt text-orange-500 w-4"></i>
                                <span class="ml-2 font-medium truncate">${trip.start_point}</span>
                            </div>
                            <div class="flex items-center text-gray-700">
                                <i class="fas fa-flag-checkered text-blue-600 w-4"></i>
                                <span class="ml-2 font-medium truncate">${trip.destination}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="space-y-2 text-sm">
                        <div class="flex items-center text-gray-600">
                            <i class="fas fa-calendar text-orange-500 w-4"></i>
                            <span class="ml-2 font-medium">${formatDate(trip.trip_date)}</span>
                        </div>
                        <div class="flex items-center text-gray-600">
                            <i class="fas fa-clock text-orange-500 w-4"></i>
                            <span class="ml-2 font-medium">${formatTime(trip.trip_time)}</span>
                        </div>
                        <div class="flex items-center justify-between pt-2 border-t border-gray-100">
                            <div class="flex items-center text-gray-600">
                                <i class="fas fa-users text-orange-500 w-4"></i>
                                <span class="ml-2 font-medium">${memberCount} joined</span>
                            </div>
                            <span class="tag-pill">${seatsLeft} seats left</span>
                        </div>
                    </div>
                </div>`;
            }).join('');
        }
    }

    // Passenger View
    const { data: pTrips } = await sbClient
        .from('trip_members')
        .select('trip:trips(*, driver:users!trips_driver_id_fkey(name, profile_image_url))')
        .eq('user_id', currentUser.id);
    
    const pContainer = document.getElementById('passengerTripsContainer');
    if (pContainer) {
        if (!pTrips || pTrips.length === 0) {
            pContainer.innerHTML = `
                <div class="col-span-full text-center py-16">
                    <div class="inline-block mb-4">
                        <div class="w-20 h-20 bg-gradient-to-br from-blue-100 to-blue-200 rounded-full flex items-center justify-center">
                            <i class="fas fa-user-friends text-blue-600 text-3xl"></i>
                        </div>
                    </div>
                    <h3 class="text-xl heading-font font-bold text-gray-800 mb-2">No trips joined</h3>
                    <p class="text-gray-600 mb-6">Discover and join available trips</p>
                    <button onclick="showPage('dashboardPage'); renderDashboard();" class="btn-secondary py-3 px-8 rounded-xl inline-flex items-center">
                        <i class="fas fa-search mr-2"></i>Browse Trips
                    </button>
                </div>
            `;
        } else {
            pContainer.innerHTML = pTrips.map((member, index) => {
                const trip = member.trip;
                if (!trip) return '';
                
                const driverAvatar = trip.driver?.profile_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(trip.driver?.name || 'Driver')}&background=004E89&color=fff&bold=true`;
                
                return `
                <div class="trip-card glass-card rounded-2xl p-6 animate-slide-up" style="animation-delay: ${index * 0.1}s;">
                    <div class="flex items-center space-x-3 mb-4">
                        <img src="${driverAvatar}" alt="${trip.driver?.name}" class="w-10 h-10 rounded-full object-cover ring-2 ring-blue-200">
                        <div class="flex-1 min-w-0">
                            <p class="font-semibold text-gray-900 truncate">${trip.driver?.name || 'Driver'}</p>
                            <p class="text-xs text-gray-500">Driver</p>
                        </div>
                        <span class="badge ${getTripTypeBadge(trip.trip_type)}">
                            ${getTripTypeIcon(trip.trip_type)} ${trip.trip_type}
                        </span>
                    </div>
                    
                    <h4 class="heading-font font-bold text-xl text-gray-900 mb-3">${trip.title}</h4>
                    
                    <div class="bg-gradient-to-r from-orange-50 to-blue-50 rounded-xl p-3 mb-4">
                        <div class="text-sm">
                            <div class="flex items-center text-gray-700 mb-1">
                                <i class="fas fa-map-marker-alt text-orange-500 w-4"></i>
                                <span class="ml-2 font-medium truncate">${trip.start_point}</span>
                            </div>
                            <div class="flex items-center text-gray-700">
                                <i class="fas fa-flag-checkered text-blue-600 w-4"></i>
                                <span class="ml-2 font-medium truncate">${trip.destination}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="space-y-2 text-sm mb-4">
                        <div class="flex items-center text-gray-600">
                            <i class="fas fa-calendar text-orange-500 w-4"></i>
                            <span class="ml-2 font-medium">${formatDate(trip.trip_date)}</span>
                        </div>
                        <div class="flex items-center text-gray-600">
                            <i class="fas fa-clock text-orange-500 w-4"></i>
                            <span class="ml-2 font-medium">${formatTime(trip.trip_time)}</span>
                        </div>
                    </div>
                    
                    <button onclick="handleLeaveTrip('${trip.id}')" class="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded-xl transition-all">
                        <i class="fas fa-times mr-2"></i>Leave Trip
                    </button>
                </div>`;
            }).join('');
        }
    }
}

// ===================================
// EVENT LISTENERS
// ===================================

document.addEventListener('DOMContentLoaded', () => {
    initializeAuth();

    // Dropdown and Profile Actions
    document.getElementById('userMenuBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('userDropdown')?.classList.toggle('hidden');
    });

    window.addEventListener('click', () => document.getElementById('userDropdown')?.classList.add('hidden'));

    document.getElementById('logoutBtn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        await sbClient.auth.signOut();
        window.location.reload();
    });

    document.getElementById('viewProfile')?.addEventListener('click', (e) => {
        e.preventDefault();
        showPage('profileSetupPage');
        prefillProfileForm();
    });

    // Navigation
    document.getElementById('myTripsLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        showPage('myTripsPage');
        renderMyTrips();
    });

    document.getElementById('backToDashboard')?.addEventListener('click', () => {
        showPage('dashboardPage');
        renderDashboard();
    });

    // Profile Form Save
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
            profile_image_url: currentUser.user_metadata?.avatar_url || ''
        };

        const { error } = await sbClient.from('users').upsert([profileData]);
        if (!error) {
            showToast('Profile saved successfully! 🎉');
            await checkUserProfile();
        } else {
            showToast('Error saving profile');
            console.error(error);
        }
    });

    // Trip Modal & Form
    document.getElementById('createTripBtn')?.addEventListener('click', () => {
        document.getElementById('createTripModal')?.classList.remove('hidden');
        // Set minimum date to today
        const dateInput = document.getElementById('tripDate');
        if (dateInput) {
            dateInput.min = new Date().toISOString().split('T')[0];
        }
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

        console.log('Creating trip:', tripData);

        const { data, error } = await sbClient.from('trips').insert([tripData]).select();
        
        if (!error) {
            showToast('Trip created successfully! 🚗');
            document.getElementById('createTripModal').classList.add('hidden');
            document.getElementById('createTripForm').reset();
            // Refresh dashboard to show the new trip
            await renderDashboard();
            console.log('Trip created:', data);
        } else {
            console.error('Error creating trip:', error);
            showToast('Error creating trip');
        }
    });

    // Tabs
    document.getElementById('tabAsDriver')?.addEventListener('click', () => {
        const driverTab = document.getElementById('tabAsDriver');
        const passengerTab = document.getElementById('tabAsPassenger');
        
        driverTab.classList.add('bg-orange-500', 'text-white');
        driverTab.classList.remove('text-gray-600');
        passengerTab.classList.remove('bg-orange-500', 'text-white');
        passengerTab.classList.add('text-gray-600');
        
        document.getElementById('driverTripsContainer').classList.remove('hidden');
        document.getElementById('passengerTripsContainer').classList.add('hidden');
    });

    document.getElementById('tabAsPassenger')?.addEventListener('click', () => {
        const driverTab = document.getElementById('tabAsDriver');
        const passengerTab = document.getElementById('tabAsPassenger');
        
        passengerTab.classList.add('bg-orange-500', 'text-white');
        passengerTab.classList.remove('text-gray-600');
        driverTab.classList.remove('bg-orange-500', 'text-white');
        driverTab.classList.add('text-gray-600');
        
        document.getElementById('passengerTripsContainer').classList.remove('hidden');
        document.getElementById('driverTripsContainer').classList.add('hidden');
    });
});

// ===================================
// GLOBAL CLICK HANDLERS
// ===================================

window.handleJoinTrip = async (tripId) => {
    console.log('Joining trip:', tripId);
    
    const { data: trip } = await sbClient.from('trips').select('current_passengers, max_passengers').eq('id', tripId).single();
    if (trip.current_passengers >= trip.max_passengers) return showToast('Trip is full!');

    const { error } = await sbClient.from('trip_members').insert([{ trip_id: tripId, user_id: currentUser.id, status: 'confirmed' }]);
    if (error) {
        console.error('Error joining trip:', error);
        return showToast('Error joining trip');
    }

    await sbClient.from('trips').update({ current_passengers: (trip.current_passengers || 0) + 1 }).eq('id', tripId);
    showToast('Successfully joined trip! 🎉');
    renderDashboard();
};

window.handleLeaveTrip = async (tripId) => {
    if (!confirm('Are you sure you want to leave this trip?')) return;
    
    console.log('Leaving trip:', tripId);
    
    const { error } = await sbClient.from('trip_members').delete().eq('trip_id', tripId).eq('user_id', currentUser.id);
    if (!error) {
        const { data: trip } = await sbClient.from('trips').select('current_passengers').eq('id', tripId).single();
        await sbClient.from('trips').update({ current_passengers: Math.max(0, (trip?.current_passengers || 1) - 1) }).eq('id', tripId);
        showToast('Left trip successfully');
        renderDashboard();
        renderMyTrips();
    } else {
        console.error('Error leaving trip:', error);
        showToast('Error leaving trip');
    }
};

window.handleDeleteTrip = async (tripId) => {
    if (!confirm('Are you sure you want to delete this trip? This action cannot be undone.')) return;
    
    console.log('Deleting trip:', tripId);
    
    const { error } = await sbClient.from('trips').delete().eq('id', tripId);
    if (!error) {
        showToast('Trip deleted successfully');
        renderMyTrips();
        renderDashboard();
    } else {
        console.error('Error deleting trip:', error);
        showToast('Error deleting trip');
    }
};