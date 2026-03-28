import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js";

// Your existing code starts here...

/**
 * 8 Iron Analytics
 * Core Application Logic
 */

// WARNING: TO MAKE THE APP PUBLIC, PASTE YOUR FIREBASE WEB CONFIG OBJECT HERE
// Check if the current URL is a dev/test environment
const isDev = window.location.hostname.includes('dev-permanent') ||
    window.location.hostname.includes('ironanalytics-dev') ||
    window.location.hostname.includes('8iron-dev') ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

// 1. Your DEV project configuration (The one you just shared)
const devConfig = {
    apiKey: "AIzaSyAS3gZqAR6XjXxuz-NvIxNqzCXSFrwMaxQ",
    authDomain: "ironanalytics-dev.firebaseapp.com",
    projectId: "ironanalytics-dev",
    storageBucket: "ironanalytics-dev.firebasestorage.app",
    messagingSenderId: "1084506018668",
    appId: "1:1084506018668:web:be7a01d8aed35f4e365949",
    measurementId: "G-NYYVEJV9JE"
};
// 2. Your PRODUCTION project configuration 
// (Replace these placeholders with your original project keys)
const prodConfig = {
    apiKey: "AIzaSyC7KiIYFW8KdDpdZEe42x6xxJZ16m5UPyo",
    authDomain: "ironanalytics-cda1d.firebaseapp.com",
    projectId: "ironanalytics-cda1d",
    storageBucket: "ironanalytics-cda1d.firebasestorage.app",
    messagingSenderId: "137015757592",
    appId: "1:137015757592:web:173f425ed7542bcf70ac6d"
};
// 3. Always use production Firebase so your data persists on dev
const firebaseConfig = prodConfig;

// Initialize Firebase using the selected config
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

class App {
    constructor() {
        this.currentView = null; // No view until auth determined
        document.body.classList.add('landing-mode');
        this.rounds = [];
        this.user = null;
        this.currentChartStat = 'score'; // Default stat to chart

        this.currentChartStat = 'score'; // Default stat to chart
        this.secondaryChartStat = 'none'; // Default secondary stat

        // Date filters
        this.filterStartDate = null;
        this.filterEndDate = null;
        this.chartGroupBy = 'round'; // Default group by
        this.chartSortDir = 'chrono-asc'; // Default chart sort direction
        this.filterYears = []; // Array of selected years. Empty means all.
        this.filterMonths = []; // Array of month indices (0-11)
        this.monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        this.filterCourses = []; // Array of selected courses. Empty means all.
        this.filterEvents = []; // Array of selected events. Empty means all.
        this.filterHoles = []; // Array of selected holes [9, 18]. Empty means all.
        this.filterPars = []; // Array of selected pars [3, 4, 5]. Empty means all for hole analytics.
        this.profile = {
            firstName: '',
            lastName: '',
            handicap: 0
        };

        // Insights dynamic targets
        this.insightsTargetType = 'score';
        this.insightsTargetValue = '76-79';
        this.insightsHoles = 18;
        this.holeChartParStat = 'score'; // Default stat for hole par trend chart
        // History Table state
        this.historySortCol = 'date';
        this.historySortDir = 'desc';
        this.historySearch = '';
        this.filtersInitialized = false;
        this.courseLayouts = [];
        this.selectedMgmtCourse = null;
        this.selectedMgmtTee = null;
        this.tempHoleData = {};
        this.isRegeneratingScorecard = false;
        this.editingTeeName = null;

        this.init();
    }

    init() {
        this.bindEvents();
        this.bindCourseMgmtEvents();

        // Initialize Firebase if config is placed AND SDK is loaded
        const isConfigured = firebaseConfig.apiKey && firebaseConfig.apiKey !== "YOUR_API_KEY";

        if (window.firebaseCore && isConfigured) {
            try {
                const firebaseApp = window.firebaseCore.initializeApp(firebaseConfig);
                this.auth = window.firebaseAuth.getAuth(firebaseApp);
                this.db = window.firebaseDB.getFirestore(firebaseApp);
                window.db = this.db;

                // Initialize Firebase App Check logic (skips on dev)
                if (window.firebaseAppCheck && !isDev) {
                    window.firebaseAppCheck.initializeAppCheck(firebaseApp, {
                        provider: new window.firebaseAppCheck.ReCaptchaEnterpriseProvider('6LfHn4ksAAAAAP9kqPa3C_dufZCjN-dvMureVHom'),
                        isTokenAutoRefreshEnabled: true
                    });
                } else if (window.firebaseAppCheck) {
                    console.log("App Check skipped because we are in Dev mode.");
                }

                const warning = document.getElementById('firebase-config-warning');
                if (warning) {
                    warning.style.display = 'none';
                    warning.remove(); // Remove it completely to be sure
                }

                window.firebaseAuth.onAuthStateChanged(this.auth, async (user) => {
                    if (user) {
                        this.user = user;
                        document.body.classList.remove('landing-mode');
                        document.getElementById('sidebar').classList.remove('hidden');
                        document.getElementById('top-header').classList.remove('hidden');
                        this.updateAvatar();

                        // Switch view IMMEDIATELY, then load data in background
                        this.switchView('dashboard');
                        await Promise.all([
                            this.loadDataFromCloud(),
                            this.loadProfileFromCloud()
                        ]);
                        this.render();
                    } else {
                        this.user = null;
                        document.body.classList.add('landing-mode');
                        document.getElementById('sidebar').classList.add('hidden');
                        document.getElementById('top-header').classList.add('hidden');
                        this.rounds = []; // clear data on logout
                        this.switchView('home');
                    }
                });
            } catch (error) {
                console.error("Firebase init failed:", error);
            }
        } else {
            // Unconfigured: Fallback to local storage
            console.warn("Firebase not configured. Falling back to Local Storage.");
            this.user = { uid: 'local', email: 'Guest' };
            document.body.classList.remove('landing-mode');
            const sidebar = document.getElementById('sidebar');
            const topHeader = document.getElementById('top-header');
            if (sidebar) sidebar.classList.remove('hidden');
            if (topHeader) topHeader.classList.remove('hidden');
            this.loadData();
            this.switchView('dashboard');
        }
    }

    getTargetMetrics(overrideScore = null) {
        let target = overrideScore;
        if (target === null) {
            // Derive from persisted Insights target selection
            const handicapMap = {
                'Plus': 68, 'Scratch': 72, '1-5': 75, '6-10': 80, '11-15': 85, '16-20': 90, '21-25': 95, '26-30': 100
            };
            const scoreMap = {
                'Below 70': 68, '70-72': 71, '73-75': 74, '76-79': 77.5, '80-85': 83, '86-89': 88, '90-95': 93, '96-99': 98, '100+': 105
            };
            target = this.insightsTargetType === 'handicap'
                ? (handicapMap[this.insightsTargetValue] ?? 80)
                : (scoreMap[this.insightsTargetValue] ?? 80);
        }
        // Formula: GIR target increases as target score decreases
        // 72 -> ~66.6% (12 GIR), 80 -> ~50% (9 GIR), 90 -> ~30% (5.5 GIR)
        const girTarget = Math.max(5, Math.min(95, 66.6 - (target - 72) * 2));

        // Putts Target: Lower score targets need fewer putts
        // 72 -> 30, 80 -> 32, 90 -> 34
        const puttsTarget = 30 + (target - 72) * 0.25;

        // Up/Down: Tighter for lower scores
        // 72 -> 60%, 80 -> 40%, 90 -> 25%
        const upDownTarget = Math.max(10, Math.min(85, 60 - (target - 72) * 2));

        // FIR Target: Scratch ~60% (8/14), scales down with higher target score
        const firTarget = Math.max(10, Math.min(80, 60 - (target - 72) * 1.5));

        return {
            score: target,
            girPercent: Math.round(girTarget),
            firPercent: Math.round(firTarget),
            putts: Math.round(puttsTarget * 10) / 10,
            upDownPercent: Math.round(upDownTarget),
            penalties: 0.5,
            blowups: 1.0
        };
    }

    loadData() {
        // LocalStorage Fallback Reader
        const data = localStorage.getItem('8iron_rounds');
        if (data) {
            try {
                this.rounds = JSON.parse(data);

                // Migration: Ensure all rounds have a persistent roundNum and clean course names
                let needsSave = false;
                if (this.rounds.length > 0) {
                    const chrono = [...this.rounds].sort((a, b) => this.getEST(a.date).ts - this.getEST(b.date).ts || a.id.localeCompare(b.id));
                    chrono.forEach((r, i) => {
                        if (!r.hasOwnProperty('roundNum')) {
                            r.roundNum = i + 1;
                            needsSave = true;
                        }
                        // Clean legacy course suffixes and set originalHoles
                        if (r.course && r.course.toLowerCase().includes('(9 holes x2)')) {
                            r.originalHoles = 9;
                            r.course = this.normalizeCourse(r.course);
                            needsSave = true;
                        }

                        // FIR Migration: Set previous FIR to N/A for rounds before 2026
                        if (!r.firMigrated) {
                            const roundDate = this.getEST(r.date);
                            if (roundDate.y < 2026) {
                                r.fir = 0;
                                r.firChances = 0;
                                if (r.holeData) {
                                    r.holeData.forEach(h => {
                                        h.fir = false;
                                    });
                                }
                                r.firMigrated = true;
                                needsSave = true;
                            }
                        }
                    });
                    if (needsSave) this.saveData();
                }

                this.rounds.sort((a, b) => this.getEST(b.date).ts - this.getEST(a.date).ts);
            } catch (e) {
                console.error("Failed to parse rounds from local storage", e);
                this.rounds = [];
            }
        }
        // Restore insights prefs from localStorage for local users
        const insightsPrefs = localStorage.getItem('insightsPrefs');
        if (insightsPrefs) {
            try {
                const prefs = JSON.parse(insightsPrefs);
                if (prefs.insightsTargetType) this.insightsTargetType = prefs.insightsTargetType;
                if (prefs.insightsTargetValue) this.insightsTargetValue = prefs.insightsTargetValue;
                if (prefs.insightsHoles) this.insightsHoles = prefs.insightsHoles;
            } catch (e) { /* ignore */ }
        }
    }

    async loadDataFromCloud() {
        if (!this.user || this.user.uid === 'local' || !this.db) return;
        try {
            const { collection, getDocs, query, orderBy } = window.firebaseDB;

            // Load Rounds
            const q = query(collection(this.db, 'users', this.user.uid, 'rounds'), orderBy('date', 'desc'));
            const querySnapshot = await getDocs(q);
            this.rounds = [];
            querySnapshot.forEach((doc) => {
                this.rounds.push({ id: doc.id, ...doc.data() });
            });

            // Migration: Ensure all rounds in cloud have a persistent roundNum and clean course names
            const updates = [];
            const chrono = [...this.rounds].sort((a, b) => this.getEST(a.date).ts - this.getEST(b.date).ts || a.id.localeCompare(b.id));
            chrono.forEach((r, i) => {
                let changed = false;
                if (!r.hasOwnProperty('roundNum')) {
                    r.roundNum = i + 1;
                    changed = true;
                }
                // Clean legacy course suffixes and set originalHoles
                if (r.course && r.course.toLowerCase().includes('(9 holes x2)')) {
                    r.originalHoles = 9;
                    r.course = this.normalizeCourse(r.course);
                    changed = true;
                }

                // FIR Migration: Set previous FIR to N/A for rounds before 2026
                if (!r.firMigrated) {
                    const roundDate = this.getEST(r.date);
                    if (roundDate.y < 2026) {
                        r.fir = 0;
                        r.firChances = 0;
                        if (r.holeData) {
                            r.holeData.forEach(h => {
                                h.fir = false;
                            });
                        }
                        r.firMigrated = true;
                        changed = true;
                    }
                }
                if (changed) {
                    updates.push(this.syncRoundToCloud(r));
                }
            });
            if (updates.length > 0) {
                console.log(`Migrating ${updates.length} legacy rounds in cloud...`);
                await Promise.all(updates);
            }

            this.rounds.sort((a, b) => this.getEST(b.date).ts - this.getEST(a.date).ts);

            // Load Global Courses
            const courseSnapshot = await getDocs(collection(this.db, 'courses'));
            this.courseLayouts = [];
            const legacyDocs = [];
            courseSnapshot.forEach((doc) => {
                this.courseLayouts.push({ id: doc.id, ...doc.data() });
            });

            // Migration: Assign C### IDs and switch Firestore keys to C### format
            let migratedCount = 0;
            const { doc, setDoc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js");

            for (const course of [...this.courseLayouts]) {
                const needsId = !course.courseId;
                const needsKeyChange = course.id !== course.courseId;

                if (needsId || needsKeyChange) {
                    if (needsId) {
                        course.courseId = this.generateCourseId();
                        // Add to list so next iteration sees the new ID for "nextId" calculation
                        if (course.location && !course.state) {
                            const parts = course.location.split(',').map(s => s.trim());
                            course.state = parts[1] || parts[0] || '';
                            course.country = parts[2] || 'USA';
                        }
                    }

                    if (this.db) {
                        try {
                            const { doc, setDoc, deleteDoc } = window.firebaseDB || await import("https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js");
                            // 1. Create new record with C### as doc ID
                            await setDoc(doc(this.db, "courses", course.courseId), course, { merge: true });

                            // 2. Delete old record if the doc ID wasn't already C###
                            if (course.id && course.id !== course.courseId) {
                                await deleteDoc(doc(this.db, "courses", course.id));
                            }
                        } catch (err) {
                            console.error("Migration error for course:", course.name, err);
                        }
                    }
                    migratedCount++;
                }
            }
            if (migratedCount > 0) {
                console.log(`Migrated ${migratedCount} courses to ID-based storage.`);
                // Refresh list to pick up new doc IDs
                const freshSnapshot = await getDocs(collection(this.db, 'courses'));
                this.courseLayouts = [];
                freshSnapshot.forEach((doc) => {
                    this.courseLayouts.push({ id: doc.id, ...doc.data() });
                });
            }

            // Migration: Link rounds to courses via courseId
            let roundLinks = 0;
            for (const round of this.rounds) {
                if (!round.courseId && round.course) {
                    const normalizedTarget = this.normalizeCourse(round.course);
                    const course = this.courseLayouts.find(c => this.normalizeCourse(c.name) === normalizedTarget);
                    if (course && course.courseId) {
                        round.courseId = course.courseId;
                        roundLinks++;
                        if (this.db) {
                            await this.syncRoundToCloud(round);
                        }
                    }
                }
            }
            if (roundLinks > 0) console.log(`Linked ${roundLinks} rounds to course IDs.`);

            this.renderCourseSearchList();
            this.renderPutterDatalist();
            this.render(); // Ensure UI updates once data arrives from cloud
        } catch (e) {
            console.error("Error loading from cloud:", e);
        }
    }

    renderCourseSearchList() {
        const listContainer = document.getElementById('course-search-list');
        if (!listContainer) return;

        if (this.courseLayouts.length === 0) {
            listContainer.innerHTML = '<div class="search-select-item no-results">No courses found. Add one in Course Management.</div>';
            return;
        }

        listContainer.innerHTML = this.courseLayouts.map(course => `
            <div class="search-select-item" onclick="window.app.selectCourseFromSearch('${course.courseId}', '${course.name.replace(/'/g, "\\'")}')">
                ${course.name}
            </div>
        `).join('');
    }

    filterCourseSearch(query) {
        const listContainer = document.getElementById('course-search-list');
        if (!listContainer) return;

        const filtered = this.courseLayouts.filter(c =>
            c.name.toLowerCase().includes(query.toLowerCase())
        );

        if (filtered.length === 0) {
            listContainer.innerHTML = '<div class="search-select-item no-results">No matches found.</div>';
        } else {
            listContainer.innerHTML = filtered.map(course => `
                <div class="search-select-item" onclick="window.app.selectCourseFromSearch('${course.courseId}', '${course.name.replace(/'/g, "\\'")}')">
                    ${course.name}
                </div>
            `).join('');
        }
        this.showCourseSearchList();
    }

    showCourseSearchList() {
        const list = document.getElementById('course-search-list');
        if (list) list.classList.remove('hidden');
    }

    hideCourseSearchList() {
        const list = document.getElementById('course-search-list');
        if (list) list.classList.add('hidden');
    }

    selectCourseFromSearch(courseId, courseName) {
        const input = document.getElementById('course');
        if (input) {
            input.value = courseName;
            // Set a data attribute or similar if needed for courseId
            input.setAttribute('data-course-id', courseId);
        }
        this.hideCourseSearchList();
        this.handleCourseChangeRoundModal();
    }

    renderPutterDatalist() {
        const datalist = document.getElementById('putter-list');
        if (!datalist) return;

        // Extract unique putter names from rounds
        const uniquePutters = [...new Set(this.rounds
            .map(r => r.putter)
            .filter(p => p && p.trim() !== '')
        )].sort();

        datalist.innerHTML = uniquePutters.map(putter =>
            `<option value="${putter}">`
        ).join('');
    }

    async saveData() {
        if (!this.user) return;
        if (this.user.uid === 'local') {
            // LocalStorage Fallback Writer
            localStorage.setItem('8iron_rounds', JSON.stringify(this.rounds));
            return;
        }

        // If we are here, we handle sync per-round via `syncRoundToCloud` instead 
        // to avoid rewriting the entire array every time.
    }

    async loadProfileFromCloud() {
        if (!this.user || this.user.uid === 'local' || !this.db) return;
        try {
            const { doc, getDoc } = window.firebaseDB;
            const docRef = doc(this.db, 'users', this.user.uid, 'settings', 'profile');
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                this.profile = { ...this.profile, ...docSnap.data() };
                // Restore persisted insights target selection
                if (this.profile.insightsTargetType) this.insightsTargetType = this.profile.insightsTargetType;
                if (this.profile.insightsTargetValue) this.insightsTargetValue = this.profile.insightsTargetValue;
                if (this.profile.insightsHoles) this.insightsHoles = this.profile.insightsHoles;
                
                this.updateAvatar();
            }
        } catch (e) {
            console.error("Error loading profile:", e);
        }
    }

    async saveProfileToCloud(profileData) {
        if (!this.user || this.user.uid === 'local' || !this.db) return;
        try {
            const { doc, setDoc } = window.firebaseDB;
            await setDoc(doc(this.db, 'users', this.user.uid, 'settings', 'profile'), profileData, { merge: true });
            this.profile = { ...this.profile, ...profileData };
            this.updateAvatar();
            alert("Profile saved successfully!");
        } catch (e) {
            console.error("Error saving profile:", e);
            alert("Failed to save profile settings.");
        }
    }

    async syncRoundToCloud(roundData) {
        if (!this.user || this.user.uid === 'local' || !this.db) return;
        try {
            const { doc, setDoc } = window.firebaseDB;
            await setDoc(doc(this.db, 'users', this.user.uid, 'rounds', roundData.id), window.structuredClone ? structuredClone(roundData) : JSON.parse(JSON.stringify(roundData)));
        } catch (e) {
            console.error("Error saving round to cloud:", e);
            alert("Failed to save round to cloud database.");
        }
    }

    async deleteRoundFromCloud(id) {
        if (!this.user || this.user.uid === 'local' || !this.db) return;
        try {
            const { doc, deleteDoc } = window.firebaseDB;
            await deleteDoc(doc(this.db, 'users', this.user.uid, 'rounds', id));
        } catch (e) {
            console.error("Error deleting target from cloud:", e);
        }
    }

    bindEvents() {
        // Auth / Login Form
        const loginForm = document.getElementById('login-form');
        const loginSubmitBtn = document.getElementById('login-submit-btn');
        const toggleSignup = document.getElementById('toggle-signup');
        let isSignup = false;

        toggleSignup.addEventListener('click', (e) => {
            e.preventDefault();
            isSignup = !isSignup;
            loginSubmitBtn.textContent = isSignup ? 'Sign Up' : 'Login';
            toggleSignup.textContent = isSignup ? 'Log In' : 'Sign Up';
            toggleSignup.parentElement.childNodes[0].nodeValue = isSignup ? "Already have an account? " : "Don't have an account? ";

            // Toggle extra signup fields
            document.getElementById('signup-extra-fields').style.display = isSignup ? 'block' : 'none';
            document.getElementById('signup-confirm-password-group').style.display = isSignup ? 'block' : 'none';

            // Toggle required attribute for extra fields if needed, 
            // though browsers might handle it if they are visible. 
            // We will handle validation manually on submit to be sure.
        });

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!this.auth) {
                alert("Firebase not configured. Please see app.js instructions.");
                return;
            }
            const email = loginForm.email.value;
            const password = loginForm.password.value;

            if (isSignup) {
                const confirmPassword = loginForm.confirmPassword.value;
                if (password !== confirmPassword) {
                    alert("Passwords do not match!");
                    return;
                }
            }

            const { signInWithEmailAndPassword, createUserWithEmailAndPassword } = window.firebaseAuth;

