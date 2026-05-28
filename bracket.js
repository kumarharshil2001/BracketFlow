/**
 * Bracket Builder - Bracket Engine & Renderer
 * Generates bracket data structures and renders them as interactive HTML.
 */

// ===== Bracket Engine =====
const BracketEngine = {
    /**
     * Generate a full bracket structure for a tournament.
     * Players are paired in the exact order provided — no power-of-2 padding, no auto-byes.
     */
    generate(participants, type, thirdPlace) {
        if (type === 'double') {
            return this.generateDouble(participants, thirdPlace);
        }
        return this.generateSingle(participants, thirdPlace);
    },

    generateSingle(participants, thirdPlace) {
        const winners = [];
        let matchCounter = 0;

        // Round 1: pair participants sequentially in input order
        const firstRound = [];
        for (let i = 0; i < participants.length; i += 2) {
            const player1 = participants[i];
            const player2 = (i + 1 < participants.length) ? participants[i + 1] : null;

            firstRound.push({
                id: `w-r0-m${matchCounter++}`,
                player1: player1,
                player2: player2,
                seed1: i + 1,
                seed2: (i + 1 < participants.length) ? i + 2 : null,
                winner: null,
                loser: null,
                nextMatchId: null,
                nextSlot: null
            });
        }
        winners.push(firstRound);

        // Generate subsequent rounds based on previous round's match count
        let prevRound = firstRound;
        while (prevRound.length > 1) {
            const round = [];
            for (let i = 0; i < prevRound.length; i += 2) {
                const match = {
                    id: `w-r${winners.length}-m${matchCounter++}`,
                    player1: null,
                    player2: null,
                    seed1: null,
                    seed2: null,
                    winner: null,
                    loser: null,
                    nextMatchId: null,
                    nextSlot: null
                };

                // Link first match of pair
                prevRound[i].nextMatchId = match.id;
                prevRound[i].nextSlot = 'player1';

                // Link second match of pair (if exists)
                if (i + 1 < prevRound.length) {
                    prevRound[i + 1].nextMatchId = match.id;
                    prevRound[i + 1].nextSlot = 'player2';
                } else {
                    // Odd number of matches — this match only has one feeder
                    match.singleFeeder = true;
                }

                round.push(match);
            }
            winners.push(round);
            prevRound = round;
        }

        const totalRounds = winners.length;
        const bracket = { winners, rounds: totalRounds, type: 'single' };

        // Third place match
        if (thirdPlace) {
            bracket.thirdPlace = {
                id: `tp-m${matchCounter++}`,
                player1: null,
                player2: null,
                winner: null,
                loser: null,
                section: 'finals'
            };
        }

        return bracket;
    },

    generateDouble(participants, thirdPlace) {
        // Generate winners bracket
        const singleBracket = this.generateSingle(participants, false);
        const winners = singleBracket.winners;
        const totalRounds = singleBracket.rounds;

        // Generate losers bracket
        const losers = [];
        let matchCounter = 1000;
        const losersRoundCount = Math.max(1, (totalRounds - 1) * 2);

        let prevCount = Math.ceil(winners[0].length / 2);
        for (let r = 0; r < losersRoundCount; r++) {
            const round = [];
            let count;
            if (r === 0) {
                count = prevCount;
            } else {
                count = r % 2 === 0 ? Math.ceil(losers[r - 1].length / 2) : losers[r - 1].length;
            }
            count = Math.max(1, count);

            for (let i = 0; i < count; i++) {
                round.push({
                    id: `l-r${r}-m${matchCounter++}`,
                    player1: null,
                    player2: null,
                    seed1: null,
                    seed2: null,
                    winner: null,
                    loser: null,
                    nextMatchId: null,
                    nextSlot: null
                });
            }
            losers.push(round);
        }

        // Link losers bracket rounds
        for (let r = 0; r < losers.length - 1; r++) {
            const currentRound = losers[r];
            const nextRound = losers[r + 1];
            if (nextRound.length < currentRound.length) {
                // Consolidation round
                for (let i = 0; i < currentRound.length; i += 2) {
                    const nextIdx = Math.floor(i / 2);
                    if (nextIdx < nextRound.length) {
                        currentRound[i].nextMatchId = nextRound[nextIdx].id;
                        currentRound[i].nextSlot = 'player1';
                        if (i + 1 < currentRound.length) {
                            currentRound[i + 1].nextMatchId = nextRound[nextIdx].id;
                            currentRound[i + 1].nextSlot = 'player2';
                        }
                    }
                }
            } else {
                // Same-size round (drop-down round)
                for (let i = 0; i < currentRound.length; i++) {
                    if (i < nextRound.length) {
                        currentRound[i].nextMatchId = nextRound[i].id;
                        currentRound[i].nextSlot = 'player1';
                    }
                }
            }
        }

        // Grand finals
        const grandFinals = {
            id: `gf-m${matchCounter++}`,
            player1: null,
            player2: null,
            winner: null,
            loser: null,
            section: 'finals'
        };

        return {
            winners,
            losers,
            grandFinals,
            rounds: totalRounds,
            type: 'double'
        };
    },

    /**
     * Clear downstream results when a match result is changed.
     */
    clearDownstream(bracket, match) {
        if (!match.nextMatchId) return;
        const nextMatch = this.findMatchById(bracket, match.nextMatchId);
        if (!nextMatch) return;

        // Clear the slot this match feeds into
        nextMatch[match.nextSlot] = null;

        // If the next match had a winner, clear it and cascade
        if (nextMatch.winner) {
            nextMatch.winner = null;
            nextMatch.loser = null;
            this.clearDownstream(bracket, nextMatch);
        }
    },

    /**
     * Advance a winner to the next match in the bracket.
     */
    advanceWinner(bracket, match, winner, loser, section) {
        // Clear any previous downstream results from this match
        this.clearDownstream(bracket, match);

        // Advance to next match
        if (match.nextMatchId) {
            const nextMatch = this.findMatchById(bracket, match.nextMatchId);
            if (nextMatch) {
                nextMatch[match.nextSlot] = winner;
            }
        }

        // For double elimination, send loser to losers bracket
        if (bracket.type === 'double' && section === 'winners') {
            this.sendToLosers(bracket, match, loser);
        }

        // Handle third place for single elimination
        if (bracket.type === 'single' && bracket.thirdPlace && bracket.winners.length >= 2) {
            const semiRound = bracket.winners[bracket.winners.length - 2];
            const semiLosers = semiRound.filter(m => m.loser).map(m => m.loser);
            if (semiLosers.length >= 2) {
                bracket.thirdPlace.player1 = semiLosers[0];
                bracket.thirdPlace.player2 = semiLosers[1];
            }
        }

        // For double elimination - losers bracket champion goes to grand finals
        if (bracket.type === 'double' && section === 'losers') {
            const lastLosersRound = bracket.losers[bracket.losers.length - 1];
            if (lastLosersRound && lastLosersRound.length === 1 && lastLosersRound[0].id === match.id) {
                bracket.grandFinals.player2 = winner;
            }
        }

        // Winners bracket champion goes to grand finals
        if (bracket.type === 'double' && section === 'winners') {
            const finalRound = bracket.winners[bracket.winners.length - 1];
            if (finalRound.length === 1 && finalRound[0].id === match.id) {
                bracket.grandFinals.player1 = winner;
            }
        }
    },

    sendToLosers(bracket, match, loser) {
        if (!bracket.losers || bracket.losers.length === 0) return;

        for (const round of bracket.losers) {
            for (const losersMatch of round) {
                if (!losersMatch.player1) {
                    losersMatch.player1 = loser;
                    return;
                }
                if (!losersMatch.player2) {
                    losersMatch.player2 = loser;
                    return;
                }
            }
        }
    },

    /**
     * Update a player's name in a specific match slot.
     * Cascades the name change to downstream matches if this player was the winner.
     */
    updatePlayerName(bracket, matchId, slot, newName) {
        const match = this.findMatchById(bracket, matchId);
        if (!match) return;

        const oldName = match[slot];
        match[slot] = newName || null;

        // If this player was the winner, update downstream
        if (match.winner && match.winner === oldName) {
            match.winner = newName || null;
            // Update the name in the next match slot
            if (match.nextMatchId) {
                const nextMatch = this.findMatchById(bracket, match.nextMatchId);
                if (nextMatch && nextMatch[match.nextSlot] === oldName) {
                    nextMatch[match.nextSlot] = newName || null;
                    // If next match winner was also this player, cascade further
                    if (nextMatch.winner === oldName) {
                        this.updatePlayerName(bracket, nextMatch.id,
                            nextMatch.winner === nextMatch.player1 ? 'player1' : 'player2', newName);
                    }
                }
            }
        }
    },

    findMatchById(bracket, matchId) {
        if (bracket.winners) {
            for (const round of bracket.winners) {
                for (const match of round) {
                    if (match.id === matchId) return match;
                }
            }
        }
        if (bracket.losers) {
            for (const round of bracket.losers) {
                for (const match of round) {
                    if (match.id === matchId) return match;
                }
            }
        }
        if (bracket.grandFinals && bracket.grandFinals.id === matchId) {
            return bracket.grandFinals;
        }
        if (bracket.thirdPlace && bracket.thirdPlace.id === matchId) {
            return bracket.thirdPlace;
        }
        return null;
    }
};


