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
      const durableGameId = env.GAMES.idFromName(gameId); // Use idFromName instead of idFromString
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
    this.players = new Map();
    this.gameState = null;
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
    
    // Assign player IDs: first player is 0, second is 1
    const playerIndex = this.players.size - 1;
    
    // Just send opponent info, let frontend handle game state
    connection.ws.send(JSON.stringify({
      type: 'game_ready',
      myPlayerId: playerIndex,
      opponent: this.getOpponentInfo(playerId),
      playersConnected: this.players.size
    }));
    
    // Notify both players when game is ready
    if (this.players.size === 2) {
      console.log('Both players joined, game ready');
      let index = 0;
      for (const player of this.players.values()) {
        player.connection.ws.send(JSON.stringify({
          type: 'game_ready',
          myPlayerId: index,
          opponent: this.getOpponentInfo(player.id),
          playersConnected: 2
        }));
        index++;
      }
    }
  }
  
  async handlePlayerAction(connection, message) {
    const { action } = message;
    
    // Broadcast action to opponent
    for (const [pid, player] of this.players) {
      if (pid !== connection.playerId) {
        player.connection.ws.send(JSON.stringify({
          type: 'opponent_action',
          action: action
        }));
        break;
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
  
  // Game state is handled entirely by the frontend
  // Worker just relays messages between players
}
