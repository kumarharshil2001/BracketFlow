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
    }

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

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

            card.innerHTML = `
                <div class="card-header">
                    <div class="card-title">${escapeHtml(t.name)}</div>
                    <span class="card-badge ${badgeClass}">${typeLabel}</span>
                </div>
                <div class="card-info">
                    <span>${participants} participants</span>
                    <span>${rounds} rounds</span>
                </div>
                <div class="card-date">Created ${formatDate(t.createdAt)}</div>
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

    createForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const name = document.getElementById('tournamentName').value.trim();
        const type = bracketTypeSelect.value;
        const thirdPlace = thirdPlaceSelect.value === 'yes' && type === 'single';
        const shuffle = document.getElementById('shuffleParticipants').checked;

        let participants = participantsInput.value
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 0);

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
        createForm.reset();
        participantCount.textContent = '0';
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
        const typeLabel = tournament.type === 'double' ? 'Double Elimination' : 'Single Elimination';
        const matchCount = tournament.bracket.winners[0].length;
        document.getElementById('bracketMeta').textContent =
            `${typeLabel} • ${matchCount * 2} slots • ${tournament.bracket.rounds} rounds`;

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
    let currentBracketSection = null;
    let currentTournamentObj = null;

    function attachMatchListeners(tournament) {
        document.querySelectorAll('.bracket-match[data-match]').forEach(el => {
            el.addEventListener('click', () => {
                const matchId = el.dataset.match;
                const section = el.dataset.section || 'winners';
                openMatchModal(tournament, matchId, section);
            });
        });
    }

    function openMatchModal(tournament, matchId, section) {
        // Always fetch fresh from storage so we modify the correct object
        const freshTournament = Storage.getTournament(tournament.id);
        if (!freshTournament) return;
        const bracket = freshTournament.bracket;
        let match;

        if (section === 'winners' || section === 'single') {
            match = findMatch(bracket.winners, matchId);
        } else if (section === 'losers') {
            match = findMatch(bracket.losers, matchId);
        } else if (section === 'finals') {
            match = bracket.grandFinals && bracket.grandFinals.id === matchId
                ? bracket.grandFinals : null;
            if (!match && bracket.thirdPlace && bracket.thirdPlace.id === matchId) {
                match = bracket.thirdPlace;
            }
        }

        if (!match) return;
        if (!match.player1 || !match.player2) {
            showToast('Both players must be determined first', 'error');
            return;
        }

        currentMatch = match;
        currentBracketSection = section;
        currentTournamentObj = freshTournament;

        document.getElementById('modalPlayer1').textContent = match.player1;
        document.getElementById('modalPlayer2').textContent = match.player2;
        matchModal.classList.add('visible');
    }

    function findMatch(rounds, matchId) {
        if (!rounds) return null;
        for (const round of rounds) {
            for (const match of round) {
                if (match.id === matchId) return match;
            }
        }
        return null;
    }

    document.getElementById('pickPlayer1').addEventListener('click', () => {
        if (currentMatch) selectWinner(currentMatch.player1);
    });

    document.getElementById('pickPlayer2').addEventListener('click', () => {
        if (currentMatch) selectWinner(currentMatch.player2);
    });

    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('deleteMatchBtn').addEventListener('click', deleteMatch);
    matchModal.addEventListener('click', (e) => {
        if (e.target === matchModal) closeModal();
    });

    function closeModal() {
        matchModal.classList.remove('visible');
        currentMatch = null;
        currentTournamentObj = null;
    }

    function selectWinner(winner) {
        if (!currentMatch || !currentTournamentId || !currentTournamentObj) return;

        const tournament = currentTournamentObj;
        // Find the match inside the fresh tournament object
        const match = BracketEngine.findMatchById(tournament.bracket, currentMatch.id);
        if (!match) return;

        const loser = match.player1 === winner ? match.player2 : match.player1;
        match.winner = winner;
        match.loser = loser;

        // Advance winner to next match (also clears downstream if re-selecting)
        BracketEngine.advanceWinner(tournament.bracket, match, winner, loser, currentBracketSection);

        // Handle third place for single elimination
        if (tournament.bracket.type === 'single' && tournament.bracket.thirdPlace && tournament.bracket.winners.length >= 2) {
            const semiRound = tournament.bracket.winners[tournament.bracket.winners.length - 2];
            const semiLosers = semiRound.filter(m => m.loser).map(m => m.loser);
            if (semiLosers.length >= 2) {
                tournament.bracket.thirdPlace.player1 = semiLosers[0];
                tournament.bracket.thirdPlace.player2 = semiLosers[1];
            }
        }

        Storage.updateTournament(tournament);
        closeModal();

        // Re-render
        if (tournament.type === 'double') {
            const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
            renderBracketTab(activeTab);
        } else {
            renderSingleBracket(tournament);
        }
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

        // Card delete buttons
        document.querySelectorAll('.card-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const matchId = btn.dataset.matchId;
                deleteMatchById(matchId);
            });
        });
    }

    function deleteMatchById(matchId) {
        if (!currentTournamentId) return;
        const tournament = Storage.getTournament(currentTournamentId);
        if (!tournament) return;

        const firstRound = tournament.bracket.winners[0];
        if (firstRound.length <= 1) {
            showToast('Cannot delete the last match', 'error');
            return;
        }

        const idx = firstRound.findIndex(m => m.id === matchId);
        if (idx === -1) {
            showToast('Only first-round matches can be deleted', 'error');
            return;
        }

        if (!confirm('Delete this match? This will rebuild the bracket.')) return;

        firstRound.splice(idx, 1);
        rebuildBracketLinks(tournament.bracket);
        Storage.updateTournament(tournament);
        openBracket(tournament.id);
        showToast('Match deleted');
    }

    function deleteMatch() {
        if (!currentMatch || !currentTournamentId) return;
        const tournament = Storage.getTournament(currentTournamentId);
        if (!tournament) return;

        const firstRound = tournament.bracket.winners[0];
        if (firstRound.length <= 1) {
            showToast('Cannot delete the last match', 'error');
            return;
        }

        const idx = firstRound.findIndex(m => m.id === currentMatch.id);
        if (idx === -1) {
            showToast('Only first-round matches can be deleted', 'error');
            return;
        }

        if (!confirm('Delete this match? This will rebuild the bracket.')) return;

        firstRound.splice(idx, 1);
        rebuildBracketLinks(tournament.bracket);
        Storage.updateTournament(tournament);
        matchModal.classList.remove('visible');
        currentMatch = null;
        openBracket(tournament.id);
        showToast('Match deleted');
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

        // Re-render
        if (tournament.type === 'double') {
            const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
            renderBracketTab(activeTab);
        } else {
            renderSingleBracket(tournament);
        }
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

    // Add match (add two new participant slots)
    document.getElementById('addMatchBtn').addEventListener('click', () => {
        if (!currentTournamentId) return;
        const tournament = Storage.getTournament(currentTournamentId);
        if (!tournament) return;

        const bracket = tournament.bracket;
        const firstRound = bracket.winners[0];

        // Create a new match in the first round
        const maxId = firstRound.reduce((max, m) => {
            const num = parseInt(m.id.replace(/\D/g, '')) || 0;
            return Math.max(max, num);
        }, 0);

        const newMatch = {
            id: `w-r0-m${maxId + 1}`,
            player1: null,
            player2: null,
            seed1: null,
            seed2: null,
            winner: null,
            loser: null,
            nextMatchId: null,
            nextSlot: null
        };

        firstRound.push(newMatch);
        tournament.participants.push('', ''); // Placeholder

        // Regenerate linkages for all rounds beyond the first
        rebuildBracketLinks(bracket);

        Storage.updateTournament(tournament);
        openBracket(tournament.id);
        showToast('New match added — edit player names to fill it');
    });

    /**
     * Rebuild bracket links after adding/removing first round matches.
     * Regenerates rounds 2+ to match the new first round size.
     */
    function rebuildBracketLinks(bracket) {
        const firstRound = bracket.winners[0];
        bracket.winners = [firstRound];

        let matchCounter = firstRound.length * 10; // Avoid ID collisions
        let prevRound = firstRound;

        // Clear old nextMatchId links
        firstRound.forEach(m => { m.nextMatchId = null; m.nextSlot = null; });

        while (prevRound.length > 1) {
            const round = [];
            for (let i = 0; i < prevRound.length; i += 2) {
                const match = {
                    id: `w-r${bracket.winners.length}-m${matchCounter++}`,
                    player1: null,
                    player2: null,
                    seed1: null,
                    seed2: null,
                    winner: null,
                    loser: null,
                    nextMatchId: null,
                    nextSlot: null
                };

                prevRound[i].nextMatchId = match.id;
                prevRound[i].nextSlot = 'player1';

                if (i + 1 < prevRound.length) {
                    prevRound[i + 1].nextMatchId = match.id;
                    prevRound[i + 1].nextSlot = 'player2';
                } else {
                    match.singleFeeder = true;
                }

                // Carry forward winners from first round if they exist
                if (prevRound[i].winner) {
                    match.player1 = prevRound[i].winner;
                }
                if (i + 1 < prevRound.length && prevRound[i + 1] && prevRound[i + 1].winner) {
                    match.player2 = prevRound[i + 1].winner;
                }

                round.push(match);
            }
            bracket.winners.push(round);
            prevRound = round;
        }

        bracket.rounds = bracket.winners.length;
    }

    document.getElementById('toggleThirdPlaceBtn').addEventListener('click', () => {
        if (!currentTournamentId) return;
        const tournament = Storage.getTournament(currentTournamentId);
        if (!tournament || tournament.type !== 'single') return;

        tournament.thirdPlace = !tournament.thirdPlace;

        if (tournament.thirdPlace) {
            // Add 3rd place match
            tournament.bracket.thirdPlace = {
                id: 'third-place',
                player1: null,
                player2: null,
                seed1: null,
                seed2: null,
                winner: null,
                loser: null
            };
        } else {
            // Remove 3rd place match
            delete tournament.bracket.thirdPlace;
        }

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
    document.getElementById('newTournamentBtn').addEventListener('click', () => switchView('create'));
    document.getElementById('emptyCreateBtn').addEventListener('click', () => switchView('create'));
    document.getElementById('cancelCreate').addEventListener('click', () => {
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