// ===== Bracket Renderer =====
const BracketRenderer = {

    renderSingle(tournament) {
        const bracket = tournament.bracket;
        const winners = bracket.winners;
        let html = '<div class="bracket-wrapper" id="bracketTree">';

        const roundNames = this.getRoundNames(winners.length);

        winners.forEach((round, rIdx) => {
            html += `<div class="bracket-round" data-round="${rIdx}">`;
            html += `<div class="round-title">${roundNames[rIdx]}</div>`;
            html += '<div class="round-matches">';

            round.forEach(match => {
                html += this.renderMatch(match, 'single');
            });

            html += '</div></div>';
        });

        // Champion display
        const finalMatch = winners[winners.length - 1][0];
        if (finalMatch && finalMatch.winner) {
            html += `
                <div class="bracket-round">
                    <div class="round-title">Champion</div>
                    <div class="round-matches">
                        <div class="champion-display">
                            <div class="trophy">🏆</div>
                            <div class="champion-label">Champion</div>
                            <div class="champion-name">${this.escapeHtml(finalMatch.winner)}</div>
                        </div>
                    </div>
                </div>`;
        }

        html += '</div>';

        // Third place match
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
        const winners = bracket.winners;
        let html = '<div class="bracket-wrapper" id="bracketTree">';

        const roundNames = this.getRoundNames(winners.length);

        winners.forEach((round, rIdx) => {
            html += `<div class="bracket-round" data-round="${rIdx}">`;
            html += `<div class="round-title">${roundNames[rIdx]}</div>`;
            html += '<div class="round-matches">';
            round.forEach(match => {
                html += this.renderMatch(match, 'winners');
            });
            html += '</div></div>';
        });

        const finalMatch = winners[winners.length - 1][0];
        if (finalMatch && finalMatch.winner) {
            html += `
                <div class="bracket-round">
                    <div class="round-title">WB Champion</div>
                    <div class="round-matches">
                        <div class="champion-display">
                            <div class="trophy">👑</div>
                            <div class="champion-label">Winners Bracket Champion</div>
                            <div class="champion-name">${this.escapeHtml(finalMatch.winner)}</div>
                        </div>
                    </div>
                </div>`;
        }

        html += '</div>';
        return html;
    },

    renderLosers(tournament) {
        const bracket = tournament.bracket;
        const losers = bracket.losers;

        if (!losers || losers.length === 0) {
            return '<p style="color: var(--text-muted); padding: 40px; text-align:center;">No losers bracket matches yet.</p>';
        }

        let html = '<div class="bracket-wrapper" id="bracketTree">';

        losers.forEach((round, rIdx) => {
            html += `<div class="bracket-round" data-round="${rIdx}">`;
            html += `<div class="round-title">LB Round ${rIdx + 1}</div>`;
            html += '<div class="round-matches">';
            round.forEach(match => {
                html += this.renderMatch(match, 'losers');
            });
            html += '</div></div>';
        });

        const lastRound = losers[losers.length - 1];
        if (lastRound && lastRound.length === 1 && lastRound[0].winner) {
            html += `
                <div class="bracket-round">
                    <div class="round-title">LB Champion</div>
                    <div class="round-matches">
                        <div class="champion-display">
                            <div class="trophy">⚔️</div>
                            <div class="champion-label">Losers Bracket Champion</div>
                            <div class="champion-name">${this.escapeHtml(lastRound[0].winner)}</div>
                        </div>
                    </div>
                </div>`;
        }

        html += '</div>';
        return html;
    },

    renderFinals(tournament) {
        const bracket = tournament.bracket;
        const gf = bracket.grandFinals;

        if (!gf) {
            return '<p style="color: var(--text-muted); padding: 40px; text-align:center;">Grand Finals not available.</p>';
        }

        let html = '<div style="max-width: 400px; margin: 40px auto;">';
        html += '<div class="round-title" style="text-align: center; margin-bottom: 20px;">Grand Finals</div>';
        html += this.renderMatch(gf, 'finals');

        if (gf.winner) {
            html += `
                <div class="champion-display" style="margin-top: 24px;">
                    <div class="trophy">🏆</div>
                    <div class="champion-label">Tournament Champion</div>
                    <div class="champion-name">${this.escapeHtml(gf.winner)}</div>
                </div>`;
        }

        html += '</div>';
        return html;
    },

    renderMatch(match, section) {
        const isCompleted = match.winner ? 'completed' : '';

        const p1Name = match.player1 || '';
        const p2Name = match.player2 || '';
        const p1Display = p1Name || 'TBD';
        const p2Display = p2Name || 'TBD';

        const p1Class = match.winner && match.winner === match.player1 ? 'winner' : (match.winner && match.winner !== match.player1 ? 'loser' : '');
        const p2Class = match.winner && match.winner === match.player2 ? 'winner' : (match.winner && match.winner !== match.player2 ? 'loser' : '');
        const nameClass1 = !p1Name ? 'tbd' : (p1Name === 'BYE' ? 'bye' : '');
        const nameClass2 = !p2Name ? 'tbd' : (p2Name === 'BYE' ? 'bye' : '');

        // Match is clickable for winner selection if both players present
        let clickable = '';
        if (p1Name && p2Name) {
            clickable = `data-match="${match.id}" data-section="${section}"`;
        }

        return `
            <div class="bracket-match ${isCompleted}" ${clickable}>
                <button class="card-delete-btn" data-match-id="${match.id}" title="Delete match">&times;</button>
                <div class="match-slot ${p1Class}" data-match-id="${match.id}" data-slot="player1">
                    ${match.seed1 ? `<span class="slot-seed">${match.seed1}</span>` : '<span class="slot-seed">-</span>'}
                    <span class="slot-name ${nameClass1}" data-editable="true">${this.escapeHtml(p1Display)}</span>
                    <button class="edit-name-btn" data-match-id="${match.id}" data-slot="player1" title="Edit name">✎</button>
                </div>
                <div class="match-slot ${p2Class}" data-match-id="${match.id}" data-slot="player2">
                    ${match.seed2 ? `<span class="slot-seed">${match.seed2}</span>` : '<span class="slot-seed">-</span>'}
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
            else names.push(`Round ${i + 1}`);
        }
        return names;
    },

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * Draw SVG connector lines between rounds after the bracket DOM is rendered.
     * Call this after innerHTML is set and the elements are in the DOM.
     */
    drawConnectors(containerEl) {
        const wrapper = containerEl.querySelector('.bracket-wrapper');
        if (!wrapper) return;

        // Remove any existing SVG
        const existingSvg = wrapper.querySelector('.bracket-connectors');
        if (existingSvg) existingSvg.remove();

        const rounds = wrapper.querySelectorAll('.bracket-round');
        if (rounds.length < 2) return;

        // Create SVG overlay
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

        const wrapperRect = wrapper.getBoundingClientRect();

        for (let r = 0; r < rounds.length - 1; r++) {
            const currentMatches = rounds[r].querySelectorAll('.bracket-match');
            const nextMatches = rounds[r + 1].querySelectorAll('.bracket-match');

            if (nextMatches.length === 0) continue;

            // Each pair of current matches connects to one next match
            let nextIdx = 0;
            for (let i = 0; i < currentMatches.length; i += 2) {
                if (nextIdx >= nextMatches.length) break;

                const match1 = currentMatches[i];
                const match2 = currentMatches[i + 1];
                const target = nextMatches[nextIdx];

                const rect1 = match1.getBoundingClientRect();
                const targetRect = target.getBoundingClientRect();

                // Start point: right edge, vertical center of match1
                const x1 = rect1.right - wrapperRect.left;
                const y1 = rect1.top + rect1.height / 2 - wrapperRect.top;

                // End point: left edge, vertical center of target
                const x3 = targetRect.left - wrapperRect.left;
                const y3 = targetRect.top + targetRect.height / 2 - wrapperRect.top;

                // Midpoint X for the elbow
                const midX = (x1 + x3) / 2;

                // Draw line from match1 to target
                const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path1.setAttribute('d', `M${x1},${y1} H${midX} V${y3} H${x3}`);
                path1.setAttribute('fill', 'none');
                path1.setAttribute('stroke', '#3d3d5c');
                path1.setAttribute('stroke-width', '2');
                path1.setAttribute('stroke-linecap', 'round');
                svg.appendChild(path1);

                // Draw line from match2 to target (if match2 exists)
                if (match2) {
                    const rect2 = match2.getBoundingClientRect();
                    const x2 = rect2.right - wrapperRect.left;
                    const y2 = rect2.top + rect2.height / 2 - wrapperRect.top;

                    const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    path2.setAttribute('d', `M${x2},${y2} H${midX} V${y3} H${x3}`);
                    path2.setAttribute('fill', 'none');
                    path2.setAttribute('stroke', '#3d3d5c');
                    path2.setAttribute('stroke-width', '2');
                    path2.setAttribute('stroke-linecap', 'round');
                    svg.appendChild(path2);
                }

                nextIdx++;
            }

            // Handle odd match (unpaired last match connects solo to next)
            if (currentMatches.length % 2 === 1 && nextIdx < nextMatches.length) {
                const lastMatch = currentMatches[currentMatches.length - 1];
                const target = nextMatches[nextIdx];
                const rectL = lastMatch.getBoundingClientRect();
                const rectT = target.getBoundingClientRect();

                const x1 = rectL.right - wrapperRect.left;
                const y1 = rectL.top + rectL.height / 2 - wrapperRect.top;
                const x3 = rectT.left - wrapperRect.left;
                const y3 = rectT.top + rectT.height / 2 - wrapperRect.top;
                const midX = (x1 + x3) / 2;

                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('d', `M${x1},${y1} H${midX} V${y3} H${x3}`);
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke', '#3d3d5c');
                path.setAttribute('stroke-width', '2');
                path.setAttribute('stroke-linecap', 'round');
                svg.appendChild(path);
            }
        }

        wrapper.appendChild(svg);
    }
};
