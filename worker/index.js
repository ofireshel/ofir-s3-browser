// Cloudflare Worker with Durable Objects for multiplayer poker
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Handle CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }
    
    // Route WebSocket upgrades to lobby
    if (url.pathname === '/lobby' && request.headers.get('Upgrade') === 'websocket') {
      const lobbyId = env.LOBBY.idFromName('main-lobby');
      const lobby = env.LOBBY.get(lobbyId);
      return lobby.fetch(request);
    }
    
    // Route game WebSocket upgrades
    if (url.pathname.startsWith('/game/') && request.headers.get('Upgrade') === 'websocket') {
      const gameId = url.pathname.split('/')[2];
      const durableGameId = env.GAMES.idFromName(gameId); // Deterministic id for a human-vs-human game
      const game = env.GAMES.get(durableGameId);
      return game.fetch(request);
    }
    
    return new Response('Not Found', { status: 404 });
  }
};

// Durable Object for lobby management
export class PokerLobby {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.players = new Map();
    this.challenges = new Map();
  }
  
  async fetch(request) {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    
    server.accept();
    
    const playerConnection = {
      ws: server,
      playerId: null,
      playerName: null
    };
    
    server.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data);
        await this.handleMessage(playerConnection, data);
      } catch (error) {
        console.error('Error handling message:', error);
        server.send(JSON.stringify({ type: 'error', message: 'Server error' }));
      }
    });
    
    server.addEventListener('close', () => {
      this.handleDisconnect(playerConnection);
    });
    
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
  
  async handleMessage(connection, message) {
    switch (message.type) {
      case 'join':
        await this.handleJoin(connection, message);
        break;
      case 'challenge':
        await this.handleChallenge(connection, message);
        break;
      case 'challenge_response':
        await this.handleChallengeResponse(connection, message);
        break;
      case 'leave':
        this.handleDisconnect(connection);
        break;
    }
  }
  
  async handleJoin(connection, message) {
    const { playerId, playerName } = message;
    
    // Validate input
    if (!playerId || !playerName || playerName.length > 20) {
      connection.ws.send(JSON.stringify({ type: 'error', message: 'Invalid player data' }));
      return;
    }
    
    // Check capacity
    if (this.players.size >= 10) {
      connection.ws.send(JSON.stringify({ type: 'error', message: 'Lobby is full' }));
      return;
    }
    
    // Check name conflicts
    for (const player of this.players.values()) {
      if (player.name === playerName) {
        connection.ws.send(JSON.stringify({ type: 'error', message: 'Name already taken' }));
        return;
      }
    }
    
    connection.playerId = playerId;
    connection.playerName = playerName;
    
    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      status: 'available',
      connection: connection
    });
    
    this.broadcastLobbyUpdate();
  }
  
  async handleChallenge(connection, message) {
    const { targetId, challengerId, challengerName } = message;
    
    const target = this.players.get(targetId);
    const challenger = this.players.get(challengerId);
    
    if (!target || !challenger || target.status !== 'available' || challenger.status !== 'available') {
      connection.ws.send(JSON.stringify({ type: 'error', message: 'Player not available' }));
      return;
    }
    
    const challengeId = crypto.randomUUID();
    const gameId = crypto.randomUUID();
    
    this.challenges.set(challengeId, {
      from: challengerId,
      to: targetId,
      gameId: gameId,
      timestamp: Date.now()
    });
    
    // Only mark challenger as busy, target stays available until they respond
    challenger.status = 'challenging';
    // Don't change target status - they can still receive other challenges
    
    target.connection.ws.send(JSON.stringify({
      type: 'challenge_received',
      from: challengerName,
      challengeId: challengeId
    }));
    
    this.broadcastLobbyUpdate();
    
    // Auto-expire after 30 seconds
    setTimeout(() => {
      if (this.challenges.has(challengeId)) {
        this.challenges.delete(challengeId);
        if (challenger.status === 'challenging') challenger.status = 'available';
        // Target status wasn't changed, so no need to reset it
        this.broadcastLobbyUpdate();
      }
    }, 30000);
  }
  
  async handleChallengeResponse(connection, message) {
    const { challengeId, response } = message;
    
    const challenge = this.challenges.get(challengeId);
    if (!challenge) {
      connection.ws.send(JSON.stringify({ type: 'error', message: 'Challenge not found' }));
      return;
    }
    
    const challenger = this.players.get(challenge.from);
    const target = this.players.get(challenge.to);
    
    this.challenges.delete(challengeId);
    
    if (response === 'accept') {
      // Remove both players from lobby when game starts
      this.players.delete(challenge.from);
      this.players.delete(challenge.to);
      
      // Notify both players with opponent info
      challenger.connection.ws.send(JSON.stringify({
        type: 'challenge_accepted',
        gameId: challenge.gameId,
        opponent: {
          id: target.id,
          name: target.name
        }
      }));
      
      target.connection.ws.send(JSON.stringify({
        type: 'challenge_accepted',
        gameId: challenge.gameId,
        opponent: {
          id: challenger.id,
          name: challenger.name
        }
      }));
    } else {
      // Challenge declined - reset challenger status
      challenger.status = 'available';
      // Target status wasn't changed, so no need to reset it
      
      challenger.connection.ws.send(JSON.stringify({
        type: 'challenge_declined',
        from: target.name
      }));
    }
    
    this.broadcastLobbyUpdate();
  }
  
  handleDisconnect(connection) {
    if (connection.playerId && this.players.has(connection.playerId)) {
      this.players.delete(connection.playerId);
      this.broadcastLobbyUpdate();
    }
  }
  
  broadcastLobbyUpdate() {
    const playerList = Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      status: p.status
    }));
    
    const update = JSON.stringify({
      type: 'lobby_update',
      players: playerList
    });
    
    for (const player of this.players.values()) {
      player.connection.ws.send(update);
    }
  }
}