            try {
                loginSubmitBtn.disabled = true;
                loginSubmitBtn.textContent = 'Loading...';
                if (isSignup) {
                    const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);

                    // Collect extra profile data
                    const initialProfile = {
                        firstName: loginForm.firstName.value,
                        lastName: loginForm.lastName.value,
                        handicap: parseFloat(loginForm.handicap.value) || 0,
                        targetScore: parseInt(loginForm.targetScore.value, 10) || 72,
                        email: email
                    };

                    // Save initial profile immediately
                    const { doc, setDoc } = window.firebaseDB;
                    await setDoc(doc(this.db, 'users', userCredential.user.uid, 'settings', 'profile'), initialProfile);
                    this.profile = initialProfile;
                } else {
                    await signInWithEmailAndPassword(this.auth, email, password);
                }
                // onAuthStateChanged handles routing successfully
                loginForm.reset();
            } catch (error) {
                alert(error.message);
            } finally {
                loginSubmitBtn.disabled = false;
                loginSubmitBtn.textContent = isSignup ? 'Sign Up' : 'Login';
            }
        });

        const forgotPasswordLink = document.getElementById('link-forgot-password');
        if (forgotPasswordLink) {
            forgotPasswordLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchView('forgot-password');
            });
        }

        const backToLoginLink = document.getElementById('back-to-login');
        if (backToLoginLink) {
            backToLoginLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchView('login');
            });
        }

        const forgotForm = document.getElementById('forgot-password-form');
        if (forgotForm) {
            forgotForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = forgotForm.email.value;
                const { sendPasswordResetEmail } = window.firebaseAuth;
                const submitBtn = document.getElementById('forgot-submit-btn');

                try {
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Sending...';
                    await sendPasswordResetEmail(this.auth, email);
                    alert("Password reset email sent! Please check your inbox.");
                    this.switchView('login');
                } catch (error) {
                    alert(error.message);
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Send Reset Email';
                }
            });
        }

        // Navigation
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = e.currentTarget.getAttribute('data-view');
                if (view) {
                    this.switchView(view);
                }
            });
        });

        // Add Round Form
        const addRoundForm = document.getElementById('add-round-form');
        if (addRoundForm) {
            // Set default date to today
            document.getElementById('date').valueAsDate = new Date();

            addRoundForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleAddRound(e.target);
            });
        }

        // CSV Upload
        const csvUpload = document.getElementById('csv-upload');
        if (csvUpload) {
            csvUpload.addEventListener('change', (e) => {
                this.handleCSVUpload(e.target.files[0]);
            });
        }

        // Profile Form
        const profileForm = document.getElementById('profile-form');
        if (profileForm) {
            profileForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const updatedProfile = {
                    firstName: profileForm.firstName.value,
                    lastName: profileForm.lastName.value,
                    handicap: parseFloat(profileForm.handicap.value) || 0
                };

                const submitBtn = document.getElementById('save-profile-btn');
                submitBtn.disabled = true;
                submitBtn.textContent = 'Saving...';

                await this.saveProfileToCloud(updatedProfile);

                submitBtn.disabled = false;
                submitBtn.textContent = 'Save Settings';
            });
        }

        // Course Auto-fill Listener
        const courseInput = document.getElementById('course');
        if (courseInput) {
            courseInput.addEventListener('input', (e) => {
                const val = e.target.value;
                const match = this.courseLayouts.find(c => c.name.toLowerCase() === val.toLowerCase());
                const badge = document.getElementById('course-status-badge');
                const hint = document.getElementById('add-course-hint');

                if (match && match.pars) {
                    if (badge) badge.style.display = 'none';
                    if (hint) hint.style.display = 'none';

                    // Check if we are in detailed mode
                    const detailedSection = document.getElementById('section-detailed-entry');
                    if (detailedSection && detailedSection.style.display !== 'none') {
                        // Populate pars
                        match.pars.forEach((par, idx) => {
                            const holeNum = idx + 1;
                            const parInput = document.getElementById(`detail-par-${holeNum}`);
                            if (parInput) {
                                parInput.value = par;
                                this.updateHoleFIR(holeNum);
                            }
                        });
                        this.calculateDetailedTotals();
                    }
                } else if (val.trim().length > 2) {
                    if (badge) badge.style.display = 'block';
                    if (hint) hint.style.display = 'block';
                } else {
                    if (badge) badge.style.display = 'none';
                    if (hint) hint.style.display = 'none';
                }
            });
        }
    }

    handleCSVUpload(file) {
        // Deprecated manual parser. Now handled by papa parse.
        return;
    }

    handleAddRound(form) {
        const formData = new FormData(form);
        const existingId = formData.get('id');
        const entryMode = document.getElementById('entry-mode-select') ? document.getElementById('entry-mode-select').value : 'quick';

        const courseName = formData.get('course') || document.getElementById('course').value;
        const teeName = formData.get('teeName');
        const normalizedTarget = this.normalizeCourse(courseName);
        const courseLayout = this.courseLayouts.find(c => this.normalizeCourse(c.name) === normalizedTarget);

        if (!courseLayout) {
            alert("Please select a registered course from the list.");
            return;
        }

        if (!teeName) {
            alert("Please select a Tee Set.");
            return;
        }

        let newRound = {
            id: existingId || Date.now().toString(),
            date: formData.get('date'),
            course: courseName,
            courseId: courseLayout.courseId,
            teeName: teeName,
            teeId: (courseLayout.tees && courseLayout.tees[teeName]) ? courseLayout.tees[teeName].teeId : '',
            timestamp: new Date().toISOString(),
            putter: formData.get('putter') || ''
        };

        if (entryMode === 'quick') {
            const holesValue = formData.get('holes') || "18";
            let holesCount = 18;
            let segment = "18";

            if (holesValue === "front9" || holesValue === "back9") {
                holesCount = 9;
                segment = holesValue;
            }

            newRound.coursePar = parseInt(formData.get('coursePar') || (holesCount === 9 ? 36 : 72), 10);
            newRound.holes = holesCount;
            newRound.segment = segment;
            newRound.originalHoles = holesCount;
            newRound.score = parseInt(formData.get('score') || 0, 10);
            newRound.putts = parseInt(formData.get('putts') || 0, 10);
            newRound.gir = parseInt(formData.get('gir') || 0, 10);
            newRound.fir = parseInt(formData.get('fir') || 0, 10);
            newRound.firChances = parseInt(formData.get('firChances') || 0, 10);
            newRound.eagles = parseInt(formData.get('eagles') || 0, 10);
            newRound.birdies = parseInt(formData.get('birdies') || 0, 10);
            newRound.pars = parseInt(formData.get('pars') || 0, 10);
            newRound.bogeys = parseInt(formData.get('bogeys') || 0, 10);
            newRound.doubleBogeys = parseInt(formData.get('doubleBogeys') || 0, 10);
            newRound.tripleBogeys = parseInt(formData.get('tripleBogeys') || 0, 10);
            newRound.upDownChances = parseInt(formData.get('upDownChances') || 0, 10);
            newRound.upDownSuccesses = parseInt(formData.get('upDownSuccesses') || 0, 10);
            newRound.threePutts = parseInt(formData.get('threePutts') || 0, 10);
        } else {
            // For detailed mode, we are much more robust about saving all data
            const holesSelect = document.getElementById('detail-holes-select');
            const segment = holesSelect ? holesSelect.value : "18";

            // Initial guess on holesCount based on segment
            let holesCount = 18;
            if (segment === "front9" || segment === "back9") holesCount = 9;

            newRound.segment = segment;
            newRound.holeData = [];

            // Determine how many holes to save. 
            // CRITICAL: We save EVERYTHING we have in tempHoleData if it has a score.
            // This prevents accidental data loss if the segment dropdown is wrong.
            let holeIndices = [];
            for (let i = 1; i <= 18; i++) {
                holeIndices.push(i);
            }

            holeIndices.forEach(i => {
                const hole = this.tempHoleData[i];
                if (!hole) return;

                // Only save if it has a score or it's within the selected segment
                const isInSegment = (segment === "18") || (segment === "front9" && i <= 9) || (segment === "back9" && i > 9 && i <= 18);
                if (!isInSegment && (hole.score === 0 || !hole.score)) return;

                const par = hole.par || 0;
                const score = hole.score || 0;
                const putts = hole.putts || 0;
                const fir = hole.fir;
                const gir = hole.gir || false;

                const holeObj = {
                    hole: parseInt(i),
                    par: par,
                    score: score,
                    scoreToPar: (score > 0 && par > 0) ? (score - par) : 0,
                    putts: putts,
                    fir: fir,
                    gir: gir,
                    scrambling: (!gir && score > 0 && par > 0) ? (score <= par) : false
                };
                newRound.holeData.push(holeObj);
            });

            // Recalculate totals from the holeData we JUST built to ensure absolute sync
            let totalScore = 0;
            let totalPar = 0;
            let totalPutts = 0;
            let girCount = 0;
            let firCount = 0;
            let firChances = 0;
            let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubleBogeys = 0, tripleBogeys = 0;
            let upDownChances = 0, upDownSuccesses = 0, threePutts = 0;

            newRound.holeData.forEach(h => {
                totalScore += h.score;
                totalPar += h.par;
                totalPutts += h.putts;
                if (h.gir) girCount++;
                if (h.putts >= 3) threePutts++;
                if (h.par === 4) { firChances++; if (h.fir === true) firCount++; }
                else if (h.par === 5) { firChances += 2; if (Array.isArray(h.fir)) { if (h.fir[0]) firCount++; if (h.fir[1]) firCount++; } }
                if (!h.gir && h.score > 0 && h.par > 0) { upDownChances++; if (h.score <= h.par) upDownSuccesses++; }
                if (h.score > 0 && h.par > 0) {
                    const diff = h.score - h.par;
                    if (diff <= -2) eagles++; else if (diff === -1) birdies++; else if (diff === 0) pars++;
                    else if (diff === 1) bogeys++; else if (diff === 2) doubleBogeys++; else if (diff >= 3) tripleBogeys++;
                }
            });

            newRound.score = totalScore;
            newRound.coursePar = totalPar;
            newRound.putts = totalPutts;
            newRound.gir = girCount;
            newRound.fir = firCount;
            newRound.firChances = firChances;
            newRound.eagles = eagles;
            newRound.birdies = birdies;
            newRound.pars = pars;
            newRound.bogeys = bogeys;
            newRound.doubleBogeys = doubleBogeys;
            newRound.tripleBogeys = tripleBogeys;
            newRound.upDownChances = upDownChances;
            newRound.upDownSuccesses = upDownSuccesses;
            newRound.threePutts = threePutts;
            newRound.holes = newRound.holeData.length;
        }

        // Apply mandatory extras to all entry modes
        newRound.lostBalls = parseInt(formData.get('lostBalls') || 0, 10);
        newRound.penaltyStrokes = parseInt(formData.get('penaltyStrokes') || 0, 10);
        newRound.cost = parseFloat(formData.get('roundCost') || 0) || 0;
        newRound.winnings = parseFloat(formData.get('roundWinnings') || 0) || 0;
        newRound.event = (formData.get('roundEvent') || '').trim();
        newRound.group = (formData.get('roundGroup') || '').trim();
        newRound.weather = formData.get('weather') || '';
        newRound.temperature = formData.get('temperature') || '';
        newRound.notes = (formData.get('roundNotes') || '').trim();

        newRound.scoreToPar = newRound.score - newRound.coursePar;
        newRound.puttsPerHole = newRound.holes > 0 ? (newRound.putts / newRound.holes).toFixed(2) : 0;

        if (existingId) {
            const index = this.rounds.findIndex(r => r.id === existingId);
            if (index !== -1) {
                const existingRound = this.rounds[index];

                // Safety guard: if editing a detailed round but computed score is 0,
                // the scorecard was likely not populated — abort to prevent data loss.
                if (entryMode === 'detailed' && newRound.score === 0 && (existingRound.score || 0) > 0) {
                    alert('⚠️ Update Cancelled: The scorecard appears to be empty (all scores read as 0). Please re-open the round and make sure all hole scores are filled in before saving.');
                    return;
                }

                // Preserve the existing round number if it exists
                newRound.roundNum = existingRound.roundNum;
                this.rounds[index] = newRound;
            }
        } else {
            // Assign next sequential round number
            const maxNum = this.rounds.reduce((max, r) => Math.max(max, r.roundNum || 0), 0);
            newRound.roundNum = maxNum + 1;
            this.rounds.push(newRound);
        }

        // Sort by date descending
        this.rounds.sort((a, b) => this.getEST(b.date).ts - this.getEST(a.date).ts);

        // Save
        if (this.user && this.user.uid === 'local') {
            this.saveData();
        } else {
            this.syncRoundToCloud(newRound); // save without blocking UI
        }

        // Reset form completely
        this.cancelEdit();
        this.closeAddRoundModal(); // Close modal after adding/editing

        // Switch to dashboard
        this.switchView('dashboard');
    }


    toggleDataEntryMode(skipRegeneration = false) {
        const mode = document.getElementById('entry-mode-select').value;
        const quickSection = document.getElementById('section-quick-entry');
        const detailedSection = document.getElementById('section-detailed-entry');
        const breakdownSection = document.getElementById('section-breakdown-container');
        const accuracySection = document.getElementById('section-accuracy-container');
        const extrasTitle = document.getElementById('extras-title');
        const accuracyDivider = document.getElementById('accuracy-divider');

        if (mode === 'quick') {
            quickSection.style.display = 'block';
            detailedSection.style.display = 'none';
            breakdownSection.style.display = 'block';
            accuracySection.style.display = 'block';
            extrasTitle.style.display = 'none';
            accuracyDivider.style.display = 'block';

            // Make quick entry fields required
            document.getElementById('score').required = true;
            document.getElementById('coursePar').required = true;
            document.getElementById('putts').required = true;
        } else {
            quickSection.style.display = 'none';
            detailedSection.style.display = 'block';
            breakdownSection.style.display = 'none';
            accuracySection.style.display = 'none';
            extrasTitle.style.display = 'block';
            accuracyDivider.style.display = 'none';

            // Remove required from quick entry fields so they don't block submit
            document.getElementById('score').required = false;
            document.getElementById('coursePar').required = false;
            document.getElementById('putts').required = false;

            // Generate the scorecard if it hasn't been generated yet
            const segment = document.getElementById('detail-holes-select')?.value || "18";
            if (!skipRegeneration && document.getElementById('detailed-scorecard-body').children.length === 0) {
                this.handleDetailedHoleChange(segment);
            }
        }
    }

    handleDetailedHoleChange(val) {
        const courseInput = document.getElementById('course');
        const teeSelect = document.getElementById('round-tee-set');
        if (!courseInput || !teeSelect) {
            this.generateDetailedScorecard(val);
            return;
        }

        const courseVal = courseInput.value;
        const teeName = teeSelect.value;
        const layout = this.courseLayouts.find(c => this.normalizeCourse(c.name) === this.normalizeCourse(courseVal));
        const tee = (layout && layout.tees) ? layout.tees[teeName] : null;

        this.generateDetailedScorecard(val, tee ? tee.holes : null);
    }

    generateDetailedScorecard(segment = "18", prefilledHoles = null) {
        console.debug('Generating scorecard:', segment, 'Prefilled:', prefilledHoles?.length, 'TempData Keys:', Object.keys(this.tempHoleData).length);

        try {
            // First ensure any currently visible data is saved before we clear,
            // but ONLY if we are not already in the middle of a regeneration/load.
            if (!this.isRegeneratingScorecard) {
                this.calculateDetailedTotals();
            }

            this.isRegeneratingScorecard = true;

            const tbody = document.getElementById('detailed-scorecard-body');
            if (!tbody) {
                console.error('detailed-scorecard-body not found!');
                return;
            }

            tbody.innerHTML = '';

            let startIdx = 0;
            let endIdx = 18;

            if (segment === "front9") {
                startIdx = 0;
                endIdx = 9;
            } else if (segment === "back9") {
                startIdx = 9;
                endIdx = 18;
            }

            // If the tee has a specific hole count, use that as the secondary boundary IF it makes sense
            if (prefilledHoles && prefilledHoles.length > 0) {
                if (segment === "18") {
                    endIdx = Math.max(18, prefilledHoles.length);
                } else if (segment === "front9") {
                    startIdx = 0;
                    endIdx = 9;
                } else if (segment === "back9") {
                    startIdx = 9;
                    endIdx = 18;
                }
            }

            // FINAL SAFETY: If we still have an invalid range or 0 holes, force 18
            if (endIdx <= startIdx || isNaN(endIdx) || isNaN(startIdx)) {
                console.warn('Invalid scorecard range detected, defaulting to 18 holes');
                startIdx = 0;
                endIdx = 18;
            }

            console.debug('Effective range:', startIdx, 'to', endIdx);

            for (let i = startIdx; i < endIdx; i++) {
                try {
                    const holeNum = i + 1;
                    const tr = document.createElement('tr');
                    tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                    tr.id = `hole-row-${holeNum}`;

                    // Looping prefilledHoles: if it has 9 but we are at 10-18, loop back to 0-8
                    let preHole = null;
                    if (prefilledHoles && prefilledHoles.length > 0) {
                        const lookupIdx = i % prefilledHoles.length;
                        preHole = prefilledHoles[lookupIdx];
                    }
                    const existing = this.tempHoleData[holeNum];

                    tr.innerHTML = `
                        <td style="padding: 10px 5px; font-weight: bold;">${holeNum}</td>
                        <td style="padding: 10px 5px;"><input type="number" id="detail-par-${holeNum}" min="3" max="6" value="${preHole ? preHole.par : (existing ? existing.par : 4)}" class="form-control scorecard-input parser" style="width: 45px; padding: 5px; text-align: center; margin: 0 auto; background: #FFFFFF; color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px;" oninput="window.app.syncHoleDataFromDOM(${holeNum})" ${preHole ? 'readonly' : ''}></td>
                        <td style="padding: 10px 5px;"><input type="number" id="detail-score-${holeNum}" min="1" max="15" value="${existing ? (existing.score || '') : ''}" class="form-control scorecard-input" style="width: 45px; padding: 5px; text-align: center; margin: 0 auto; background: #FFFFFF; color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px;" oninput="window.app.syncHoleDataFromDOM(${holeNum})"></td>
                        <td style="padding: 10px 5px;"><input type="number" id="detail-putts-${holeNum}" min="0" max="10" value="${existing ? (existing.putts || '') : ''}" class="form-control scorecard-input" style="width: 45px; padding: 5px; text-align: center; margin: 0 auto; background: #FFFFFF; color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px;" oninput="window.app.syncHoleDataFromDOM(${holeNum})"></td>
                        <td style="padding: 10px 5px;" id="detail-fir-container-${holeNum}">
                            <input type="checkbox" id="detail-fir-${holeNum}" style="width: 16px; height: 16px; accent-color: var(--primary-green);" onchange="window.app.syncHoleDataFromDOM(${holeNum})" ${existing && (existing.fir === true) ? 'checked' : ''}>
                        </td>
                        <td style="padding: 10px 5px;"><input type="checkbox" id="detail-gir-${holeNum}" style="width: 16px; height: 16px; accent-color: var(--primary-green); pointer-events: none; opacity: 0.7;" tabindex="-1" ${existing && existing.gir ? 'checked' : ''}></td>
                    `;
                    tbody.appendChild(tr);
                    this.updateHoleFIR(holeNum, true); // Pass true to skip calculateTotals in recursive call

                    // Re-apply FIR state (in case updateHoleFIR changed the structure)
                    if (existing && existing.fir !== undefined) {
                        const parInput = document.getElementById(`detail-par-${holeNum}`);
                        const par = parInput ? parseInt(parInput.value) : 4;
                        if (par === 5 && Array.isArray(existing.fir)) {
                            const f1 = document.getElementById(`detail-fir-${holeNum}-1`);
                            const f2 = document.getElementById(`detail-fir-${holeNum}-2`);
                            if (f1) f1.checked = existing.fir[0];
                            if (f2) f2.checked = existing.fir[1];
                        } else {
                            const fEl = document.getElementById(`detail-fir-${holeNum}`);
                            if (fEl) fEl.checked = (existing.fir === true);
                        }
                    }
                } catch (holeErr) {
                    console.error(`Error rendering hole ${i + 1}:`, holeErr);
                }
            }
        } catch (err) {
            console.error('Fatal error in generateDetailedScorecard:', err);
        } finally {
            this.isRegeneratingScorecard = false;
            this.calculateDetailedTotals();
        }
    }

    updateHoleFIR(holeNum, skipTotals = false) {
        const parInput = document.getElementById(`detail-par-${holeNum}`);
        if (!parInput) return;
        const par = parseInt(parInput.value) || 0;
        const container = document.getElementById(`detail-fir-container-${holeNum}`);
        if (!container) return;

        if (par === 3) {
            container.innerHTML = '<span style="color: var(--text-muted); font-size: 0.7rem;">N/A</span>';
        } else if (par === 5) {
            container.innerHTML = `
                <div style="display: flex; gap: 4px; justify-content: center; align-items: center;">
                    <input type="checkbox" id="detail-fir-${holeNum}-1" style="width: 14px; height: 14px; accent-color: var(--primary-green);" onchange="window.app.syncHoleDataFromDOM(${holeNum})" title="Fairway 1">
                    <input type="checkbox" id="detail-fir-${holeNum}-2" style="width: 14px; height: 14px; accent-color: var(--primary-green);" onchange="window.app.syncHoleDataFromDOM(${holeNum})" title="Fairway 2">
                </div>
            `;
        } else {
            // Par 4 or others
            container.innerHTML = `<input type="checkbox" id="detail-fir-${holeNum}" style="width: 16px; height: 16px; accent-color: var(--primary-green);" onchange="window.app.syncHoleDataFromDOM(${holeNum})">`;
        }
        if (!skipTotals) {
            this.calculateDetailedTotals();
        }
    }

    syncHoleDataFromDOM(hNum) {
        const parInput = document.getElementById(`detail-par-${hNum}`);
        const scoreInput = document.getElementById(`detail-score-${hNum}`);
        const puttsInput = document.getElementById(`detail-putts-${hNum}`);

        if (!parInput || !scoreInput || !puttsInput) return;

        const parVal = parseInt(parInput.value) || 0;
        const scoreVal = parseInt(scoreInput.value) || 0;
        const puttsVal = parseInt(puttsInput.value) || 0;

        // Auto-calculate GIR: reached the green in (par - 2) strokes or fewer.
        // Formula: (score - putts) <= (par - 2)
        // Only compute when we have valid score and putts; otherwise leave unchecked.
        let gir = false;
        if (scoreVal > 0 && puttsVal > 0 && parVal > 0) {
            gir = (scoreVal - puttsVal) <= (parVal - 2);
        }

        // Reflect auto-calculated GIR back to the checkbox
        const girEl = document.getElementById(`detail-gir-${hNum}`);
        if (girEl) girEl.checked = gir;

        const fEl = document.getElementById(`detail-fir-${hNum}`);
        const f1 = document.getElementById(`detail-fir-${hNum}-1`);
        const f2 = document.getElementById(`detail-fir-${hNum}-2`);

        const firValue = (parVal === 5 ? [f1?.checked || false, f2?.checked || false] : (fEl?.checked || false));

        // Update the central data store
        this.tempHoleData[hNum] = {
            hole: parseInt(hNum),
            par: parVal,
            score: scoreVal,
            putts: puttsVal,
            gir: gir,
            fir: firValue
        };

        // Handle FIR updates if par changes
        const currentEvent = typeof event !== 'undefined' ? event : null;
        if (parInput === document.activeElement || (currentEvent && currentEvent.target === parInput)) {
            this.updateHoleFIR(hNum, true);
        }

        this.calculateDetailedTotals();
    }

    calculateDetailedTotals() {
        if (this.isRegeneratingScorecard) return;

        let totalPar = 0;
        let totalScore = 0;
        let totalPutts = 0;
        // ... (rest of the calculation logic remains, but NO sync from DOM here)
        let girCount = 0;
        let firCount = 0;
        let firChances = 0;
        let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubleBogeys = 0, tripleBogeys = 0;
        let upDownChances = 0, upDownSuccesses = 0, threePutts = 0;

        const segment = document.getElementById('detail-holes-select')?.value || "18";
        let targetHoles = [];
        if (segment === "front9") targetHoles = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        else if (segment === "back9") targetHoles = [10, 11, 12, 13, 14, 15, 16, 17, 18];
        else {
            // Assume 18 or custom hole count from the tee
            const holeCount = Object.keys(this.tempHoleData).length > 9 ? Object.keys(this.tempHoleData).length : 18;
            for (let i = 1; i <= (parseInt(segment) || holeCount); i++) targetHoles.push(i);
        }

        targetHoles.forEach(hNum => {
            const h = this.tempHoleData[hNum];
            if (!h) return;

            totalPar += h.par;
            totalScore += h.score;
            totalPutts += h.putts;
            if (h.gir) girCount++;
            if (h.putts >= 3) threePutts++;

            if (h.par === 4) {
                firChances++;
                if (h.fir === true) firCount++;
            } else if (h.par === 5) {
                firChances += 2;
                if (Array.isArray(h.fir)) {
                    if (h.fir[0]) firCount++;
                    if (h.fir[1]) firCount++;
                }
            }

            if (!h.gir && h.score > 0 && h.par > 0) {
                upDownChances++;
                if (h.score <= h.par) upDownSuccesses++;
            }

            if (h.score > 0 && h.par > 0) {
                const diff = h.score - h.par;
                if (diff <= -2) eagles++;
                else if (diff === -1) birdies++;
                else if (diff === 0) pars++;
                else if (diff === 1) bogeys++;
                else if (diff === 2) doubleBogeys++;
                else if (diff >= 3) tripleBogeys++;
            }
        });

        // Update scorecard footer display
        document.getElementById('calc-total-par').innerText = totalPar;
        document.getElementById('calc-total-score').innerText = totalScore;
        document.getElementById('calc-total-putts').innerText = totalPutts;

        // Sync all quick-entry fields so switching modes shows correct totals
        const setQ = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        setQ('score', totalScore || '');
        setQ('coursePar', totalPar || '');
        setQ('putts', totalPutts || '');
        setQ('gir', girCount);
        setQ('fir', firCount);
        setQ('firChances', firChances);
        setQ('eagles', eagles);
        setQ('birdies', birdies);
        setQ('pars', pars);
        setQ('bogeys', bogeys);
        setQ('doubleBogeys', doubleBogeys);
        setQ('tripleBogeys', tripleBogeys);
        setQ('upDownChances', upDownChances);
        setQ('upDownSuccesses', upDownSuccesses);
        setQ('threePutts', threePutts);
    }


    cancelEdit() {
        const form = document.getElementById('add-round-form');
        if (form) {
            form.reset();
            document.getElementById('edit-round-id').value = '';
            document.getElementById('add-round-title').textContent = 'Log a Round';
            document.getElementById('save-round-btn').textContent = 'Save Round';
            document.getElementById('cancel-edit-btn').style.display = 'none';

            // Reset entry mode
            document.getElementById('entry-mode-select').value = 'quick';
            this.toggleDataEntryMode();

            // Reset detailed scorecard
            if (document.getElementById('detailed-scorecard-body').children.length > 0) {
                this.generateDetailedScorecard();
            }

            document.getElementById('date').valueAsDate = new Date();

            // Reset course-related readonly fields
            const cp = document.getElementById('coursePar');
            if (cp) cp.readOnly = false;

            const ts = document.getElementById('round-tee-set');
            if (ts) ts.innerHTML = '<option value="">Select Course First</option>';
        }
        this.closeAddRoundModal(); // Close modal on cancel
    }

    editRound(id) {
        console.debug('editRound called for id:', id);
        const round = this.rounds.find(r => r.id === id);
        if (!round) {
            console.error('Round not found for id:', id);
            return;
        }

        // 1. POPULATE TEMP DATA FIRST (Collision-Safe for legacy 1-9 twice data)
        this.tempHoleData = {};
        if (round.holeData) {
            const hData = Array.isArray(round.holeData) ? round.holeData : Object.values(round.holeData);
            console.debug('editRound: Populating from hData. length:', hData.length);
            hData.forEach((h, idx) => {
                if (h && h.hole !== undefined) {
                    let hNum = parseInt(h.hole);

                    // HEALER: If we see a hole number we've already seen (e.g. 1-9 repeating),
                    // or if it's the second half of an 18-item array, shift it to 10-18.
                    if (this.tempHoleData[hNum] !== undefined || (idx >= 9 && hNum <= 9 && hData.length > 9)) {
                        if (hNum <= 9) {
                            hNum += 9;
                            console.debug(`  Auto-shifted hole ${h.hole} at idx ${idx} to ${hNum}`);
                        }
                    }

                    this.tempHoleData[hNum] = { ...h, hole: hNum };
                }
            });
            console.debug('Populated tempHoleData keys:', Object.keys(this.tempHoleData));
        }

        // 2. OPEN MODAL (Ensures DOM elements are active)
        this.openAddRoundModal(true);

        // 3. SYNCHRONOUS POPULATION
        console.debug('Synchronous population starting for round:', id);
        const form = document.getElementById('add-round-form');
        const entryModeSelect = document.getElementById('entry-mode-select');
        if (!form || !entryModeSelect) {
            console.error('Population failed: Form or EntryModeSelect not found!');
            return;
        }

        // 4. SET ENTRY MODE
        const isDetailed = !!(round.holeData && round.holeData.length > 0);
        entryModeSelect.value = isDetailed ? 'detailed' : 'quick';
        this.toggleDataEntryMode(true); // Skip immediate regeneration to avoid race

        // 5. LOAD CORE DATA
        document.getElementById('edit-round-id').value = round.id;
        const setVal = (fid, val) => {
            const el = form.querySelector('#' + fid);
            if (el) el.value = val !== undefined ? val : '';
        };

        let dateVal = round.date;
        if (dateVal && dateVal.includes('/')) {
            const parts = dateVal.split('/');
            if (parts.length === 3) {
                let year = parts[2];
                if (year.length === 2) year = '20' + year;
                let month = parts[0].padStart(2, '0');
                let day = parts[1].padStart(2, '0');
                dateVal = `${year}-${month}-${day}`;
            }
        }
        setVal('date', dateVal);
        setVal('course', round.course ? round.course.replace(' (9 Holes x2)', '') : '');
        this.handleCourseChangeRoundModal();

        // 6. SETUP SEGMENT
        let segment = round.segment || (round.holes === 9 ? 'front9' : '18');

        // DATA-DRIVEN HEALER: Count how many holes actually have ANY data. 
        // If more than 9, or if we have keys above 9, we MUST show 18 holes to be useful.
        const populatedHolesCount = Object.keys(this.tempHoleData).length;
        const hasBackNineData = Object.keys(this.tempHoleData).some(hNum => parseInt(hNum) > 9);

        if (populatedHolesCount > 9 || hasBackNineData) {
            segment = '18';
        }

        const layout = this.courseLayouts.find(c => this.normalizeCourse(c.name) === this.normalizeCourse(round.course));
        const teeName = round.teeName || '';
        const tee = (layout && layout.tees && teeName) ? layout.tees[teeName] : null;

        setVal('holes', segment);
        setVal('detail-holes-select', segment);
        setVal('round-tee-set', teeName);

        // 7. RENDER SCORECARD (Immediate & Deterministic)
        this.isRegeneratingScorecard = true;
        this.generateDetailedScorecard(segment, tee ? tee.holes : null);

        // Also call the standard tee change handler to ensure all other side effects (like dropdowns) are synced
        this.handleTeeChangeRoundModal();

        // 8. POPULATE EXTRAS
        const isLegacyDoubledEntry = round.course && round.course.includes('(9 Holes x2)');
        const divisor = isLegacyDoubledEntry ? 2 : 1;
        setVal('coursePar', (round.coursePar / divisor) || 72);
        setVal('score', (round.score / divisor) || 0);
        setVal('putts', (round.putts / divisor) || 0);
        setVal('gir', (round.gir / divisor) || 0);
        setVal('fir', (round.fir / divisor) || 0);
        setVal('firChances', (round.firChances / divisor) || 0);
        setVal('eagles', (round.eagles / divisor) || 0);
        setVal('birdies', (round.birdies / divisor) || 0);
        setVal('pars', (round.pars / divisor) || 0);
        setVal('bogeys', (round.bogeys / divisor) || 0);
        setVal('putter', round.putter || '');
        setVal('doubleBogeys', (round.doubleBogeys / divisor) || 0);
        setVal('tripleBogeys', (round.tripleBogeys / divisor) || 0);
        setVal('upDownChances', (round.upDownChances / divisor) || 0);
        setVal('upDownSuccesses', (round.upDownSuccesses / divisor) || 0);
        setVal('threePutts', (round.threePutts / divisor) || 0);
        setVal('lostBalls', (round.lostBalls / divisor) || 0);
        setVal('penaltyStrokes', (round.penaltyStrokes / divisor) || 0);
        setVal('roundCost', round.cost || '');
        setVal('roundWinnings', round.winnings || '');
        setVal('roundEvent', round.event || '');
        setVal('roundGroup', round.group || '');
        setVal('weather', round.weather || '');
        setVal('temperature', round.temperature || '');
        setVal('roundNotes', round.notes || '');

        document.getElementById('add-round-title').textContent = 'Edit Round';
        document.getElementById('save-round-btn').textContent = 'Update Round';
        document.getElementById('cancel-edit-btn').style.display = 'block';

        if (isDetailed) {
            this.calculateDetailedTotals();
        }
    }

    switchView(viewId) {
        // Security check: Don't allow app views if not logged in
        const publicViews = ['login', 'forgot-password', 'home'];
        if (!this.user && !publicViews.includes(viewId)) {
            viewId = 'home';
        }
        this.currentView = viewId;

        // Manage Landing Header
        const landingHeader = document.getElementById('landing-header');
        if (landingHeader) {
            landingHeader.style.display = (viewId === 'home') ? 'flex' : 'none';
        }

        // Update nav UI
        document.querySelectorAll('.nav-item').forEach(item => {
            if (item.getAttribute('data-view') === viewId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Hide ALL view containers first
        document.querySelectorAll('.view-container').forEach(view => {
            view.classList.add('hidden');
        });

        // Show ONLY the target view
        const targetView = document.getElementById(`view-${viewId}`);
        if (targetView) {
            targetView.classList.remove('hidden');
        }

        // Update header title
        const titles = {
            'dashboard': 'Round Analytics',
            'insights': 'Insights',
            'history': 'Round History',
            'hole-dash': 'Hole Analytics',
            'login': 'Login',
            'forgot-password': 'Reset Password',
            'profile': 'My Profile',
            'home': 'Home',
            'data-dictionary': 'Data Dictionary',
            'courses': 'Course Management',
            'import': 'Import Data'
        };
        const titleEl = document.getElementById('page-title');
        if (titleEl) titleEl.textContent = titles[viewId] || '8 Iron Analytics';

        this.currentView = viewId;
        this.render();
    }

    openAddRoundModal(isEditMode = false) {
        // Reset form for fresh entry only if we aren't inheriting edit data
        if (!isEditMode) {
            const form = document.getElementById('add-round-form');
            if (form) {
                form.reset();
                document.getElementById('edit-round-id').value = '';
                document.getElementById('date').valueAsDate = new Date();
                document.getElementById('add-round-title').textContent = 'Log a Round';
                document.getElementById('save-round-btn').textContent = 'Save Round';
                document.getElementById('cancel-edit-btn').style.display = 'none';
            }
            // Only toggle mode on fresh open — editRound() handles this for edit mode
            // to avoid wiping the pre-populated detailed scorecard
            this.tempHoleData = {};
            this.toggleDataEntryMode();
        }

        const modal = document.getElementById('add-round-modal');
        if (modal) modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }

    closeAddRoundModal() {
        const modal = document.getElementById('add-round-modal');
        if (modal) modal.classList.add('hidden');
        document.body.style.overflow = ''; // Restore scrolling
    }

    handleCourseChangeRoundModal() {
        const courseInput = document.getElementById('course');
        const teeSelect = document.getElementById('round-tee-set');
        if (!courseInput || !teeSelect) return;

        const val = courseInput.value;
        const layout = this.courseLayouts.find(c => this.normalizeCourse(c.name) === this.normalizeCourse(val));

        teeSelect.innerHTML = '<option value="">Select Tee Set</option>';
        if (layout && layout.tees) {
            Object.keys(layout.tees).sort().forEach(teeName => {
                const opt = document.createElement('option');
                opt.value = teeName;
                opt.textContent = teeName;
                teeSelect.appendChild(opt);
            });
        }
    }

    handleTeeChangeRoundModal() {
        const courseInput = document.getElementById('course');
        const teeSelect = document.getElementById('round-tee-set');
        const holesSelect = document.getElementById('holes');
        const detailHolesSelect = document.getElementById('detail-holes-select');
        const courseParInput = document.getElementById('coursePar');

        if (!courseInput || !teeSelect) return;

        const val = courseInput.value;
        const teeName = teeSelect.value;
        const layout = this.courseLayouts.find(c => this.normalizeCourse(c.name) === this.normalizeCourse(val));

        if (layout && layout.tees && layout.tees[teeName]) {
            const tee = layout.tees[teeName];
            const holeCount = tee.holes ? tee.holes.length : 18;

            // Handle segments options based on holeCount
            const updateSegments = (select) => {
                if (!select) return;
                const currentVal = select.value;
                select.innerHTML = '';

                // ALWAYS allow 18 Holes if the user has/wants it.
                // On a 9-hole course, it just loops the front 9.
                select.innerHTML = `
                    <option value="18" ${currentVal === '18' ? 'selected' : ''}>18 Holes</option>
                    <option value="front9" ${currentVal === 'front9' ? 'selected' : ''}>Front 9</option>
                    <option value="back9" ${currentVal === 'back9' ? 'selected' : ''}>Back 9</option>
                `;

                // Preserve the value if it exists in the new options, otherwise it defaults to first
                if (currentVal && select.querySelector(`option[value="${currentVal}"]`)) {
                    select.value = currentVal;
                }
            };


            updateSegments(holesSelect);
            updateSegments(detailHolesSelect);

            // Auto-populate par for quick entry
            if (courseParInput) {
                const segment = holesSelect ? holesSelect.value : "18";
                let totalPar = 0;
                if (segment === "front9") {
                    totalPar = tee.holes.slice(0, 9).reduce((sum, h) => sum + h.par, 0);
                } else if (segment === "back9") {
                    // Loop if only 9 holes available
                    const backHoles = tee.holes.length === 18 ? tee.holes.slice(9, 18) : tee.holes.slice(0, 9);
                    totalPar = backHoles.reduce((sum, h) => sum + h.par, 0);
                } else {
                    // 18 Holes
                    if (tee.holes.length === 18) {
                        totalPar = tee.holes.reduce((sum, h) => sum + (h.par || 0), 0);
                    } else {
                        // Loop 9 holes twice
                        totalPar = (tee.holes.reduce((sum, h) => sum + (h.par || 0), 0)) * 2;
                    }
                }
                courseParInput.value = totalPar;
                courseParInput.readOnly = true;
            }

            // Sync Detailed Scorecard if in detailed mode
            const entryMode = document.getElementById('entry-mode-select')?.value;
            if (entryMode === 'detailed') {
                this.generateDetailedScorecard(detailHolesSelect.value, tee.holes);
            }
        }
    }

    togglePasswordVisibility(inputId, btn) {
        const input = document.getElementById(inputId);
        if (!input) return;

        if (input.type === 'password') {
            input.type = 'text';
            btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
        } else {
            input.type = 'password';
            btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
        }
    }

    render() {
        this.updateHandicapDisplay();

        if (this.currentView === 'dashboard') {
            this.renderDashboard();
        } else if (this.currentView === 'history') {
            this.renderHistory();
        } else if (this.currentView === 'insights') {
            this.renderInsights();
        } else if (this.currentView === 'profile') {
            this.renderProfile();
        } else if (this.currentView === 'course-analytics') {
            this.renderCourseAnalytics();
        } else if (this.currentView === 'hole-dash') {
            this.renderHoleDash();
        } else if (this.currentView === 'data-dictionary') {
            // No dynamic rendering needed yet, just static HTML
        } else if (this.currentView === 'courses') {
            this.renderCourseManagement();
        }
    }

    calculateHandicapIndex() {
        if (!this.rounds || this.rounds.length === 0) return { value: 'NH', history: [] };

        const validRounds = [];

        // Iterate through rounds (newest first) to find up to 20 valid differentials
        for (const r of this.rounds) {
            if (validRounds.length >= 20) break;

            const course = this.courseLayouts.find(c => c.courseId === r.courseId);
            if (!course || !course.tees || !r.teeName || !course.tees[r.teeName]) continue;

            const tee = course.tees[r.teeName];
            const rating = tee.rating || 0;
            const slope = tee.slope || 0;

            if (rating > 0 && slope > 0 && r.score > 0) {
                // Scale 9-hole rounds
                const holes = r.holes || 18;
                const multiplier = 18 / holes;
                const adjustedScore = r.score * multiplier;

                const diff = (113 / slope) * (adjustedScore - rating);
                // Keep the round object to render later
                validRounds.push({
                    date: r.date,
                    course: r.course || course.name,
                    score: r.score,
                    adjustedScore: adjustedScore,
                    holes: holes,
                    rating: rating,
                    slope: slope,
                    diff: diff,
                    isUsed: false
                });
            }
        }

        const count = validRounds.length;
        if (count < 3) return { value: 'NH', history: validRounds };
        
        // Determine how many scores to use for the average
        let numsToAverage = 1;
        let adjustment = 0;

        if (count === 3) { numsToAverage = 1; adjustment = -2.0; }
        else if (count === 4) { numsToAverage = 1; adjustment = -1.0; }
        else if (count === 5) { numsToAverage = 1; }
        else if (count === 6) { numsToAverage = 2; adjustment = -1.0; }
        else if (count >= 7 && count <= 8) { numsToAverage = 2; }
        else if (count >= 9 && count <= 11) { numsToAverage = 3; }
        else if (count >= 12 && count <= 14) { numsToAverage = 4; }
        else if (count >= 15 && count <= 16) { numsToAverage = 5; }
        else if (count >= 17 && count <= 19) { numsToAverage = 6; }
        else if (count >= 20) { numsToAverage = 8; }

        // Sort a copy ascending to find the lowest N differentials
        const sortedDiffs = [...validRounds].sort((a, b) => a.diff - b.diff);
        const selectedForAverage = sortedDiffs.slice(0, numsToAverage);
        
        // Mark the used rounds in the original array
        selectedForAverage.forEach(sr => {
            sr.isUsed = true;
        });

        const sum = selectedForAverage.reduce((acc, val) => acc + val.diff, 0);
        let hdcp = (sum / numsToAverage) + adjustment;

        // WHS maximum handicap index is 54.0
        if (hdcp > 54.0) hdcp = 54.0;

        const formatted = (Math.round(Math.abs(hdcp) * 10) / 10).toFixed(1);
        const finalValue = hdcp < 0 ? `+${formatted}` : formatted;

        return {
            value: finalValue,
            history: validRounds,
            adjustment: adjustment,
            counted: numsToAverage
        };
    }

    calculateHandicapHistory() {
        if (!this.rounds || this.rounds.length === 0) return [];
        
        const chronologicalRounds = [...this.rounds].sort((a, b) => new Date(a.date) - new Date(b.date));
        const history = [];
        const runningValidRounds = [];

        for (const r of chronologicalRounds) {
            const course = this.courseLayouts.find(c => c.courseId === r.courseId);
            if (!course || !course.tees || !r.teeName || !course.tees[r.teeName]) continue;

            const tee = course.tees[r.teeName];
            const rating = tee.rating || 0;
            const slope = tee.slope || 0;

            if (rating > 0 && slope > 0 && r.score > 0) {
                const holes = r.holes || 18;
                const multiplier = 18 / holes;
                const adjustedScore = r.score * multiplier;
                const diff = (113 / slope) * (adjustedScore - rating);

                // Difficulty Formula: (Rating - 67)*5 + (Slope - 113)
                const diffMetric = (rating - 67) * 5 + (slope - 113);

                runningValidRounds.push({
                    date: r.date,
                    diff: diff
                });

                if (runningValidRounds.length > 20) {
                    runningValidRounds.shift();
                }

                const count = runningValidRounds.length;
                let hdcpVal = 0;
                if (count >= 3) {
                    let numsToAverage = 1;
                    let adjustment = 0;

                    if (count === 3) { numsToAverage = 1; adjustment = -2.0; }
                    else if (count === 4) { numsToAverage = 1; adjustment = -1.0; }
                    else if (count === 5) { numsToAverage = 1; }
                    else if (count === 6) { numsToAverage = 2; adjustment = -1.0; }
                    else if (count >= 7 && count <= 8) { numsToAverage = 2; }
                    else if (count >= 9 && count <= 11) { numsToAverage = 3; }
                    else if (count >= 12 && count <= 14) { numsToAverage = 4; }
                    else if (count >= 15 && count <= 16) { numsToAverage = 5; }
                    else if (count >= 17 && count <= 19) { numsToAverage = 6; }
                    else if (count >= 20) { numsToAverage = 8; }

                    const sortedDiffs = [...runningValidRounds].sort((a, b) => a.diff - b.diff);
                    const selected = sortedDiffs.slice(0, numsToAverage);
                    const sum = selected.reduce((acc, val) => acc + val.diff, 0);
                    hdcpVal = (sum / numsToAverage) + adjustment;

                    if (hdcpVal > 54.0) hdcpVal = 54.0;
                }

                // Expected Score: Rating + (Slope / 113) * Current Handicap
                const currentHdcp = history.length > 0 ? history[history.length - 1].index : 0;
                const expected = rating + (slope / 113) * currentHdcp;
                const performance = expected - adjustedScore;

                history.push({
                    date: r.date,
                    count: count,
                    index: parseFloat((Math.round(Math.abs(hdcpVal) * 10) / 10).toFixed(1)) * (hdcpVal < 0 ? -1 : 1),
                    performance: performance,
                    difficulty: diffMetric,
                    courseName: r.course || course.name,
                    teeName: r.teeName,
                    score: r.score,
                    adjustedScore: adjustedScore,
                    rating: rating,
                    slope: slope,
                    prevHandicap: currentHdcp,
                    holes: holes
                });
            }
        }
        
        return history;
    }

    renderCourseAnalytics() {
        let filterContainer = document.getElementById('course-analytics-filters');
        const view = document.getElementById('view-course-analytics');
        const header = view ? view.querySelector('.dashboard-header') : null;
        if (!filterContainer && header) {
            filterContainer = document.createElement('div');
            filterContainer.id = 'course-analytics-filters';
            header.parentNode.insertBefore(filterContainer, header.nextSibling);
        }
        if (filterContainer) {
            this.renderFilters('course-analytics-filters', () => this.renderCourseAnalytics());
        }

        const primarySelect = document.getElementById('course-primary-stat');
        if (primarySelect && !primarySelect._listenerAdded) {
            primarySelect.addEventListener('change', () => this.renderCourseAnalytics());
            primarySelect._listenerAdded = true;
        }
        const secondarySelect = document.getElementById('course-secondary-stat');
        if (secondarySelect && !secondarySelect._listenerAdded) {
            secondarySelect.addEventListener('change', () => this.renderCourseAnalytics());
            secondarySelect._listenerAdded = true;
        }

        const primaryStat = primarySelect ? primarySelect.value : 'handicap';
        const secondaryStat = secondarySelect ? secondarySelect.value : 'none';

        let history = this.calculateHandicapHistory();
        
        // Apply Year/Month Filters
        history = history.filter(h => {
             const est = this.getEST(h.date);
             return (this.filterYears.length === 0 || this.filterYears.includes(est.y)) &&
                    (this.filterMonths.length === 0 || this.filterMonths.includes(est.m));
        });

        // Tiles Calculation
        const perfHistory = history.filter(h => h.holes === 18);
        const sortedByDiff = [...history].sort((a, b) => b.difficulty - a.difficulty);

        const setTile = (id, val, desc, data, type) => {
            const card = document.getElementById(id)?.closest('.card');
            const valEl = document.getElementById(id);
            const descEl = document.getElementById(id + '-desc');
            if (valEl) valEl.textContent = val;
            if (descEl) descEl.textContent = desc;
            if (card) {
                if (data) {
                    card.style.cursor = 'pointer';
                    card.onclick = () => this.showMetricBreakdown(type, data);
                    card.title = "Click to see calculation";
                } else {
                    card.style.cursor = 'default';
                    card.onclick = null;
                    card.title = "";
                }
            }
        };

        if (perfHistory.length > 0) {
            const bestPerf = [...perfHistory].sort((a, b) => b.performance - a.performance)[0];
            const worstPerf = [...perfHistory].sort((a, b) => a.performance - b.performance)[0];

            setTile('stat-best-perf', (bestPerf.performance > 0 ? '+' : '') + bestPerf.performance.toFixed(1), bestPerf.courseName + ' (' + this.formatDateDisplay(bestPerf.date) + ')', bestPerf, 'performance');
            setTile('stat-worst-perf', worstPerf.performance.toFixed(1), worstPerf.courseName + ' (' + this.formatDateDisplay(worstPerf.date) + ')', worstPerf, 'performance');
        } else {
            setTile('stat-best-perf', '--', 'No 18-hole rounds', null, 'performance');
            setTile('stat-worst-perf', '--', 'No 18-hole rounds', null, 'performance');
        }

        if (history.length > 0) {
            const hardest = sortedByDiff[0];
            const easiest = sortedByDiff[sortedByDiff.length - 1];
            setTile('stat-hardest-course', hardest.difficulty.toFixed(0), hardest.courseName, hardest, 'difficulty');
            setTile('stat-easiest-course', easiest.difficulty.toFixed(0), easiest.courseName, easiest, 'difficulty');
        }

        // Grouping Logic
        if (this.chartGroupBy !== 'round') {
            const groups = {};
            history.forEach(h => {
                const est = this.getEST(h.date);
                let key, label;
                if (this.chartGroupBy === 'week') {
                    const d = new Date(est.iso);
                    const day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1);
                    const weekStart = new Date(d.setDate(diff));
                    key = weekStart.toISOString().split('T')[0];
                    label = 'Week of ' + this.formatDateDisplay(key);
                } else if (this.chartGroupBy === 'month') {
                    key = `${est.y}-${(est.m + 1).toString().padStart(2, '0')}-01`;
                    label = `${this.monthNames[est.m]} ${est.y}`;
                } else if (this.chartGroupBy === 'quarter') {
                    const q = Math.ceil((est.m + 1) / 3);
                    key = `${est.y}-Q${q}`;
                    label = `Q${q} ${est.y}`;
                } else { // year
                    key = `${est.y}-01-01`;
                    label = est.y.toString();
                }

                if (!groups[key]) {
                    groups[key] = { date: h.date, index: h.index, performance: h.performance, difficulty: h.difficulty, label: label, count: 0 };
                }
                groups[key].index = h.index; // Take latest
                groups[key].performance = h.performance; // Take latest
                groups[key].difficulty = h.difficulty; // Take latest
                groups[key].count++;
            });
            history = Object.values(groups).sort((a, b) => new Date(a.date) - new Date(b.date));
        }

        const emptyState = document.getElementById('course-analytics-empty');
        const contentState = document.getElementById('course-analytics-content');

        if (!history || history.length === 0) {
            if (emptyState) emptyState.style.display = 'block';
            if (contentState) contentState.style.display = 'none';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        if (contentState) contentState.style.display = 'block';

        // Chart.js Rendering
        const ctxId = 'handicapTrendChart';
        const ctx = document.getElementById(ctxId);
        if (!ctx) return;

        if (this.handicapChartInstance) {
            this.handicapChartInstance.destroy();
        }

        const labels = history.map((h, i) => this.chartGroupBy === 'round' ? this.formatDateDisplay(h.date) : h.label);
        
        const getStatData = (stat, item) => {
            if (stat === 'handicap') return item.index;
            if (stat === 'performance') return item.performance;
            if (stat === 'difficulty') return item.difficulty;
            return null;
        };

        const getStatLabel = (stat) => {
            if (stat === 'handicap') return 'Handicap Index';
            if (stat === 'performance') return 'Performance (+ Better)';
            if (stat === 'difficulty') return 'Course Difficulty';
            return '';
        };

        const getStatColor = (stat) => {
            if (stat === 'handicap') return '#10b981'; // Green
            if (stat === 'performance') return '#3b82f6'; // Blue
            if (stat === 'difficulty') return '#f59e0b'; // Amber
            return '#94a3b8';
        };

        const datasets = [{
            label: getStatLabel(primaryStat),
            data: history.map(h => getStatData(primaryStat, h)),
            borderColor: getStatColor(primaryStat),
            backgroundColor: getStatColor(primaryStat) + '22',
            borderWidth: 3,
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            yAxisID: 'y'
        }];

        if (secondaryStat !== 'none') {
            datasets.push({
                label: getStatLabel(secondaryStat),
                data: history.map(h => getStatData(secondaryStat, h)),
                borderColor: getStatColor(secondaryStat),
                backgroundColor: 'transparent',
                borderWidth: 2,
                borderDash: [5, 5],
                tension: 0.3,
                pointRadius: 4,
                yAxisID: 'y1'
            });
        }

        this.handicapChartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#000000', font: { family: 'Inter', size: 12, weight: 'bold' } }
                    },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        titleColor: '#f8fafc',
                        bodyColor: '#cbd5e1',
                        borderColor: '#334155',
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: function(context) {
                                return ` ${context.dataset.label}: ${context.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: { color: '#000000', font: { size: 10, weight: '500' } }
                    },
                    y: {
                        title: { display: true, text: getStatLabel(primaryStat), color: '#000000', font: { weight: 'bold' } },
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: { color: '#000000' },
                        reverse: false
                    },
                    y1: {
                        display: secondaryStat !== 'none',
                        position: 'right',
                        title: { display: true, text: getStatLabel(secondaryStat), color: '#000000', font: { weight: 'bold' } },
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#000000' },
                        reverse: false
                    }
                }
            }
        });

        // Current Handicap display in chart card
        const currentHdcpEl = document.getElementById('course-analytics-current-hdcp');
        if (currentHdcpEl) {
            const latest = history[history.length - 1];
            currentHdcpEl.textContent = `Index: ${latest.index.toFixed(1)}`;
            currentHdcpEl.style.display = primaryStat === 'handicap' || secondaryStat === 'handicap' ? 'block' : 'none';
        }

        this.renderExpectedScoreCalculator();
    }

    renderExpectedScoreCalculator() {
        const courseSelect = document.getElementById('calc-course-select');
        const teeSelect = document.getElementById('calc-tee-select');
        const resultEl = document.getElementById('expected-score-val');
        const detailsEl = document.getElementById('expected-score-details');
        
        if (!courseSelect || !teeSelect) return;

        // Only setup if needed
        if (!courseSelect.innerHTML) {
            const sortedCourses = [...this.courseLayouts].sort((a, b) => a.name.localeCompare(b.name));
            courseSelect.innerHTML = '<option value="">-- Select a Course --</option>' + 
                sortedCourses.map(c => `<option value="${c.courseId}">${c.name}</option>`).join('');
            
            courseSelect.addEventListener('change', () => {
                const cid = courseSelect.value;
                const course = this.courseLayouts.find(c => c.courseId === cid);
                if (course && course.tees) {
                    const tees = Object.keys(course.tees).sort();
                    teeSelect.innerHTML = '<option value="">-- Select Tee --</option>' + 
                        tees.map(t => `<option value="${t}">${t}</option>`).join('');
                } else {
                    teeSelect.innerHTML = '';
                    resultEl.textContent = '--';
                    detailsEl.textContent = 'Select a course to calculate';
                }
            });

            teeSelect.addEventListener('change', () => {
                const cid = courseSelect.value;
                const teeName = teeSelect.value;
                const course = this.courseLayouts.find(c => c.courseId === cid);
                
                if (course && course.tees && course.tees[teeName]) {
                    const tee = course.tees[teeName];
                    const rating = tee.rating || 0;
                    const slope = tee.slope || 0;
                    
                    const res = this.calculateHandicapIndex();
                    let handicap = 0;
                    if (res.value !== 'NH') {
                        if (res.value.startsWith('+')) {
                            handicap = -parseFloat(res.value.substring(1));
                        } else {
                            handicap = parseFloat(res.value);
                        }
                    }

                    if (rating > 0 && slope > 0) {
                        const expected = rating + (slope / 113) * handicap;
                        resultEl.textContent = Math.round(expected);
                        detailsEl.textContent = `Based on index ${res.value} and ${teeName} tees (R: ${rating}, S: ${slope})`;
                    }
                } else {
                    resultEl.textContent = '--';
                    detailsEl.textContent = 'Invalid tee selected';
                }
            });
        }
    }

    showMetricBreakdown(type, data) {
        const modal = document.getElementById('metric-math-modal');
        const titleEl = document.getElementById('metric-modal-title');
        const subtitleEl = document.getElementById('metric-modal-subtitle');
        const contentEl = document.getElementById('metric-modal-content');

        if (!modal || !contentEl) return;

        let html = '';
        if (type === 'performance') {
            titleEl.textContent = "Performance Breakdown";
            subtitleEl.textContent = `${data.courseName} - ${this.formatDateDisplay(data.date)}`;
            
            const expected = data.rating + (data.slope / 113) * data.prevHandicap;
            
            html = `
                <div style="margin-bottom: 15px; color: var(--primary-green); font-weight: bold;">1. Expected Score Calculation</div>
                <div style="margin-left: 10px; margin-bottom: 20px;">
                    Rating: ${data.rating}<br>
                    Slope: ${data.slope}<br>
                    Handicap at time: ${data.prevHandicap.toFixed(1)}<br>
                    <div style="margin-top: 8px; font-style: italic; opacity: 0.8;">Formula: Rating + (Slope / 113) * Handicap</div>
                    <div style="margin-top: 5px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 5px;">
                        ${data.rating} + (${data.slope} / 113) * ${data.prevHandicap.toFixed(1)} = <span style="color: var(--primary-green);">${expected.toFixed(2)}</span>
                    </div>
                </div>

                <div style="margin-bottom: 15px; color: var(--primary-green); font-weight: bold;">2. Performance Score</div>
                <div style="margin-left: 10px;">
                    Expected Score: ${expected.toFixed(2)}<br>
                    Actual Score: ${data.score} ${data.holes !== 18 ? `(Scales to ${data.adjustedScore.toFixed(1)} for 18h)` : ''}<br>
                    <div style="margin-top: 8px; font-style: italic; opacity: 0.8;">Formula: Expected - Actual</div>
                    <div style="margin-top: 5px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 5px;">
                        ${expected.toFixed(2)} - ${data.adjustedScore.toFixed(2)} = <span style="color: ${data.performance >= 0 ? 'var(--primary-green)' : 'var(--danger)'}; font-weight: bold;">${(data.performance > 0 ? '+' : '') + data.performance.toFixed(2)}</span>
                    </div>
                </div>
            `;
        } else if (type === 'difficulty') {
            titleEl.textContent = "Course Difficulty Breakdown";
            subtitleEl.textContent = `${data.courseName} (${data.teeName} Tees)`;

            html = `
                <div style="margin-bottom: 15px; color: var(--primary-green); font-weight: bold;">Difficulty Factor Calculation</div>
                <div style="margin-left: 10px;">
                    Rating: ${data.rating}<br>
                    Slope: ${data.slope}<br>
                    <div style="margin-top: 15px; font-style: italic; opacity: 0.8;">Formula: (Rating - 67) * 5 + (Slope - 113)</div>
                    <div style="margin-top: 10px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px; font-size: 1.1rem;">
                        (${data.rating} - 67) * 5 + (${data.slope} - 113) = <span style="color: var(--warning); font-weight: bold;">${data.difficulty.toFixed(1)}</span>
                    </div>
                    <div style="margin-top: 15px; font-size: 0.85rem; color: var(--text-muted);">
                        * This factor represents the relative difficulty of the course setup compared to a standard benchmark.
                    </div>
                </div>
            `;
        }

        contentEl.innerHTML = html;
        modal.classList.remove('hidden');
    }

    closeMetricBreakdown() {
        const modal = document.getElementById('metric-math-modal');
        if (modal) modal.classList.add('hidden');
    }

    exportHandicapHistoryCSV() {
        const history = this.calculateHandicapHistory();
        if (!history || history.length === 0) {
            alert("No handicap history available to export.");
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Date,Rounds Counted,Computed Index\n";

        // Reverse to export newest first, or keep oldest first as you wish. 
        // We'll export newest first to match the UI table
        const exportHistory = [...history].reverse();

        exportHistory.forEach(row => {
            const formattedDate = this.formatDateDisplay(row.date).replace(/,/g, '');
            const indexStr = row.index < 0 ? `+${Math.abs(row.index).toFixed(1)}` : row.index.toFixed(1);
            csvContent += `${formattedDate},${row.count},${indexStr}\n`;
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Handicap_History_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    updateHandicapDisplay() {
        const hdcpData = this.calculateHandicapIndex();
        
        const headerContainer = document.getElementById('header-handicap-display');
        const headerVal = document.getElementById('header-handicap-val');
        if (headerContainer && headerVal) {
            headerContainer.style.display = 'flex';
            headerVal.textContent = hdcpData.value;
        }

        const profileInput = document.getElementById('profile-handicap');
        if (profileInput) {
            profileInput.value = hdcpData.value;
        }
    }

    showHandicapBreakdown() {
        const hdcpData = this.calculateHandicapIndex();
        
        document.getElementById('breakdown-hdcp-val').textContent = hdcpData.value;
        
        let explanation = '';
        if (hdcpData.history.length < 3) {
            explanation = `You need at least 3 eligible 18-hole rounds to compute a handicap. You currently have ${hdcpData.history.length}.`;
        } else {
            explanation = `Based on your ${hdcpData.history.length} eligible rounds, your handicap is the average of your lowest ${hdcpData.counted} differentials${hdcpData.adjustment !== 0 ? ` with a ${hdcpData.adjustment} adjustment` : ''}. Rounds used in the calculation are highlighted in green.`;
        }
        document.getElementById('breakdown-explanation').innerHTML = explanation;

        const tbody = document.getElementById('breakdown-table-body');
        if (!tbody) return;

        if (hdcpData.history.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-muted);">No eligible rounds found.</td></tr>`;
        } else {
            tbody.innerHTML = hdcpData.history.map(r => {
                const isSelected = r.isUsed;
                const scoreDisplay = r.holes !== 18 ? `${r.score} <span style="font-size: 0.8em; color: var(--text-muted);">(scaled to ${Math.round(r.adjustedScore)})</span>` : r.score;
                return `
                    <tr style="border-bottom: 1px solid var(--border-color); ${isSelected ? 'background: rgba(16, 185, 129, 0.1);' : ''}">
                        <td style="padding: 12px 15px; color: var(--text-muted); white-space: nowrap;">${this.formatDateDisplay(r.date)}</td>
                        <td style="padding: 12px 15px; font-weight: 500;">${r.course}</td>
                        <td style="padding: 12px 15px; text-align: center;">${scoreDisplay}</td>
                        <td style="padding: 12px 15px; text-align: center; color: var(--text-muted);">${r.rating} / ${r.slope}</td>
                        <td style="padding: 12px 15px; text-align: right; font-weight: bold; color: ${isSelected ? 'var(--primary-green)' : 'var(--text-primary)'};">${r.diff.toFixed(1)}</td>
                    </tr>
                `;
            }).join('');
        }

        const modal = document.getElementById('handicap-breakdown-modal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    closeHandicapBreakdown() {
        const modal = document.getElementById('handicap-breakdown-modal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    updateAvatar() {
        const avatar = document.getElementById('user-avatar');
        if (!avatar) return;
        
        if (this.profile && this.profile.firstName && this.profile.lastName) {
            const firstInitial = this.profile.firstName.trim().charAt(0).toUpperCase();
            const lastInitial = this.profile.lastName.trim().charAt(0).toUpperCase();
            avatar.textContent = `${firstInitial}.${lastInitial}.`;
        } else if (this.user && this.user.email) {
            avatar.textContent = this.user.email.charAt(0).toUpperCase();
        } else {
            avatar.textContent = 'U';
        }
    }

    renderProfile() {
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val !== undefined ? val : '';
        };

        setVal('profile-first-name', this.profile.firstName);
        setVal('profile-last-name', this.profile.lastName);
        setVal('profile-email', this.user ? this.user.email : 'local@example.com');
        this.updateHandicapDisplay();

        const tbody = document.getElementById('profile-handicap-history-body');
        if (tbody) {
            const history = this.calculateHandicapHistory();
            if (!history || history.length === 0) {
                tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; padding: 20px; color: var(--text-muted);">No history available. Play more rounds to establish a handicap.</td></tr>`;
            } else {
                // Show newest first in the table
                const reversedHistory = [...history].reverse();
                tbody.innerHTML = reversedHistory.map(row => {
                    const indexStr = row.index < 0 ? `+${Math.abs(row.index).toFixed(1)}` : row.index.toFixed(1);
                    return `
                        <tr style="border-bottom: 1px solid var(--border-color);">
                            <td style="padding: 10px 12px; color: var(--text-muted);">${this.formatDateDisplay(row.date)}</td>
                            <td style="padding: 10px 12px; text-align: center;">${row.count}</td>
                            <td style="padding: 10px 12px; text-align: right; font-weight: bold; color: var(--primary-green);">${indexStr}</td>
                        </tr>
                    `;
                }).join('');
            }
        }
    }

    renderCourseManagement() {
        const tbody = document.getElementById('mgmt-course-list');
        if (!tbody) return;

        // Get all unique course names from both layouts and rounds
        const allCourseNames = [...new Set([
            ...this.courseLayouts.map(c => c.name),
            ...this.rounds.map(r => r.course)
        ])].filter(n => n && n.trim()).sort((a, b) => a.localeCompare(b));

        tbody.innerHTML = allCourseNames.map(courseName => {
            const layout = this.courseLayouts.find(c => this.normalizeCourse(c.name) === this.normalizeCourse(courseName));
            const id = layout ? (layout.courseId || '---') : '---';
            const teeCount = layout && layout.tees ? Object.keys(layout.tees).length : 0;
            const state = layout ? (layout.state || '') : '';
            const country = layout ? (layout.country || '') : '';
            const isRegistered = id !== '---';

            return `
                <tr onclick="window.app.selectMgmtCourse('${id}')" style="cursor: pointer; vertical-align: middle; ${!isRegistered ? 'background: rgba(239, 68, 68, 0.02);' : ''}">
                    <td style="color: ${isRegistered ? 'var(--text-muted)' : 'var(--danger)'}; font-family: monospace; font-size: 0.85rem; padding: 12px 15px; border-bottom: 1px solid var(--border-color); width: 120px;">
                        ${isRegistered ? id : '<span style="font-size: 0.65rem; font-weight: 800; letter-spacing: 0.05em;">UNREGISTERED</span>'}
                    </td>
                    <td style="padding: 12px 15px; border-bottom: 1px solid var(--border-color);">
                        <strong>${courseName}</strong>
                    </td>
                    <td style="padding: 12px 15px; border-bottom: 1px solid var(--border-color); width: 80px;">${state}</td>
                    <td style="padding: 12px 15px; border-bottom: 1px solid var(--border-color); width: 100px;">${country}</td>
                    <td style="padding: 12px 15px; border-bottom: 1px solid var(--border-color); width: 100px;">
                        <span class="badge ${teeCount > 0 ? 'badge-active' : ''}">${teeCount} Tees</span>
                    </td>
                    <td style="padding: 12px 15px; border-bottom: 1px solid var(--border-color); width: 180px; white-space: nowrap; text-align: right;">
                        <div style="display: flex; gap: 6px; align-items: center; justify-content: flex-end;">
                            ${isRegistered ? `
                                <button class="btn btn-secondary btn-sm" style="padding: 5px 12px; font-size: 0.75rem; border-radius: 6px;" onclick="event.stopPropagation(); window.app.editMgmtCourse('${id}')">Edit</button>
                                <button class="btn btn-danger btn-sm" style="background: rgba(239, 68, 68, 0.1); color: var(--primary-red); border: 1px solid rgba(239, 68, 68, 0.2); padding: 5px 12px; font-size: 0.75rem; border-radius: 6px;" onclick="event.stopPropagation(); window.app.deleteMgmtCourse('${id}')">Delete</button>
                            ` : `
                                <button class="btn btn-primary btn-sm" style="padding: 5px 14px; font-size: 0.75rem; border-radius: 6px; background: var(--primary-green); color: white;" onclick="event.stopPropagation(); window.app.editMgmtCourse(null, '${courseName.replace(/'/g, "\\'")}')">Register</button>
                            `}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    selectMgmtCourse(courseId) {
        const layout = this.courseLayouts.find(c => c.courseId === courseId);
        if (!layout) return;

        this.selectedMgmtCourseId = courseId;
        const section = document.getElementById('mgmt-tee-section');
        const title = document.getElementById('mgmt-selected-course-name');
        const list = document.getElementById('mgmt-tee-list');
        const holeSection = document.getElementById('mgmt-hole-section');

        if (!section || !title || !list) return;

        section.style.display = 'block';
        if (holeSection) holeSection.style.display = 'none';
        title.textContent = `${layout.name} - Tees`;

        const tees = layout.tees || {};

        if (Object.keys(tees).length === 0) {
            list.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No tees defined.</td></tr>';
        } else {
            list.innerHTML = Object.entries(tees).map(([teeName, data]) => `
                <tr onclick="window.app.selectMgmtTee('${courseId}', '${teeName}')" style="cursor: pointer;">
                    <td>${data.teeId || '---'}</td>
                    <td><span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: ${teeName.toLowerCase()}; border: 1px solid var(--border-color); margin-right: 8px;"></span>${teeName}</td>
                    <td>${data.rating || 'N/A'}</td>
                    <td>${data.slope || 'N/A'}</td>
                    <td>
                        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); window.app.editMgmtTee('${courseId}', '${teeName}')">Edit</button>
                        <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); window.app.deleteMgmtTee('${courseId}', '${teeName}')">Delete</button>
                    </td>
                </tr>
            `).join('');
        }
    }

    editMgmtTee(courseId, teeName) {
        const layout = this.courseLayouts.find(c => c.courseId === courseId);
        if (!layout || !layout.tees || !layout.tees[teeName]) return;

        const tee = layout.tees[teeName];
        this.editingTeeName = teeName;

        // Reset and populate modal
        const titleEl = document.getElementById('add-tee-title');
        if (titleEl) titleEl.textContent = 'Edit Tee Set';

        const saveBtn = document.getElementById('save-tee-btn') ||
            document.querySelector('#add-tee-form button[type="submit"]');

        if (saveBtn) saveBtn.textContent = 'Update Tee Set';

        document.getElementById('mgmt-tee-color').value = teeName;
        document.getElementById('mgmt-tee-id').value = tee.teeId || '';
        document.getElementById('mgmt-tee-rating').value = tee.rating || '';
        document.getElementById('mgmt-tee-slope').value = tee.slope || '';

        // Handle hole count and par inputs
        const holes = tee.holes || [];
        const holesSelect = document.getElementById('mgmt-tee-holes');
        if (holesSelect) {
            holesSelect.value = holes.length;
            this.renderHoleGridInTeeModal(holes.length);
        }

        // Populate pars (and yardages/handicaps if they exist)
        holes.forEach((h, idx) => {
            const hNum = idx + 1;
            const parInput = document.getElementById(`mgmt-par-${hNum}`);
            const ydsInput = document.getElementById(`mgmt-yardage-${hNum}`);
            const hcpInput = document.getElementById(`mgmt-handicap-${hNum}`);
            if (parInput) parInput.value = h.par || 4;
            if (ydsInput) ydsInput.value = h.yardage || 0;
            if (hcpInput) hcpInput.value = h.handicap || 0;
        });

        this.openAddTeeModal(true);
    }

    openQuickEditTee() {
        const courseInput = document.getElementById('course');
        const teeSelect = document.getElementById('round-tee-set');

        if (!courseInput || !teeSelect || !teeSelect.value) {
            alert('Please select a course and tee set first.');
            return;
        }

        const val = courseInput.value;
        const teeName = teeSelect.value;
        const layout = this.courseLayouts.find(c => this.normalizeCourse(c.name) === this.normalizeCourse(val));

        if (layout) {
            this.editMgmtTee(layout.courseId, teeName);
        } else {
            alert('Course not found in database.');
        }
    }

    openQuickEditTeeFromCourses() {
        if (!this.selectedMgmtCourseId) {
            alert('Please select a course from the list first.');
            return;
        }

        // If a tee is selected in the list, edit it. Otherwise, prompt or edit first.
        // For now, if no tee selected, we could just open the Add Tee modal.
        // But the user specifically said "Manage Tees" button should be moved.
        // Let's make it open the "Add Tee" modal if none selected, or the first one.
        const layout = this.courseLayouts.find(c => c.courseId === this.selectedMgmtCourseId);
        if (layout && layout.tees && Object.keys(layout.tees).length > 0) {
            const firstTee = Object.keys(layout.tees)[0];
            this.editMgmtTee(this.selectedMgmtCourseId, firstTee);
        } else {
            this.openAddTeeModal();
        }
    }

    selectMgmtTee(courseId, teeName) {
        const layout = this.courseLayouts.find(c => c.courseId === courseId);
        if (!layout) return;

        const section = document.getElementById('mgmt-hole-section');
        const title = document.getElementById('mgmt-selected-tee-name');
        const header = document.getElementById('mgmt-hole-header');
        const body = document.getElementById('mgmt-hole-body');

        if (!section || !title || !header || !body) return;

        section.style.display = 'block';
        title.textContent = `${layout.name} - ${teeName} Tees (Hole Breakdown)`;

        const teeData = layout.tees[teeName];
        const holes = teeData.holes || [];

        header.innerHTML = `
            <tr>
                <th style="width: 80px;">Hole</th>
                <th>Par</th>
                <th>Yards</th>
                <th>Handicap</th>
            </tr>
        `;

        const totalPar = holes.reduce((a, b) => a + (Number(b.par) || 0), 0);
        const totalYardage = holes.reduce((a, b) => a + (Number(b.yardage) || 0), 0);

        body.innerHTML = holes.map((hole, i) => `
            <tr>
                <td><strong>${hole.num || (i + 1)}</strong></td>
                <td>${hole.par || '-'}</td>
                <td>${hole.yardage || '-'}</td>
                <td>${hole.handicap || '-'}</td>
            </tr>
        `).join('') + `
            <tr style="background: rgba(255,255,255,0.05); font-weight: bold; border-top: 2px solid var(--border-color);">
                <td>TOTAL</td>
                <td>${totalPar}</td>
                <td>${totalYardage}</td>
                <td>-</td>
            </tr>
        `;
    }

    async deleteMgmtCourse(courseId) {
        const index = this.courseLayouts.findIndex(c => c.courseId === courseId);
        if (index === -1) return;

        const course = this.courseLayouts[index];
        if (!confirm(`Are you sure you want to delete ${course.name}? This will remove all associated tees and data.`)) return;

        this.courseLayouts.splice(index, 1);

        // Sync to cloud
        if (this.db) {
            const { doc, deleteDoc } = window.firebaseDB || await import("https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js");
            await deleteDoc(doc(this.db, "courses", courseId));
        }

        this.renderCourseManagement();
        this.renderCourseSearchList();

        // Clear selection if deleted
        if (this.selectedMgmtCourseId === courseId) {
            this.selectedMgmtCourseId = null;
            document.getElementById('mgmt-tee-section').style.display = 'none';
            document.getElementById('mgmt-hole-section').style.display = 'none';
        }
    }

    editMgmtCourse(courseId, fallbackName) {
        let layout = courseId ? this.courseLayouts.find(c => c.courseId === courseId) : null;

        // If no ID provided but we have a name (registration flow), try to find by name 
        if (!layout && fallbackName) {
            layout = this.courseLayouts.find(c => this.normalizeCourse(c.name) === this.normalizeCourse(fallbackName));
        }

        document.getElementById('mgmt-course-name').value = layout ? layout.name : (fallbackName || '');
        document.getElementById('mgmt-course-state').value = layout ? (layout.state || '') : '';
        document.getElementById('mgmt-course-country').value = layout ? (layout.country || '') : '';
        const typeEl = document.getElementById('mgmt-course-type');
        if (typeEl) typeEl.value = layout ? (layout.public_private || '') : '';

        // Store ID as we're editing an existing record, or null if registering a new course 
        this.editingCourseId = layout ? layout.courseId : null;

        this.openAddCourseModal();
    }

    openAddCourseModal() {
        const modal = document.getElementById('add-course-modal');
        if (modal) modal.classList.remove('hidden');
    }

    closeAddCourseModal() {
        const modal = document.getElementById('add-course-modal');
        if (modal) modal.classList.add('hidden');
        const form = document.getElementById('add-course-form');
        if (form) form.reset();
        this.editingCourseId = null;
    }

    async getNextCourseIdGlobal() {
        if (!this.db || !window.firebaseDB) return this.generateCourseId();

        const { doc, runTransaction } = window.firebaseDB;
        const metaRef = doc(this.db, 'metadata', 'courses');

        try {
            const nextId = await runTransaction(this.db, async (transaction) => {
                const metaDoc = await transaction.get(metaRef);
                if (!metaDoc.exists()) {
                    // Initialize from current local max
                    let currentMax = 0;
                    this.courseLayouts.forEach(c => {
                        if (c.courseId && c.courseId.startsWith('C')) {
                            const num = parseInt(c.courseId.substring(1));
                            if (!isNaN(num) && num > currentMax) currentMax = num;
                        }
                    });
                    const startId = currentMax + 1;
                    transaction.set(metaRef, { lastId: startId });
                    return startId;
                } else {
                    const newId = (metaDoc.data().lastId || 0) + 1;
                    transaction.update(metaRef, { lastId: newId });
                    return newId;
                }
            });

            return `C${nextId.toString().padStart(3, '0')}`;
        } catch (e) {
            console.error("Global ID generation failed, falling back:", e);
            return this.generateCourseId();
        }
    }

    generateCourseId() {
        // Find the maximum numeric ID among existing layouts (Local Fallback)
        let maxNum = 0;
        this.courseLayouts.forEach(c => {
            if (c.courseId && c.courseId.startsWith('C')) {
                const num = parseInt(c.courseId.substring(1));
                if (!isNaN(num) && num > maxNum) maxNum = num;
            }
        });
        const nextId = maxNum + 1;
        // Format as C### (padding with zeros for at least 3 digits)
        return `C${nextId.toString().padStart(3, '0')}`;
    }

    async getNextTeeIdGlobal() {
        if (!this.db || !window.firebaseDB) return this.generateTeeId();

        const { doc, runTransaction } = window.firebaseDB;
        const metaRef = doc(this.db, 'metadata', 'tees');

        try {
            const nextId = await runTransaction(this.db, async (transaction) => {
                const metaDoc = await transaction.get(metaRef);
                if (!metaDoc.exists()) {
                    // Initialize from current local max
                    let maxNum = 0;
                    this.courseLayouts.forEach(c => {
                        if (c.tees) {
                            Object.values(c.tees).forEach(t => {
                                if (t.teeId && t.teeId.startsWith('T')) {
                                    const num = parseInt(t.teeId.substring(1));
                                    if (!isNaN(num) && num > maxNum) maxNum = num;
                                }
                            });
                        }
                    });
                    const startId = maxNum + 1;
                    transaction.set(metaRef, { lastId: startId });
                    return startId;
                } else {
                    const newId = (metaDoc.data().lastId || 0) + 1;
                    transaction.update(metaRef, { lastId: newId });
                    return newId;
                }
            });

            return `T${nextId.toString().padStart(3, '0')}`;
        } catch (e) {
            console.error("Global Tee ID generation failed, falling back:", e);
            return this.generateTeeId();
        }
    }

    generateTeeId() {
        // Find the maximum numeric ID among existing tees across all courses
        let maxNum = 0;
        this.courseLayouts.forEach(c => {
            if (c.tees) {
                Object.values(c.tees).forEach(t => {
                    if (t.teeId && t.teeId.startsWith('T')) {
                        const num = parseInt(t.teeId.substring(1));
                        if (!isNaN(num) && num > maxNum) maxNum = num;
                    }
                });
            }
        });
        const nextId = maxNum + 1;
        return `T${nextId.toString().padStart(3, '0')}`;
    }

    async handleAddCourse(e) {
        e.preventDefault();
        const name = document.getElementById('mgmt-course-name').value.trim();
        const state = document.getElementById('mgmt-course-state').value.trim();
        const country = document.getElementById('mgmt-course-country').value.trim();
        const typeEl = document.getElementById('mgmt-course-type');
        const publicPrivate = typeEl ? typeEl.value : '';

        if (!name) return;

        const saveBtn = e.target.querySelector('button[type="submit"]');
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }

        try {
            let courseData;
            const editingId = this.editingCourseId;

            if (editingId) {
                // Update existing
                const index = this.courseLayouts.findIndex(c => c.courseId === editingId);
                courseData = {
                    ...this.courseLayouts[index],
                    name: name,
                    state: state || '',
                    country: country || '',
                    public_private: publicPrivate || '',
                    updatedAt: new Date().toISOString()
                };
                this.courseLayouts[index] = courseData;
            } else {
                // Create new — use local ID generator to avoid blocking Firestore transaction
                const newId = this.generateCourseId();
                courseData = {
                    courseId: newId,
                    name: name,
                    state: state || '',
                    country: country || '',
                    public_private: publicPrivate || '',
                    tees: {},
                    updatedAt: new Date().toISOString(),
                    createdBy: this.user ? this.user.uid : 'anonymous'
                };
                this.courseLayouts.push(courseData);
            }

            // Sync to cloud (fire and forget — don't block UI)
            if (this.db && window.firebaseDB) {
                const { doc, setDoc } = window.firebaseDB;
                setDoc(doc(this.db, "courses", courseData.courseId), courseData, { merge: true })
                    .then(() => console.log("Course synced to cloud:", courseData.courseId))
                    .catch(err => console.error("Cloud sync failed (data saved locally):", err));
            }

            this.closeAddCourseModal();
            this.renderCourseManagement();
            this.selectMgmtCourse(courseData.courseId);
        } catch (err) {
            console.error("Failed to save course:", err);
            alert(`Error saving course: ${err.message}`);
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Course'; }
        }
    }

    openAddTeeModal(isEdit = false) {
        const modal = document.getElementById('add-tee-modal');
        const holeSelect = document.getElementById('mgmt-tee-holes');
        if (!modal) return;

        if (!isEdit) {
            this.editingTeeName = null;
            document.getElementById('add-tee-title').textContent = 'Add Tee Set';
            const saveBtn = document.querySelector('#add-tee-form button[type="submit"]');
            if (saveBtn) saveBtn.textContent = 'Save Tee Set';

            // Reset hole count select to 18
            if (holeSelect) holeSelect.value = '18';

            // Initial Grid Render (18 holes)
            this.renderHoleGridInTeeModal(18);

            // Populate Tee ID — reuse the cached pending ID if the user previously cancelled,
            // so we don't burn a new ID every time the modal is opened.
            const teeIdInput = document.getElementById('mgmt-tee-id');
            if (teeIdInput) teeIdInput.readOnly = true;

            if (this.pendingTeeId) {
                if (teeIdInput) teeIdInput.value = this.pendingTeeId;
            } else {
                this.getNextTeeIdGlobal().then(id => {
                    this.pendingTeeId = id;
                    const input = document.getElementById('mgmt-tee-id');
                    if (input) input.value = id;
                });
            }
        }

        modal.classList.remove('hidden');
    }

    renderHoleGridInTeeModal(count) {
        count = parseInt(count);
        const header = document.getElementById('mgmt-input-hole-header');
        const parRow = document.getElementById('mgmt-input-par-row');
        const yardRow = document.getElementById('mgmt-input-yardage-row');
        const hcpRow = document.getElementById('mgmt-input-handicap-row');

        if (header && parRow && yardRow && hcpRow) {
            header.innerHTML = `<tr><th style="min-width: 100px; text-align: left; padding-left: 15px;">Hole</th>${[...Array(count)].map((_, i) => `<th>${i + 1}</th>`).join('')}</tr>`;

            parRow.innerHTML = `<td style="min-width: 100px; text-align: left; padding-left: 15px;"><strong>Par</strong></td>` +
                [...Array(count)].map((_, i) => `<td style="padding: 5px;"><input type="number" class="grid-input" id="mgmt-par-${i + 1}" value="4" style="width: 42px; height: 36px; padding: 4px; text-align: center; border: 1px solid var(--border-color); border-radius: 6px;"></td>`).join('');

            yardRow.innerHTML = `<td style="min-width: 100px; text-align: left; padding-left: 15px;"><strong>Yardage</strong></td>` +
                [...Array(count)].map((_, i) => `<td style="padding: 5px;"><input type="number" class="grid-input" id="mgmt-yardage-${i + 1}" placeholder="Yds" style="width: 48px; height: 36px; padding: 4px; text-align: center; border: 1px solid var(--border-color); border-radius: 6px;"></td>`).join('');

            hcpRow.innerHTML = `<td style="min-width: 100px; text-align: left; padding-left: 15px;"><strong>Handicap</strong></td>` +
                [...Array(count)].map((_, i) => `<td style="padding: 5px;"><input type="number" class="grid-input" id="mgmt-handicap-${i + 1}" placeholder="HCP" style="width: 42px; height: 36px; padding: 4px; text-align: center; border: 1px solid var(--border-color); border-radius: 6px;"></td>`).join('');
        }
    }

    closeAddTeeModal() {
        const modal = document.getElementById('add-tee-modal');
        if (modal) modal.classList.add('hidden');
        const form = document.getElementById('add-tee-form');
        if (form) form.reset();
        this.editingTeeName = null;
        // NOTE: intentionally do NOT clear this.pendingTeeId here — if the user
        // cancelled, we want to reuse the same ID next time they open Add Tee.
    }

    async handleAddTee(e) {
        e.preventDefault();
        const courseId = this.selectedMgmtCourseId;
        const teeName = document.getElementById('mgmt-tee-color').value.trim();
        const teeId = document.getElementById('mgmt-tee-id').value.trim();
        const rating = parseFloat(document.getElementById('mgmt-tee-rating').value);
        const slope = parseInt(document.getElementById('mgmt-tee-slope').value);

        if (!courseId || !teeName) return;

        const holeCount = parseInt(document.getElementById('mgmt-tee-holes').value) || 18;
        const holes = [];
        for (let i = 1; i <= holeCount; i++) {
            const par = parseInt(document.getElementById(`mgmt-par-${i}`).value);
            const yds = parseInt(document.getElementById(`mgmt-yardage-${i}`).value);
            const hcp = parseInt(document.getElementById(`mgmt-handicap-${i}`).value);

            holes.push({
                num: i,
                par: isNaN(par) ? 4 : par,
                yardage: isNaN(yds) ? 0 : yds,
                handicap: isNaN(hcp) ? 0 : hcp
            });
        }

        const teeData = {
            teeId: teeId,
            rating: rating,
            slope: slope,
            holes: holes
        };

        const course = this.courseLayouts.find(c => c.courseId === courseId);
        if (!course) return;

        if (!course.tees) course.tees = {};

        // If we are editing and the name changed, delete the old entry
        if (this.editingTeeName && this.editingTeeName !== teeName) {
            delete course.tees[this.editingTeeName];
        }

        course.tees[teeName] = teeData;
        course.updatedAt = new Date().toISOString();

        // Sync to cloud (fire and forget — don't block UI)
        if (this.db && window.firebaseDB) {
            const { doc, setDoc } = window.firebaseDB;
            setDoc(doc(this.db, "courses", courseId), course, { merge: true })
                .then(() => console.log("Tee synced to cloud:", courseId, teeName))
                .catch(err => console.error("Tee cloud sync failed:", err));
        }

        this.editingTeeName = null;
        this.pendingTeeId = null; // ID was consumed — clear so a fresh one is fetched next time
        this.closeAddTeeModal();
        this.selectMgmtCourse(courseId);
        this.selectMgmtTee(courseId, teeName);
    }

    async deleteMgmtTee(courseId, teeName) {
        const course = this.courseLayouts.find(c => c.courseId === courseId);
        if (!course) return;

        if (!confirm(`Are you sure you want to delete the ${teeName} tee set for ${course.name}?`)) return;

        if (course.tees) {
            delete course.tees[teeName];

            if (this.db) {
                const { doc, setDoc } = window.firebaseDB || await import("https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js");
                await setDoc(doc(this.db, "courses", courseId), course);
            }

            this.selectMgmtCourse(courseId);
        }
    }

    bindCourseMgmtEvents() {
        const courseForm = document.getElementById('add-course-form');
        if (courseForm) courseForm.addEventListener('submit', (e) => this.handleAddCourse(e));

        const teeForm = document.getElementById('add-tee-form');
        if (teeForm) teeForm.addEventListener('submit', (e) => this.handleAddTee(e));
    }

    async handleBulkCourseUpload() {
        const textarea = document.getElementById('bulk-course-json');
        const status = document.getElementById('bulk-course-status');
        if (!textarea || !status) return;

        const raw = textarea.value.trim();
        if (!raw) {
            status.textContent = "Please paste JSON data first.";
            status.style.display = 'block';
            status.style.background = 'rgba(239, 68, 68, 0.1)';
            status.style.color = 'var(--primary-red)';
            return;
        }

        try {
            const data = JSON.parse(raw);
            if (!Array.isArray(data)) throw new Error("JSON must be an array of courses.");

            status.textContent = `Importing ${data.length} courses...`;
            status.style.display = 'block';
            status.style.background = 'rgba(59, 130, 246, 0.1)';
            status.style.color = 'var(--primary-blue)';

            const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js");

            for (const course of data) {
                if (!course.name) continue;
                const courseId = course.name.toLowerCase().replace(/[^a-z0-9]/g, '_');

                // Add/Update in local state
                const existingIndex = this.courseLayouts.findIndex(c => c.name === course.name);
                if (existingIndex !== -1) {
                    this.courseLayouts[existingIndex] = { ...this.courseLayouts[existingIndex], ...course, id: courseId, updatedAt: new Date().toISOString() };
                } else {
                    this.courseLayouts.push({ ...course, id: courseId, updatedAt: new Date().toISOString() });
                }

                // Sync to cloud
                if (this.db) {
                    const { doc, setDoc } = window.firebaseDB || await import("https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js");
                    await setDoc(doc(this.db, "courses", courseId), course, { merge: true });
                }
            }

            status.textContent = `Successfully imported ${data.length} courses!`;
            status.style.background = 'rgba(16, 185, 129, 0.1)';
            status.style.color = 'var(--primary-green)';
            textarea.value = '';

            // Refresh Course view data
            this.renderCourseManagement();
            this.renderCourseSearchList();

        } catch (e) {
            console.error("Bulk upload failed:", e);
            status.textContent = "Error: " + e.message;
            status.style.background = 'rgba(239, 68, 68, 0.1)';
            status.style.color = 'var(--primary-red)';
        }
    }

    normalizeCourse(name) {
        if (!name) return '';
        // Strip legacy suffix and trim
        let n = name.replace(/\s*\(9\s*Holes\s*x2\)/i, '').trim();
        // Basic title casing to merge "Osprey Point" and "Osprey point"
        return n.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }

    getEST(dateInput) {
        if (!dateInput) return { y: 1970, m: 0, d: 1, ts: 0, iso: '1970-01-01' };

        // Handle Firebase Timestamps
        let dateStr = dateInput;
        if (dateInput.toDate && typeof dateInput.toDate === 'function') {
            dateStr = dateInput.toDate().toISOString().split('T')[0];
        } else if (typeof dateInput !== 'string') {
            try {
                dateStr = new Date(dateInput).toISOString().split('T')[0];
            } catch (e) {
                dateStr = String(dateInput);
            }
        }

        let y, m, d;

        // Handle ISO string or YYYY-MM-DD
        if (typeof dateStr === 'string' && dateStr.includes('-')) {
            let clean = dateStr.split('T')[0];
            let parts = clean.split('-');
            if (parts.length === 3) {
                y = parseInt(parts[0]);
                m = parseInt(parts[1]) - 1;
                d = parseInt(parts[2]);
            }
        }
        // Handle MM/DD/YYYY
        else if (typeof dateStr === 'string' && dateStr.includes('/')) {
            let parts = dateStr.split('/');
            if (parts.length === 3) {
                m = parseInt(parts[0]) - 1;
                d = parseInt(parts[1]);
                y = parseInt(parts[2]);
                // Handle 2-digit years if any
                if (y < 100) y += 2000;
            }
        }

        // Fallback for any other format
        if (y === undefined) {
            const dt = new Date(dateStr);
            if (isNaN(dt.getTime())) {
                return { y: 1970, m: 0, d: 1, ts: 0, iso: '1970-01-01' };
            }
            y = dt.getUTCFullYear();
            m = dt.getUTCMonth();
            d = dt.getUTCDate();
        }

        const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        // Map to a stable UTC timestamp for comparison (Midnight UTC)
        const ts = new Date(iso + 'T00:00:00Z').getTime();
        return { y, m, d, ts, iso };
    }

    getRoundOriginalHoles(r) {
        if (!r) return 18;
        // Respect explicit fields first
        if (r.originalHoles) return Number(r.originalHoles);
        if (r.holes) return Number(r.holes);
        // Fallback for legacy data that might only have the string suffix
        if (r.course && r.course.toLowerCase().includes('(9 holes x2)')) return 9; // It was a physical 9-hole round
        return 18;
    }

    formatDateDisplay(dateStr) {
        const est = this.getEST(dateStr);
        if (!est || est.y === 1970 && dateStr !== '1970-01-01') return dateStr;
        return `${String(est.m + 1).padStart(2, '0')}/${String(est.d).padStart(2, '0')}/${est.y}`;
    }



    renderFilters(containerId, onUpdate) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Ensure class is correct for styling
        if (!container.classList.contains('dashboard-filters-row')) {
            container.className = 'dashboard-filters-row';
        }

        const years = [...new Set(this.rounds.map(r => this.getEST(r.date).y))].sort((a, b) => b - a);
        const holes = [18, 9];
        const courses = [...new Set(this.rounds.map(r => this.normalizeCourse(r.course)))].sort();
        const events = [...new Set(this.rounds.map(r => (r.event || '').trim()).filter(e => e !== ''))].sort();
        const pars = [3, 4, 5];

        // Only render structure if empty
        if (container.innerHTML.trim() === "") {
            container.innerHTML = `
                <div class="multi-select-container" id="${containerId}-years">
                    <div class="multi-select-trigger" onclick="this.parentElement.classList.toggle('active')">
                        <span class="selected-years-display">All Years</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                    <div class="multi-select-dropdown" id="${containerId}-year-options"></div>
                </div>
                <div class="multi-select-container" id="${containerId}-months">
                    <div class="multi-select-trigger" onclick="this.parentElement.classList.toggle('active')">
                        <span class="selected-months-display">All Months</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                    <div class="multi-select-dropdown" id="${containerId}-month-options"></div>
                </div>
                <div class="multi-select-container" id="${containerId}-holes">
                    <div class="multi-select-trigger" onclick="this.parentElement.classList.toggle('active')">
                        <span class="selected-holes-display">All Holes</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                    <div class="multi-select-dropdown" id="${containerId}-hole-options"></div>
                </div>
                <div class="multi-select-container" id="${containerId}-courses" style="min-width: 160px;">
                    <div class="multi-select-trigger" onclick="this.parentElement.classList.toggle('active')">
                        <span class="selected-courses-display">All Courses</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                    <div class="multi-select-dropdown" id="${containerId}-course-options"></div>
                </div>
                <div class="multi-select-container" id="${containerId}-events" style="min-width: 160px;">
                    <div class="multi-select-trigger" onclick="this.parentElement.classList.toggle('active')">
                        <span class="selected-events-display">All Events</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                    <div class="multi-select-dropdown" id="${containerId}-event-options"></div>
                </div>
                ${containerId === 'hole-dash-filters' ? `
                <div class="multi-select-container" id="${containerId}-pars" style="min-width: 160px;">
                    <div class="multi-select-trigger" onclick="this.parentElement.classList.toggle('active')">
                        <span class="selected-pars-display">All Pars</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                    <div class="multi-select-dropdown" id="${containerId}-par-options"></div>
                </div>
                ` : ''}
                <div class="multi-select-container" id="${containerId}-group-by" style="min-width: 160px;">
                    <div class="multi-select-trigger" onclick="this.parentElement.classList.toggle('active')">
                        <span class="selected-groupby-display">Group: Round</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                    <div class="multi-select-dropdown" id="${containerId}-groupby-options"></div>
                </div>
            `;

            if (!window._filterEventSetup) {
                document.addEventListener('click', (e) => {
                    if (!e.target.closest('.multi-select-container')) {
                        document.querySelectorAll('.multi-select-container').forEach(c => c.classList.remove('active'));
                    }
                });
                window._filterEventSetup = true;
            }
        }

        const clean = (name) => this.normalizeCourse(name);

        // Update displays
        const isAllY = this.filterYears.length === 0 || this.filterYears.length === years.length;
        const isNoneY = this.filterYears.includes('none');
        this.updateDisplay(container, '.selected-years-display', isAllY ? 'All Years' : (isNoneY ? '0 Selected' : (this.filterYears.length === 1 ? this.filterYears[0] : 'Multiple')));

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const isAllM = this.filterMonths.length === 0 || this.filterMonths.length === 12;
        const isNoneM = this.filterMonths.includes('none');
        this.updateDisplay(container, '.selected-months-display', isAllM ? 'All Months' : (isNoneM ? '0 Selected' : (this.filterMonths.length === 1 ? monthNames[this.filterMonths[0]] : 'Multiple')));

        const isAllH = this.filterHoles.length === 0 || this.filterHoles.length === 2;
        const isNoneH = this.filterHoles.includes('none');
        this.updateDisplay(container, '.selected-holes-display', isAllH ? 'All Holes' : (isNoneH ? '0 Selected' : (this.filterHoles.length === 1 ? this.filterHoles[0] + ' Holes' : 'Multiple')));

        const isAllC = this.filterCourses.length === 0 || this.filterCourses.length === courses.length;
        const isNoneC = this.filterCourses.includes('none');
        this.updateDisplay(container, '.selected-courses-display', isAllC ? 'All Courses' : (isNoneC ? '0 Selected' : (this.filterCourses.length === 1 ? clean(this.filterCourses[0]) : 'Multiple')));

        const isAllE = this.filterEvents.length === 0 || this.filterEvents.length === events.length;
        const isNoneE = this.filterEvents.includes('none');
        this.updateDisplay(container, '.selected-events-display', isAllE ? 'All Events' : (isNoneE ? '0 Selected' : (this.filterEvents.length === 1 ? this.filterEvents[0] : 'Multiple')));

        const isAllP = this.filterPars.length === 0 || this.filterPars.length === 3;
        const isNoneP = this.filterPars.includes('none');
        this.updateDisplay(container, '.selected-pars-display', isAllP ? 'All Pars' : (isNoneP ? '0 Selected' : (this.filterPars.length === 1 ? 'Par ' + this.filterPars[0] : 'Multiple')));

        const groupByOptions = [
            { value: 'round', label: 'Per Round' },
            { value: 'week', label: 'Per Week' },
            { value: 'month', label: 'Per Month' },
            { value: 'quarter', label: 'Per Quarter' },
            { value: 'year', label: 'Per Year' }
        ];
        const selGrp = groupByOptions.find(o => o.value === this.chartGroupBy) || groupByOptions[0];
        this.updateDisplay(container, '.selected-groupby-display', 'Group: ' + selGrp.label.replace('Per ', ''));

        // Populate lists
        const yOpts = document.getElementById(`${containerId}-year-options`);
        yOpts.innerHTML = `<div class="year-option select-all ${isAllY ? 'selected' : ''}" data-value="all"><input type="checkbox" ${isAllY ? 'checked' : ''}><strong>Select All</strong></div>` +
            years.map(y => `<div class="year-option ${(this.filterYears.includes(y) || isAllY) ? 'selected' : ''}" data-value="${y}"><input type="checkbox" ${(this.filterYears.includes(y) || isAllY) ? 'checked' : ''}><span>${y}</span></div>`).join('');

        const mOpts = document.getElementById(`${containerId}-month-options`);
        mOpts.innerHTML = `<div class="month-option select-all ${isAllM ? 'selected' : ''}" data-value="all"><input type="checkbox" ${isAllM ? 'checked' : ''}><strong>Select All</strong></div>` +
            monthNames.map((m, i) => `<div class="month-option ${(this.filterMonths.includes(i) || isAllM) ? 'selected' : ''}" data-value="${i}"><input type="checkbox" ${(this.filterMonths.includes(i) || isAllM) ? 'checked' : ''}><span>${m}</span></div>`).join('');

        const hOpts = document.getElementById(`${containerId}-hole-options`);
        hOpts.innerHTML = `<div class="hole-option select-all ${isAllH ? 'selected' : ''}" data-value="all"><input type="checkbox" ${isAllH ? 'checked' : ''}><strong>Select All</strong></div>` +
            holes.map(h => `<div class="hole-option ${(this.filterHoles.includes(h) || isAllH) ? 'selected' : ''}" data-value="${h}"><input type="checkbox" ${(this.filterHoles.includes(h) || isAllH) ? 'checked' : ''}><span>${h} Holes</span></div>`).join('');

        const cOpts = document.getElementById(`${containerId}-course-options`);
        cOpts.innerHTML = `<div class="course-option select-all ${isAllC ? 'selected' : ''}" data-value="all"><input type="checkbox" ${isAllC ? 'checked' : ''}><strong>Select All</strong></div>` +
            courses.map(c => `<div class="course-option ${(this.filterCourses.includes(c) || isAllC) ? 'selected' : ''}" data-value="${c}"><input type="checkbox" ${(this.filterCourses.includes(c) || isAllC) ? 'checked' : ''}><span>${clean(c)}</span></div>`).join('');

        const eOpts = document.getElementById(`${containerId}-event-options`);
        eOpts.innerHTML = `<div class="event-option select-all ${isAllE ? 'selected' : ''}" data-value="all"><input type="checkbox" ${isAllE ? 'checked' : ''}><strong>Select All</strong></div>` +
            events.map(e => `<div class="event-option ${(this.filterEvents.includes(e) || isAllE) ? 'selected' : ''}" data-value="${e}"><input type="checkbox" ${(this.filterEvents.includes(e) || isAllE) ? 'checked' : ''}><span>${e}</span></div>`).join('');

        if (containerId === 'hole-dash-filters') {
            const pOpts = document.getElementById(`${containerId}-par-options`);
            if (pOpts) {
                pOpts.innerHTML = `<div class="par-option select-all ${isAllP ? 'selected' : ''}" data-value="all"><input type="checkbox" ${isAllP ? 'checked' : ''}><strong>Select All</strong></div>` +
                    pars.map(p => `<div class="par-option ${(this.filterPars.includes(p) || isAllP) ? 'selected' : ''}" data-value="${p}"><input type="checkbox" ${(this.filterPars.includes(p) || isAllP) ? 'checked' : ''}><span>Par ${p}</span></div>`).join('');
            }
        }

        const gOpts = document.getElementById(`${containerId}-groupby-options`);
        gOpts.innerHTML = groupByOptions.map(opt => `<div class="group-option ${this.chartGroupBy === opt.value ? 'selected' : ''}" data-value="${opt.value}" style="cursor:pointer; padding: 8px 12px; border-radius: 4px; margin-bottom: 2px;"><span style="display:block;">${opt.label}</span></div>`).join('');

        // Bindings
        const bind = (list, selector, callback) => {
            list.querySelectorAll(selector).forEach(opt => {
                opt.onclick = (e) => {
                    e.stopPropagation();
                    callback(opt.dataset.value);
                    onUpdate();
                };
            });
        };

        bind(yOpts, '.year-option', (v) => {
            const isAll = this.filterYears.length === 0 || this.filterYears.length === years.length;
            if (v === 'all') {
                this.filterYears = isAll ? ['none'] : [];
            } else {
                const yr = parseInt(v);
                if (isAll || this.filterYears.includes('none')) {
                    this.filterYears = [yr];
                } else if (this.filterYears.includes(yr)) {
                    this.filterYears = this.filterYears.filter(x => x !== yr);
                } else {
                    this.filterYears.push(yr);
                }
                if (this.filterYears.length === years.length) this.filterYears = [];
                if (this.filterYears.length === 0) this.filterYears = ['none'];
            }
        });
        bind(mOpts, '.month-option', (v) => {
            const isAll = this.filterMonths.length === 0 || this.filterMonths.length === 12;
            if (v === 'all') {
                this.filterMonths = isAll ? ['none'] : [];
            } else {
                const idx = parseInt(v);
                if (isAll || this.filterMonths.includes('none')) {
                    this.filterMonths = [idx];
                } else if (this.filterMonths.includes(idx)) {
                    this.filterMonths = this.filterMonths.filter(x => x !== idx);
                } else {
                    this.filterMonths.push(idx);
                }
                if (this.filterMonths.length === 12) this.filterMonths = [];
                if (this.filterMonths.length === 0) this.filterMonths = ['none'];
            }
        });
        bind(hOpts, '.hole-option', (v) => {
            const isAll = this.filterHoles.length === 0 || this.filterHoles.length === 2;
            if (v === 'all') {
                this.filterHoles = isAll ? ['none'] : [];
            } else {
                const val = parseInt(v);
                if (isAll || this.filterHoles.includes('none')) {
                    this.filterHoles = [val];
                } else if (this.filterHoles.includes(val)) {
                    this.filterHoles = this.filterHoles.filter(x => x !== val);
                } else {
                    this.filterHoles.push(val);
                }
                if (this.filterHoles.length === 2) this.filterHoles = [];
                if (this.filterHoles.length === 0) this.filterHoles = ['none'];
            }
        });
        bind(cOpts, '.course-option', (v) => {
            const isAll = this.filterCourses.length === 0 || this.filterCourses.length === courses.length;
            if (v === 'all') {
                this.filterCourses = isAll ? ['none'] : [];
            } else {
                if (isAll || this.filterCourses.includes('none')) {
                    this.filterCourses = [v];
                } else if (this.filterCourses.includes(v)) {
                    this.filterCourses = this.filterCourses.filter(x => x !== v);
                } else {
                    this.filterCourses.push(v);
                }
                if (this.filterCourses.length === courses.length) this.filterCourses = [];
                if (this.filterCourses.length === 0) this.filterCourses = ['none'];
            }
        });
        bind(eOpts, '.event-option', (v) => {
            const isAll = this.filterEvents.length === 0 || this.filterEvents.length === events.length;
            if (v === 'all') {
                this.filterEvents = isAll ? ['none'] : [];
            } else {
                if (isAll || this.filterEvents.includes('none')) {
                    this.filterEvents = [v];
                } else if (this.filterEvents.includes(v)) {
                    this.filterEvents = this.filterEvents.filter(x => x !== v);
                } else {
                    this.filterEvents.push(v);
                }
                if (this.filterEvents.length === events.length) this.filterEvents = [];
                if (this.filterEvents.length === 0) this.filterEvents = ['none'];
            }
        });

        if (containerId === 'hole-dash-filters') {
            const pOpts = document.getElementById(`${containerId}-par-options`);
            if (pOpts) {
                bind(pOpts, '.par-option', (v) => {
                    const isAll = this.filterPars.length === 0 || this.filterPars.length === 3;
                    if (v === 'all') {
                        this.filterPars = isAll ? ['none'] : [];
                    } else {
                        const val = parseInt(v);
                        if (isAll || this.filterPars.includes('none')) {
                            this.filterPars = [val];
                        } else if (this.filterPars.includes(val)) {
                            this.filterPars = this.filterPars.filter(x => x !== val);
                        } else {
                            this.filterPars.push(val);
                        }
                        if (this.filterPars.length === 3) this.filterPars = [];
                        if (this.filterPars.length === 0) this.filterPars = ['none'];
                    }
                });
            }
        }
        bind(gOpts, '.group-option', (v) => {
            this.chartGroupBy = v;
            document.getElementById(`${containerId}-group-by`).classList.remove('active');
            onUpdate();
        });
    }

    updateDisplay(container, selector, text) {
        const el = container.querySelector(selector);
        if (el) el.textContent = text;
    }

    renderDashboard() {
        try {
            const emptyState = document.getElementById('dashboard-empty');
            const statsContainer = document.getElementById('dashboard-stats');
            const chartsContainer = document.getElementById('dashboard-charts');

            if (!this.rounds || this.rounds.length === 0) {
                if (emptyState) emptyState.style.display = 'flex';
                if (statsContainer) statsContainer.innerHTML = '';
                if (chartsContainer) chartsContainer.innerHTML = '';
                return;
            }
            if (emptyState) emptyState.style.display = 'none';

            // 1. Render/Update Filters
            let filterContainer = document.getElementById('dashboard-date-filters');
            const header = document.querySelector('.dashboard-header');
            if (!filterContainer && header) {
                filterContainer = document.createElement('div');
                filterContainer.id = 'dashboard-date-filters';
                header.parentNode.insertBefore(filterContainer, header.nextSibling);
            }
            this.renderFilters('dashboard-date-filters', () => this.renderDashboard());

            // Apply Filters
            const filteredRounds = this.rounds.filter(r => {
                const est = this.getEST(r.date);
                const yr = est.y;
                const mo = est.m;
                const normalizedRCourse = this.normalizeCourse(r.course);
                const origHoles = this.getRoundOriginalHoles(r);
                const rEvent = (r.event || '').trim();

                return (this.filterYears.length === 0 || this.filterYears.includes(yr)) &&
                    (this.filterMonths.length === 0 || this.filterMonths.includes(mo)) &&
                    (this.filterHoles.length === 0 || this.filterHoles.includes(origHoles)) &&
                    (this.filterCourses.length === 0 || this.filterCourses.includes(normalizedRCourse)) &&
                    (this.filterEvents.length === 0 || this.filterEvents.includes(rEvent));
            });


            if (filteredRounds.length === 0) {
                if (statsContainer) statsContainer.innerHTML = '<div class="card" style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-muted);">No rounds match your selection.</div>';
                if (chartsContainer) chartsContainer.innerHTML = '';
                return;
            }

            // 1. True physical holes for the "Total Holes" tile
            const physicalTotalHoles = filteredRounds.reduce((acc, r) => {
                if (r.originalHoles) return acc + Number(r.originalHoles);
                if (r.holes) return acc + Number(r.holes);
                // Fallback for legacy
                if (r.course && r.course.includes('(9 Holes x2)')) return acc + 9;
                return acc + 18;
            }, 0);

            // 2. Safely filter out empty/garbage rounds (e.g. score of 0 or absurdly low partials like 4)
            // A realistic 9-hole score is at least 25.
            const scoringRounds = filteredRounds.filter(r => (Number(r.score) || 0) > 20);

            // 3. Math Denominator: What fraction of 18 holes does the stored SCORE represent?
            const getScoringHoles = (r) => {
                if (!r) return 18;
                if (r.originalHoles) return Number(r.originalHoles);
                if (r.holes) return Number(r.holes);
                // Fallback for legacy
                if (r.course && r.course.includes('(9 Holes x2)')) return 9;
                return 18;
            };

            // Math Denominator: How many normalized benchmarks are we calculating?
            const mathScoringCount = scoringRounds.length;

            // NEW: Detect if we are looking ONLY at 9-hole rounds.
            // If so, we display raw 9-hole stats without doubling.
            const is9HoleOnly = this.filterHoles.length === 1 && Number(this.filterHoles[0]) === 9;
            const benchmarkHoles = is9HoleOnly ? 9 : 18;

            // Core sums across VALID rounds, manually scaling any 9-hole rounds by 2x for the dashboard benchmark UNLESS it's a 9-hole only view
            const scalingFactor = (r) => (benchmarkHoles === 18 && getScoringHoles(r) === 9) ? 2 : 1;

            const totalScoreSum = scoringRounds.reduce((acc, r) => {
                let s = Number(r.score) || 0;
                return acc + (s * scalingFactor(r));
            }, 0);
            const totalScoreToParSum = scoringRounds.reduce((acc, r) => {
                let s = Number(r.scoreToPar) || 0;
                return acc + (s * scalingFactor(r));
            }, 0);
            const totalPuttsSum = scoringRounds.reduce((acc, r) => {
                let p = Number(r.putts) || 0;
                return acc + (p * scalingFactor(r));
            }, 0);
            const totalGIR = scoringRounds.reduce((acc, r) => {
                let g = Number(r.gir) || 0;
                return acc + (g * scalingFactor(r));
            }, 0);
            const totalFIR = scoringRounds.reduce((acc, r) => {
                let f = Number(r.fir) || 0;
                return acc + (f * scalingFactor(r));
            }, 0);
            const totalFIRC = scoringRounds.reduce((acc, r) => {
                let fc = Number(r.firChances) || 0;
                return acc + (fc * scalingFactor(r));
            }, 0);
            const totalUDC = scoringRounds.reduce((acc, r) => {
                let c = Number(r.upDownChances) || 0;
                return acc + (c * scalingFactor(r));
            }, 0);
            const totalUDS = scoringRounds.reduce((acc, r) => {
                let s = Number(r.upDownSuccesses) || 0;
                return acc + (s * scalingFactor(r));
            }, 0);

            const totalCost = filteredRounds.reduce((acc, r) => acc + (Number(r.cost) || 0), 0);
            const totalWinnings = filteredRounds.reduce((acc, r) => acc + (Number(r.winnings) || 0), 0);

            // Normalized Averages (Benchmark explicitly mapped across valid round count)
            const count = filteredRounds.length;
            const uniqueCourseCount = new Set(filteredRounds.map(r => r.course).filter(Boolean)).size;
            const avgScore = mathScoringCount > 0 ? (totalScoreSum / mathScoringCount) : 0;
            const avgScoreToPar = mathScoringCount > 0 ? (totalScoreToParSum / mathScoringCount) : 0;
            const avgPutts = mathScoringCount > 0 ? (totalPuttsSum / mathScoringCount) : 0;
            const girPercent = mathScoringCount > 0 ? (totalGIR / (mathScoringCount * benchmarkHoles)) * 100 : 0;
            const firPercent = totalFIRC > 0 ? (totalFIR / totalFIRC) * 100 : 0;
            const scramblingPercent = totalUDC > 0 ? (totalUDS / totalUDC) * 100 : 0;

            // Count rounds where specific metrics were actually tracked
            const roundsWithFIR = scoringRounds.filter(r => (Number(r.firChances) || 0) > 0).length;

            // Per-round averages for absolute counts
            const avgHolesPerRound = benchmarkHoles;
            const avgGIRPerRound = mathScoringCount > 0 ? (totalGIR / mathScoringCount) : 0;
            const avgFIRPerRound = totalFIRC > 0 ? (totalFIR / totalFIRC) * (benchmarkHoles === 18 ? 14 : 7) : 0;
            const avgFIRCPerRound = totalFIRC > 0 ? (benchmarkHoles === 18 ? 14 : 7) : 0;
            const avgUDSPerRound = mathScoringCount > 0 ? (totalUDS / mathScoringCount) : 0;
            const avgUDCPerRound = mathScoringCount > 0 ? (totalUDC / mathScoringCount) : 0;

            // Best Score: Find lowest explicit rounds matching the current benchmark
            const targetScoreRounds = scoringRounds.filter(r => getScoringHoles(r) === benchmarkHoles);

            const bestRound = targetScoreRounds.reduce((best, r) => {
                let rScore = Number(r.score) || 200;
                let bScore = best ? (Number(best.score) || 200) : Infinity;
                return rScore < bScore ? r : best;
            }, null);

            const bestScore = bestRound ? (Number(bestRound.score) || '--') : '--';
            const bestScoreToPar = bestRound ? (Number(bestRound.scoreToPar) || 0) : 0;

            const courseCounts = filteredRounds.reduce((acc, r) => {
                const cName = r.course ? r.course.replace(' (9 Holes x2)', '').trim() : 'Unknown';
                acc[cName] = (acc[cName] || 0) + 1;
                return acc;
            }, {});
            let maxCourseCount = 0;
            let tiedCourses = [];
            for (const [course, c] of Object.entries(courseCounts)) {
                if (c > maxCourseCount) {
                    maxCourseCount = c;
                    tiedCourses = [course];
                } else if (c === maxCourseCount) {
                    tiedCourses.push(course);
                }
            }

            let mostPlayedCourse = '--';
            if (tiedCourses.length > 1) {
                mostPlayedCourse = 'Multiple Courses';
            } else if (tiedCourses.length === 1) {
                mostPlayedCourse = tiedCourses[0];
            }

            const monthSpan = filteredRounds.length > 1 ? (() => {
                const timestamps = filteredRounds.map(r => this.getEST(r.date).ts);
                const minTs = Math.min(...timestamps);
                const maxTs = Math.max(...timestamps);
                const minDate = new Date(minTs);
                const maxDate = new Date(maxTs);
                return (maxDate.getUTCFullYear() - minDate.getUTCFullYear()) * 12 + (maxDate.getUTCMonth() - minDate.getUTCMonth()) + 1;
            })() : 1;

            const avgRoundsPerMonth = (count / monthSpan).toFixed(1);

            const targets = this.getTargetMetrics();
            const benchmarkPar = benchmarkHoles === 18 ? 72 : 36;

            // Adjust targets if 9-hole benchmark
            const displayTargets = { ...targets };
            if (benchmarkHoles === 9) {
                displayTargets.score /= 2;
                displayTargets.putts /= 2;
            }

            const getColor = (val, target, lowerIsBetter) => {
                const isPassing = lowerIsBetter ? val <= target : val >= target;
                return isPassing ? 'var(--primary-green)' : '#ef4444';
            }; function getDiff(val) {
                if (val === 0) return 'E';
                return (val > 0 ? '+' : '') + Math.round(val);
            }

            statsContainer.innerHTML = `
                <div class="card stat-card">
                    <div class="stat-title">Avg Score (${benchmarkHoles} Holes)</div>
                    <div class="stat-value" style="color: ${getColor(avgScore, displayTargets.score, true)};">${avgScore.toFixed(1)}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Target: ${displayTargets.score}</div>
                </div>
                <div class="card stat-card">
                    <div class="stat-title">Avg Score to Par</div>
                    <div class="stat-value" style="color: ${getColor(avgScoreToPar, displayTargets.score - benchmarkPar, true)};">${avgScoreToPar > 0 ? '+' : ''}${avgScoreToPar.toFixed(1)}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Target: ${getDiff(displayTargets.score - benchmarkPar)}</div>
                </div>
                <div class="card stat-card">
                    <div class="stat-title">GIR %</div>
                    <div class="stat-value" style="color: ${getColor(girPercent, displayTargets.girPercent, false)};">${girPercent.toFixed(1)}% <span style="font-size: 0.9rem; color: var(--text-muted); font-weight: normal;">(${Math.round(avgGIRPerRound)}/${Math.round(avgHolesPerRound)})</span></div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Target: ${displayTargets.girPercent}% (${Math.round(displayTargets.girPercent / 100 * avgHolesPerRound)}/${Math.round(avgHolesPerRound)})</div>
                </div>
                <div class="card stat-card">
                    <div class="stat-title">FIR %</div>
                    <div class="stat-value" style="color: ${totalFIRC > 0 ? getColor(firPercent, displayTargets.firPercent, false) : 'var(--text-muted)'};">${totalFIRC > 0 ? firPercent.toFixed(1) + '%' : 'N/A'} <span style="font-size: 0.9rem; color: var(--text-muted); font-weight: normal;">(${totalFIRC > 0 ? Math.round(avgFIRPerRound) + '/' + Math.round(avgFIRCPerRound) : '--'})</span></div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Target: ${displayTargets.firPercent}% (${totalFIRC > 0 ? Math.round(displayTargets.firPercent / 100 * avgFIRCPerRound) : '--'}/${Math.round(avgFIRCPerRound)})</div>
                </div>
                <div class="card stat-card">
                    <div class="stat-title">Scrambling %</div>
                    <div class="stat-value" style="color: ${getColor(scramblingPercent, displayTargets.upDownPercent, false)};">${scramblingPercent.toFixed(1)}% <span style="font-size: 0.9rem; color: var(--text-muted); font-weight: normal;">(${Math.round(avgUDSPerRound)}/${Math.round(avgUDCPerRound)})</span></div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Target: ${displayTargets.upDownPercent}% (${Math.round(displayTargets.upDownPercent / 100 * avgUDCPerRound)}/${Math.round(avgUDCPerRound)})</div>
                </div>
                <div class="card stat-card">
                    <div class="stat-title">Avg Putts (${benchmarkHoles} Holes)</div>
                    <div class="stat-value" style="color: ${getColor(avgPutts, displayTargets.putts, true)};">${Math.round(avgPutts)}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Target: ${Math.round(displayTargets.putts)}</div>
                </div>
                <div class="card stat-card">
                    <div class="stat-title"># of Rounds</div>
                    <div class="stat-value" style="color: var(--text-primary);">${count}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">${uniqueCourseCount} course${uniqueCourseCount !== 1 ? 's' : ''} · Total Filtered</div>
                </div>
                <div class="card stat-card">
                    <div class="stat-title">Best Score (${benchmarkHoles} Holes)</div>
                    <div class="stat-value" style="color: var(--primary-green);">${bestScore}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">(${bestScoreToPar > 0 ? '+' : ''}${bestScoreToPar} to par)</div>
                </div>
                <div class="card stat-card">
                    <div class="stat-title">Most Played</div>
                    <div class="stat-value" style="color: var(--primary-green); font-size: 1.1rem; line-height: 1.5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${mostPlayedCourse}">${mostPlayedCourse}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">(${maxCourseCount} rounds • ${Math.round((maxCourseCount / count) * 100)}%)</div>
                </div>
                <div class="card stat-card">
                    <div class="stat-title">Total Cost</div>
                    <div class="stat-value" style="color: var(--text-primary);">$${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">For Filtered Rounds</div>
                </div>
                <div class="card stat-card">
                    <div class="stat-title">Total Winnings</div>
                    <div class="stat-value" style="color: ${totalWinnings >= 0 ? 'var(--primary-green)' : '#ef4444'};">$${totalWinnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">For Filtered Rounds</div>
                </div>
                <div class="card stat-card">
                    <div class="stat-title">Total Holes</div>
                    <div class="stat-value" style="color: var(--text-primary);">${physicalTotalHoles.toLocaleString()}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">Played</div>
                </div>
            `;

            this.renderCharts(filteredRounds);
        } catch (e) {
            console.error("Dashboard error:", e);
            const container = document.getElementById('dashboard-stats');
            if (container) container.innerHTML = `<div class="card" style="grid-column: 1 / -1; padding: 20px; color: #ef4444; border: 1px solid #ef4444;">Error loading dashboard metrics. Please check your data.</div>`;
        }
    }

    renderHoleDash() {
        try {
            const emptyState = document.getElementById('hole-dash-empty');
            const statsContainer = document.getElementById('hole-dash-stats');
            const tableContainer = document.getElementById('hole-dash-table');
            const chartsContainer = document.getElementById('hole-dash-charts');

            // Check for hole data
            const roundsWithDetails = this.rounds.filter(r => r.holeData && r.holeData.length > 0);

            if (roundsWithDetails.length === 0) {
                if (emptyState) emptyState.style.display = 'block';
                if (statsContainer) statsContainer.innerHTML = '';
                if (tableContainer) tableContainer.innerHTML = '';
                if (chartsContainer) chartsContainer.innerHTML = '';
                return;
            }
            if (emptyState) emptyState.style.display = 'none';

            // 1. Render/Update Filters
            this.renderFilters('hole-dash-filters', () => this.renderHoleDash());

            // Apply Filters
            const filteredRounds = roundsWithDetails.filter(r => {
                const est = this.getEST(r.date);
                const yr = est.y;
                const mo = est.m;
                const normalizedRCourse = this.normalizeCourse(r.course);
                const origHoles = this.getRoundOriginalHoles(r);
                const rEvent = (r.event || '').trim();

                return (this.filterYears.length === 0 || this.filterYears.includes(yr)) &&
                    (this.filterMonths.length === 0 || this.filterMonths.includes(mo)) &&
                    (this.filterHoles.length === 0 || this.filterHoles.includes(origHoles)) &&
                    (this.filterCourses.length === 0 || this.filterCourses.includes(normalizedRCourse)) &&
                    (this.filterEvents.length === 0 || this.filterEvents.includes(rEvent));
            });

            if (filteredRounds.length === 0) {
                if (statsContainer) statsContainer.innerHTML = '<div class="card" style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-muted);">No rounds with detailed data match your selection.</div>';
                if (tableContainer) tableContainer.innerHTML = '';
                if (chartsContainer) chartsContainer.innerHTML = '';
                return;
            }

            // Aggregate Hole Data
            const holeStats = {};
            for (let i = 1; i <= 18; i++) {
                holeStats[i] = { hole: i, totalScore: 0, totalPutts: 0, totalGIR: 0, totalFIR: 0, count: 0, firChances: 0, par: 0, parCount: 0 };
            }

            const parStats = {
                3: { count: 0, totalScore: 0, totalPar: 0, totalGIR: 0 },
                4: { count: 0, totalScore: 0, totalPar: 0, totalGIR: 0, totalFIR: 0, firChances: 0 },
                5: { count: 0, totalScore: 0, totalPar: 0, totalGIR: 0, totalFIR: 0, firChances: 0 }
            };

            filteredRounds.forEach(r => {
                if (!r.holeData) return;
                r.holeData.forEach(hd => {
                    let holeNum = parseInt(hd.hole);
                    const hPar = parseInt(hd.par);

                    // Par Filter
                    if (this.filterPars.length > 0 && !this.filterPars.includes(hPar)) return;

                    // FURNACE BROOK SPECIAL CASE: Map 10-18 to 1-9
                    if (r.course && r.course.toLowerCase().includes('furnace brook') && holeNum > 9) {
                        holeNum -= 9;
                    }

                    if (holeStats[holeNum]) {
                        const s = holeStats[holeNum];
                        const score = Number(hd.score) || 0;
                        const putts = Number(hd.putts) || 0;
                        const isGIR = hd.gir === true || hd.gir === 'true';

                        s.totalScore += score;
                        s.totalPutts += putts;
                        if (isGIR) s.totalGIR++;

                        if (hPar > 3) {
                            if (hd.fir === true || hd.fir === 'true' || (Array.isArray(hd.fir) && hd.fir.some(f => f === true || f === 'true'))) {
                                // If array (Par 5), count hits. For Par 4, it's just a boolean.
                                if (Array.isArray(hd.fir)) {
                                    hd.fir.forEach(f => {
                                        s.firChances++;
                                        if (f === true || f === 'true') s.totalFIR++;
                                    });
                                } else {
                                    s.totalFIR++;
                                    s.firChances++;
                                }
                            } else {
                                s.firChances += (hPar === 5 ? 2 : 1);
                            }
                        }

                        if (hPar) {
                            s.par += hPar;
                            s.parCount++;
                        }
                        s.count++;

                        // Par Stats Aggregation
                        if (parStats[hPar]) {
                            const ps = parStats[hPar];
                            ps.count++;
                            ps.totalScore += score;
                            ps.totalPar += hPar;
                            if (isGIR) ps.totalGIR++;
                            if (hPar > 3) {
                                if (Array.isArray(hd.fir)) {
                                    hd.fir.forEach(f => {
                                        ps.firChances++;
                                        if (f === true || f === 'true') ps.totalFIR++;
                                    });
                                } else {
                                    ps.firChances++;
                                    if (hd.fir === true || hd.fir === 'true') ps.totalFIR++;
                                }
                            }
                        }
                    }
                });
            });

            // Render Table
            let tableHtml = `
                <thead>
                    <tr>
                        <th>Hole</th>
                        <th>Avg Score</th>
                        <th>Avg vs Par</th>
                        <th>Avg Putts</th>
                        <th>GIR %</th>
                        <th>FIR %</th>
                        <th>Rounds</th>
                    </tr>
                </thead>
                <tbody>
            `;

            const activeHoles = Object.values(holeStats).filter(s => s.count > 0);
            activeHoles.forEach(s => {
                const avgScore = s.totalScore / s.count;
                const avgPar = s.parCount > 0 ? s.par / s.parCount : 4;
                const avgVsPar = avgScore - avgPar;
                const avgPutts = s.totalPutts / s.count;
                const girPct = (s.totalGIR / s.count) * 100;
                const firPct = s.firChances > 0 ? (s.totalFIR / s.firChances) * 100 : 0;

                tableHtml += `
                    <tr>
                        <td><strong>${s.hole}</strong> <span style="font-size: 0.75rem; color: var(--text-muted);">(Par ${Math.round(avgPar)})</span></td>
                        <td style="color: ${avgVsPar <= 0 ? 'var(--primary-green)' : 'inherit'}">${avgScore.toFixed(1)}</td>
                        <td style="color: ${avgVsPar <= 0 ? 'var(--primary-green)' : '#ef4444'}">${avgVsPar > 0 ? '+' : ''}${avgVsPar.toFixed(1)}</td>
                        <td>${avgPutts.toFixed(1)}</td>
                        <td>${girPct.toFixed(0)}%</td>
                        <td>${s.firChances > 0 ? firPct.toFixed(0) + '%' : 'N/A'}</td>
                        <td style="font-size: 0.8rem; color: var(--text-muted);">${s.count}</td>
                    </tr>
                `;
            });
            tableHtml += '</tbody>';
            tableContainer.innerHTML = tableHtml;            // Render Par Breakdown Tiles
            statsContainer.innerHTML = Object.entries(parStats)
                .filter(([p, s]) => this.filterPars.length === 0 || this.filterPars.includes(parseInt(p)))
                .map(([p, s]) => {
                    const avgScore = s.count > 0 ? s.totalScore / s.count : 0;
                    const avgPar = s.count > 0 ? s.totalPar / s.count : p;
                    const avgVsPar = avgScore - avgPar;
                    const girPct = s.count > 0 ? (s.totalGIR / s.count) * 100 : 0;
                    const firPct = s.firChances > 0 ? (s.totalFIR / s.firChances) * 100 : 0;

                    return `
                        <div class="card stat-card">
                            <div class="stat-title">Par ${p} Averages</div>
                            <div class="stat-value" style="color: ${avgVsPar <= 0 ? 'var(--primary-green)' : '#ef4444'}">${avgScore.toFixed(2)} <span style="font-size: 0.8rem; font-weight: normal;">(${avgVsPar > 0 ? '+' : ''}${avgVsPar.toFixed(2)})</span></div>
                            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">GIR: ${girPct.toFixed(0)}% ${p > 3 ? `• FIR: ${firPct.toFixed(0)}%` : ''}</div>
                        </div>
                    `;
                }).join('');

            this.renderHoleCharts(activeHoles, parStats);
            this.renderParTrendChart(filteredRounds);
        } catch (e) {
            console.error("Hole Dash error:", e);
            const container = document.getElementById('hole-dash-stats');
            if (container) container.innerHTML = `<div class="card" style="grid-column: 1 / -1; padding: 20px; color: #ef4444; border: 1px solid #ef4444;">Error loading hole analytics. Please check your detailed round data.</div>`;
        }
    }

    getSortLabel() {
        switch (this.chartSortDir) {
            case 'chrono-asc': return 'Oldest First';
            case 'chrono-desc': return 'Newest First';
            case 'val-asc': return 'Low to High';
            case 'val-desc': return 'High to Low';
            default: return 'Sort Order';
        }
    }

    renderHoleCharts(activeHoles, parStats) {
        const container = document.getElementById('hole-dash-charts');
        if (!container) return;

        container.innerHTML = `
            <div class="card chart-wrapper">
                <h3 style="margin-bottom: 1rem; font-size: 1.1rem; color: var(--text-light);">Avg Score vs Par by Hole</h3>
                <div style="height: 300px; position: relative;">
                    <canvas id="holeVsParChart"></canvas>
                </div>
            </div>
            <div class="card chart-wrapper">
                <h3 style="margin-bottom: 1rem; font-size: 1.1rem; color: var(--text-light);">Performance by Par Type (Avg vs Par)</h3>
                <div style="height: 300px; position: relative;">
                    <canvas id="parComparisonChart"></canvas>
                </div>
            </div>
        `;

        // Use setTimeout to ensure canvas is rendered
        setTimeout(() => {
            const ctx = document.getElementById('holeVsParChart');
            if (!ctx) return;

            const labels = activeHoles.map(s => `Hole ${s.hole}`);
            const data = activeHoles.map(s => (s.totalScore / s.count) - (s.parCount > 0 ? s.par / s.parCount : 4));

            if (this.holeChartInstance) {
                this.holeChartInstance.destroy();
            }

            this.holeChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Avg Score vs Par',
                        data: data,
                        backgroundColor: data.map(v => v > 0 ? 'rgba(239, 68, 68, 0.6)' : 'rgba(16, 185, 129, 0.6)'),
                        borderColor: data.map(v => v > 0 ? '#ef4444' : 'var(--primary-green)'),
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(255,255,255,0.05)' },
                            ticks: { color: 'var(--text-muted)' }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: 'var(--text-muted)' }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (context) => `Avg vs Par: ${context.parsed.y > 0 ? '+' : ''}${context.parsed.y.toFixed(2)}`
                            }
                        }
                    }
                }
            });

            const ctx2 = document.getElementById('parComparisonChart');
            if (!ctx2) return;

            const selectedPars = [3, 4, 5].filter(p => this.filterPars.length === 0 || this.filterPars.includes(p));
            const parLabels = selectedPars.map(p => 'Par ' + p);
            const parData = selectedPars.map(p => {
                const s = parStats[p];
                return s.count > 0 ? (s.totalScore / s.count) - (s.totalPar / s.count) : 0;
            });

            if (this.parChartInstance) {
                this.parChartInstance.destroy();
            }

            this.parChartInstance = new Chart(ctx2, {
                type: 'bar',
                data: {
                    labels: parLabels,
                    datasets: [{
                        label: 'Avg vs Par',
                        data: parData,
                        backgroundColor: parData.map(v => v > 0 ? 'rgba(239, 68, 68, 0.6)' : 'rgba(16, 185, 129, 0.6)'),
                        borderColor: parData.map(v => v > 0 ? '#ef4444' : 'var(--primary-green)'),
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: 'rgba(255,255,255,0.05)' },
                            ticks: { color: 'var(--text-muted)' }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: 'var(--text-muted)' }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (context) => `Avg vs Par: ${context.parsed.y > 0 ? '+' : ''}${context.parsed.y.toFixed(2)}`
                            }
                        }
                    }
                }
            });
        }, 100);
    }

    renderParTrendChart(filteredRounds) {
        const container = document.getElementById('hole-dash-trend');
        if (!container) return;

        const statOptions = [
            { value: 'score', label: 'Avg Score' },
            { value: 'scoreToPar', label: 'Avg vs Par' },
            { value: 'putts', label: 'Avg Putts' },
            { value: 'girPercent', label: 'GIR %' },
            { value: 'firPercent', label: 'FIR %' }
        ];

        const optionsHtml = statOptions.map(opt =>
            `<option value="${opt.value}" ${this.holeChartParStat === opt.value ? 'selected' : ''}>${opt.label}</option>`
        ).join('');

        container.innerHTML = `
            <div class="card chart-wrapper">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 10px;">
                    <h3 style="margin:0; font-size: 1.1rem; color: var(--text-light);">Trend by Par Type</h3>
                    <select id="par-stat-filter" class="form-control" style="width: auto; padding: 0.25rem 0.5rem; background: var(--bg-dark); color: black; border: 1px solid var(--border-color); border-radius: 4px;">
                        ${optionsHtml}
                    </select>
                </div>
                <div style="height: 350px; position: relative;">
                    <canvas id="parTrendChart"></canvas>
                </div>
                <div id="par-trend-legend" style="display: flex; justify-content: center; gap: 20px; margin-top: 15px; font-size: 0.85rem;">
                    ${(this.filterPars.length === 0 || this.filterPars.includes(3)) ? '<div style="display: flex; align-items: center; gap: 6px;"><span style="width: 12px; height: 12px; border-radius: 50%; background: #60a5fa;"></span> Par 3</div>' : ''}
                    ${(this.filterPars.length === 0 || this.filterPars.includes(4)) ? '<div style="display: flex; align-items: center; gap: 6px;"><span style="width: 12px; height: 12px; border-radius: 50%; background: #fbbf24;"></span> Par 4</div>' : ''}
                    ${(this.filterPars.length === 0 || this.filterPars.includes(5)) ? '<div style="display: flex; align-items: center; gap: 6px;"><span style="width: 12px; height: 12px; border-radius: 50%; background: #34d399;"></span> Par 5</div>' : ''}
                </div>
            </div>
        `;

        const filter = document.getElementById('par-stat-filter');
        if (filter) {
            filter.onchange = (e) => {
                this.holeChartParStat = e.target.value;
                this.renderParTrendChart(filteredRounds);
            };
        }

        // Aggregate data by date and par
        const sortedRounds = [...filteredRounds].sort((a, b) => this.getEST(a.date).ts - this.getEST(b.date).ts);
        const groups = {};

        sortedRounds.forEach(r => {
            const est = this.getEST(r.date);
            const d = new Date(est.iso + 'T12:00:00');
            let key = '';
            let label = '';

            if (this.chartGroupBy === 'round') {
                key = est.iso;
                label = `${String(est.m + 1).padStart(2, '0')}/${String(est.d).padStart(2, '0')}/${String(est.y).slice(-2)}`;
            } else if (this.chartGroupBy === 'week') {
                const firstDayOfYear = new Date(est.y, 0, 1);
                const pastDaysOfYear = (d - firstDayOfYear) / 86400000;
                const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
                key = `${est.y}-W${weekNum}`;
                label = `Wk ${weekNum} '${String(est.y).slice(-2)}`;
            } else if (this.chartGroupBy === 'month') {
                key = `${est.y}-${String(est.m + 1).padStart(2, '0')}`;
                label = `${d.toLocaleString('default', { month: 'short' })} '${String(est.y).slice(-2)}`;
            } else if (this.chartGroupBy === 'quarter') {
                const q = Math.floor(est.m / 3) + 1;
                key = `${est.y}-Q${q}`;
                label = `Q${q} '${String(est.y).slice(-2)}`;
            } else if (this.chartGroupBy === 'year') {
                key = `${est.y}`;
                label = `${est.y}`;
            }

            if (!groups[key]) {
                groups[key] = {
                    label: label,
                    stats: {
                        3: { score: 0, count: 0, putts: 0, gir: 0, par: 0 },
                        4: { score: 0, count: 0, putts: 0, gir: 0, par: 0, fir: 0, firChances: 0 },
                        5: { score: 0, count: 0, putts: 0, gir: 0, par: 0, fir: 0, firChances: 0 }
                    }
                };
            }

            if (r.holeData) {
                r.holeData.forEach(hd => {
                    const p = parseInt(hd.par);
                    if (groups[key].stats[p]) {
                        const s = groups[key].stats[p];
                        s.score += (Number(hd.score) || 0);
                        s.count++;
                        s.putts += (Number(hd.putts) || 0);
                        s.par += p;
                        if (hd.gir === true || hd.gir === 'true') s.gir++;
                        if (p > 3) {
                            if (Array.isArray(hd.fir)) {
                                hd.fir.forEach(f => {
                                    s.firChances++;
                                    if (f === true || f === 'true') s.fir++;
                                });
                            } else {
                                s.firChances++;
                                if (hd.fir === true || hd.fir === 'true') s.fir++;
                            }
                        }
                    }
                });
            }
        });

        const labels = Object.values(groups).map(g => g.label);
        const par3Data = [];
        const par4Data = [];
        const par5Data = [];

        const getVal = (s) => {
            if (s.count === 0) return null;
            switch (this.holeChartParStat) {
                case 'score': return s.score / s.count;
                case 'scoreToPar': return (s.score / s.count) - (s.par / s.count);
                case 'putts': return s.putts / s.count;
                case 'girPercent': return (s.gir / s.count) * 100;
                case 'firPercent': return s.firChances > 0 ? (s.fir / s.firChances) * 100 : 0;
                default: return 0;
            }
        };

        Object.values(groups).forEach(g => {
            par3Data.push(getVal(g.stats[3]));
            par4Data.push(getVal(g.stats[4]));
            par5Data.push(getVal(g.stats[5]));
        });

        setTimeout(() => {
            const ctx = document.getElementById('parTrendChart');
            if (!ctx) return;

            if (this.parTrendChartInstance) {
                this.parTrendChartInstance.destroy();
            }

            this.parTrendChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        { par: 3, label: 'Par 3', data: par3Data, borderColor: '#60a5fa' },
                        { par: 4, label: 'Par 4', data: par4Data, borderColor: '#fbbf24' },
                        { par: 5, label: 'Par 5', data: par5Data, borderColor: '#34d399' }
                    ].filter(ds => this.filterPars.length === 0 || this.filterPars.includes(ds.par))
                        .map(ds => ({
                            label: ds.label,
                            data: ds.data,
                            borderColor: ds.borderColor,
                            backgroundColor: 'transparent',
                            tension: 0.3,
                            pointRadius: 4,
                            pointHoverRadius: 6,
                            spanGaps: true
                        }))
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    scales: {
                        y: {
                            grid: { color: 'rgba(255,255,255,0.05)' },
                            ticks: { color: 'var(--text-muted)' }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: 'var(--text-muted)', maxRotation: 45, minRotation: 45 }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.9)',
                            titleColor: '#fff',
                            bodyColor: '#fff',
                            borderColor: 'rgba(255,255,255,0.1)',
                            borderWidth: 1,
                            padding: 12,
                            callbacks: {
                                label: (context) => {
                                    let val = context.parsed.y;
                                    if (val === null) return null;
                                    let label = context.dataset.label + ': ';
                                    if (this.holeChartParStat === 'scoreToPar') label += (val > 0 ? '+' : '') + val.toFixed(2);
                                    else if (this.holeChartParStat.includes('Percent')) label += val.toFixed(0) + '%';
                                    else label += val.toFixed(2);
                                    return label;
                                }
                            }
                        }
                    }
                }
            });
        }, 100);
    }

    renderCharts(filteredRounds = this.rounds) {
        const chartsContainer = document.getElementById('dashboard-charts');
        if (!chartsContainer) return;

        // Define available stats for the dropdown
        const statOptions = [
            { value: 'score', label: 'Total Score' },
            { value: 'scoreToPar', label: 'Score to Par' },
            { value: 'putts', label: 'Putts' },
            { value: 'puttsPerHole', label: 'Putts Per Hole' },
            { value: 'gir', label: 'Greens in Regulation' },
            { value: 'girPercent', label: 'GIR %' },
            { value: 'fir', label: 'Fairways in Regulation' },
            { value: 'firPercent', label: 'FIR %' },
            { value: 'upDownChances', label: 'Scrambling Chances' },
            { value: 'upDownSuccesses', label: 'Scrambling Successes' },
            { value: 'upDownPercent', label: 'Scrambling %' },
            { value: 'threePutts', label: '3 Putts' },
            { value: 'lostBalls', label: 'Lost Balls' },
            { value: 'penaltyStrokes', label: 'Penalty Strokes' },
            { value: 'cost', label: 'Total Cost' },
            { value: 'winnings', label: 'Total Winnings' },
            { value: 'roundCount', label: '# of Rounds' }
        ];

        const optionsHtml = statOptions.map(opt =>
            `<option value="${opt.value}" ${this.currentChartStat === opt.value ? 'selected' : ''}>${opt.label}</option>`
        ).join('');

        const optionsHtmlSecondary = `<option value="none" ${this.secondaryChartStat === 'none' ? 'selected' : ''}>Secondary: None</option>` +
            statOptions.map(opt =>
                `<option value="${opt.value}" ${this.secondaryChartStat === opt.value ? 'selected' : ''}>Secondary: ${opt.label}</option>`
            ).join('');

        chartsContainer.innerHTML = `
            <div class="card chart-wrapper" style="grid-column: 1 / -1; height: auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 10px;">
                    <h3 style="margin:0; font-size: 1.1rem; color: var(--text-light);">Trend Indicator</h3>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                        <select id="chart-sort-select" class="form-control" style="width: auto; padding: 0.25rem 0.5rem; background: var(--bg-dark); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px; min-width: 120px;">
                            <option value="chrono-asc" ${this.chartSortDir === 'chrono-asc' ? 'selected' : ''}>Oldest First</option>
                            <option value="chrono-desc" ${this.chartSortDir === 'chrono-desc' ? 'selected' : ''}>Newest First</option>
                            <option value="val-asc" ${this.chartSortDir === 'val-asc' ? 'selected' : ''}>Low to High</option>
                            <option value="val-desc" ${this.chartSortDir === 'val-desc' ? 'selected' : ''}>High to Low</option>
                        </select>
                        <select id="stat-filter" class="form-control" style="width: auto; padding: 0.25rem 0.5rem; background: var(--bg-dark); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px;">
                            ${optionsHtml}
                        </select>
                        <select id="stat-filter-secondary" class="form-control" style="width: auto; padding: 0.25rem 0.5rem; background: var(--bg-dark); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 4px;">
                            ${optionsHtmlSecondary}
                        </select>
                    </div>
                </div>
                <div class="chart-container" style="position: relative; height: 350px;">
                    <canvas id="primaryChart"></canvas>
                </div>
            </div>
            <div class="card chart-wrapper" style="grid-column: 1 / -1;">
                <canvas id="distributionChart"></canvas>
            </div>
        `;

        const statFilter = document.getElementById('stat-filter');
        if (statFilter) {
            statFilter.onchange = (e) => {
                this.currentChartStat = e.target.value;
                this.renderCharts(filteredRounds);
            };
        }

        const secondaryFilter = document.getElementById('stat-filter-secondary');
        if (secondaryFilter) {
            secondaryFilter.onchange = (e) => {
                this.secondaryChartStat = e.target.value;
                this.renderCharts(filteredRounds);
            };
        }

        const sortSelect = document.getElementById('chart-sort-select');
        if (sortSelect) {
            sortSelect.onchange = (e) => {
                this.chartSortDir = e.target.value;
                this.renderCharts(filteredRounds);
            };
        }

        // Grouping Logic
        const sortedRounds = [...filteredRounds].sort((a, b) => this.getEST(a.date).ts - this.getEST(b.date).ts);
        const groups = {};

        sortedRounds.forEach(r => {
            const est = this.getEST(r.date);
            const d = new Date(est.iso + 'T12:00:00'); // Local mid-day for label generation safely
            let key = '';
            let label = '';

            if (this.chartGroupBy === 'round') {
                key = est.iso;
                label = `${String(est.m + 1).padStart(2, '0')}/${String(est.d).padStart(2, '0')}/${String(est.y).slice(-2)}`;
            } else if (this.chartGroupBy === 'week') {
                const firstDayOfYear = new Date(est.y, 0, 1);
                const pastDaysOfYear = (d - firstDayOfYear) / 86400000;
                const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
                key = `${est.y} -W${weekNum} `;
                label = `Wk ${weekNum} '${String(est.y).slice(-2)}`;
            } else if (this.chartGroupBy === 'month') {
                key = `${est.y}-${String(est.m + 1).padStart(2, '0')}`;
                label = `${d.toLocaleString('default', { month: 'short' })} '${String(est.y).slice(-2)}`;
            } else if (this.chartGroupBy === 'quarter') {
                const q = Math.floor(est.m / 3) + 1;
                key = `${est.y}-Q${q}`;
                label = `Q${q} '${String(est.y).slice(-2)}`;
            } else if (this.chartGroupBy === 'year') {
                key = `${est.y}`;
                label = `${est.y}`;
            }

            if (!groups[key]) {
                groups[key] = {
                    label: label, count: 0, holes: 0, score: 0, putts: 0, gir: 0, fir: 0,
                    eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubleBogeys: 0, tripleBogeys: 0,
                    otherScore: 0, upDownChances: 0, upDownSuccesses: 0, firChances: 0,
                    threePutts: 0, lostBalls: 0, penaltyStrokes: 0, scoreToPar: 0,
                    cost: 0, winnings: 0, courses: []
                };
            }

            const g = groups[key];
            g.count++;
            g.holes += (r.holes || 18);
            g.score += (r.score || 0);
            g.putts += (r.putts || 0);
            g.gir += (r.gir || 0);
            g.fir += (r.fir || 0);
            g.eagles += (r.eagles || 0);
            g.birdies += (r.birdies || 0);
            g.pars += (r.pars || 0);
            g.bogeys += (r.bogeys || 0);
            g.doubleBogeys += (r.doubleBogeys || 0);
            g.tripleBogeys += (r.tripleBogeys || 0);
            g.otherScore += (r.otherScore || 0);
            g.upDownChances += (r.upDownChances || 0);
            g.upDownSuccesses += (r.upDownSuccesses || 0);
            g.firChances += (r.firChances || 0);
            g.threePutts += (r.threePutts || 0);
            g.lostBalls += (r.lostBalls || 0);
            g.penaltyStrokes += (r.penaltyStrokes || 0);
            g.scoreToPar += (r.scoreToPar || 0);
            g.cost += (r.cost || 0);
            g.winnings += (r.winnings || 0);
            if (r.course && !g.courses.includes(r.course)) {
                g.courses.push(r.course);
            }
        });

        // NEW: Detect if we are looking ONLY at 9-hole rounds for the chart benchmark.
        const is9HoleOnly = this.filterHoles.length === 1 && Number(this.filterHoles[0]) === 9;
        const benchmarkHoles = is9HoleOnly ? 9 : 18;

        const chartData = Object.values(groups).map(g => {
            const factorBenchmark = g.holes > 0 ? (benchmarkHoles / g.holes) : 1;
            return {
                ...g,
                score: g.score * factorBenchmark,
                putts: g.putts * factorBenchmark,
                gir: g.gir * factorBenchmark,
                fir: g.fir * factorBenchmark,
                scoreToPar: g.scoreToPar * factorBenchmark,
                roundCount: g.count,
                girPercent: g.holes > 0 ? (g.gir / g.holes) * 100 : 0,
                firPercent: g.firChances > 0 ? (g.fir / g.firChances) * 100 : 0,
                upDownPercent: g.upDownChances > 0 ? (g.upDownSuccesses / g.upDownChances) * 100 : 0,
                puttsPerHole: g.holes > 0 ? (g.putts / g.holes) : 0,
                cost: g.cost,
                winnings: g.winnings,
                courses: g.courses
            };
        });

        const getVal = (r, stat) => Math.round((r[stat] || 0) * 10) / 10;

        // Apply Chart Sorting (Asc/Desc by Time or Value)
        if (this.chartSortDir === 'val-asc') {
            chartData.sort((a, b) => (getVal(a, this.currentChartStat) || 0) - (getVal(b, this.currentChartStat) || 0));
        } else if (this.chartSortDir === 'val-desc') {
            chartData.sort((a, b) => (getVal(b, this.currentChartStat) || 0) - (getVal(a, this.currentChartStat) || 0));
        } else if (this.chartSortDir === 'chrono-desc' || this.chartSortDir === 'desc') {
            chartData.reverse(); // Groups are initially asc
        }

        const labels = chartData.map(g => g.label);

        if (this.primaryChartInstance) this.primaryChartInstance.destroy();
        if (this.distChartInstance) this.distChartInstance.destroy();

        const datasets = [{
            label: statOptions.find(o => o.value === this.currentChartStat).label,
            data: chartData.map(r => getVal(r, this.currentChartStat)),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 3,
            tension: 0.3,
            fill: true,
            yAxisID: 'y'
        }];

        if (this.secondaryChartStat !== 'none') {
            datasets.push({
                label: statOptions.find(o => o.value === this.secondaryChartStat).label,
                data: chartData.map(r => getVal(r, this.secondaryChartStat)),
                borderColor: '#f59e0b',
                borderWidth: 3,
                tension: 0.3,
                yAxisID: 'y1'
            });
        }

        this.primaryChartInstance = new Chart(document.getElementById('primaryChart'), {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: false, title: { display: true, text: datasets[0].label, color: '#10b981' } },
                    y1: { display: this.secondaryChartStat !== 'none', position: 'right', title: { display: true, text: datasets[1]?.label, color: '#f59e0b' } }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            afterLabel: function (context) {
                                // Only add the course info to the primary dataset tooltip (index 0) to avoid duplication
                                if (context.datasetIndex !== 0) return null;
                                const dataIndex = context.dataIndex;
                                const item = chartData[dataIndex];
                                const courses = item.courses;
                                if (!courses || courses.length === 0) return '';
                                const cleanedCourses = courses.map(c => c.replace(' (9 Holes x2)', '').trim());

                                let extraInfo = '';
                                if (item.cost !== 0 || item.winnings !== 0) {
                                    extraInfo = ` | Cost: $${(item.cost || 0).toFixed(2)} | Winnings: $${(item.winnings || 0).toFixed(2)}`;
                                }

                                const courseText = cleanedCourses.length === 1 ? 'Course: ' + cleanedCourses[0] : 'Courses: ' + cleanedCourses.join(', ');
                                return courseText + extraInfo;
                            }
                        }
                    }
                }
            }
        });

        this.distChartInstance = new Chart(document.getElementById('distributionChart'), {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Eagles', data: chartData.map(r => (r.eagles / r.holes) * 100), backgroundColor: '#fcd34d' },
                    { label: 'Birdies', data: chartData.map(r => (r.birdies / r.holes) * 100), backgroundColor: '#10b981' },
                    { label: 'Pars', data: chartData.map(r => (r.pars / r.holes) * 100), backgroundColor: '#3b82f6' },
                    { label: 'Bogeys', data: chartData.map(r => (r.bogeys / r.holes) * 100), backgroundColor: '#f97316' },
                    { label: 'Dbl Bogeys+', data: chartData.map(r => ((r.doubleBogeys + r.tripleBogeys + r.otherScore) / r.holes) * 100), backgroundColor: '#ef4444' }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { x: { stacked: true }, y: { stacked: true, max: 100 } },
                plugins: { title: { display: true, text: 'Scoring Distribution (%)' } }
            }
        });
    }



    sortHistory(col) {
        if (this.historySortCol === col) {
            this.historySortDir = this.historySortDir === 'asc' ? 'desc' : 'asc';
        } else {
            this.historySortCol = col;
            this.historySortDir = col === 'date' || col === 'course' ? 'asc' : 'desc'; // Default numerical to desc (highest first, or lowest depending on user pref, simple toggle is fine)
        }
        this.renderHistory();
    }

    renderHistory() {
        try {
            // Initialize export panel on first render
            this.renderExportPanel();

            // Setup search listener if not exists
            const searchInput = document.getElementById('history-search');
            if (searchInput && !searchInput.dataset.listening) {
                searchInput.addEventListener('input', (e) => {
                    this.historySearch = e.target.value.toLowerCase();
                    this.renderHistory();
                });
                searchInput.dataset.listening = 'true';
            }

            const tbody = document.getElementById('history-table-body');
            if (!tbody) return;

            // Apply Filters (Same as Dashboard for consistency)
            let filteredRounds = (this.rounds || []).filter(r => {
                if (!r) return false;
                const est = this.getEST(r.date);
                const yr = est.y;
                const mo = est.m;
                const normalizedRCourse = this.normalizeCourse(r.course);
                const origHoles = this.getRoundOriginalHoles(r);

                return (this.filterYears.length === 0 || this.filterYears.includes(yr)) &&
                    (this.filterMonths.length === 0 || this.filterMonths.includes(mo)) &&
                    (this.filterCourses.length === 0 || this.filterCourses.includes(normalizedRCourse));
            });

            // Apply Search Filter
            if (this.historySearch) {
                const s = String(this.historySearch || '').toLowerCase();
                filteredRounds = filteredRounds.filter(r => {
                    const course = String(r.course || '').toLowerCase();
                    const date = String(r.date || '');
                    return course.includes(s) || date.includes(s);
                });
            }

            // Apply Sorting
            filteredRounds.sort((a, b) => {
                let valA = a[this.historySortCol];
                let valB = b[this.historySortCol];

                // Handle special cases
                if (this.historySortCol === 'date') {
                    valA = this.getEST(valA).ts;
                    valB = this.getEST(valB).ts;
                } else if (this.historySortCol === 'course' || this.historySortCol === 'teeName') {
                    valA = valA ? String(valA).toLowerCase() : '';
                    valB = valB ? String(valB).toLowerCase() : '';
                } else {
                    // Ensure numerical for other columns
                    valA = Number(valA) || 0;
                    valB = Number(valB) || 0;
                }

                if (valA < valB) return this.historySortDir === 'asc' ? -1 : 1;
                if (valA > valB) return this.historySortDir === 'asc' ? 1 : -1;
                return 0;
            });



            // Update sort indicators in header
            document.querySelectorAll('.sort-icon').forEach(el => el.textContent = '⇅');
            const activeHeader = document.getElementById(`sort-${this.historySortCol}`);
            if (activeHeader) {
                const icon = activeHeader.querySelector('.sort-icon');
                if (icon) icon.textContent = this.historySortDir === 'asc' ? '↑' : '↓';
            }

            if (filteredRounds.length === 0) {
                tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--text-muted); padding: 40px;">No rounds match the current filters.</td></tr>`;
                return;
            }

            tbody.innerHTML = filteredRounds.map(round => {
                if (!round) return '';
                const num = String(round.roundNum || '?').padStart(3, '0');
                const score = Number(round.score) || 0;
                const scoreToPar = Number(round.scoreToPar) || 0;
                const fir = Number(round.fir) || 0;
                const gir = Number(round.gir) || 0;
                const putts = Math.round(Number(round.putts) || 0);
                const penalties = Number(round.penaltyStrokes) || 0;
                const udS = Number(round.upDownSuccesses) || 0;
                const udC = Number(round.upDownChances) || 0;
                const scramblingPct = udC > 0 ? Math.round((udS / udC) * 100) : 0;

                return `
                <tr onclick="window.app.showRoundDetails('${round.id}')" style="cursor: pointer;">
                    <td style="text-align:center;" onclick="event.stopPropagation()"><input type="checkbox" class="history-row-checkbox" value="${round.id}"></td>
                    <td style="color:var(--text-muted); font-size:0.8rem; white-space:nowrap;">#${num}</td>
                    <td>${this.formatDateDisplay(round.date)}</td>
                    <td style="font-weight: 500; color: var(--primary-green)">${String(round.course || 'Unknown').trim()}</td>
                    <td style="font-weight: 500; color: var(--text-primary)">${round.teeName || '---'}</td>
                    <td style="font-weight: 700;">${score}</td>
                    <td>${scoreToPar > 0 ? '+' : ''}${scoreToPar}</td>
                    <td>${fir}</td>
                    <td>${gir}</td>
                    <td>${udS}/${udC} <span style="font-size:0.75em;color:var(--text-muted)">(${scramblingPct}%)</span></td>
                    <td>${putts}</td>
                    <td>${penalties}</td>
                    <td onclick="event.stopPropagation()">
                        <button class="btn btn-secondary" onclick="window.app.editRound('${round.id}')" style="padding: 4px 8px; font-size: 0.8rem; margin-right: 4px;">Edit</button>
                        <button class="btn btn-danger" onclick="window.app.deleteRound('${round.id}')" style="padding: 4px 8px; font-size: 0.8rem;">Delete</button>
                    </td>
                </tr>`;
            }).join('');
        } catch (e) {
            console.error("Error rendering history:", e);
            const tbody = document.getElementById('history-table-body');
            if (tbody) tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: #ef4444; padding: 40px;">Error loading history. Please check console for details.</td></tr>`;
        }
    }

    showRoundDetails(id) {
        const round = this.rounds.find(r => r.id === id);
        if (!round) return;

        const modal = document.getElementById('round-details-modal');
        const content = document.getElementById('round-details-content');

        const girPercent = Math.round((round.gir || 0) / (round.holes || 18) * 100);
        const firPercent = (round.firChances || 0) > 0 ? Math.round((round.fir || 0) / (round.firChances || 0) * 100) : 0;
        const scramblingPercent = (round.upDownChances || 0) > 0 ? Math.round((round.upDownSuccesses || 0) / (round.upDownChances || 0) * 100) : 0;

        const num = String(round.roundNum || '?').padStart(3, '0');
        content.innerHTML = `
            <div style="margin-bottom: 25px;">
                <h2 style="margin: 0; font-size: 1.8rem; color: var(--text-primary);"><span style="color: var(--text-muted); font-size: 0.9em; font-weight: 400; margin-right: 10px;">#${num}</span>${round.course ? this.normalizeCourse(round.course) : ''}</h2>
                <div style="color: var(--text-muted); margin-top: 5px; font-size: 1rem;">${this.formatDateDisplay(round.date)}</div>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 15px; margin-bottom: 30px;">
                <div class="card" style="padding: 15px; text-align: center; background: var(--bg-dark);">
                    <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 5px;">Score</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary);">${round.score} (${round.scoreToPar > 0 ? '+' : ''}${round.scoreToPar})</div>
                </div>
                <div class="card" style="padding: 15px; text-align: center; background: var(--bg-dark);">
                    <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 5px;">Putts</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary);">${Math.round(round.putts || 0)}</div>
                </div>
                <div class="card" style="padding: 15px; text-align: center; background: var(--bg-dark);">
                    <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 5px;">GIR</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary);">${round.gir}/${round.holes || 18} (${girPercent}%)</div>
                </div>
                <div class="card" style="padding: 15px; text-align: center; background: var(--bg-dark);">
                    <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 5px;">Fairways Hits (FIR)</div>
                    <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-primary);">${round.firChances > 0 ? `${round.fir}/${round.firChances} (${firPercent}%)` : 'N/A'}</div>
                </div>
                <div class="card" style="padding: 15px; text-align: center; background: var(--bg-dark); grid-column: span 2;">
                    <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 5px;">Putter Used</div>
                    <div style="font-size: 1.2rem; font-weight: 600; color: var(--primary-green);">${round.putter || 'Not specified'}</div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-bottom: 30px;">
                <div>
                    <h3 style="margin-top: 0; color: var(--text-light); font-size: 1.1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 15px;">Scoring Breakdown</h3>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <div style="display: flex; justify-content: space-between;">
                            <span>Eagles:</span>
                            <span style="font-weight: 600;">${round.eagles || 0}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #10b981;">Birdies:</span>
                            <span style="font-weight: 600; color: #10b981;">${round.birdies || 0}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #3b82f6;">Pars:</span>
                            <span style="font-weight: 600; color: #3b82f6;">${round.pars || 0}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #f97316;">Bogeys:</span>
                            <span style="font-weight: 600; color: #f97316;">${round.bogeys || 0}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #ef4444;">Double Bogeys:</span>
                            <span style="font-weight: 600; color: #ef4444;">${round.doubleBogeys || 0}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="color: #991b1b;">Triples+:</span>
                            <span style="font-weight: 600; color: #991b1b;">${round.tripleBogeys || 0}</span>
                        </div>
                    </div>
                </div>
                <div>
                    <h3 style="margin-top: 0; color: var(--text-light); font-size: 1.1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 15px;">Advanced Stats</h3>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <div style="display: flex; justify-content: space-between;">
                            <span>Scrambling:</span>
                            <span style="font-weight: 600;">${round.upDownSuccesses || 0}/${round.upDownChances || 0} (${scramblingPercent}%)</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>3-Putts:</span>
                            <span style="font-weight: 600;">${round.threePutts || 0}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Lost Balls:</span>
                            <span style="font-weight: 600;">${round.lostBalls || 0}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Penalty Strokes:</span>
                            <span style="font-weight: 600;">${round.penaltyStrokes || 0}</span>
                        </div>
                        ${(round.cost || round.winnings) ? `
                        <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border-color); padding-top: 8px; margin-top: 2px;">
                            <span>Cost:</span>
                            <span style="font-weight: 600;">$${(round.cost || 0).toFixed(2)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Winnings:</span>
                            <span style="font-weight: 600; color: ${(round.winnings || 0) > 0 ? '#10b981' : (round.winnings < 0 ? '#ef4444' : 'inherit')};">$${(round.winnings || 0).toFixed(2)}</span>
                        </div>` : ''}
                        ${(round.event || round.group) ? `
                        <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border-color); padding-top: 8px; margin-top: 2px;">
                            <span>Event:</span>
                            <span style="font-weight: 600;">${round.event || '—'}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Group:</span>
                            <span style="font-weight: 600;">${round.group || '—'}</span>
                        </div>` : ''}
                        ${(round.weather || round.temperature) ? `
                        <div style="display: flex; justify-content: space-between; border-top: 1px solid var(--border-color); padding-top: 8px; margin-top: 2px;">
                            <span>Weather:</span>
                            <span style="font-weight: 600;">${round.weather || '—'}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span>Temp:</span>
                            <span style="font-weight: 600;">${round.temperature ? round.temperature + '°' : '—'}</span>
                        </div>` : ''}
                    </div>
                </div>
            </div>

            ${round.notes ? `
            <div style="margin-bottom: 30px;">
                <h3 style="margin-top: 0; color: var(--text-light); font-size: 1.1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 15px;">Notes</h3>
                <div style="background: var(--bg-dark); padding: 15px; border-radius: 8px; border: 1px solid var(--border-color); color: var(--text-primary); white-space: pre-wrap; font-size: 0.95rem; line-height: 1.5;">${round.notes}</div>
            </div>
            ` : ''}

            ${round.holeData && round.holeData.length > 0 ? `
            <div style="margin-bottom: 30px;">
                <h3 style="margin-top: 0; color: var(--text-light); font-size: 1.1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 15px;">Detailed Scorecard</h3>
                <div style="overflow-x: auto; -webkit-overflow-scrolling: touch; background: var(--bg-dark); border-radius: 8px; border: 1px solid var(--border-color);">
                    <table class="data-table" style="min-width: 600px; margin: 0; width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: rgba(255,255,255,0.05); border-bottom: 1px solid var(--border-color);">
                                <th style="padding: 12px 10px; text-align: center; color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase;">Hole</th>
                                <th style="padding: 12px 10px; text-align: center; color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase;">Par</th>
                                <th style="padding: 12px 10px; text-align: center; color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase;">Score</th>
                                <th style="padding: 12px 10px; text-align: center; color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase;">Putts</th>
                                <th style="padding: 12px 10px; text-align: center; color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase;">FIR</th>
                                <th style="padding: 12px 10px; text-align: center; color: var(--text-muted); font-size: 0.85rem; text-transform: uppercase;">GIR</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${round.holeData.map((h, i) => h ? `
                                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                                    <td style="padding: 10px; text-align: center; font-weight: 600; color: var(--text-light);">${h.hole}</td>
                                    <td style="padding: 10px; text-align: center;">${h.par || '-'}</td>
                                    <td style="padding: 10px; text-align: center; font-weight: bold; color: ${h.score < h.par ? '#10b981' : (h.score > h.par ? '#ef4444' : 'var(--text-primary)')};">${h.score || '-'}</td>
                                    <td style="padding: 10px; text-align: center;">${h.putts || '-'}</td>
                                    <td style="padding: 10px; text-align: center;">${h.par === 3 ? '<span style="color:var(--text-muted); font-size:0.8em;">N/A</span>' : ((Array.isArray(h.fir) ? h.fir.some(v => v) : h.fir) ? '✅' : '❌')}</td>
                                    <td style="padding: 10px; text-align: center;">${h.gir ? '✅' : '❌'}</td>
                                </tr>
                            ` : '').join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            ` : ''}

            <div style="display: flex; gap: 10px; margin-top: 20px;">
                <button class="btn btn-secondary" style="flex: 1;" onclick="window.app.editRound('${round.id}'); document.getElementById('round-details-modal').classList.add('hidden');">Edit Round</button>
                <button class="btn btn-primary" style="flex: 1;" onclick="document.getElementById('round-details-modal').classList.add('hidden')">Close Details</button>
            </div>
        `;

        modal.classList.remove('hidden');
    }

    async deleteRound(id) {
        if (confirm('Are you sure you want to delete this round?')) {
            this.rounds = this.rounds.filter(r => r.id !== id);

            if (this.user && this.user.uid === 'local') {
                this.saveData();
            } else {
                await this.deleteRoundFromCloud(id);
            }

            this.render();
        }
    }

    toggleSelectAll(el) {
        const checkboxes = document.querySelectorAll('.history-row-checkbox');
        checkboxes.forEach(cb => cb.checked = el.checked);
    }

    renderExportPanel() {
        const container = document.getElementById('export-field-checkboxes');
        if (!container || container.dataset.initialized) return;
        container.dataset.initialized = 'true';

        const fields = [
            { key: 'roundNumber', label: 'Round #' },
            { key: 'date', label: 'Date' },
            { key: 'course', label: 'Course' },
            { key: 'coursePar', label: 'Course Par' },
            { key: 'score', label: 'Score' },
            { key: 'scoreToPar', label: 'Score to Par' },
            { key: 'putts', label: 'Putts' },
            { key: 'threePutts', label: '3-Putts' },
            { key: 'gir', label: 'GIR' },
            { key: 'fir', label: 'FIR Hits' },
            { key: 'firChances', label: 'FIR Chances' },
            { key: 'firPercent', label: 'FIR %' },
            { key: 'upDownChances', label: 'Scrambling Chances' },
            { key: 'upDownSuccesses', label: 'Scrambling Successes' },
            { key: 'scramblingPercent', label: 'Scrambling %' },
            { key: 'eagles', label: 'Eagles' },
            { key: 'birdies', label: 'Birdies' },
            { key: 'pars', label: 'Pars' },
            { key: 'bogeys', label: 'Bogeys' },
            { key: 'doubleBogeys', label: 'Double Bogeys' },
            { key: 'tripleBogeys', label: 'Triple Bogeys' },
            { key: 'lostBalls', label: 'Lost Balls' },
            { key: 'penaltyStrokes', label: 'Penalty Strokes' },
        ];

        const defaultOn = ['roundNumber', 'date', 'course', 'score', 'scoreToPar', 'putts', 'gir', 'fir', 'firPercent', 'scramblingPercent', 'penaltyStrokes'];

        container.innerHTML = fields.map(f => `
            <label style="display:flex; align-items:center; gap:6px; font-size:0.85rem; color:var(--text-muted); cursor:pointer;">
                <input type="checkbox" name="export-field" value="${f.key}" ${defaultOn.includes(f.key) ? 'checked' : ''} style="accent-color:var(--primary-green);">
                ${f.label}
            </label>
        `).join('');

        // Store field metadata for export
        this._exportFields = fields;
    }

    toggleAllExportFields(checked) {
        document.querySelectorAll('[name="export-field"]').forEach(cb => cb.checked = checked);
    }

    exportCSV() {
        const startDate = document.getElementById('export-start-date')?.value;
        const endDate = document.getElementById('export-end-date')?.value;
        const selectedKeys = [...document.querySelectorAll('[name="export-field"]:checked')].map(cb => cb.value);

        if (selectedKeys.length === 0) {
            alert('Please select at least one field to export.');
            return;
        }

        // Parse filter dates for robust comparison (Anchor to UTC Midnight for stable range)
        const startTs = startDate ? this.getEST(startDate).ts : null;
        const endTs = endDate ? this.getEST(endDate).ts : null;

        // Sort and filter rounds
        let exportRounds = [...this.rounds].sort((a, b) => this.getEST(a.date).ts - this.getEST(b.date).ts);

        if (startTs || endTs) {
            exportRounds = exportRounds.filter(r => {
                const rTs = this.getEST(r.date).ts;
                if (startTs && rTs < startTs) return false;
                if (endTs && rTs > endTs) return false;
                return true;
            });
        }

        if (exportRounds.length === 0) {
            alert('No rounds found in the selected date range.');
            return;
        }

        const fieldLabels = {
            roundNumber: 'Round #', date: 'Date', course: 'Course', coursePar: 'Course Par',
            score: 'Score', scoreToPar: 'Score to Par', putts: 'Putts', threePutts: '3-Putts',
            gir: 'GIR', fir: 'FIR Hits', firChances: 'FIR Chances', firPercent: 'FIR %',
            upDownChances: 'Scrambling Chances', upDownSuccesses: 'Scrambling Successes',
            scramblingPercent: 'Scrambling %', eagles: 'Eagles', birdies: 'Birdies', pars: 'Pars',
            bogeys: 'Bogeys', doubleBogeys: 'Double Bogeys', tripleBogeys: 'Triple Bogeys',
            lostBalls: 'Lost Balls', penaltyStrokes: 'Penalty Strokes'
        };

        const escape = (val) => {
            const s = String(val ?? '');
            return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
        };

        const getValue = (r, key) => {
            if (key === 'roundNumber') return r.roundNum || '';
            if (key === 'firPercent') return r.firChances > 0 ? Math.round(r.fir / r.firChances * 1000) / 10 : 0;
            if (key === 'scramblingPercent') return r.upDownChances > 0 ? Math.round(r.upDownSuccesses / r.upDownChances * 1000) / 10 : 0;
            return r[key] ?? '';
        };

        const header = selectedKeys.map(k => escape(fieldLabels[k] || k)).join(',');
        const rows = exportRounds.map(r => selectedKeys.map(k => escape(getValue(r, k))).join(','));
        const csvContent = [header, ...rows].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `8iron_rounds_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    exportCoursesCSV() {
        if (this.courseLayouts.length === 0) {
            alert('No courses found to export.');
            return;
        }

        const escape = (val) => {
            const s = String(val ?? '');
            return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
        };

        const header = ['ID', 'Name', 'State', 'Country', 'Tee Count'].join(',');
        const rows = this.courseLayouts.map(c => {
            const teeCount = c.tees ? Object.keys(c.tees).length : 0;
            return [
                escape(c.courseId || '---'),
                escape(c.name),
                escape(c.state || ''),
                escape(c.country || ''),
                teeCount
            ].join(',');
        });

        const csvContent = [header, ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `8iron_courses_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    importCoursesCSV() {
        document.getElementById('course-csv-upload').click();
    }

    async handleCourseCSVUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target.result;
            Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
                complete: async (results) => {
                    const rows = results.data;
                    let importedCount = 0;

                    for (const row of rows) {
                        const idFromCsv = (row['ID'] || row['id'] || '').trim();
                        const name = (row['Name'] || row['name'] || row['Course'] || row['course'] || '').trim();
                        if (!name && !idFromCsv) continue;

                        const state = (row['State'] || row['state'] || '').trim();
                        const country = (row['Country'] || row['country'] || '').trim();
                        const publicPrivate = (row['Public/Private'] || row['public_private'] || row['Type'] || row['type'] || '').trim();

                        // Match by ID first, then by normalized Name
                        let existingIndex = -1;
                        if (idFromCsv && idFromCsv.startsWith('C')) {
                            existingIndex = this.courseLayouts.findIndex(c => c.courseId === idFromCsv);
                        }
                        if (existingIndex === -1 && name) {
                            const normalizedName = this.normalizeCourse(name);
                            existingIndex = this.courseLayouts.findIndex(c => this.normalizeCourse(c.name) === normalizedName);
                        }

                        let courseData;
                        if (existingIndex !== -1) {
                            const existing = this.courseLayouts[existingIndex];
                            courseData = {
                                ...existing,
                                name: name || existing.name, // Support renaming via ID match if name changed
                                state: state || existing.state || '',
                                country: country || existing.country || '',
                                public_private: publicPrivate || existing.public_private || '',
                                updatedAt: new Date().toISOString()
                            };
                            this.courseLayouts[existingIndex] = courseData;
                        } else {
                            const newId = await this.getNextCourseIdGlobal();
                            courseData = {
                                courseId: idFromCsv && idFromCsv.startsWith('C') ? idFromCsv : newId,
                                name: name,
                                state: state,
                                country: country,
                                public_private: publicPrivate,
                                tees: {},
                                updatedAt: new Date().toISOString(),
                                createdBy: this.user ? this.user.uid : 'anonymous'
                            };
                            this.courseLayouts.push(courseData);
                        }

                        // Sync to cloud
                        if (this.db) {
                            const { doc, setDoc } = window.firebaseDB || await import("https://www.gstatic.com/firebasejs/11.4.0/firebase-firestore.js");
                            await setDoc(doc(this.db, "courses", courseData.courseId), courseData, { merge: true });
                        }
                        importedCount++;
                    }

                    alert(`Successfully imported ${importedCount} courses.`);
                    this.renderCourseManagement();
                    this.renderCourseSearchList();
                }
            });
        };
        reader.readAsText(file);
        event.target.value = ''; // Reset for next upload
    }

    exportHoleDataCSV() {
        const startDate = document.getElementById('export-start-date')?.value;
        const endDate = document.getElementById('export-end-date')?.value;

        // Parse filter dates
        const startTs = startDate ? this.getEST(startDate).ts : null;
        const endTs = endDate ? this.getEST(endDate).ts : null;

        // Sort and filter rounds
        let exportRounds = [...this.rounds].sort((a, b) => this.getEST(a.date).ts - this.getEST(b.date).ts);

        if (startTs || endTs) {
            exportRounds = exportRounds.filter(r => {
                const rTs = this.getEST(r.date).ts;
                if (startTs && rTs < startTs) return false;
                if (endTs && rTs > endTs) return false;
                return true;
            });
        }

        // Only include rounds with hole data
        exportRounds = exportRounds.filter(r => r.holeData && r.holeData.length > 0);

        if (exportRounds.length === 0) {
            alert('No rounds with detailed hole data found in the selected date range.');
            return;
        }

        const escape = (val) => {
            const s = String(val ?? '');
            return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
        };

        const header = ['Round #', 'Date', 'Course', 'Hole', 'Par', 'Score', 'Putts', 'FIR', 'GIR'].map(escape).join(',');

        const rows = [];
        exportRounds.forEach(r => {
            r.holeData.forEach(h => {
                rows.push([
                    r.roundNum || '',
                    r.date || '',
                    r.course || '',
                    h.hole || '',
                    h.par || '',
                    h.score || '',
                    h.putts || '',
                    h.par === 3 ? 'N/A' : (h.fir ? 'Hit' : 'Miss'),
                    h.gir ? 'Hit' : 'Miss'
                ].map(escape).join(','));
            });
        });

        const csvContent = [header, ...rows].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `8iron_hole_data_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async deleteSelectedRounds() {
        const checkboxes = document.querySelectorAll('.history-row-checkbox:checked');
        if (checkboxes.length === 0) {
            alert("No rounds selected.");
            return;
        }

        if (confirm(`Are you sure you want to delete ${checkboxes.length} rounds?`)) {
            const idsToDelete = Array.from(checkboxes).map(cb => cb.value);
            this.rounds = this.rounds.filter(r => !idsToDelete.includes(r.id));

            if (this.user && this.user.uid === 'local') {
                this.saveData();
            } else {
                for (const id of idsToDelete) {
                    await this.deleteRoundFromCloud(id);
                }
            }

            this.render();
            document.getElementById('selectAllHistory').checked = false;
        }
    }

    async logout() {
        if (this.auth) {
            await window.firebaseAuth.signOut(this.auth);
        } else {
            // Unconfigured local logout
            this.user = { uid: 'local' }; // remains local
            alert("No active session because Firebase is not configured.");
            window.location.reload();
        }
    }

    renderInsights() {
        try {
            const insightsContainer = document.getElementById('insights-content');
            if (!insightsContainer) return;

            // Target Mappings
            const handicapMap = {
                'Plus': 68, 'Scratch': 72, '1-5': 75, '6-10': 80, '11-15': 85, '16-20': 90, '21-25': 95, '26-30': 100
            };
            const scoreMap = {
                'Below 70': 68, '70-72': 71, '73-75': 74, '76-79': 77.5, '80-85': 83, '86-89': 88, '90-95': 93, '96-99': 98, '100+': 105
            };

            const currentTargetScore = this.insightsTargetType === 'handicap'
                ? handicapMap[this.insightsTargetValue]
                : scoreMap[this.insightsTargetValue];

            const holeMultiplier = this.insightsHoles / 18;

            if (this.rounds.length === 0) {
                insightsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 40px;">No rounds recorded yet. Play some rounds to get insights!</div>`;
                return;
            }

            // Get recent valid rounds (up to 20)
            const recent = this.rounds.slice(0, 20);

            let totalHoles = 0;
            let totalScore = 0;
            let totalPutts = 0;
            let totalGIR = 0;
            let totalFIR = 0;
            let totalFIRChances = 0;
            let totalUpDownChances = 0;
            let totalUpDownSuccesses = 0;
            let totalPenalties = 0;
            let doubleBogeysPlus = 0;
            let totalScoreToPar = 0;

            recent.forEach(r => {
                totalHoles += this.getRoundOriginalHoles(r);
                totalScore += (Number(r.score) || 0);
                totalPutts += (Number(r.putts) || 0);
                totalGIR += (Number(r.gir) || 0);
                totalFIR += (Number(r.fir) || 0);
                totalFIRChances += (Number(r.firChances) || 0);
                totalUpDownChances += (Number(r.upDownChances) || 0);
                totalUpDownSuccesses += (Number(r.upDownSuccesses) || 0);
                totalPenalties += (Number(r.penaltyStrokes) || 0);
                totalScoreToPar += (Number(r.scoreToPar) || 0);
                doubleBogeysPlus += (Number(r.doubleBogeys) || 0) + (Number(r.tripleBogeys) || 0) + (Number(r.otherScore) || 0);
            });

            // Calculate Averages per selected hole count
            const avgScore = totalHoles > 0 ? (totalScore / totalHoles) * this.insightsHoles : 0;
            const avgScoreToPar = totalHoles > 0 ? (totalScoreToPar / totalHoles) * this.insightsHoles : 0;
            const avgPutts = totalHoles > 0 ? (totalPutts / totalHoles) * this.insightsHoles : 0;
            const avgPenalties = totalHoles > 0 ? (totalPenalties / totalHoles) * this.insightsHoles : 0;
            const avgBlowups = totalHoles > 0 ? (doubleBogeysPlus / totalHoles) * this.insightsHoles : 0;

            const girPercent = totalHoles > 0 ? (totalGIR / totalHoles) * 100 : 0;
            const firPercent = totalFIRChances > 0 ? (totalFIR / totalFIRChances) * 100 : 0;
            const upDownPercent = totalUpDownChances > 0 ? (totalUpDownSuccesses / totalUpDownChances) * 100 : 0;

            // Dynamic Targets based on selection
            const baselinesRaw = this.getTargetMetrics(currentTargetScore);
            const baselines = {
                ...baselinesRaw,
                score: baselinesRaw.score * holeMultiplier,
                putts: baselinesRaw.putts * holeMultiplier,
                penalties: baselinesRaw.penalties * holeMultiplier,
                blowups: baselinesRaw.blowups * holeMultiplier
            };

            // Compare and generate recommendations
            const gaps = [
                { metric: 'GIR %', diff: baselines.girPercent - girPercent, tip: girPercent < baselines.girPercent ? "Your approach play needs work. Focus on hitting the center of the green rather than flag hunting to increase GIRs." : "Excellent ball striking! You are hitting greens at your target level." },
                { metric: 'FIR %', diff: baselines.firPercent - firPercent, tip: firPercent < baselines.firPercent ? "You are missing too many fairways. Work on a more controlled swing off the tee to improve your accuracy and set up easier approach shots." : "Great tee ball accuracy! You are hitting fairways at your target level." },
                { metric: 'Putts per ' + this.insightsHoles, diff: avgPutts - baselines.putts, tip: avgPutts > baselines.putts ? "You are losing strokes on the green. Spend more practice time on speed control and 3-to-5 foot putts." : "Your putting is incredibly efficient." },
                { metric: 'Scrambling %', diff: baselines.upDownPercent - upDownPercent, tip: upDownPercent < baselines.upDownPercent ? "Your short game is bleeding strokes. When you miss a green, you need to get up and down more consistently. Practice chipping from various lies." : "Great short game! You are saving pars at your target level." },
                { metric: 'Penalty Strokes per 18', diff: avgPenalties - baselines.penalties, tip: avgPenalties > 1 ? "Penalty strokes are killing your score. Play more conservatively off the tee to keep the ball in play." : "Good job keeping the ball in play and avoiding big numbers." },
                { metric: 'Blowup Holes (> Bogey)', diff: avgBlowups - baselines.blowups, tip: avgBlowups > 1 ? "Eliminate 'blowup' holes (doubles or worse). When in trouble, take your medicine and pitch out instead of attempting hero shots." : "You are doing a great job managing mistakes and avoiding big numbers." }
            ];

            // Sort gaps by severity (highest difference from baseline is worse)
            // For GIR/UpDown, lower is worse (positive diff means trailing). For Putts/Penalties, higher is worse (positive diff means trailing).
            // Since we structured `diff` such that positive numbers always indicate how far BEHIND scratch you are:
            const biggestWeaknesses = [...gaps].filter(g => g.diff > 0).sort((a, b) => {
                // Normalize differences to roughly comparable weights for sorting
                let weightA = a.diff;
                let weightB = b.diff;
                if (a.metric.includes('%')) weightA /= 10; // 10% diff is similar to 1 stroke diff
                if (b.metric.includes('%')) weightB /= 10;
                return weightB - weightA;
            });

            const topRecommendations = biggestWeaknesses.slice(0, 3).map(w => `<li><strong>${w.metric}:</strong> ${w.tip}</li>`).join('');
            const positiveNote = gaps.find(g => g.diff <= 0)?.tip || "Keep working on your consistency across all areas.";

            const targetGIRsInsight = Math.round(baselines.girPercent / 100 * this.insightsHoles);
            const targetMissedGIRsInsight = this.insightsHoles - targetGIRsInsight;
            const targetFIRChances = this.insightsHoles === 9 ? 7 : 14;

            insightsContainer.innerHTML = `
            <div class="card" style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; flex-wrap: wrap; gap: 15px;">
                    <div>
                        <h3 style="margin:0; color:var(--text-light);">Target Benchmarks</h3>
                        <p style="color: var(--text-muted); line-height: 1.6; margin: 5px 0 0 0;">Compare your last ${recent.length} rounds against specific goals.</p>
                    </div>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <select id="insight-target-type" class="form-control" style="width: auto; padding: 5px 10px; background: var(--bg-dark); color: black; border: 1px solid var(--border-color); border-radius: 4px;">
                            <option value="handicap" ${this.insightsTargetType === 'handicap' ? 'selected' : ''}>Target Handicap</option>
                            <option value="score" ${this.insightsTargetType === 'score' ? 'selected' : ''}>Target Score</option>
                        </select>
                        <select id="insight-target-value" class="form-control" style="width: auto; padding: 5px 10px; background: var(--bg-dark); color: black; border: 1px solid var(--border-color); border-radius: 4px;">
                            ${(this.insightsTargetType === 'handicap' ? Object.keys(handicapMap) : Object.keys(scoreMap)).map(val =>
                `<option value="${val}" ${this.insightsTargetValue === val ? 'selected' : ''}>${val}</option>`
            ).join('')}
                        </select>
                        <select id="insight-target-holes" class="form-control" style="width: auto; padding: 5px 10px; background: var(--bg-dark); color: black; border: 1px solid var(--border-color); border-radius: 4px;">
                            <option value="18" ${this.insightsHoles === 18 ? 'selected' : ''}>18 Holes</option>
                            <option value="9" ${this.insightsHoles === 9 ? 'selected' : ''}>9 Holes</option>
                        </select>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-top: 20px;">
                    ${this.createInsightMetricCard("Scoring Avg", avgScore, baselines.score, true)}
                    ${this.createInsightMetricCard("Avg Score to Par", avgScoreToPar, Math.round(baselines.score - 72 * holeMultiplier), true)}
                    ${totalFIRChances > 0 ? this.createInsightMetricCard("FIR %", firPercent, baselines.firPercent, false, '%', targetFIRChances) : ''}
                    ${this.createInsightMetricCard("GIR %", girPercent, baselines.girPercent, false, '%', this.insightsHoles)}
                    ${this.createInsightMetricCard("Scrambling %", upDownPercent, baselines.upDownPercent, false, '%', targetMissedGIRsInsight)}
                    ${this.createInsightMetricCard("Putts per " + this.insightsHoles, avgPutts, baselines.putts, true)}
                    ${this.createInsightMetricCard("Blowup Holes/" + this.insightsHoles, avgBlowups, baselines.blowups, true)}
                    ${this.createInsightMetricCard("Penalty Strokes/" + this.insightsHoles, avgPenalties, baselines.penalties, true)}
                </div>
            </div>

            <div class="card">
                <h3 style="margin-top:0; color:var(--text-light);">Actionable Recommendations</h3>
                <ul style="color: var(--text-muted); line-height: 1.8; margin-left: 20px;">
                    ${topRecommendations || "<li>Outstanding! You are currently playing at or better than a scratch baseline in the major stroke categories.</li>"}
                </ul>
                <div style="margin-top: 15px; padding: 15px; background: rgba(16, 185, 129, 0.1); border-left: 4px solid var(--primary-green); border-radius: 4px;">
                    <strong style="color: var(--primary-green);">Bright Spot:</strong> ${positiveNote}
                </div>
            </div>
        `;

            const emailSubject = encodeURIComponent("My 8 Iron Analytics Victory Plan");
            const emailBody = encodeURIComponent(
                `Here is my game plan to shoot ${this.insightsTargetValue}:\n\n` +
                `Target Score: ${Math.round(baselines.score)}\n` +
                `Fairways (FIR): ${Math.round(baselines.firPercent / 100 * targetFIRChances)} / ${targetFIRChances}\n` +
                `Greens (GIR): ${targetGIRsInsight} / ${this.insightsHoles}\n` +
                `Putts: ${Math.round(baselines.putts)} or fewer\n` +
                `Scrambling: ${Math.round(baselines.upDownPercent / 100 * targetMissedGIRsInsight)} / ${targetMissedGIRsInsight}\n` +
                `Penalty Strokes: Max ${Math.round(baselines.penalties)}\n` +
                `Blowup Holes: Max ${Math.round(baselines.blowups)}\n\n` +
                `Tracked with 8 Iron Analytics.`
            );
            const mailtoLink = `mailto:?subject=${emailSubject}&body=${emailBody}`;

            insightsContainer.innerHTML += `
            <div class="card" style="margin-top: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; flex-wrap: wrap; gap: 15px;">
                    <div>
                        <h3 style="margin:0; color:var(--text-light);">Your Victory Plan</h3>
                        <p style="color: var(--text-muted); line-height: 1.6; margin: 5px 0 0 0;">Take this game plan to your next round to improve your game.</p>
                    </div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <a id="email-plan-btn" class="btn btn-secondary print-hidden" href="#" style="display: flex; align-items: center; gap: 8px; text-decoration: none;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                                <polyline points="22,6 12,13 2,6"></polyline>
                            </svg>
                            Email
                        </a>
                        <button id="save-plan-btn" class="btn btn-secondary print-hidden" onclick="window.app.saveVictoryPlanImage()" style="display: flex; align-items: center; gap: 8px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            Save Image
                        </button>
                        <button class="btn btn-primary print-hidden" onclick="window.print()" style="display: flex; align-items: center; gap: 8px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                                <rect x="6" y="14" width="12" height="8"></rect>
                            </svg>
                            Print Card
                        </button>
                    </div>
                </div>
                
                <div id="victory-plan-card" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 20px; max-width: 400px; margin: 0 auto;">
                    <h3 style="margin-top: 0; text-align: center; color: var(--primary-green); border-bottom: 1px solid var(--border-color); padding-bottom: 10px; margin-bottom: 15px; font-size: 1.4rem;">Victory Plan<br><span style="font-size: 1rem; color: var(--text-muted); font-weight: normal;">Target: ${this.insightsTargetValue}</span></h3>
                    
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px dashed var(--border-color); padding-bottom: 6px; font-size: 1.1rem;">
                        <span style="font-weight: 500;">Target Score:</span>
                        <span style="font-weight: 700; color: var(--primary-green);">${Math.round(baselines.score)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px dashed var(--border-color); padding-bottom: 6px; font-size: 1.1rem;">
                        <span style="font-weight: 500;">Fairways (FIR):</span>
                        <span style="font-weight: 700;">${Math.round(baselines.firPercent / 100 * targetFIRChances)} / ${targetFIRChances}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px dashed var(--border-color); padding-bottom: 6px; font-size: 1.1rem;">
                        <span style="font-weight: 500;">Greens (GIR):</span>
                        <span style="font-weight: 700;">${targetGIRsInsight} / ${this.insightsHoles}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px dashed var(--border-color); padding-bottom: 6px; font-size: 1.1rem;">
                        <span style="font-weight: 500;">Putts:</span>
                        <span style="font-weight: 700;">${Math.round(baselines.putts)} or fewer</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px dashed var(--border-color); padding-bottom: 6px; font-size: 1.1rem;">
                        <span style="font-weight: 500;">Scrambling:</span>
                        <span style="font-weight: 700;">${Math.round(baselines.upDownPercent / 100 * targetMissedGIRsInsight)} / ${targetMissedGIRsInsight}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px dashed var(--border-color); padding-bottom: 6px; font-size: 1.1rem;">
                        <span style="font-weight: 500;">Penalty Strokes:</span>
                        <span style="font-weight: 700;">Max ${Math.round(baselines.penalties)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 1.1rem;">
                        <span style="font-weight: 500;">Blowup Holes:</span>
                        <span style="font-weight: 700;">Max ${Math.round(baselines.blowups)}</span>
                    </div>
                </div>
            </div>
        `;

            const emailBtn = document.getElementById('email-plan-btn');
            if (emailBtn) {
                emailBtn.setAttribute('href', mailtoLink);
            }

            const typeSelect = document.getElementById('insight-target-type');
            const valueSelect = document.getElementById('insight-target-value');
            const holesSelect = document.getElementById('insight-target-holes');

            if (typeSelect) {
                typeSelect.addEventListener('change', (e) => {
                    this.insightsTargetType = e.target.value;
                    this.insightsTargetValue = this.insightsTargetType === 'handicap' ? 'Scratch' : '76-79';
                    this.saveInsightsPrefs();
                    this.renderInsights();
                });
            }
            if (valueSelect) {
                valueSelect.addEventListener('change', (e) => {
                    this.insightsTargetValue = e.target.value;
                    this.saveInsightsPrefs();
                    this.renderInsights();
                });
            }
            if (holesSelect) {
                holesSelect.addEventListener('change', (e) => {
                    this.insightsHoles = parseInt(e.target.value);
                    this.saveInsightsPrefs();
                    this.renderInsights();
                });
            }
        } catch (e) {
            console.error("Error rendering insights:", e);
            const insightsContainer = document.getElementById('insights-content');
            if (insightsContainer) insightsContainer.innerHTML = '<div style="text-align: center; color: #ef4444; padding: 40px;">Error loading insights.</div>';
        }
    }

    saveInsightsPrefs() {
        const prefs = {
            insightsTargetType: this.insightsTargetType,
            insightsTargetValue: this.insightsTargetValue,
            insightsHoles: this.insightsHoles
        };
        if (this.user && this.user.uid !== 'local' && this.db) {
            const { doc, setDoc } = window.firebaseDB;
            setDoc(doc(this.db, 'users', this.user.uid, 'settings', 'profile'), prefs, { merge: true }).catch(e => console.error('Error saving insights prefs:', e));
        } else {
            localStorage.setItem('insightsPrefs', JSON.stringify(prefs));
        }
    }

    saveVictoryPlanImage() {
        const card = document.getElementById('victory-plan-card');
        if (!card) return;

        if (typeof html2canvas === 'undefined') {
            alert('Image saving is currently unavailable. Please check your connection.');
            return;
        }

        const btn = document.getElementById('save-plan-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = 'Saving...';
        btn.disabled = true;

        html2canvas(card, {
            scale: 2,
            backgroundColor: '#1e293b' // var(--bg-card) dark theme background
        }).then(canvas => {
            const link = document.createElement('a');
            link.download = `8-iron-victory-plan-${new Date().toISOString().split('T')[0]}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            btn.innerHTML = originalText;
            btn.disabled = false;
        }).catch(err => {
            console.error('Error creating image:', err);
            alert('Failed to save image. Please attempt again.');
            btn.innerHTML = originalText;
            btn.disabled = false;
        });
    }

    createInsightMetricCard(title, userValue, scratchValue, lowerIsBetter, unit = '', outOf = null) {
        const val = Math.round(userValue);
        const targetVal = Math.round(scratchValue);
        let isMeeting = lowerIsBetter ? val <= targetVal : val >= targetVal;

        // Dynamic coloring
        const diffColor = isMeeting ? 'var(--primary-green)' : '#ef4444';

        let userAbsolute = '';
        let targetAbsolute = '';
        if (outOf) {
            userAbsolute = ` <span style="font-size: 0.9rem; color: var(--text-muted); font-weight: normal;">(${Math.round(val / 100 * outOf)}/${outOf})</span>`;
            targetAbsolute = ` (${Math.round((targetVal || 0) / 100 * outOf)}/${outOf})`;
        }

        return `
            <div class="card stat-card">
                <div class="stat-title">${title}</div>
                <div class="stat-value" style="color: ${diffColor};">${val}${unit}${userAbsolute}</div>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">
                    Target: ${scratchValue !== null ? targetVal + unit + targetAbsolute : '--'}
                </div>
            </div>
        `;
    }

    toggleImportInstructions() {
        const type = document.getElementById('import-type-select').value;
        const basicDiv = document.getElementById('import-instructions-basic');
        const detailedDiv = document.getElementById('import-instructions-detailed');

        if (type === 'basic') {
            basicDiv.style.display = 'block';
            detailedDiv.style.display = 'none';
        } else {
            basicDiv.style.display = 'none';
            detailedDiv.style.display = 'block';
        }
    }

    handleCSVUpload() {
        const fileInput = document.getElementById('csv-upload');
        const statusDiv = document.getElementById('import-status');
        const importType = document.getElementById('import-type-select').value;

        if (!fileInput.files.length) {
            statusDiv.style.display = 'block';
            statusDiv.style.color = '#ef4444';
            statusDiv.innerText = 'Please select a CSV file first.';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            console.log("=== APP.JS VERSION 4.0 START ===");
            console.log("Raw CSV text length:", text.length);

            // Find the true header row by looking for 'Date' and 'Course'
            const lines = text.split('\n');
            let headerIndex = 0;
            for (let i = 0; i < Math.min(10, lines.length); i++) {
                const l = lines[i].toLowerCase();
                if ((l.includes('date') && l.includes('course')) || l.includes('round #') || l.includes('round number') || l.includes('course id') || l.includes('course_id')) {
                    headerIndex = i;
                    console.log("Found header index at line:", i, lines[i]);
                    break;
                }
            }
            const cleanText = lines.slice(headerIndex).join('\n');
            console.log("Clean CSV text begins with:", cleanText.substring(0, 100));

            const self = this; // Capture class instance context

            Papa.parse(cleanText, {
                header: true,
                skipEmptyLines: true,
                transformHeader: header => header.trim(),
                complete: async (results) => {
                    console.log("=== PAPA PARSE COMPLETE ===");
                    console.log("PapaParse complete. Row count:", results.data.length);
                    if (results.data.length > 0) {
                        console.log("First row keys:", Object.keys(results.data[0]));
                    }
                    const rows = results.data;
                    let importedCount = 0;


                    const parseSafeDate = (dateStr) => {
                        if (!dateStr) return '';
                        const est = self.getEST(dateStr.toString().trim());
                        return est.iso;
                    };

                    const parseCurrency = (val) => {
                        if (val === undefined || val === null || val === "") return 0;
                        // Strip everything except numbers, decimal points, and minus signs
                        const cleaned = val.toString().replace(/[^\d.-]/g, '');
                        return parseFloat(cleaned) || 0;
                    };

                    const cleanCourseName = (name) => name ? name.toString().toLowerCase().trim().replace(/[^a-z0-9]/g, '') : '';

                    const getKeywords = (name) => {
                        if (!name) return [];
                        const noiseWords = ['the', 'at', 'golf', 'club', 'course', 'links', 'cc', 'gc', 'and', '9', '18', 'holes', 'x2'];
                        return name.toString().toLowerCase()
                            .replace(/[^a-z0-9\s]/g, ' ')
                            .split(/\s+/)
                            .filter(w => w.length > 0 && !noiseWords.includes(w));
                    };

                    const isCourseMatch = (name1, name2) => {
                        // 1. Strict clean match
                        const c1 = cleanCourseName(name1);
                        const c2 = cleanCourseName(name2);
                        if (c1 === c2 && c1 !== '') return true;

                        const kw1 = getKeywords(name1);
                        const kw2 = getKeywords(name2);
                        if (kw1.length === 0 || kw2.length === 0) return false;

                        // 2. Keyword overlap count
                        const shared = kw1.filter(w => kw2.includes(w));
                        if (shared.length >= 2) return true;

                        // 3. Subset match (for 1-word courses or short names)
                        const subset = (a, b) => a.length > 0 && a.every(aw => b.includes(aw));
                        return subset(kw1, kw2) || subset(kw2, kw1);
                    };

                    const getRowVal = (r, keys) => {
                        const foundKey = Object.keys(r).find(k => {
                            const cleanK = k.replace(/^[\uFEFF\s]+|[\s]+$/g, '').toLowerCase();
                            return keys.includes(cleanK);
                        });
                        return foundKey ? r[foundKey] : undefined;
                    };

                    if (importType === 'basic') {
                        // Check for accidental detailed CSV upload
                        const firstKeys = rows.length > 0 ? Object.keys(rows[0]).map(k => k.trim().toLowerCase()) : [];
                        if (firstKeys.includes('hole') || firstKeys.includes('par')) {
                            statusDiv.innerText = 'Error: It looks like you uploaded a detailed hole-by-hole CSV but selected "Basic Round Totals". Please change the Import Type above to Detailed and attempt again.';
                            statusDiv.style.color = '#ef4444';
                            return;
                        }

                        // BASIC ROUND TOTALS LOOP
                        statusDiv.innerText = `Found ${rows.length} rounds. Processing Basic Import...`;
                        for (const row of rows) {
                            const roundNum = parseInt(getRowVal(row, ['round #', 'round number', 'round_#', 'round'])) || 0;
                            const date = getRowVal(row, ['date']);
                            const course = getRowVal(row, ['course']);
                            // Skip if missing core data or if the "Totals" row
                            if (!roundNum && (!date || !course || date.toLowerCase() === 'totals' || date === '')) continue;


                            let formattedDate = parseSafeDate(date);

                            // Calculate aggregates based on basic headers
                            const roundPayload = {
                                roundNum: roundNum > 0 ? roundNum : undefined,
                                createdAt: new Date().toISOString()
                            };
                            const v_courseId = getRowVal(row, ['course id', 'course_id', 'courseid']);
                            if (formattedDate) roundPayload.date = formattedDate;
                            if (course) {
                                roundPayload.course = course;
                                const layout = self.courseLayouts.find(c => isCourseMatch(c.name, course));
                                roundPayload.courseId = layout ? layout.courseId : (v_courseId || null);
                            } else if (v_courseId) {
                                // HEALER: If course name is missing but Course ID is provided, resolve name
                                const layout = self.courseLayouts.find(c => c.courseId === v_courseId);
                                if (layout) {
                                    roundPayload.course = layout.name;
                                    roundPayload.courseId = v_courseId;
                                }
                            }

                            const v_score = getRowVal(row, ['score']);
                            const v_par = getRowVal(row, ['course par', 'par']);
                            const v_holes = getRowVal(row, ['holes']);
                            const v_putts = getRowVal(row, ['putts']);
                            const v_teeId = getRowVal(row, ['tee id', 'tee_id', 'teeid']);
                            const v_tee = getRowVal(row, ['tee color', 'tee name', 'tee']);
                            const v_gir = getRowVal(row, ['gir', 'gir ']);
                            const v_pens = getRowVal(row, ['penalty strokes', 'pens']);
                            const v_ud_c = getRowVal(row, ['up/down chances', 'scrambling chances']);
                            const v_ud_s = getRowVal(row, ['up/down successes', 'scrambling successes']);
                            const v_birds = row['Birdies'];
                            const v_pars = row['Pars'];
                            const v_bogeys = row['Bogeys'];
                            const v_putter = getRowVal(row, ['putter used', 'putter']);
                            const v_cost = getRowVal(row, ['cost', 'price', 'round cost']);
                            const v_winnings = getRowVal(row, ['winnings', 'prize', 'round winnings']);
                            const v_event = getRowVal(row, ['event', 'tournament', 'round event']);
                            const v_group = getRowVal(row, ['group', 'players', 'round group']);

                            if (v_score !== undefined && v_score !== "") roundPayload.score = parseInt(v_score) || 0;
                            if (v_par !== undefined && v_par !== "") roundPayload.par = parseInt(v_par) || 72;
                            if (v_teeId !== undefined && v_teeId !== "") roundPayload.teeId = v_teeId;
                            if (v_tee !== undefined && v_tee !== "") {
                                roundPayload.teeName = v_tee;
                            } else if (v_teeId && layout && layout.tees) {
                                const matchedTee = Object.entries(layout.tees).find(([name, data]) => data.teeId === v_teeId);
                                if (matchedTee) roundPayload.teeName = matchedTee[0];
                            }
                            if (roundPayload.score !== undefined && roundPayload.par !== undefined) {
                                roundPayload.scoreToPar = roundPayload.score - roundPayload.par;
                            }
                            if (v_holes !== undefined && v_holes !== "") roundPayload.holes = parseInt(v_holes) || 18;
                            if (v_putts !== undefined && v_putts !== "") roundPayload.putts = parseInt(v_putts) || 0;
                            if (v_gir !== undefined && v_gir !== "") roundPayload.gir = parseInt(v_gir) || 0;
                            if (v_pens !== undefined && v_pens !== "") roundPayload.penaltyStrokes = parseInt(v_pens) || 0;
                            if (v_ud_c !== undefined && v_ud_c !== "") roundPayload.upDownChances = parseInt(v_ud_c) || 0;
                            if (v_ud_s !== undefined && v_ud_s !== "") roundPayload.upDownSuccesses = parseInt(v_ud_s) || 0;
                            if (v_birds !== undefined && v_birds !== "") roundPayload.birdies = parseInt(v_birds) || 0;
                            if (v_pars !== undefined && v_pars !== "") roundPayload.pars = parseInt(v_pars) || 0;
                            if (v_bogeys !== undefined && v_bogeys !== "") roundPayload.bogeys = parseInt(v_bogeys) || 0;
                            if (v_putter !== undefined && v_putter !== "") roundPayload.putter = v_putter;
                            if (v_cost !== undefined && v_cost !== "") roundPayload.cost = parseCurrency(v_cost);
                            if (v_winnings !== undefined && v_winnings !== "") roundPayload.winnings = parseCurrency(v_winnings);
                            if (v_event !== undefined && v_event !== "") roundPayload.event = v_event;
                            if (v_group !== undefined && v_group !== "") roundPayload.group = v_group;

                            // Attempt to deduce FIR if chances column is present
                            const firChancesVal = getRowVal(row, ['fir chances', 'fairway chances', 'fairways_chances']);
                            if (firChancesVal !== undefined && firChancesVal !== "") {
                                roundPayload.firChances = parseInt(firChancesVal) || 0;
                                roundPayload.fir = 0;
                            } else if (v_holes !== undefined) {
                                roundPayload.firChances = roundPayload.holes === 18 ? 14 : 7;
                                roundPayload.fir = 0;
                            }

                            // Duplicate check for basic import
                            const importedCourseClean = cleanCourseName(course);
                            // Matching logic for basic import: Round # first, then Date + Course
                            let existingRoundIndex = -1;
                            if (roundNum > 0) {
                                existingRoundIndex = self.rounds.findIndex(r => r.roundNum === roundNum);
                            }

                            if (existingRoundIndex === -1) {
                                existingRoundIndex = self.rounds.findIndex(r => {
                                    const rFormatted = parseSafeDate(r.date);
                                    if (rFormatted !== formattedDate) return false;
                                    return isCourseMatch(r.course, course);
                                });
                            }

                            try {
                                if (existingRoundIndex !== -1) {
                                    // Update existing round
                                    const existing = self.rounds[existingRoundIndex];
                                    const updated = {
                                        ...existing,
                                        ...roundPayload,
                                        id: existing.id,
                                        putter: roundPayload.putter || existing.putter || ''
                                    };
                                    self.rounds[existingRoundIndex] = updated;
                                    if (self.user && self.user.uid !== 'local') {
                                        // HEALER: If we have teeId but no teeName/course context in the CSV row, 
                                        // resolve it using the existing round's course layout.
                                        if (updated.teeId && !updated.teeName && updated.course) {
                                            const layout = self.courseLayouts.find(c => isCourseMatch(c.name, updated.course));
                                            if (layout && layout.tees) {
                                                const matchedTee = Object.entries(layout.tees).find(([name, data]) => data.teeId === updated.teeId);
                                                if (matchedTee) {
                                                    updated.teeName = matchedTee[0];
                                                    updated.courseId = layout.courseId;
                                                }
                                            }
                                        }
                                        self.syncRoundToCloud(updated);
                                    }
                                } else {
                                    roundPayload.id = Date.now().toString() + Math.random().toString(36).substring(2, 9);
                                    // Assign persistent round number if not already present
                                    if (!roundPayload.roundNum) {
                                        const maxNum = self.rounds.reduce((max, r) => Math.max(max, r.roundNum || 0), 0);
                                        roundPayload.roundNum = maxNum + 1;
                                    }
                                    self.rounds.push(roundPayload);
                                    if (self.user && self.user.uid !== 'local') {
                                        self.syncRoundToCloud(roundPayload);
                                    }
                                }
                                importedCount++;
                            } catch (e) {
                                console.error('Failed to import/update basic round:', e);
                            }
                        }

                    } else {
                        // DETAILED HOLE-BY-HOLE LOOP
                        const roundsMap = {}; // Group by Date + Course

                        rows.forEach((row, i) => {
                            // Dynamically find keys ignoring case and whitespace/BOM
                            const getVal = (possibleKeys) => {
                                const foundKey = Object.keys(row).find(k => {
                                    const cleanK = k.replace(/^[\uFEFF\s]+|[\s]+$/g, '').toLowerCase();
                                    return possibleKeys.includes(cleanK);
                                });
                                return foundKey ? row[foundKey] : undefined;
                            };

                            const roundNum = parseInt(getVal(['round #', 'round number', 'round_#', 'round'])) || 0;
                            const date = getVal(['date']);
                            const course = getVal(['course']);
                            const teeId = getVal(['tee id', 'tee_id', 'teeid', 'tee']);
                            const v_courseId = getVal(['course id', 'course_id', 'courseid']);

                            if (!roundNum && (!date || !course || date.toLowerCase() === 'date')) return;

                            let key;
                            if (roundNum > 0) {
                                key = `round_num_${roundNum}`;
                            } else {
                                const normalizedCourseKey = cleanCourseName(course);
                                key = `${date}_${normalizedCourseKey}_${teeId || ''}`;
                            }

                            if (!roundsMap[key]) {
                                roundsMap[key] = {
                                    date: date,
                                    course: course,
                                    courseId: v_courseId,
                                    roundNum: roundNum,
                                    teeId: teeId,
                                    holeData: []
                                };
                            }

                            // Extract round-level fields only if present in the CSV row
                            const v_putter = getVal(['putter used', 'putter']);
                            const v_cost = getVal(['cost', 'price', 'round cost']);
                            const v_winnings = getVal(['winnings', 'prize', 'round winnings']);
                            const v_event = getVal(['event', 'tournament', 'round event']);
                            const v_group = getVal(['group', 'players', 'round group']);

                            if (v_putter !== undefined && v_putter !== "" && roundsMap[key].putter === undefined) roundsMap[key].putter = v_putter;
                            if (v_cost !== undefined && v_cost !== "" && roundsMap[key].cost === undefined) roundsMap[key].cost = parseCurrency(v_cost);
                            if (v_winnings !== undefined && v_winnings !== "" && roundsMap[key].winnings === undefined) roundsMap[key].winnings = parseCurrency(v_winnings);
                            if (v_event !== undefined && v_event !== "" && roundsMap[key].event === undefined) roundsMap[key].event = v_event;
                            if (v_group !== undefined && v_group !== "" && roundsMap[key].group === undefined) roundsMap[key].group = v_group;

                            // Calculate Scrambling based on user formula:
                            const par = parseInt(getVal(['par'])) || 0;
                            const score = parseInt(getVal(['score', 'score on hole actual'])) || 0;

                            const parseBool = (raw) => {
                                if (raw === undefined || raw === null || raw === '') return undefined;
                                if (typeof raw === 'boolean') return raw;
                                const s = String(raw).trim().toUpperCase();
                                return s === 'TRUE' || s === '1' || s === 'YES' || s === 'Y';
                            };

                            let girRaw = parseBool(getVal(['gir']));
                            let gir = girRaw !== undefined ? girRaw : false;

                            let scramblingRaw = parseBool(getVal(['scrambling']));
                            let scrambling = false;

                            if (scramblingRaw !== undefined) {
                                scrambling = scramblingRaw;
                            } else {
                                if (!gir && score > 0 && par > 0) {
                                    if (score <= par) {
                                        scrambling = true;
                                    }
                                }
                            }

                            let firRaw = parseBool(getVal(['fir']));

                            // Parse the hole data
                            const holeNum = parseInt(getVal(['hole'])) || 0;
                            if (holeNum > 0) {
                                const holeData = {
                                    hole: holeNum,
                                    par: par,
                                    score: score,
                                    scoreToPar: (score > 0 && par > 0) ? (score - par) : 0,
                                    fir: firRaw !== undefined ? firRaw : false,
                                    gir: gir,
                                    scrambling: scrambling,
                                    putts: parseInt(getVal(['putts'])) || 0
                                };
                                roundsMap[key].holeData.push(holeData);
                            }
                        });

                        if (Object.keys(roundsMap).length === 0) {
                            const firstRowKeys = rows.length > 0 ? Object.keys(rows[0]).map(k => '"' + k + '"').join(', ') : 'No data rows found';
                            statusDiv.innerText = `Error: Found 0 matching rounds. Your column headers look like this: ${firstRowKeys}. Make sure 'Date' and 'Course' columns are spelled correctly.`;
                            statusDiv.style.color = '#ef4444';
                            console.error("0 Rounds found. RoundsMap is empty.");
                            return;
                        }

                        console.log(`Found ${Object.keys(roundsMap).length} unique rounds to import.`);
                        statusDiv.innerText = `Found ${Object.keys(roundsMap).length} rounds. Processing Detailed Import...`;

                        for (const [key, roundObj] of Object.entries(roundsMap)) {
                            let totalScore = 0;
                            let totalPar = 0;
                            let totalPutts = 0;
                            let girCount = 0;
                            let firCount = 0;
                            let upDownSuccesses = 0;
                            let upDownChances = 0;
                            let firChances = 0;

                            let formattedDate = parseSafeDate(roundObj.date);

                            let eagles = 0;
                            let birdies = 0;
                            let pars = 0;
                            let bogeys = 0;
                            let doubleBogeys = 0;
                            let tripleBogeys = 0;
                            let otherScore = 0;
                            let threePutts = 0;

                            roundObj.holeData.forEach(h => {
                                totalScore += h.score;
                                totalPar += h.par;
                                totalPutts += h.putts;

                                if (h.putts >= 3) threePutts++;

                                const diff = h.score - h.par;
                                if (diff <= -2) eagles++;
                                else if (diff === -1) birdies++;
                                else if (diff === 0) pars++;
                                else if (diff === 1) bogeys++;
                                else if (diff === 2) doubleBogeys++;
                                else if (diff === 3) tripleBogeys++;
                                else if (diff > 3) otherScore++;
                                if (h.gir) girCount++;
                                if (h.par > 3) firChances++; // Par 4s and 5s are FIR chances
                                if (h.fir) firCount++;
                                if (!h.gir) {
                                    upDownChances++;
                                    if (h.scrambling) upDownSuccesses++;
                                }
                            });
                            // Fuzzy match handled by common cleanCourseName
                            // Matching logic for detailed import: Round # first, then Date + Course
                            let existingRoundIndex = -1;
                            if (roundObj.roundNum > 0) {
                                existingRoundIndex = self.rounds.findIndex(r => r.roundNum === roundObj.roundNum);
                            }

                            if (existingRoundIndex === -1 && formattedDate && roundObj.course) {
                                existingRoundIndex = self.rounds.findIndex(r => {
                                    const rFormatted = parseSafeDate(r.date);
                                    if (rFormatted !== formattedDate) return false;
                                    return isCourseMatch(r.course, roundObj.course);
                                });
                            }

                            if (existingRoundIndex !== -1) {
                                // Match found! Merge data into existing round
                                const existingRound = self.rounds[existingRoundIndex];

                                const updatedRound = {
                                    ...existingRound,
                                    score: totalScore > 0 ? totalScore : existingRound.score,
                                    scoreToPar: (totalScore > 0 && totalPar > 0) ? (totalScore - totalPar) : existingRound.scoreToPar,
                                    putts: totalPutts > 0 ? totalPutts : existingRound.putts,
                                    threePutts: threePutts >= 0 ? threePutts : existingRound.threePutts,
                                    eagles: eagles >= 0 ? eagles : existingRound.eagles,
                                    birdies: birdies >= 0 ? birdies : existingRound.birdies,
                                    pars: pars >= 0 ? pars : existingRound.pars,
                                    bogeys: bogeys >= 0 ? bogeys : existingRound.bogeys,
                                    doubleBogeys: doubleBogeys >= 0 ? doubleBogeys : existingRound.doubleBogeys,
                                    tripleBogeys: tripleBogeys >= 0 ? tripleBogeys : existingRound.tripleBogeys,
                                    otherScore: otherScore >= 0 ? otherScore : existingRound.otherScore,
                                    gir: girCount >= 0 ? girCount : existingRound.gir,
                                    fir: firCount >= 0 ? firCount : existingRound.fir,
                                    firChances: firChances > 0 ? firChances : existingRound.firChances,
                                    upDownChances: upDownChances >= 0 ? upDownChances : existingRound.upDownChances,
                                    upDownSuccesses: upDownSuccesses >= 0 ? upDownSuccesses : existingRound.upDownSuccesses,
                                    putter: roundObj.putter !== undefined ? roundObj.putter : (existingRound.putter || ''),
                                    cost: roundObj.cost !== undefined ? roundObj.cost : (existingRound.cost || 0),
                                    winnings: roundObj.winnings !== undefined ? roundObj.winnings : (existingRound.winnings || 0),
                                    teeId: roundObj.teeId !== undefined ? roundObj.teeId : existingRound.teeId,
                                    event: roundObj.event !== undefined ? roundObj.event : (existingRound.event || ''),
                                    group: roundObj.group !== undefined ? roundObj.group : (existingRound.group || ''),
                                    holes: roundObj.holeData.length > 0 ? roundObj.holeData.length : existingRound.holes,
                                    holeData: roundObj.holeData.length > 0 ? roundObj.holeData : existingRound.holeData
                                };

                                try {
                                    self.rounds[existingRoundIndex] = updatedRound;
                                    if (self.user && self.user.uid !== 'local') {
                                        self.syncRoundToCloud(updatedRound);
                                    }
                                    importedCount++;
                                } catch (e) {
                                    console.error('Failed to update existing round with detailed data:', key, e);
                                }
                            } else {
                                // No match found, push as new round
                                let layout = self.courseLayouts.find(c => isCourseMatch(c.name, roundObj.course));
                                if (!layout && roundObj.courseId) {
                                    layout = self.courseLayouts.find(c => c.courseId === roundObj.courseId);
                                    if (layout && !roundObj.course) roundObj.course = layout.name;
                                }

                                const nextRoundNum = self.rounds.reduce((max, r) => Math.max(max, r.roundNum || 0), 0) + 1;

                                const finalRoundPayload = {
                                    id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
                                    roundNum: roundObj.roundNum > 0 ? roundObj.roundNum : nextRoundNum,
                                    date: formattedDate,
                                    course: roundObj.course,
                                    courseId: layout ? layout.courseId : (roundObj.courseId || null),
                                    teeId: roundObj.teeId || '',
                                    teeName: (function () {
                                        if (layout && layout.tees && roundObj.teeId) {
                                            const matchedTee = Object.entries(layout.tees).find(([name, data]) => data.teeId === roundObj.teeId);
                                            return matchedTee ? matchedTee[0] : 'Default';
                                        }
                                        return 'Default';
                                    })(),
                                    holes: roundObj.holeData.length,
                                    score: totalScore,
                                    scoreToPar: totalScore - totalPar,
                                    putts: totalPutts,
                                    threePutts: threePutts,
                                    eagles: eagles,
                                    birdies: birdies,
                                    pars: pars,
                                    bogeys: bogeys,
                                    doubleBogeys: doubleBogeys,
                                    tripleBogeys: tripleBogeys,
                                    otherScore: otherScore,
                                    gir: girCount,
                                    fir: firCount,
                                    firChances: firChances,
                                    upDownChances: upDownChances,
                                    upDownSuccesses: upDownSuccesses,
                                    putter: roundObj.putter || '',
                                    cost: roundObj.cost || 0,
                                    winnings: roundObj.winnings || 0,
                                    event: roundObj.event || '',
                                    group: roundObj.group || '',
                                    holeData: roundObj.holeData,
                                    createdAt: new Date().toISOString()
                                };

                                try {
                                    finalRoundPayload.id = Date.now().toString() + Math.random().toString(36).substring(2, 9);
                                    self.rounds.push(finalRoundPayload);
                                    if (self.user && self.user.uid !== 'local') {
                                        self.syncRoundToCloud(finalRoundPayload);
                                    }
                                    importedCount++;
                                } catch (e) {
                                    console.error('Failed to import detailed round:', key, e);
                                }
                            }
                        }
                    }

                    self.rounds.sort((a, b) => self.getEST(b.date).ts - self.getEST(a.date).ts);
                    self.renderPutterDatalist();
                    if (self.user && self.user.uid === 'local') {
                        self.saveData();
                    }

                    statusDiv.innerText = `Success! Imported ${importedCount} rounds into your database.`;
                    statusDiv.style.color = 'var(--primary-green)';
                    alert(`Success! Imported or updated ${importedCount} rounds into your database.`);

                    // Reset file input
                    fileInput.value = '';

                    // Refresh local state
                    self.render();
                },
                error: (err) => {
                    statusDiv.style.color = '#ef4444';
                    statusDiv.innerText = 'Error parsing CSV: ' + err.message;
                }
            });
        };
        reader.readAsText(fileInput.files[0]);
    }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
// deploy trigger 1
// Version: 1.0.4-firebase-fix
