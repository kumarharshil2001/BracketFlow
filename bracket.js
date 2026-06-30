/**
 * Bracket Builder - Bracket Engine & Renderer
 * Generates bracket data structures and renders them as interactive HTML.
 */

// ===== Bracket Engine =====
const BracketEngine = {
    /**
     * Generate a full bracket structure for a tournament.
     * The field is padded to the next power of two with BYE entries using
     * standard tournament seeding, so every bracket is perfectly symmetric.
     * BYE matches resolve automatically.
     */
    generate(participants, type, thirdPlace) {
        if (type === 'double') {
            return this.generateDouble(participants);
        }
        return this.generateSingle(participants, thirdPlace);
    },

    /** Smallest power of two >= n (minimum 2). */
    nextPow2(n) {
        let p = 1;
        while (p < n) p <<= 1;
        return Math.max(2, p);
    },

    /** Standard seeding order for a power-of-two bracket (1 vs lowest, etc.). */
    seedOrder(size) {
        let order = [1, 2];
        while (order.length < size) {
            const sum = order.length * 2 + 1;
            const next = [];
            for (const s of order) {
                next.push(s);
                next.push(sum - s);
            }
            order = next;
        }
        return order;
    },

    makeMatch(id, section, round, p1, p2, s1, s2) {
        return {
            id,
            section,
            round,
            player1: p1 != null ? p1 : null,
            player2: p2 != null ? p2 : null,
            seed1: s1 != null ? s1 : null,
            seed2: s2 != null ? s2 : null,
            winner: null,
            loser: null,
            winnerTo: null,
            loserTo: null
        };
    },

    /** Build the seeded first round, padding with BYE up to a power of two. */
    buildFirstRound(participants, counter) {
        const size = this.nextPow2(participants.length);
        const order = this.seedOrder(size);
        const round = [];
        for (let i = 0; i < size; i += 2) {
            const s1 = order[i];
            const s2 = order[i + 1];
            const p1 = s1 <= participants.length ? participants[s1 - 1] : 'BYE';
            const p2 = s2 <= participants.length ? participants[s2 - 1] : 'BYE';
            round.push(this.makeMatch(`w-r0-m${counter.v++}`, 'winners', 0, p1, p2, s1, s2));
        }
        return round;
    },

    /** Build the empty advancing rounds of a winners-style bracket. */
    buildWinnerRounds(first, totalRounds, counter) {
        const rounds = [first];
        let prev = first;
        for (let r = 1; r < totalRounds; r++) {
            const round = [];
            for (let i = 0; i < prev.length; i += 2) {
                const m = this.makeMatch(`w-r${r}-m${counter.v++}`, 'winners', r, null, null, null, null);
                prev[i].winnerTo = { matchId: m.id, slot: 'player1' };
                prev[i + 1].winnerTo = { matchId: m.id, slot: 'player2' };
                round.push(m);
            }
            rounds.push(round);
            prev = round;
        }
        return rounds;
    },

    generateSingle(participants, thirdPlace) {
        const counter = { v: 0 };
        const first = this.buildFirstRound(participants, counter);
        const totalRounds = Math.log2(first.length * 2);
        const winners = this.buildWinnerRounds(first, totalRounds, counter);

        const bracket = { type: 'single', winners, rounds: totalRounds };

        if (thirdPlace && totalRounds >= 2) {
            const tp = this.makeMatch('tp-m0', 'third', totalRounds - 1, null, null, null, null);
            const semis = winners[totalRounds - 2];
            semis[0].loserTo = { matchId: tp.id, slot: 'player1' };
            semis[1].loserTo = { matchId: tp.id, slot: 'player2' };
            bracket.thirdPlace = tp;
        }

        this.resolveByes(bracket);
        return bracket;
    },

    generateDouble(participants) {
        const counter = { v: 0 };
        const first = this.buildFirstRound(participants, counter);
        const k = Math.log2(first.length * 2); // winners-bracket rounds
        const winners = this.buildWinnerRounds(first, k, counter);

        // Losers bracket: 2*(k-1) rounds, sizes N/4, N/4, N/8, N/8, ... 1, 1.
        const losers = [];
        let lc = 1000;
        const lbRounds = 2 * (k - 1);
        for (let r = 0; r < lbRounds; r++) {
            const pair = Math.floor(r / 2);
            const size = Math.max(1, Math.pow(2, k - pair - 2));
            const round = [];
            for (let i = 0; i < size; i++) {
                round.push(this.makeMatch(`l-r${r}-m${lc++}`, 'losers', r, null, null, null, null));
            }
            losers.push(round);
        }

        // Link losers-bracket progression.
        // Even (minor) rounds feed 1:1 into the next major round's player1.
        // Odd (major) rounds combine in pairs into the next minor round.
        for (let r = 0; r < losers.length - 1; r++) {
            const round = losers[r];
            const next = losers[r + 1];
            const isMajor = r % 2 === 1;
            if (isMajor) {
                for (let i = 0; i < round.length; i++) {
                    round[i].winnerTo = {
                        matchId: next[Math.floor(i / 2)].id,
                        slot: i % 2 === 0 ? 'player1' : 'player2'
                    };
                }
            } else {
                for (let i = 0; i < round.length; i++) {
                    round[i].winnerTo = { matchId: next[i].id, slot: 'player1' };
                }
            }
        }

        // Route winners-bracket losers into the losers bracket.
        if (lbRounds > 0) {
            // WB round 0 losers -> LB round 0 (two per match).
            first.forEach((m, i) => {
                m.loserTo = {
                    matchId: losers[0][Math.floor(i / 2)].id,
                    slot: i % 2 === 0 ? 'player1' : 'player2'
                };
            });
            // WB round r (r>=1) losers -> LB round (2r-1), filling player2.
            for (let r = 1; r < k; r++) {
                const lbRound = losers[2 * r - 1];
                winners[r].forEach((m, i) => {
                    if (lbRound && lbRound[i]) {
                        m.loserTo = { matchId: lbRound[i].id, slot: 'player2' };
                    }
                });
            }
        }

        // Grand finals.
        const gf = this.makeMatch('gf-m0', 'grand', k, null, null, null, null);
        const wbFinal = winners[k - 1][0];
        wbFinal.winnerTo = { matchId: gf.id, slot: 'player1' };
        if (lbRounds === 0) {
            wbFinal.loserTo = { matchId: gf.id, slot: 'player2' };
        } else {
            const lbFinal = losers[losers.length - 1][0];
            lbFinal.winnerTo = { matchId: gf.id, slot: 'player2' };
        }

        const bracket = { type: 'double', winners, losers, grandFinals: gf, rounds: k };
        this.resolveByes(bracket);
        return bracket;
    },

    /** Apply a decided result and push players forward (no downstream clearing). */
    applyResult(bracket, match, winner) {
        const loser = match.player1 === winner ? match.player2 : match.player1;
        match.winner = winner;
        match.loser = loser;
        if (match.winnerTo) {
            const t = this.findMatchById(bracket, match.winnerTo.matchId);
            if (t) {
                t[match.winnerTo.slot] = winner;
                this.autoResolve(bracket, t);
            }
        }
        if (match.loserTo) {
            const t = this.findMatchById(bracket, match.loserTo.matchId);
            if (t) {
                t[match.loserTo.slot] = loser;
                this.autoResolve(bracket, t);
            }
        }
    },

    /** Auto-advance a match if it has become a BYE pairing. */
    autoResolve(bracket, match) {
        if (match.winner || !match.player1 || !match.player2) return;
        const p1Bye = match.player1 === 'BYE';
        const p2Bye = match.player2 === 'BYE';
        if (p1Bye && !p2Bye) this.applyResult(bracket, match, match.player2);
        else if (p2Bye && !p1Bye) this.applyResult(bracket, match, match.player1);
        else if (p1Bye && p2Bye) this.applyResult(bracket, match, 'BYE');
    },

    /** Resolve every BYE across a freshly generated bracket. */
    resolveByes(bracket) {
        const visit = (rounds) => {
            if (!rounds) return;
            for (const round of rounds) {
                for (const m of round) this.autoResolve(bracket, m);
            }
        };
        visit(bracket.winners);
        visit(bracket.losers);
        if (bracket.grandFinals) this.autoResolve(bracket, bracket.grandFinals);
        if (bracket.thirdPlace) this.autoResolve(bracket, bracket.thirdPlace);
    },

    /** Record a user-selected winner, clearing any stale downstream results. */
    setResult(bracket, matchId, winner) {
        const match = this.findMatchById(bracket, matchId);
        if (!match || !match.player1 || !match.player2) return false;
        if (winner !== match.player1 && winner !== match.player2) return false;
        if (match.winner) this.clearDownstream(bracket, match);
        this.applyResult(bracket, match, winner);
        return true;
    },

    /** Clear results that depended on this match's outcome. */
    clearDownstream(bracket, match) {
        const clearLink = (link) => {
            if (!link) return;
            const t = this.findMatchById(bracket, link.matchId);
            if (!t) return;
            const hadResult = !!t.winner;
            t[link.slot] = null;
            if (hadResult) {
                t.winner = null;
                t.loser = null;
                this.clearDownstream(bracket, t);
            }
        };
        clearLink(match.winnerTo);
        clearLink(match.loserTo);
    },

    /** Rename a player and cascade the change to every downstream appearance. */
    updatePlayerName(bracket, matchId, slot, newName) {
        const match = this.findMatchById(bracket, matchId);
        if (!match) return;
        const oldName = match[slot];
        match[slot] = newName || null;
        if (!oldName || oldName === newName) return;

        const cascade = (link) => {
            if (!link) return;
            const t = this.findMatchById(bracket, link.matchId);
            if (t && t[link.slot] === oldName) {
                t[link.slot] = newName || null;
                propagate(t);
            }
        };
        const propagate = (m) => {
            if (m.winner === oldName) {
                m.winner = newName || null;
                cascade(m.winnerTo);
            }
            if (m.loser === oldName) {
                m.loser = newName || null;
                cascade(m.loserTo);
            }
        };
        propagate(match);
    },

    findMatchById(bracket, matchId) {
        const scan = (rounds) => {
            if (!rounds) return null;
            for (const round of rounds) {
                for (const m of round) if (m.id === matchId) return m;
            }
            return null;
        };
        return scan(bracket.winners) ||
            scan(bracket.losers) ||
            (bracket.grandFinals && bracket.grandFinals.id === matchId ? bracket.grandFinals : null) ||
            (bracket.thirdPlace && bracket.thirdPlace.id === matchId ? bracket.thirdPlace : null);
    },

    /** Count decidable matches (excluding BYEs) and how many are decided. */
    getStats(bracket) {
        let total = 0;
        let decided = 0;
        const tally = (m) => {
            if (!m) return;
            if (m.player1 === 'BYE' || m.player2 === 'BYE') return;
            total++;
            if (m.winner) decided++;
        };
        const visit = (rounds) => { if (rounds) rounds.forEach(r => r.forEach(tally)); };
        visit(bracket.winners);
        visit(bracket.losers);
        tally(bracket.grandFinals);
        tally(bracket.thirdPlace);
        return { total, decided };
    },

    /** Overall tournament champion, if decided. */
    getChampion(bracket) {
        if (bracket.type === 'double') {
            return bracket.grandFinals ? bracket.grandFinals.winner : null;
        }
        const finalRound = bracket.winners[bracket.winners.length - 1];
        return finalRound && finalRound[0] ? finalRound[0].winner : null;
    }
};