// Durable Object for individual poker games
export class PokerGame {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.players = new Map(); // playerId -> { id, name, connection }
    this.gameState = null;    // authoritative game state
    this.started = false;
    this.awaiting = [false, false]; // players' continue acknowledgements at showdown
    this.nextHandTimer = null;
  }
  
  async fetch(request) {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    
    server.accept();
    
    const playerConnection = {
      ws: server,
      playerId: null,
      playerName: null
    };
    
    server.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data);
        await this.handleGameMessage(playerConnection, data);
      } catch (error) {
        console.error('Game error:', error);
        server.send(JSON.stringify({ type: 'error', message: 'Game error' }));
      }
    });
    
    server.addEventListener('close', (event) => {
      console.log(`Game WebSocket closed: code=${event.code}, reason=${event.reason}`);
      this.handleGameDisconnect(playerConnection);
    });
    
    server.addEventListener('error', (event) => {
      console.log(`Game WebSocket error:`, event);
    });
    
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
  
  async handleGameMessage(connection, message) {
    switch (message.type) {
      case 'join_game':
        await this.handleJoinGame(connection, message);
        break;
      case 'player_action':
        await this.handlePlayerAction(connection, message);
        break;
      case 'ping':
        // Respond to heartbeat ping to keep connection alive
        console.log(`Received ping from ${connection.playerName}`);
        connection.ws.send(JSON.stringify({
          type: 'pong',
          timestamp: Date.now()
        }));
        break;
      default:
        console.log('Unknown game message type:', message.type);
    }
  }
  
  async handleJoinGame(connection, message) {
    const { playerId, playerName } = message;
    
    console.log(`Player joining game: ${playerName} (${playerId})`);
    
    connection.playerId = playerId;
    connection.playerName = playerName;
    
    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      connection: connection
    });
    
    console.log(`Game now has ${this.players.size} players`);
    
    // When first player joins, send waiting notice
    if (this.players.size === 1) {
      connection.ws.send(JSON.stringify({ type: 'game_ready', myPlayerId: 0, opponent: null, playersConnected: 1 }));
      return;
    }

    // If two players are present, assign deterministic seat order based on join order
    if (this.players.size === 2) {
      console.log('Both players joined, initializing game');
      const seats = Array.from(this.players.values());
      // Seat order: join order (Map iteration order is insertion order)
      this.gameState = this.createInitialGameState(seats[0], seats[1]);
      this.started = true;
      // Start first hand and immediately broadcast initial state (single frame) for faster client init
      this.startNewHand();
      // Send a single compact init message per player (combines ready + first state)
      seats.forEach((p, idx) => {
        try{
          p.connection.ws.send(JSON.stringify({
            type: 'game_state',
            myPlayerId: idx,
            state: this.viewFor(idx),
            opponent: this.getOpponentInfo(p.id)
          }));
        }catch(e){ console.log('init send failed', e); }
      });
    }
  }
  
  async handlePlayerAction(connection, message) {
    if (!this.started || !this.gameState) return;
    const { action } = message || {};
    if (!action || !action.type) return;

    const actorId = connection.playerId;
    const seatIndex = this.getSeatIndex(actorId);
    if (seatIndex === -1) return;
    const g = this.gameState;
    const isShowdown = g.street === 'showdown';
    const isBettingAction = ['fold','check','call','bet_raise'].includes(action.type);
    // Only enforce turn order for betting actions during active streets
    if (isBettingAction) {
      if (isShowdown) return; // no betting at showdown
      if (g.toAct !== seatIndex) return; // out-of-turn betting
    }

    try {
      switch (action.type) {
        case 'fold':
          this.applyFold(seatIndex);
          break;
        case 'check':
          this.applyCheck(seatIndex);
          break;
        case 'call':
          this.applyCall(seatIndex);
          break;
        case 'bet_raise':
          this.applyBetRaise(seatIndex, Number(action.amount||0));
        break;
        case 'continue':
          // Player acknowledges showdown; when both have continued (or timeout), start next hand
          if (this.gameState && this.gameState.street === 'showdown') {
            this.awaiting[seatIndex] = true;
            const g = this.gameState;
            const bothReady = this.awaiting[0] && this.awaiting[1];
            const bothHaveChips = g.players[0].stack > 0 && g.players[1].stack > 0;
            if (bothReady) {
              if (this.nextHandTimer) { try { clearTimeout(this.nextHandTimer); } catch {} this.nextHandTimer = null; }
              if (bothHaveChips) {
                this.startNewHand();
                this.broadcastState();
              } else {
                // Game over previously. Reset stacks evenly and restart a new match.
                const totalChips = (g.players[0].stack || 0) + (g.players[1].stack || 0) + (g.pot || 0);
                const half = Math.floor(totalChips / 2);
                g.players[0].stack = half;
                g.players[1].stack = totalChips - half;
                g.pot = 0;
                g.gameOver = false;
                g.gameOverWinner = '';
                this.startNewHand();
                this.broadcastState();
              }
            }
          }
          break;
        case 'play_again':
          // Both players want to restart a fresh match from lobby-like state
          if (this.gameState && this.gameState.street === 'showdown') {
            this.awaiting[seatIndex] = true;
            if (this.awaiting[0] && this.awaiting[1]) {
              if (this.nextHandTimer) { try { clearTimeout(this.nextHandTimer); } catch {} this.nextHandTimer = null; }
              const g = this.gameState;
              // Rebuild initial state preserving seat order and player identities
              const p0 = { id: g.players[0].id, name: g.players[0].name };
              const p1 = { id: g.players[1].id, name: g.players[1].name };
              this.gameState = this.createInitialGameState(p0, p1);
              this.started = true;
              this.awaiting = [false, false];
              this.startNewHand();
              this.broadcastState();
            }
          }
          break;
        default:
        break;
      }
    } catch (e) {
      console.error('apply action failed', e);
    }
    // Broadcast updated state to both players
    this.broadcastState();
    // If showdown reached, schedule an auto-continue after timeout if both players didn't click
    if (this.gameState && this.gameState.street === 'showdown') {
      const canContinue = this.gameState.players[0].stack > 0 && this.gameState.players[1].stack > 0;
      if (canContinue && !this.nextHandTimer) {
        this.awaiting = [false, false];
        this.nextHandTimer = setTimeout(() => {
          try {
            // Only start if still in showdown and next hand hasn't started
            if (this.gameState && this.gameState.street === 'showdown') {
              this.startNewHand();
              this.broadcastState();
            }
          } catch (e) { console.error('auto-continue failed', e); }
          finally { this.nextHandTimer = null; }
        }, 5000);
      }
    }
  }
  
  handleGameDisconnect(connection) {
    console.log(`Game disconnect: ${connection.playerName} (${connection.playerId})`);
    
    if (connection.playerId) {
      this.players.delete(connection.playerId);
      
      console.log(`Player ${connection.playerName} removed from game. Remaining players: ${this.players.size}`);
      
      // Notify remaining player
      for (const player of this.players.values()) {
        console.log(`Notifying ${player.name} of disconnect`);
        player.connection.ws.send(JSON.stringify({
          type: 'game_ended',
          reason: 'Opponent disconnected'
        }));
      }
    }
  }
  
  getOpponentInfo(playerId) {
    for (const [pid, player] of this.players) {
      if (pid !== playerId) {
        return { id: pid, name: player.name };
      }
    }
    return null;
  }
  
  // ====== Game engine (server-authoritative) ======
  createInitialGameState(p0, p1) {
    const START_STACK = 200;
    const SMALL_BLIND = 1, BIG_BLIND = 2;
    return {
      handId: 0,
      dealer: Math.random() < 0.5 ? 0 : 1,
      smallBlind: SMALL_BLIND,
      bigBlind: BIG_BLIND,
      players: [
        { id: p0.id, name: p0.name, stack: START_STACK, hole: [], folded: false },
        { id: p1.id, name: p1.name, stack: START_STACK, hole: [], folded: false }
      ],
      deck: [],
      board: [],
      pot: 0,
      street: 'preflop',
      toAct: 0,
      lastAggressor: -1,
      curBet: 0,
      betThisRound: [0,0],
      acted: [false,false],
      message: ''
    };
  }

  getSeatIndex(playerId) {
    if (!this.gameState) return -1;
    if (this.gameState.players[0].id === playerId) return 0;
    if (this.gameState.players[1].id === playerId) return 1;
    return -1;
  }

  startNewHand() {
    if (!this.gameState) return;
    const g = this.gameState;
    g.handId += 1;
    g.board = [];
    g.pot = 0;
    g.street = 'preflop';
    g.curBet = 0;
    g.betThisRound = [0,0];
    g.players.forEach(p => { p.hole = []; p.folded = false; });
    g.lastAggressor = -1;
    g.message = '';
    // Switch dealer
    g.dealer = 1 - g.dealer;
    // New deck
    g.deck = this.newShuffledDeck();
    // Post blinds (heads-up variant per request): dealer posts BIG blind, opponent posts SMALL blind
    this.postBlind(g.dealer, g.bigBlind);
    this.postBlind(1 - g.dealer, g.smallBlind);
    // Deal hole cards (alternating)
    for (let i = 0; i < 2; i++) {
      g.players[g.dealer].hole.push(g.deck.pop());
      g.players[1 - g.dealer].hole.push(g.deck.pop());
    }
    // Preflop: small blind (non-dealer) acts first so dealer acts last
    g.acted = [false, false];
    g.toAct = 1 - g.dealer;
  }

  postBlind(pid, amt) {
    const g = this.gameState; if (!g) return;
    const p = g.players[pid];
    const pay = Math.min(amt, p.stack);
    p.stack -= pay; g.betThisRound[pid] += pay; g.pot += pay; g.curBet = Math.max(g.curBet, g.betThisRound[pid]);
  }

  toCall(pid) {
    const g = this.gameState; if (!g) return 0;
    return Math.max(0, g.curBet - g.betThisRound[pid]);
  }

  allInCap(pid) {
    const g = this.gameState; if (!g) return 0;
    return g.players[pid].stack + g.betThisRound[pid];
  }

  minRaiseAmount(pid) {
    const g = this.gameState; if (!g) return 0;
    const highest = Math.max(g.betThisRound[0], g.betThisRound[1]);
    const other = Math.min(g.betThisRound[0], g.betThisRound[1]);
    const lastRaise = Math.max(g.bigBlind, highest - other);
    return highest + lastRaise;
  }

  openAmountRange(pid) {
    const g = this.gameState; if (!g) return [0,0];
    const min = g.curBet === 0 ? Math.max(g.bigBlind, this.toCall(pid) + g.bigBlind) : this.minRaiseAmount(pid);
    const effectiveMax = Math.min(this.allInCap(pid), this.allInCap(1 - pid));
    const max = Math.max(0, effectiveMax);
    return [Math.min(min, max), max];
  }

  bothActedAndEqual() {
    const g = this.gameState; if (!g) return false;
    if (g.players[0].stack === 0 || g.players[1].stack === 0) return false; // let all-in runout logic handle
    const curBetExists = g.curBet > 0;
    const betsEqual = g.betThisRound[0] === g.betThisRound[1];
    const bothActed = g.acted[0] && g.acted[1];
    // When there was an aggressor, once the other player has called (bets equal) and both acted,
    // the street ends immediately.
    if (curBetExists && betsEqual && bothActed) return true;
    return false;
  }

  bothCheckedThisStreet() {
    const g = this.gameState; if (!g) return false;
    // Preflop nuance: if blinds are matched to big blind and small blind has acted,
    // big blind must get a chance to check or raise; only count as both checked when
    // both explicitly acted with no outstanding optional action.
    if (g.street === 'preflop') {
      const smallBlindSeat = g.dealer;
      const bigBlindSeat = 1 - g.dealer;
      const blindsMatchedToBB = (g.betThisRound[smallBlindSeat] === g.betThisRound[bigBlindSeat]) && (g.betThisRound[bigBlindSeat] >= g.bigBlind);
      if (blindsMatchedToBB) {
        // Street ends as checks only if both acted and no new bet
        return g.curBet === 0 && g.acted[smallBlindSeat] && g.acted[bigBlindSeat];
      }
    }
    return g.curBet === 0 && g.acted[0] && g.acted[1];
  }

  isAllInAndEqual() {
    const g = this.gameState; if (!g) return false;
    return (g.players[0].stack === 0 || g.players[1].stack === 0) && g.betThisRound[0] === g.betThisRound[1];
  }

  applyFold(pid) {
    const g = this.gameState; if (!g) return;
    g.players[pid].folded = true;
    const opp = 1 - pid;
    g.players[opp].stack += g.pot;
    g.message = `${g.players[opp].name} wins ${g.pot}`;
    g.pot = 0;
    // Do NOT reveal additional runout on fold; keep already-dealt community cards as-is
    g.street = 'showdown';
  }

  applyCheck(pid) {
    const g = this.gameState; if (!g) return;
    if (this.toCall(pid) > 0) return; // invalid check
    g.acted[pid] = true;
    // Preflop special: if big blind (dealer) checks after small blind called to match,
    // then end street (flop). If big blind raises, handled in applyBetRaise.
    if (g.street === 'preflop') {
      const smallBlindSeat = 1 - g.dealer;
      const bigBlindSeat = g.dealer;
      const blindsMatchedToBB = (g.betThisRound[smallBlindSeat] === g.betThisRound[bigBlindSeat]) && (g.betThisRound[bigBlindSeat] >= g.bigBlind);
      const bbChecked = pid === bigBlindSeat && blindsMatchedToBB;
      if (bbChecked) {
        this.endStreet();
        return;
      }
    }
    if (this.bothActedAndEqual() || this.bothCheckedThisStreet()) {
      this.endStreet();
    } else {
      g.toAct = 1 - pid;
    }
  }

  applyCall(pid) {
    const g = this.gameState; if (!g) return;
    const need = this.toCall(pid);
    const p = g.players[pid];
    const pay = Math.min(need, p.stack);
    p.stack -= pay; g.betThisRound[pid] += pay; g.pot += pay;
    g.curBet = Math.max(g.curBet, g.betThisRound[0], g.betThisRound[1]);
    g.acted[pid] = true;
    // Special preflop logic: ONLY when SB (non-dealer) calls to exactly match the big blind (no raises yet),
    // the BB (dealer) gets an option to check or raise before dealing the flop.
    if (g.street === 'preflop') {
      const smallBlindSeat = 1 - g.dealer;
      const bigBlindSeat = g.dealer;
      const smallBlindBet = g.betThisRound[smallBlindSeat];
      const bigBlindBet = g.betThisRound[bigBlindSeat];
      const sbMatchedExactlyBB = (smallBlindBet === g.bigBlind) && (bigBlindBet === g.bigBlind);
      const noAggressorYet = g.lastAggressor === -1 && g.curBet === g.bigBlind;
      const sbJustCalledBB = pid === smallBlindSeat && sbMatchedExactlyBB && noAggressorYet;
      if (sbJustCalledBB) {
        g.toAct = bigBlindSeat; // BB may check or raise
        return;
      }
    }
    if (this.isAllInAndEqual()) {
      this.autoRunout();
      return;
    }
    if (this.bothActedAndEqual() || this.bothCheckedThisStreet()) {
      this.endStreet();
    } else {
      g.toAct = 1 - pid;
    }
  }

  applyBetRaise(pid, amount) {
    const g = this.gameState; if (!g) return;
    const [minAmt, maxAmt] = this.openAmountRange(pid);
    const target = Math.max(minAmt, Math.min(amount, maxAmt));
    const p = g.players[pid];
    const put = target - g.betThisRound[pid];
    const pay = Math.min(put, p.stack);
    p.stack -= pay; g.pot += pay; g.betThisRound[pid] += pay;
    g.curBet = Math.max(g.curBet, g.betThisRound[pid]);
    g.lastAggressor = pid; g.acted = [false, false]; g.acted[pid] = true; g.toAct = 1 - pid;
    if (this.isAllInAndEqual()) { this.autoRunout(); return; }
    if (g.players[1 - pid].stack === 0 && g.betThisRound[0] === g.betThisRound[1]) { this.autoRunout(); return; }
  }

  endStreet() {
    const g = this.gameState; if (!g) return;
    g.street = g.street === 'preflop' ? 'flop' : g.street === 'flop' ? 'turn' : g.street === 'turn' ? 'river' : 'showdown';
    g.curBet = 0; g.betThisRound = [0,0]; g.lastAggressor = -1; g.acted = [false, false]; g.toAct = g.dealer === 1 ? 0 : 1;
    if (g.street === 'flop') { g.board.push(g.deck.pop(), g.deck.pop(), g.deck.pop()); }
    else if (g.street === 'turn' || g.street === 'river') { g.board.push(g.deck.pop()); }
    if (g.street === 'showdown') { this.doShowdown(); }
  }

  autoRunout() {
    const g = this.gameState; if (!g) return;
    // Reveal remaining community cards only if both players are still alive (no fold)
    const alive = [0,1].filter(i => !g.players[i].folded);
    if (alive.length === 2) {
      while (g.board.length < 5) { g.board.push(g.deck.pop()); }
    }
    this.doShowdown();
  }

  doShowdown() {
    const g = this.gameState; if (!g) return;
    g.street = 'showdown';
    // Reset awaiting acknowledgements and any previous timer
    this.awaiting = [false, false];
    if (this.nextHandTimer) { try { clearTimeout(this.nextHandTimer); } catch {} this.nextHandTimer = null; }
    const alive = [0,1].filter(i => !g.players[i].folded);
    if (alive.length === 1) {
      const w = alive[0];
      g.players[w].stack += g.pot; g.message = `${g.players[w].name} wins ${g.pot}`; g.pot = 0; return;
    }
    const score0 = this.eval7(g.players[0].hole.concat(g.board));
    const score1 = this.eval7(g.players[1].hole.concat(g.board));
    const cmp = score0.rank === score1.rank ? 0 : (score0.rank > score1.rank ? 1 : -1);
    if (cmp === 0) {
      const each = Math.floor(g.pot / 2); g.players[0].stack += each; g.players[1].stack += each; g.message = 'Split Pot';
    } else {
      const w = cmp > 0 ? 0 : 1; g.players[w].stack += g.pot; g.message = `${g.players[w].name} wins ${g.pot}`;
    }
    g.pot = 0;
    // If someone has 0 and the other has all chips, mark game over message for clients
    const zero0 = g.players[0].stack <= 0; const zero1 = g.players[1].stack <= 0;
    if ((zero0 && !zero1) || (zero1 && !zero0)) {
      const winnerIdx = zero0 ? 1 : 0;
      g.gameOver = true;
      g.gameOverWinner = g.players[winnerIdx].name;
    } else {
      g.gameOver = false;
      g.gameOverWinner = '';
    }
  }

  // ====== Helpers ======
  newShuffledDeck() {
    const d = [];
    for (let s = 0; s < 4; s++) { for (let r = 2; r <= 14; r++) { d.push({ r, s }); } }
    // Fisher-Yates with crypto randomness
    for (let i = d.length - 1; i > 0; i--) {
      const j = this.secureRandomIntInclusive(i);
      const tmp = d[i]; d[i] = d[j]; d[j] = tmp;
    }
    return d;
  }

  secureRandomIntInclusive(max) {
    max = Math.floor(max); if (max <= 0) return 0; const range = max + 1;
    const arr = new Uint32Array(1);
    while (true) {
      crypto.getRandomValues(arr);
      const v = arr[0];
      const maxUint = 0x100000000;
      const bucket = Math.floor(maxUint / range);
      const limit = bucket * range - 1;
      if (v <= limit) return v % range;
    }
  }

  eval7(cards) {
    const bySuit = [[],[],[],[]];
    const counts = new Map();
    let maskRanks = 0;
    for (const c of cards) { bySuit[c.s].push(c.r); counts.set(c.r,(counts.get(c.r)||0)+1); maskRanks |= 1<<(c.r); }
    for (let s=0;s<4;s++) bySuit[s].sort((a,b)=>b-a);
    const ranks = Array.from(counts.keys()).sort((a,b)=> b-a);
    function bestStraightFromMask(mask){ if(mask & (1<<14)) mask |= 1<<1; for(let hi=14; hi>=5; hi--){ let ok=true; for(let k=0;k<5;k++){ if(!(mask & (1<<(hi-k)))){ ok=false; break; } } if(ok) return hi; } return 0; }
    let flushSuit=-1; for(let s=0;s<4;s++){ if(bySuit[s].length>=5){ flushSuit=s; break; } }
    if(flushSuit>=0){ const maskFlush=bySuit[flushSuit].reduce((m,r)=>m|(1<<r),0); let hiSF=bestStraightFromMask(maskFlush); if(hiSF){ const rank=8*1e9 + hiSF*1e6; return { rank, cat:8, kickers:[hiSF] }; } }
    const groups={4:[],3:[],2:[],1:[]}; for(const r of ranks){ groups[counts.get(r)].push(r); }
    if(groups[4].length){ const four=groups[4][0]; const rest=ranks.filter(x=>x!==four); return { rank: 7*1e9 + four*1e6 + (rest[0]||0)*1e3, cat:7, kickers:[four,rest[0]||0] }; }
    if(groups[3].length){ if(groups[3].length>=2 || groups[2].length){ const trips=groups[3][0]; const pair=groups[3].length>=2 ? groups[3][1] : groups[2][0]; return { rank: 6*1e9 + trips*1e6 + pair*1e3, cat:6, kickers:[trips,pair] }; } }
    if(flushSuit>=0){ const top5=bySuit[flushSuit].slice(0,5); return { rank: 5*1e9 + top5[0]*1e6 + top5[1]*1e4 + top5[2]*1e2 + top5[3], cat:5, kickers: top5 }; }
    const hiSt=bestStraightFromMask(maskRanks); if(hiSt){ return { rank: 4*1e9 + hiSt*1e6, cat:4, kickers:[hiSt] }; }
    if(groups[3].length){ const t=groups[3][0]; const rest=ranks.filter(x=>x!==t); return { rank: 3*1e9 + t*1e6 + (rest[0]||0)*1e4 + (rest[1]||0)*1e2, cat:3, kickers:[t, rest[0]||0, rest[1]||0] }; }
    if(groups[2].length>=2){ const [p1,p2]=groups[2].slice(0,2); const rest=ranks.filter(x=>x!==p1&&x!==p2); return { rank: 2*1e9 + p1*1e6 + p2*1e4 + (rest[0]||0)*1e2, cat:2, kickers:[p1,p2, rest[0]||0] }; }
    if(groups[2].length===1){ const p=groups[2][0]; const rest=ranks.filter(x=>x!==p); return { rank: 1*1e9 + p*1e6 + (rest[0]||0)*1e4 + (rest[1]||0)*1e2 + (rest[2]||0), cat:1, kickers:[p, rest[0]||0, rest[1]||0, rest[2]||0] }; }
    const top5=ranks.slice(0,5); while(top5.length<5) top5.push(0); return { rank: top5[0]*1e6 + top5[1]*1e4 + top5[2]*1e2 + top5[3]*1, cat:0, kickers: top5 };
  }

  // Send personalized state views to each connected player
  broadcastState() {
    if (!this.gameState) return;
    const seats = Array.from(this.players.values());
    seats.forEach((p, idx) => {
      try {
        p.connection.ws.send(JSON.stringify({
          type: 'game_state',
          myPlayerId: idx,
          state: this.viewFor(idx)
        }));
      } catch {}
    });
  }

  viewFor(myIdx) {
    const g = this.gameState;
    const clone = JSON.parse(JSON.stringify(g));
    // Hide opponent hole cards until showdown. Use nulls so clients don't accidentally render a specific card.
    const oppIdx = 1 - myIdx;
    if (clone.street !== 'showdown') {
      clone.players[oppIdx].hole = [ null, null ];
    }
    // Only reveal the community cards up to street
    const revealCount = clone.street === 'preflop' ? 0 : clone.street === 'flop' ? 3 : clone.street === 'turn' ? 4 : 5;
    clone.board = clone.board.slice(0, revealCount);
    return clone;
  }
}
