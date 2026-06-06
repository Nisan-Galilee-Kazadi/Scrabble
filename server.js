import http from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import {
  analyzeBoard,
  autoPassTurn,
  createGame,
  exchangeTilesByIds,
  moveTileInRack,
  passTurn,
  placeTileFromRack,
  quitPlayer,
  recallTiles,
  removeTemporaryTile,
  restartGame,
  shuffleRackForPlayer,
  undoLastTurn,
  validateTurn
} from "./src/lib/game.js";
import {
  getDictionaryLabel,
  isValidDictionaryWord,
  normalizeDictionaryLanguage
} from "./src/lib/dictionary.js";

const HOST = "0.0.0.0";
const DEFAULT_PORT = 8788;
const PORT = Number.parseInt(process.env.SCRABBLE_SERVER_PORT ?? process.env.PORT ?? `${DEFAULT_PORT}`, 10);
const rooms = new Map();

function normalizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function createRoomId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let roomId = "";
  for (let index = 0; index < 6; index += 1) {
    roomId += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return rooms.has(roomId) ? createRoomId() : roomId;
}

function json(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  response.end(JSON.stringify(payload));
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function checkExistingServer(port) {
  return new Promise((resolve) => {
    const request = http.get(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/health",
        timeout: 1500
      },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          try {
            const payload = JSON.parse(body);
            resolve(response.statusCode === 200 && payload?.service === "scrabble-room-server");
          } catch {
            resolve(false);
          }
        });
      },
    );

    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

function createRoom(playerNames, options = {}) {
  const dictionaryLanguage = normalizeDictionaryLanguage(options.dictionaryLanguage);
  const game = createGame(playerNames, {
    dictionaryLanguage,
    turnDurationSeconds: options.turnDurationSeconds
  });
  const roomId = createRoomId();
  const adminToken = randomUUID();
  const playerTokens = new Map();

  game.players.forEach((player) => {
    playerTokens.set(randomUUID(), player.id);
  });

  const room = {
    id: roomId,
    adminToken,
    game,
    playerTokens,
    sockets: new Set(),
    createdAt: Date.now()
  };

  rooms.set(roomId, room);
  return room;
}

function getViewer(room, token) {
  if (!token) {
    return null;
  }

  if (token === room.adminToken) {
    return {
      role: "admin"
    };
  }

  const playerId = room.playerTokens.get(token);
  if (!playerId) {
    return null;
  }

  return {
    role: "player",
    playerId
  };
}

function getCurrentPlayer(room) {
  return room.game.players[room.game.currentPlayerIndex];
}

function getConnectedPlayerIds(room) {
  const connected = new Set();
  room.sockets.forEach((socket) => {
    if (socket.readyState !== 1) {
      return;
    }
    if (socket.viewer?.role === "player") {
      connected.add(socket.viewer.playerId);
    }
  });
  return connected;
}

function serializeBoard(room, viewer) {
  const currentPlayer = getCurrentPlayer(room);
  return room.game.board.map((row) =>
    row.map((cell) => {
      if (!cell) {
        return null;
      }

      if (!cell.locked) {
        const isOwner = viewer.role === "player" && viewer.playerId === currentPlayer?.id;
        return {
          ...cell,
          isTemporary: true,
          isOwn: isOwner
        };
      }

      return cell;
    }),
  );
}

function serializePlayerView(room, playerId) {
  const me = room.game.players.find((player) => player.id === playerId);
  const currentPlayer = getCurrentPlayer(room);
  const isMyTurn = currentPlayer?.id === playerId;

  let pendingScore = null;
  if (isMyTurn && hasTemporaryTiles(room)) {
    const analysis = analyzeBoard(room.game);
    pendingScore = analysis;
  }

  return {
    role: "player",
    roomId: room.id,
    dictionaryLanguage: room.game.dictionaryLanguage,
    dictionaryLabel: getDictionaryLabel(room.game.dictionaryLanguage),
    board: serializeBoard(room, { role: "player", playerId }),
    bagCount: room.game.bag.length,
    turnNumber: room.game.turnNumber,
    turnDurationSeconds: room.game.turnDurationSeconds,
    turnStartTime: room.game.turnStartTime,
    playedWords: room.game.playedWords || [],
    gameOver: room.game.gameOver,
    winnerId: room.game.winnerId,
    currentPlayerName: currentPlayer?.name ?? null,
    currentPlayerId: currentPlayer?.id ?? null,
    isMyTurn,
    pendingScore,
    canUndo: isMyTurn && Boolean(room.game.previousState),
    logs: room.game.logs.slice(0, 10),
    me: me
      ? {
        id: me.id,
        name: me.name,
        score: me.score,
        rack: me.rack,
        status: me.status
      }
      : null,
    allPlayers: room.game.players.map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      status: player.status,
      isCurrent: currentPlayer?.id === player.id
    })),
    opponents: room.game.players
      .filter((player) => player.id !== playerId)
      .map((player) => ({
        id: player.id,
        name: player.name,
        score: player.score,
        status: player.status
      }))
  };
}

