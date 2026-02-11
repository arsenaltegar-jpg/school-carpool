// ===================================
// SCHOOL CARPOOL WEB APPLICATION
// Full Final Version - All Features Fixed
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
    // Fill from Google Metadata if available
    const nameInput = document.getElementById('nameInput');
    if (nameInput && currentUser.user_metadata?.full_name) {
        nameInput.value = currentUser.user_metadata.full_name;
    }
    
    // Fill with existing profile data if we are editing
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
        avatar.src = currentUserProfile.profile_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUserProfile.name)}`;
    }
    
    const createBtn = document.getElementById('createTripBtnContainer');
    if (createBtn) {
        const isDriver = ['Driver', 'Both'].includes(currentUserProfile?.role);
        isDriver ? createBtn.classList.remove('hidden') : createBtn.classList.add('hidden');
    }
}

// ===================================
// TRIP OPERATIONS
// ===================================

async function renderDashboard() {
    const { data, error } = await sbClient
        .from('trips')
        .select(`*, driver:users!trips_driver_id_fkey(name, profile_image_url), trip_members(user_id)`)
        .eq('is_active', true)
        .order('trip_date', { ascending: true });

    const container = document.getElementById('tripsContainer');
    if (!container) return;

    if (error || !data || data.length === 0) {
        container.innerHTML = '';
        document.getElementById('emptyState')?.classList.remove('hidden');
    } else {
        document.getElementById('emptyState')?.classList.add('hidden');
        // Filter out own trips
        const discoveryTrips = data.filter(t => t.driver_id !== currentUser.id);
        
        container.innerHTML = discoveryTrips.map(trip => {
            const isJoined = trip.trip_members?.some(m => m.user_id === currentUser.id);
            const seatsLeft = trip.max_passengers - (trip.current_passengers || 0);
            
            return `
            <div class="bg-white p-6 rounded-xl shadow-md border trip-card">
                <h3 class="font-bold text-lg">${trip.title}</h3>
                <p class="text-sm text-gray-600 mb-4">${trip.start_point} to ${trip.destination}</p>
                <div class="flex justify-between items-center text-xs text-blue-600 mb-4">
                    <span><i class="fas fa-calendar"></i> ${trip.trip_date}</span>
                    <span><i class="fas fa-users"></i> ${seatsLeft} seats left</span>
                </div>
                ${isJoined ? 
                    `<button onclick="handleLeaveTrip('${trip.id}')" class="w-full bg-red-500 text-white py-2 rounded-lg">Leave Trip</button>` :
                    seatsLeft <= 0 ? `<button disabled class="w-full bg-gray-300 text-gray-500 py-2 rounded-lg">Full</button>` :
                    `<button onclick="handleJoinTrip('${trip.id}')" class="w-full bg-blue-500 text-white py-2 rounded-lg hover:bg-blue-600">Join Trip</button>`
                }
            </div>`;
        }).join('');
    }
}

async function renderMyTrips() {
    // Driver View
    const { data: dTrips } = await sbClient.from('trips').select('*').eq('driver_id', currentUser.id);
    const dContainer = document.getElementById('driverTripsContainer');
    if (dContainer) {
        dContainer.innerHTML = dTrips?.length ? dTrips.map(t => `
            <div class="bg-white p-4 rounded-lg shadow border flex justify-between items-center">
                <div>
                    <h4 class="font-bold">${t.title}</h4>
                    <p class="text-xs text-gray-500">${t.trip_date} | ${t.current_passengers}/${t.max_passengers} joined</p>
                </div>
                <button onclick="handleDeleteTrip('${t.id}')" class="text-red-500 hover:bg-red-50 p-2 rounded"><i class="fas fa-trash"></i></button>
            </div>
        `).join('') : '<p class="col-span-full text-center text-gray-400 py-10">No trips created as driver.</p>';
    }

    // Passenger View
    const { data: pTrips } = await sbClient.from('trip_members').select('trip:trips(*)').eq('user_id', currentUser.id);
    const pContainer = document.getElementById('passengerTripsContainer');
    if (pContainer) {
        pContainer.innerHTML = pTrips?.length ? pTrips.map(m => `
            <div class="bg-white p-4 rounded-lg shadow border flex justify-between items-center">
                <div>
                    <h4 class="font-bold">${m.trip.title}</h4>
                    <p class="text-xs text-gray-500">Date: ${m.trip.trip_date}</p>
                </div>
                <button onclick="handleLeaveTrip('${m.trip.id}')" class="text-red-500 text-sm font-semibold">Leave</button>
            </div>
        `).join('') : '<p class="col-span-full text-center text-gray-400 py-10">No trips joined yet.</p>';
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

    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
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
            showToast('Profile Saved Successfully!');
            await checkUserProfile();
        } else {
            showToast('Error saving profile');
            console.error(error);
        }
    });

    // Trip Modal & Form
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

    // Tabs
    document.getElementById('tabAsDriver')?.addEventListener('click', () => {
        document.getElementById('tabAsDriver').classList.add('border-blue-500', 'text-blue-600');
        document.getElementById('tabAsPassenger').classList.remove('border-blue-500', 'text-blue-600');
        document.getElementById('driverTripsContainer').classList.remove('hidden');
        document.getElementById('passengerTripsContainer').classList.add('hidden');
    });

    document.getElementById('tabAsPassenger')?.addEventListener('click', () => {
        document.getElementById('tabAsPassenger').classList.add('border-blue-500', 'text-blue-600');
        document.getElementById('tabAsDriver').classList.remove('border-blue-500', 'text-blue-600');
        document.getElementById('passengerTripsContainer').classList.remove('hidden');
        document.getElementById('driverTripsContainer').classList.add('hidden');
    });
});

// ===================================
// GLOBAL CLICK HANDLERS
// ===================================

window.handleJoinTrip = async (tripId) => {
    const { data: trip } = await sbClient.from('trips').select('current_passengers, max_passengers').eq('id', tripId).single();
    if (trip.current_passengers >= trip.max_passengers) return showToast('Trip is full!');

    const { error } = await sbClient.from('trip_members').insert([{ trip_id: tripId, user_id: currentUser.id, status: 'confirmed' }]);
    if (error) return showToast('Error joining');

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
    if (!confirm('Delete this trip?')) return;
    const { error } = await sbClient.from('trips').delete().eq('id', tripId);
    if (!error) {
        showToast('Trip deleted');
        renderMyTrips();
        renderDashboard();
    }
};