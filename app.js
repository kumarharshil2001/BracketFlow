/**
 * Bracket Builder - Main Application Logic
 * Handles UI navigation, tournament CRUD, and data persistence.
 */

(function () {
    'use strict';

    // ===== Storage Manager (localStorage + Firestore sync) =====
    const Storage = {
        KEY: 'bracketBuilder_tournaments',

        getAll() {
            try {
                const data = localStorage.getItem(this.KEY);
                return data ? JSON.parse(data) : [];
            } catch (e) {
                console.error('Failed to read storage:', e);
                return [];
            }
        },

        save(tournaments) {
            try {
                localStorage.setItem(this.KEY, JSON.stringify(tournaments));
            } catch (e) {
                console.error('Failed to save storage:', e);
            }
        },

        getTournament(id) {
            return this.getAll().find(t => t.id === id) || null;
        },

        addTournament(tournament) {
            const all = this.getAll();
            all.unshift(tournament);
            this.save(all);
            // Sync to cloud
            if (Auth.isLoggedIn()) FireStore.save(tournament);
        },

        updateTournament(tournament) {
            const all = this.getAll();
            const idx = all.findIndex(t => t.id === tournament.id);
            if (idx !== -1) {
                all[idx] = tournament;
                this.save(all);
                // Sync to cloud
                if (Auth.isLoggedIn()) FireStore.save(tournament);
            }
        },

        deleteTournament(id) {
            const all = this.getAll().filter(t => t.id !== id);
            this.save(all);
            // Sync to cloud
            if (Auth.isLoggedIn()) FireStore.delete(id);
        },

        exportAll() {
            return JSON.stringify(this.getAll(), null, 2);
        },

        exportOne(id) {
            const t = this.getTournament(id);
            return t ? JSON.stringify([t], null, 2) : null;
        },

        importData(jsonStr) {
            try {
                const data = JSON.parse(jsonStr);
                if (!Array.isArray(data)) throw new Error('Invalid format');
                const all = this.getAll();
                const existingIds = new Set(all.map(t => t.id));
                let imported = 0;
                data.forEach(t => {
                    if (t.id && t.name && t.bracket) {
                        if (existingIds.has(t.id)) {
                            t.id = generateId();
                        }
                        all.unshift(t);
                        imported++;
                    }
                });
                this.save(all);
                return imported;
            } catch (e) {
                console.error('Import failed:', e);
                return -1;
            }
        }
    };

    // ===== Utility Functions =====
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    function formatDate(ts) {
        return new Date(ts).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });
    }

    function shuffleArray(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function showToast(message, type = 'success') {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ===== View Management =====
    const views = document.querySelectorAll('.view');
    const navBtns = document.querySelectorAll('.nav-btn[data-view]');

    function switchView(viewId) {
        views.forEach(v => v.classList.remove('active'));
        navBtns.forEach(b => b.classList.remove('active'));

        const target = document.getElementById(`view-${viewId}`);
        if (target) target.classList.add('active');

        const activeNav = document.querySelector(`.nav-btn[data-view="${viewId}"]`);
        if (activeNav) activeNav.classList.add('active');
        closeSidebar();
    }

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // ===== Mobile Sidebar Drawer =====
    const sidebarEl = document.getElementById('sidebar');
    const menuToggle = document.getElementById('menuToggle');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');

    function openSidebar() {
        if (sidebarEl) sidebarEl.classList.add('open');
        if (sidebarBackdrop) sidebarBackdrop.classList.add('visible');
    }

    function closeSidebar() {
        if (sidebarEl) sidebarEl.classList.remove('open');
        if (sidebarBackdrop) sidebarBackdrop.classList.remove('visible');
    }

    if (menuToggle) menuToggle.addEventListener('click', openSidebar);
    if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);
    if (sidebarEl) {
        sidebarEl.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', closeSidebar);
        });
    }

    // ===== Dashboard =====
    const tournamentsGrid = document.getElementById('tournamentsGrid');
    const emptyState = document.getElementById('emptyState');

    function renderDashboard() {
        const tournaments = Storage.getAll();
        tournamentsGrid.innerHTML = '';

        if (tournaments.length === 0) {
            tournamentsGrid.style.display = 'none';
            emptyState.classList.add('visible');
            return;
        }

        emptyState.classList.remove('visible');
        tournamentsGrid.style.display = 'grid';

        tournaments.forEach(t => {
            const card = document.createElement('div');
            card.className = 'tournament-card';
            card.dataset.id = t.id;

            const typeLabel = t.type === 'double' ? 'Double Elim' : 'Single Elim';
            const badgeClass = t.type === 'double' ? 'badge-double' : 'badge-single';
            const participants = t.participants ? t.participants.length : 0;
            const rounds = t.bracket ? t.bracket.rounds : 0;
            const stats = t.bracket ? BracketEngine.getStats(t.bracket) : { total: 0, decided: 0 };
            const pct = stats.total ? Math.round((stats.decided / stats.total) * 100) : 0;
            const champ = t.bracket ? BracketEngine.getChampion(t.bracket) : null;

            card.innerHTML = `
                <div class="card-header">
                    <div class="card-title">${escapeHtml(t.name)}</div>
                    <span class="card-badge ${badgeClass}">${typeLabel}</span>
                </div>
                <div class="card-info">
                    <span>${participants} participants</span>
                    <span>${rounds} rounds</span>
                </div>
                <div class="card-progress" title="${stats.decided}/${stats.total} matches played">
                    <div class="card-progress-bar" style="width:${pct}%"></div>
                </div>
                ${champ && champ !== 'BYE'
                    ? `<div class="card-champion">🏆 ${escapeHtml(champ)}</div>`
                    : `<div class="card-date">Created ${formatDate(t.createdAt)}</div>`}
            `;

            card.addEventListener('click', () => openBracket(t.id));
            tournamentsGrid.appendChild(card);
        });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ===== Create Tournament =====
    const createForm = document.getElementById('createForm');
    const participantsInput = document.getElementById('participants');
    const participantCount = document.getElementById('participantCount');
    const bracketTypeSelect = document.getElementById('bracketType');
    const thirdPlaceSelect = document.getElementById('thirdPlace');

    participantsInput.addEventListener('input', () => {
        const lines = participantsInput.value.split('\n').filter(l => l.trim());
        participantCount.textContent = lines.length;
    });

    // Show/hide third place option based on bracket type
    bracketTypeSelect.addEventListener('change', () => {
        const thirdGroup = thirdPlaceSelect.closest('.form-group');
        if (bracketTypeSelect.value === 'double') {
            thirdGroup.style.opacity = '0.5';
            thirdGroup.style.pointerEvents = 'none';
            thirdPlaceSelect.value = 'no';
        } else {
            thirdGroup.style.opacity = '1';
            thirdGroup.style.pointerEvents = 'auto';
        }
    });

    let editingId = null;

    function resetCreateForm() {
        editingId = null;
        createForm.reset();
        participantCount.textContent = '0';
        document.getElementById('createTitle').textContent = 'Create Tournament';
        document.getElementById('createSubmitBtn').textContent = 'Generate Bracket';
        bracketTypeSelect.dispatchEvent(new Event('change'));
    }

    createForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const name = document.getElementById('tournamentName').value.trim();
        const type = bracketTypeSelect.value;
        const thirdPlace = thirdPlaceSelect.value === 'yes' && type === 'single';
        const shuffle = document.getElementById('shuffleParticipants').checked;

        let participants = participantsInput.value
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0 && l.toUpperCase() !== 'BYE');

        if (participants.length < 2) {
            showToast('Please enter at least 2 participants', 'error');
            return;
        }

        if (participants.length > 128) {
            showToast('Maximum 128 participants allowed', 'error');
            return;
        }

        if (shuffle) {
            participants = shuffleArray(participants);
        }

        if (editingId) {
            const existing = Storage.getTournament(editingId);
            if (existing) {
                existing.name = name;
                existing.type = type;
                existing.thirdPlace = thirdPlace;
                existing.participants = participants;
                existing.bracket = BracketEngine.generate(participants, type, thirdPlace);
                Storage.updateTournament(existing);
                const id = existing.id;
                resetCreateForm();
                renderDashboard();
                openBracket(id);
                showToast('Tournament updated');
                return;
            }
        }

        const tournament = {
            id: generateId(),
            name,
            type,
            thirdPlace,
            participants,
            createdAt: Date.now(),
            bracket: BracketEngine.generate(participants, type, thirdPlace)
        };

        Storage.addTournament(tournament);
        showToast('Tournament created successfully!');
        resetCreateForm();
        renderDashboard();
        openBracket(tournament.id);
    });

    // ===== Bracket View =====
    let currentTournamentId = null;

    function openBracket(id) {
        currentTournamentId = id;
        const tournament = Storage.getTournament(id);
        if (!tournament) return;

        document.getElementById('bracketTitle').textContent = tournament.name;
        updateBracketMeta(tournament);

        // Show/hide tabs for double elimination
        const tabs = document.getElementById('bracketTabs');
        const toggleThirdBtn = document.getElementById('toggleThirdPlaceBtn');
        if (tournament.type === 'double') {
            tabs.classList.add('visible');
            toggleThirdBtn.style.display = 'none';
            renderBracketTab('winners');
        } else {
            tabs.classList.remove('visible');
            toggleThirdBtn.style.display = '';
            toggleThirdBtn.textContent = tournament.thirdPlace ? '3rd Place: On' : '3rd Place: Off';
            toggleThirdBtn.classList.toggle('active', !!tournament.thirdPlace);
            renderSingleBracket(tournament);
        }

        switchView('bracket');
    }

    function updateBracketMeta(tournament) {
        const typeLabel = tournament.type === 'double' ? 'Double Elimination' : 'Single Elimination';
        const stats = BracketEngine.getStats(tournament.bracket);
        const champ = BracketEngine.getChampion(tournament.bracket);
        let meta = `${typeLabel} • ${tournament.participants.length} players • ${stats.decided}/${stats.total} matches`;
        if (champ && champ !== 'BYE') meta += ` • 🏆 ${champ}`;
        document.getElementById('bracketMeta').textContent = meta;
    }

    function renderSingleBracket(tournament) {
        const container = document.getElementById('bracketContainer');
        container.innerHTML = BracketRenderer.renderSingle(tournament);
        attachMatchListeners(tournament);
        attachEditListeners();
        // Draw connectors after a frame so DOM is laid out
        requestAnimationFrame(() => BracketRenderer.drawConnectors(container));
    }

    function renderBracketTab(tab) {
        const tournament = Storage.getTournament(currentTournamentId);
        if (!tournament) return;

        const container = document.getElementById('bracketContainer');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active');

        switch (tab) {
            case 'winners':
                container.innerHTML = BracketRenderer.renderWinners(tournament);
                break;
            case 'losers':
                container.innerHTML = BracketRenderer.renderLosers(tournament);
                break;
            case 'finals':
                container.innerHTML = BracketRenderer.renderFinals(tournament);
                break;
        }
        attachMatchListeners(tournament);
        attachEditListeners();
        requestAnimationFrame(() => BracketRenderer.drawConnectors(container));
    }

    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => renderBracketTab(btn.dataset.tab));
    });

    // ===== Match Interaction =====
    const matchModal = document.getElementById('matchModal');
    let currentMatch = null;
    let currentTournamentObj = null;

    function attachMatchListeners(tournament) {
        document.querySelectorAll('.bracket-match[data-match]').forEach(el => {
            el.addEventListener('click', () => {
                openMatchModal(tournament, el.dataset.match);
            });
        });
    }

    function openMatchModal(tournament, matchId) {
        // Always fetch fresh from storage so we modify the correct object
        const freshTournament = Storage.getTournament(tournament.id);
        if (!freshTournament) return;
        const match = BracketEngine.findMatchById(freshTournament.bracket, matchId);

        if (!match) return;
        if (!match.player1 || !match.player2 || match.player1 === 'BYE' || match.player2 === 'BYE') {
            showToast('Both players must be determined first', 'error');
            return;
        }

        currentMatch = match;
        currentTournamentObj = freshTournament;

        document.getElementById('modalPlayer1').textContent = match.player1;
        document.getElementById('modalPlayer2').textContent = match.player2;
        matchModal.classList.add('visible');
    }

    document.getElementById('pickPlayer1').addEventListener('click', () => {
        if (currentMatch) selectWinner(currentMatch.player1);
    });

    document.getElementById('pickPlayer2').addEventListener('click', () => {
        if (currentMatch) selectWinner(currentMatch.player2);
    });

    document.getElementById('closeModal').addEventListener('click', closeModal);
    matchModal.addEventListener('click', (e) => {
        if (e.target === matchModal) closeModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && matchModal.classList.contains('visible')) closeModal();
    });

    function closeModal() {
        matchModal.classList.remove('visible');
        currentMatch = null;
        currentTournamentObj = null;
    }

    function selectWinner(winner) {
        if (!currentMatch || !currentTournamentId || !currentTournamentObj) return;

        const tournament = currentTournamentObj;
        if (!BracketEngine.setResult(tournament.bracket, currentMatch.id, winner)) {
            closeModal();
            return;
        }

        Storage.updateTournament(tournament);
        closeModal();
        rerenderBracket(tournament);
    }

    function rerenderBracket(tournament) {
        if (tournament.type === 'double') {
            const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
            renderBracketTab(activeTab);
        } else {
            renderSingleBracket(tournament);
        }
        updateBracketMeta(tournament);
    }

    // ===== Inline Name Editing =====
    function attachEditListeners() {
        document.querySelectorAll('.edit-name-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Don't trigger match click
                const matchId = btn.dataset.matchId;
                const slot = btn.dataset.slot;
                startInlineEdit(btn.closest('.match-slot'), matchId, slot);
            });
        });
    }

    function startInlineEdit(slotEl, matchId, slot) {
        const nameEl = slotEl.querySelector('.slot-name');
        const currentName = nameEl.textContent.trim();
        const displayName = currentName === 'TBD' ? '' : currentName;

        // Replace name span with input
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'inline-edit-input';
        input.value = displayName;
        input.placeholder = 'Enter name or BYE';

        nameEl.style.display = 'none';
        slotEl.querySelector('.edit-name-btn').style.display = 'none';
        nameEl.parentNode.insertBefore(input, nameEl.nextSibling);
        input.focus();
        input.select();

        function finishEdit() {
            const newName = input.value.trim();
            input.remove();
            nameEl.style.display = '';
            slotEl.querySelector('.edit-name-btn').style.display = '';

            if (newName !== displayName) {
                saveName(matchId, slot, newName);
            }
        }

        input.addEventListener('blur', finishEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            }
            if (e.key === 'Escape') {
                input.value = displayName; // revert
                input.blur();
            }
        });
    }

    function saveName(matchId, slot, newName) {
        if (!currentTournamentId) return;
        const tournament = Storage.getTournament(currentTournamentId);
        if (!tournament) return;

        BracketEngine.updatePlayerName(tournament.bracket, matchId, slot, newName || null);
        Storage.updateTournament(tournament);
        rerenderBracket(tournament);
        showToast('Player name updated');
    }

    // ===== Bracket Actions =====
    document.getElementById('backToDashboard').addEventListener('click', () => {
        switchView('dashboard');
        renderDashboard();
    });

    // Tournament name editing
    document.getElementById('bracketTitle').addEventListener('click', () => {
        if (!currentTournamentId) return;
        const titleEl = document.getElementById('bracketTitle');
        const currentName = titleEl.textContent;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'title-edit-input';
        input.value = currentName;

        titleEl.style.display = 'none';
        titleEl.parentNode.insertBefore(input, titleEl);
        input.focus();
        input.select();

        function finishTitleEdit() {
            const newName = input.value.trim();
            input.remove();
            titleEl.style.display = '';

            if (newName && newName !== currentName) {
                const tournament = Storage.getTournament(currentTournamentId);
                if (tournament) {
                    tournament.name = newName;
                    Storage.updateTournament(tournament);
                    titleEl.textContent = newName;
                    showToast('Tournament renamed');
                }
            }
        }

        input.addEventListener('blur', finishTitleEdit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') { input.value = currentName; input.blur(); }
        });
    });

    // Edit participants (reopens the form prefilled and rebuilds the bracket)
    document.getElementById('editParticipantsBtn').addEventListener('click', () => {
        if (!currentTournamentId) return;
        const tournament = Storage.getTournament(currentTournamentId);
        if (!tournament) return;

        editingId = tournament.id;
        document.getElementById('tournamentName').value = tournament.name;
        bracketTypeSelect.value = tournament.type;
        thirdPlaceSelect.value = tournament.thirdPlace ? 'yes' : 'no';
        participantsInput.value = tournament.participants.join('\n');
        participantCount.textContent = tournament.participants.length;
        bracketTypeSelect.dispatchEvent(new Event('change'));
        document.getElementById('createTitle').textContent = 'Edit Tournament';
        document.getElementById('createSubmitBtn').textContent = 'Save & Rebuild';
        switchView('create');
    });

    document.getElementById('toggleThirdPlaceBtn').addEventListener('click', () => {
        if (!currentTournamentId) return;
        const tournament = Storage.getTournament(currentTournamentId);
        if (!tournament || tournament.type !== 'single') return;

        const stats = BracketEngine.getStats(tournament.bracket);
        if (stats.decided > 0 &&
            !confirm('Changing the third-place setting rebuilds the bracket and clears results. Continue?')) {
            return;
        }

        tournament.thirdPlace = !tournament.thirdPlace;
        tournament.bracket = BracketEngine.generate(
            tournament.participants, tournament.type, tournament.thirdPlace
        );

        Storage.updateTournament(tournament);
        openBracket(tournament.id);
        showToast(tournament.thirdPlace ? '3rd place match enabled' : '3rd place match disabled');
    });

    document.getElementById('resetBracketBtn').addEventListener('click', () => {
        if (!currentTournamentId) return;
        if (!confirm('Reset all match results? This cannot be undone.')) return;

        const tournament = Storage.getTournament(currentTournamentId);
        if (!tournament) return;

        tournament.bracket = BracketEngine.generate(
            tournament.participants, tournament.type, tournament.thirdPlace
        );
        Storage.updateTournament(tournament);
        openBracket(tournament.id);
        showToast('Bracket reset successfully');
    });

    document.getElementById('deleteBracketBtn').addEventListener('click', () => {
        if (!currentTournamentId) return;
        if (!confirm('Delete this tournament? This cannot be undone.')) return;

        Storage.deleteTournament(currentTournamentId);
        currentTournamentId = null;
        switchView('dashboard');
        renderDashboard();
        showToast('Tournament deleted');
    });

    document.getElementById('exportBracketBtn').addEventListener('click', () => {
        if (!currentTournamentId) return;
        const json = Storage.exportOne(currentTournamentId);
        if (json) downloadFile(json, `bracket-${currentTournamentId}.json`);
    });

    // ===== Import / Export All =====
    document.getElementById('exportAllBtn').addEventListener('click', () => {
        const json = Storage.exportAll();
        downloadFile(json, `all-brackets-${Date.now()}.json`);
        showToast('All brackets exported');
    });

    document.getElementById('importBtn').addEventListener('click', () => {
        document.getElementById('fileInput').click();
    });

    document.getElementById('fileInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            const result = Storage.importData(ev.target.result);
            if (result === -1) {
                showToast('Invalid file format', 'error');
            } else {
                showToast(`Imported ${result} tournament(s)`);
                renderDashboard();
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    function downloadFile(content, filename) {
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ===== Navigation Buttons =====
    document.getElementById('newTournamentBtn').addEventListener('click', () => { resetCreateForm(); switchView('create'); });
    document.getElementById('emptyCreateBtn').addEventListener('click', () => { resetCreateForm(); switchView('create'); });
    document.querySelector('.nav-btn[data-view="create"]').addEventListener('click', resetCreateForm);
    document.getElementById('cancelCreate').addEventListener('click', () => {
        resetCreateForm();
        switchView('dashboard');
        renderDashboard();
    });

    // ===== Init =====
    renderDashboard();

    // ===== Firebase Auth =====
    let isSignUpMode = false;

    function updateAuthUI(user) {
        const loggedOut = document.getElementById('authLoggedOut');
        const loggedIn = document.getElementById('authLoggedIn');
        if (user) {
            loggedOut.style.display = 'none';
            loggedIn.style.display = 'block';
            const displayName = user.displayName || user.email || 'User';
            document.getElementById('userName').textContent = displayName;
            const initials = displayName.charAt(0).toUpperCase();
            document.getElementById('userAvatarPlaceholder').textContent = initials;
            document.getElementById('syncStatus').textContent = 'Syncing...';
        } else {
            loggedOut.style.display = 'block';
            loggedIn.style.display = 'none';
        }
    }

    async function syncFromCloud() {
        if (!Auth.isLoggedIn()) return;
        const syncStatus = document.getElementById('syncStatus');
        try {
            syncStatus.textContent = 'Syncing...';
            const cloudData = await FireStore.getAll();

            if (cloudData.length > 0) {
                // Cloud is source of truth — merge with any unsaved local data
                const localData = Storage.getAll();
                const cloudIds = new Set(cloudData.map(t => t.id));
                const localOnly = localData.filter(t => !cloudIds.has(t.id));

                // Final local store = cloud data + any local-only items
                const merged = [...cloudData, ...localOnly];
                Storage.save(merged);

                // Push local-only items to cloud so they persist
                if (localOnly.length > 0) {
                    await FireStore.saveAll(localOnly);
                }
            } else {
                // No cloud data yet — push current local data to cloud
                const localData = Storage.getAll();
                if (localData.length > 0) {
                    await FireStore.saveAll(localData);
                }
            }

            syncStatus.textContent = '✓ Synced';
            setTimeout(() => { syncStatus.textContent = ''; }, 2000);
            renderDashboard();
        } catch (e) {
            console.error('Cloud sync failed:', e);
            syncStatus.textContent = '✗ Sync failed';
        }
    }

    function handleLogout() {
        // Clear local storage on logout so next user gets clean slate
        Storage.save([]);
        renderDashboard();
        switchView('dashboard');
    }

    Auth.init((user) => {
        updateAuthUI(user);
        if (user) {
            syncFromCloud();
        } else {
            // User just logged out
            handleLogout();
        }
    });

    // Email/Password form
    const authForm = document.getElementById('authForm');
    const authError = document.getElementById('authError');
    const authSubmitBtn = document.getElementById('authSubmitBtn');
    const authToggleBtn = document.getElementById('authToggleBtn');
    const authForgotBtn = document.getElementById('authForgotBtn');

    const authConfirmPassword = document.getElementById('authConfirmPassword');

    authToggleBtn.addEventListener('click', () => {
        isSignUpMode = !isSignUpMode;
        authSubmitBtn.textContent = isSignUpMode ? 'Create Account' : 'Sign In';
        authToggleBtn.textContent = isSignUpMode ? 'Already have an account?' : 'Create account';
        authForgotBtn.style.display = isSignUpMode ? 'none' : '';
        authConfirmPassword.style.display = isSignUpMode ? '' : 'none';
        authConfirmPassword.required = isSignUpMode;
        authError.textContent = '';
    });

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('authEmail').value.trim();
        const password = document.getElementById('authPassword').value;
        const confirmPassword = authConfirmPassword.value;

        if (!email || !password) return;

        if (isSignUpMode && password !== confirmPassword) {
            authError.textContent = 'Passwords do not match.';
            return;
        }

        authSubmitBtn.disabled = true;
        authError.textContent = '';

        let result;
        if (isSignUpMode) {
            result = await Auth.signUp(email, password);
        } else {
            result = await Auth.signIn(email, password);
        }

        if (!result.success) {
            authError.textContent = result.message;
        } else {
            authForm.reset();
        }
        authSubmitBtn.disabled = false;
    });

    authForgotBtn.addEventListener('click', async () => {
        const email = document.getElementById('authEmail').value.trim();
        if (!email) {
            authError.textContent = 'Enter your email above, then click Forgot password.';
            return;
        }
        const result = await Auth.resetPassword(email);
        if (result.success) {
            showToast('Password reset email sent');
            authError.textContent = '';
        } else {
            authError.textContent = result.message;
        }
    });

    // Google sign-in
    document.getElementById('googleSignInBtn').addEventListener('click', async () => {
        const result = await Auth.signInWithGoogle();
        if (!result.success) {
            document.getElementById('authError').textContent = result.message;
        }
    });

    // Sign out
    document.getElementById('signOutBtn').addEventListener('click', () => {
        Auth.signOut();
        showToast('Signed out');
    });

    // Redraw connectors on resize
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const container = document.getElementById('bracketContainer');
            if (container && document.getElementById('view-bracket').classList.contains('active')) {
                BracketRenderer.drawConnectors(container);
            }
        }, 150);
    });

})();