function serializeAdminView(room) {
  const connected = getConnectedPlayerIds(room);
  const currentPlayer = getCurrentPlayer(room);

  return {
    role: "admin",
    roomId: room.id,
    dictionaryLanguage: room.game.dictionaryLanguage,
    dictionaryLabel: getDictionaryLabel(room.game.dictionaryLanguage),
    board: serializeBoard(room, { role: "admin" }),
    bagCount: room.game.bag.length,
    turnNumber: room.game.turnNumber,
    turnDurationSeconds: room.game.turnDurationSeconds,
    turnStartTime: room.game.turnStartTime,
    playedWords: room.game.playedWords || [],
    gameOver: room.game.gameOver,
    winnerId: room.game.winnerId,
    currentPlayerName: currentPlayer?.name ?? null,
    logs: room.game.logs.slice(0, 8),
    players: room.game.players.map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score,
      rackCount: player.rack.length,
      status: player.status,
      connected: connected.has(player.id),
      isCurrent: currentPlayer?.id === player.id,
      token: [...room.playerTokens.entries()].find(([, storedPlayerId]) => storedPlayerId === player.id)?.[0] ?? null
    }))
  };
}

function serializeRoom(room, viewer) {
  return viewer.role === "admin"
    ? serializeAdminView(room)
    : serializePlayerView(room, viewer.playerId);
}

function hasTemporaryTiles(room) {
  return room.game.board.some((row) => row.some((cell) => cell && !cell.locked));
}

function applyPlayerAction(room, playerId, action) {
  if (room.game.gameOver) {
    return;
  }

  const actingPlayer = room.game.players.find((player) => player.id === playerId);
  if (!actingPlayer || actingPlayer.status === "quit") {
    return;
  }

  if (action.type === "shuffle_rack") {
    room.game = shuffleRackForPlayer(room.game, playerId);
    return;
  }

  if (action.type === "move_tile_in_rack") {
    room.game = moveTileInRack(room.game, playerId, action.tileId, action.targetIndex);
    return;
  }

  if (action.type === "quit_game") {
    room.game = quitPlayer(room.game, playerId);
    return;
  }

  const currentPlayer = getCurrentPlayer(room);
  if (!currentPlayer || currentPlayer.id !== playerId) {
    return;
  }

  switch (action.type) {
    case "place_tile":
      room.game = placeTileFromRack(
        room.game,
        action.tileId,
        action.row,
        action.col,
        action.blankLetter ?? "E",
      );
      return;
    case "remove_tile":
      room.game = removeTemporaryTile(room.game, action.row, action.col);
      return;
    case "recall_tiles":
      room.game = recallTiles(room.game);
      return;
    case "pass_turn":
      room.game = passTurn(room.game);
      return;
    case "validate_turn":
      room.game = validateTurn(room.game, {
        isWordValid: (word) => isValidDictionaryWord(word, room.game.dictionaryLanguage),
        languageLabel: getDictionaryLabel(room.game.dictionaryLanguage)
      });
      return;
    case "exchange_tiles":
      if (hasTemporaryTiles(room)) {
        return;
      }
      room.game = exchangeTilesByIds(room.game, action.tileIds ?? []);
      return;
    case "undo_turn":
      room.game = undoLastTurn(room.game);
      return;
    case "restart_game":
      room.game = restartGame(room.game);
      return;
    default:
      return;
  }
}

