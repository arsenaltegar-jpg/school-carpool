// ===================================
// SCHOOL CARPOOL WEB APPLICATION
// Main JavaScript File - GitHub Pages Optimized
// ===================================

// Configuration
const SUPABASE_URL = 'https://zjxkykvkxfrndlcirfjg.supabase.co'; 
const SUPABASE_ANON_KEY = 'sb_publishable_MsYFfGjoGA-rl8PCjF-58Q_kGkMvzuF'; 

// Initialize Supabase client
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
        navbar.classList.add('hidden');
    } else {
        navbar.classList.remove('hidden');
    }
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' });
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
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen) loadingScreen.classList.remove('hidden');
    
    try {
        // Attempt to recover session from URL fragment (GitHub Pages fix)
        const { data: { session }, error } = await supabaseClient.auth.getSession();
        
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
    // This MUST match the 'redirect_to' in your error and the whitelist in Supabase
    const redirectUrl = "https://arsenaltegar-jpg.github.io/school-carpool/";
    
    const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: redirectUrl
        }
    });
    
    if (error) {
        showToast('Sign in failed: ' + error.message);
    }
}

async function signOut() {
    const { error } = await supabaseClient.auth.signOut();
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
// PROFILE & TRIP LOGIC (Abbreviated for brevity, kept essential)
// ===================================

async function saveUserProfile(profileData) {
    const { data, error } = await supabaseClient
        .from('users')
        .upsert([{
            id: currentUser.id,
            email: currentUser.email,
            google_id: currentUser.user_metadata.sub,
            profile_image_url: currentUser.user_metadata.avatar_url,
            ...profileData
        }])
        .select()
        .single();
    
    if (error) {
        showToast('Failed to save profile');
        return false;
    }
    currentUserProfile = data;
    return true;
}

// ... (Other Trip Logic functions stay the same as previous version)

// ===================================
// INITIALIZATION & EVENT LISTENERS
// ===================================

async function initializeDashboard() {
    const userAvatar = document.getElementById('userAvatar');
    if (userAvatar && currentUserProfile) {
        userAvatar.src = currentUserProfile.profile_image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUserProfile.name)}`;
    }
    
    const createBtn = document.getElementById('createTripBtnContainer');
    if (createBtn && ['Driver', 'Both'].includes(currentUserProfile?.role)) {
        createBtn.classList.remove('hidden');
    }
    await renderDashboard();
}

document.addEventListener('DOMContentLoaded', () => {
    // Start auth process
    initializeAuth();
    
    // Listen for auth state changes (crucial for OAuth redirects)
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session) {
            currentUser = session.user;
            // Clean URL fragment for cleaner UI
            if (window.location.hash) {
                window.history.replaceState(null, null, window.location.pathname);
            }
            checkUserProfile();
        } else if (event === 'SIGNED_OUT') {
            showPage('loginPage');
        }
    });

    // UI Click Events
    document.getElementById('googleSignInBtn')?.addEventListener('click', signInWithGoogle);
    document.getElementById('logoutBtn')?.addEventListener('click', signOut);
    document.getElementById('userMenuBtn')?.addEventListener('click', () => {
        document.getElementById('userDropdown')?.classList.toggle('hidden');
    });
    
    // Profile Form Submission
    document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
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
});