// ===== Bracket Renderer =====
const BracketRenderer = {

    renderSingle(tournament) {
        const bracket = tournament.bracket;
        const cols = this.renderColumns(bracket.winners, 'single', this.getRoundNames(bracket.winners.length));
        const champ = BracketEngine.getChampion(bracket);
        let html = `<div class="bracket-wrapper" id="bracketTree">${cols}` +
            (champ && champ !== 'BYE' ? this.championColumn('Champion', '🏆', champ) : '') +
            '</div>';

        if (bracket.thirdPlace) {
            html += `
                <div class="third-place-section">
                    <div class="section-title">🥉 Third Place Match</div>
                    <div class="bracket-wrapper">
                        <div class="bracket-round"><div class="round-matches">
                            ${this.renderMatch(bracket.thirdPlace, 'finals')}
                        </div></div>
                    </div>
                </div>`;
        }
        return html;
    },

    renderWinners(tournament) {
        const bracket = tournament.bracket;
        const cols = this.renderColumns(bracket.winners, 'winners', this.getRoundNames(bracket.winners.length));
        const finalMatch = bracket.winners[bracket.winners.length - 1][0];
        const champ = finalMatch ? finalMatch.winner : null;
        return `<div class="bracket-wrapper" id="bracketTree">${cols}` +
            (champ && champ !== 'BYE' ? this.championColumn('Winners Champion', '👑', champ) : '') +
            '</div>';
    },

    renderLosers(tournament) {
        const losers = tournament.bracket.losers;
        if (!losers || losers.length === 0) {
            return '<p class="bracket-empty">This tournament has no losers bracket.</p>';
        }
        const names = losers.map((_, i) => `Losers Round ${i + 1}`);
        const cols = this.renderColumns(losers, 'losers', names);
        const last = losers[losers.length - 1];
        const champ = last && last.length === 1 ? last[0].winner : null;
        return `<div class="bracket-wrapper" id="bracketTree">${cols}` +
            (champ && champ !== 'BYE' ? this.championColumn('Losers Champion', '⚔️', champ) : '') +
            '</div>';
    },

    renderFinals(tournament) {
        const gf = tournament.bracket.grandFinals;
        if (!gf) return '<p class="bracket-empty">Grand Finals not available.</p>';

        let html = '<div class="finals-wrap">';
        html += '<div class="round-title finals-title">Grand Finals</div>';
        html += this.renderMatch(gf, 'finals');
        if (gf.winner) {
            html += `
                <div class="champion-display">
                    <div class="trophy">🏆</div>
                    <div class="champion-label">Tournament Champion</div>
                    <div class="champion-name">${this.escapeHtml(gf.winner)}</div>
                </div>`;
        }
        html += '</div>';
        return html;
    },

    renderColumns(rounds, section, names) {
        let html = '';
        rounds.forEach((round, rIdx) => {
            html += `<div class="bracket-round" data-round="${rIdx}">`;
            html += `<div class="round-title">${names[rIdx]}</div>`;
            html += '<div class="round-matches">';
            round.forEach(match => {
                html += this.renderMatch(match, section);
            });
            html += '</div></div>';
        });
        return html;
    },

    championColumn(label, icon, name) {
        return `
            <div class="bracket-round champion-round">
                <div class="round-title">${this.escapeHtml(label)}</div>
                <div class="round-matches">
                    <div class="champion-display">
                        <div class="trophy">${icon}</div>
                        <div class="champion-label">${this.escapeHtml(label)}</div>
                        <div class="champion-name">${this.escapeHtml(name)}</div>
                    </div>
                </div>
            </div>`;
    },

    renderMatch(match, section) {
        const p1Name = match.player1 || '';
        const p2Name = match.player2 || '';
        const p1Bye = p1Name === 'BYE';
        const p2Bye = p2Name === 'BYE';
        const isCompleted = match.winner ? 'completed' : '';

        const p1Display = p1Name || 'TBD';
        const p2Display = p2Name || 'TBD';

        const p1Class = match.winner ? (match.winner === match.player1 ? 'winner' : 'loser') : '';
        const p2Class = match.winner ? (match.winner === match.player2 ? 'winner' : 'loser') : '';
        const nameClass1 = !p1Name ? 'tbd' : (p1Bye ? 'bye' : '');
        const nameClass2 = !p2Name ? 'tbd' : (p2Bye ? 'bye' : '');

        const decidable = p1Name && p2Name && !p1Bye && !p2Bye;
        const clickable = decidable ? `data-match="${match.id}" data-section="${section}"` : '';
        const nextAttr = match.winnerTo ? ` data-next="${match.winnerTo.matchId}"` : '';

        return `
            <div class="bracket-match ${isCompleted} ${decidable ? '' : 'locked'}" data-id="${match.id}"${nextAttr} ${clickable}>
                <div class="match-slot ${p1Class}" data-match-id="${match.id}" data-slot="player1">
                    <span class="slot-seed">${match.seed1 ? match.seed1 : '·'}</span>
                    <span class="slot-name ${nameClass1}" data-editable="true">${this.escapeHtml(p1Display)}</span>
                    <button class="edit-name-btn" data-match-id="${match.id}" data-slot="player1" title="Edit name">✎</button>
                </div>
                <div class="match-slot ${p2Class}" data-match-id="${match.id}" data-slot="player2">
                    <span class="slot-seed">${match.seed2 ? match.seed2 : '·'}</span>
                    <span class="slot-name ${nameClass2}" data-editable="true">${this.escapeHtml(p2Display)}</span>
                    <button class="edit-name-btn" data-match-id="${match.id}" data-slot="player2" title="Edit name">✎</button>
                </div>
            </div>`;
    },

    getRoundNames(totalRounds) {
        const names = [];
        for (let i = 0; i < totalRounds; i++) {
            const remaining = totalRounds - i;
            if (remaining === 1) names.push('Final');
            else if (remaining === 2) names.push('Semifinals');
            else if (remaining === 3) names.push('Quarterfinals');
            else names.push(`Round of ${Math.pow(2, remaining)}`);
        }
        return names;
    },

    escapeHtml(str) {
        if (str == null) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * Draw SVG connector lines following each match's winnerTo link.
     * Works for both the winners and losers brackets and any mapping ratio.
     */
    drawConnectors(containerEl) {
        const wrappers = containerEl.querySelectorAll('.bracket-wrapper');
        wrappers.forEach(wrapper => this.drawWrapperConnectors(wrapper));
    },

    drawWrapperConnectors(wrapper) {
        const existing = wrapper.querySelector('.bracket-connectors');
        if (existing) existing.remove();

        const matches = wrapper.querySelectorAll('.bracket-match[data-id]');
        if (matches.length < 2) return;

        const byId = {};
        matches.forEach(el => { byId[el.dataset.id] = el; });

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.classList.add('bracket-connectors');
        svg.style.position = 'absolute';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.style.width = wrapper.scrollWidth + 'px';
        svg.style.height = wrapper.scrollHeight + 'px';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '1';
        wrapper.style.position = 'relative';

        const wrapRect = wrapper.getBoundingClientRect();
        const stroke = getComputedStyle(document.documentElement)
            .getPropertyValue('--connector').trim() || '#3d3d5c';

        matches.forEach(el => {
            const nextId = el.dataset.next;
            if (!nextId) return;
            const target = byId[nextId];
            if (!target) return;

            const a = el.getBoundingClientRect();
            const b = target.getBoundingClientRect();
            const x1 = a.right - wrapRect.left;
            const y1 = a.top + a.height / 2 - wrapRect.top;
            const x2 = b.left - wrapRect.left;
            const y2 = b.top + b.height / 2 - wrapRect.top;
            const midX = x1 + (x2 - x1) / 2;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', `M${x1},${y1} H${midX} V${y2} H${x2}`);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', stroke);
            path.setAttribute('stroke-width', '2');
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-linejoin', 'round');
            svg.appendChild(path);
        });

        wrapper.appendChild(svg);
    }
};