function broadcastRoom(room) {
  room.sockets.forEach((socket) => {
    if (socket.readyState !== 1 || !socket.viewer) {
      return;
    }

    socket.send(
      JSON.stringify({
        type: "snapshot",
        payload: serializeRoom(room, socket.viewer)
      }),
    );
  });
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    json(response, 400, { error: "Missing URL" });
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);
  const path = url.pathname;

  if (request.method === "GET" && path === "/api/health") {
    json(response, 200, {
      ok: true,
      service: "scrabble-room-server",
      port: PORT
    });
    return;
  }

  if (request.method === "POST" && path === "/api/rooms") {
    try {
      const body = await parseBody(request);
      const playerNames = Array.isArray(body.playerNames) ? body.playerNames : [];
      const dictionaryLanguage = normalizeDictionaryLanguage(body.dictionaryLanguage);
      if (playerNames.length < 2 || playerNames.length > 4) {
        json(response, 400, { error: "A room needs between 2 and 4 players." });
        return;
      }

      const normalizedNames = playerNames.map((name) => normalizeName(name));
      if (normalizedNames.some((name) => !name)) {
        json(response, 400, { error: "Each player must have a name." });
        return;
      }

      if (new Set(normalizedNames).size !== normalizedNames.length) {
        json(response, 400, { error: "Each player name must be unique in the room." });
        return;
      }

      const room = createRoom(playerNames, { 
        dictionaryLanguage,
        turnDurationSeconds: body.turnDurationSeconds ? parseInt(body.turnDurationSeconds, 10) : null 
      });
      json(response, 201, {
        roomId: room.id,
        adminToken: room.adminToken,
        dictionaryLanguage: room.game.dictionaryLanguage,
        players: room.game.players.map((player) => ({
          id: player.id,
          name: player.name,
          token: [...room.playerTokens.entries()].find(([, storedPlayerId]) => storedPlayerId === player.id)?.[0] ?? null
        }))
      });
      return;
    } catch {
      json(response, 400, { error: "Invalid JSON body." });
      return;
    }
  }

  const joinMatch = path.match(/^\/api\/rooms\/([A-Za-z0-9]+)\/join$/);
  if (request.method === "POST" && joinMatch) {
    const roomId = joinMatch[1].toUpperCase();
    const room = rooms.get(roomId);
    if (!room) {
      json(response, 404, { error: "Room not found." });
      return;
    }

    try {
      const body = await parseBody(request);
      const targetName = normalizeName(body.playerName);
      if (!targetName) {
        json(response, 400, { error: "Player name is required." });
        return;
      }

      const player = room.game.players.find((entry) => normalizeName(entry.name) === targetName);
      if (!player) {
        json(response, 404, { error: "Player name not found in this room." });
        return;
      }

      const token =
        [...room.playerTokens.entries()].find(([, storedPlayerId]) => storedPlayerId === player.id)?.[0] ?? null;

      if (!token) {
        json(response, 500, { error: "Unable to generate the player session." });
        return;
      }

      json(response, 200, {
        roomId,
        playerId: player.id,
        playerName: player.name,
        token
      });
      return;
    } catch {
      json(response, 400, { error: "Invalid JSON body." });
      return;
    }
  }

  const roomMatch = path.match(/^\/api\/rooms\/([A-Za-z0-9]+)$/);
  if (!roomMatch) {
    json(response, 404, { error: "Not found." });
    return;
  }

  const room = rooms.get(roomMatch[1].toUpperCase());
  if (!room) {
    json(response, 404, { error: "Room not found." });
    return;
  }

  const viewer = getViewer(room, url.searchParams.get("token"));
  if (!viewer) {
    json(response, 403, { error: "Invalid token." });
    return;
  }

  if (request.method === "GET") {
    json(response, 200, serializeRoom(room, viewer));
    return;
  }

  if (request.method === "POST") {
    if (viewer.role !== "player") {
      json(response, 403, { error: "Only players can send actions." });
      return;
    }

    try {
      const action = await parseBody(request);
      applyPlayerAction(room, viewer.playerId, action);
      broadcastRoom(room);
      json(response, 200, serializeRoom(room, viewer));
      return;
    } catch {
      json(response, 400, { error: "Invalid action payload." });
      return;
    }
  }

  json(response, 405, { error: "Method not allowed." });
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  if (!request.url) {
    socket.destroy();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }

  const room = rooms.get(url.searchParams.get("roomId"));
  if (!room) {
    socket.destroy();
    return;
  }

  const viewer = getViewer(room, url.searchParams.get("token"));
  if (!viewer) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (websocket) => {
    websocket.viewer = viewer;
    websocket.roomId = room.id;
    room.sockets.add(websocket);

    websocket.send(
      JSON.stringify({
        type: "snapshot",
        payload: serializeRoom(room, viewer)
      }),
    );

    broadcastRoom(room);

    websocket.on("close", () => {
      room.sockets.delete(websocket);
      broadcastRoom(room);
    });
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (!room.game.gameOver && room.game.turnDurationSeconds && room.game.turnStartTime) {
      const elapsedSeconds = (now - room.game.turnStartTime) / 1000;
      if (elapsedSeconds >= room.game.turnDurationSeconds) {
        room.game = autoPassTurn(room.game);
        broadcastRoom(room);
      }
    }
  }
}, 1000);

server.on("error", async (error) => {
  if (error.code === "EADDRINUSE") {
    const isExistingScrabbleServer = await checkExistingServer(PORT);
    if (isExistingScrabbleServer) {
      console.log(
        `Scrabble room server already running on http://127.0.0.1:${PORT}, reusing the existing instance.`,
      );
      process.exit(0);
      return;
    }

    console.error(
      `Le port ${PORT} est deja occupe par une autre application. Definis SCRABBLE_SERVER_PORT sur un port libre puis relance le serveur.`,
    );
    process.exit(1);
    return;
  }

  throw error;
});

server.listen(PORT, HOST, () => {
  console.log(`Scrabble room server listening on http://127.0.0.1:${PORT}`);
});
