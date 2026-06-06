import {
  BINGO_BONUS,
  BOARD_SIZE,
  CENTER_INDEX,
  EXCHANGE_MIN_BAG_TILES,
  LETTER_DISTRIBUTION,
  PREMIUM_CELLS,
  RACK_SIZE
} from "./constants.js";

export function createEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null),
  );
}

export function shuffle(items) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

export function createBag() {
  let uid = 0;
  const tiles = [];
  LETTER_DISTRIBUTION.forEach(({ letter, count, points }) => {
    for (let index = 0; index < count; index += 1) {
      tiles.push({
        id: `${letter}-${uid}`,
        letter,
        points,
        isBlank: letter === "?"
      });
      uid += 1;
    }
  });
  return shuffle(tiles);
}

export function drawTiles(bag, count) {
  const drawn = bag.slice(0, count);
  return {
    drawn,
    bag: bag.slice(count)
  };
}

export function createGame(playerNames, options = {}) {
  let bag = createBag();
  const players = playerNames.map((name, index) => {
    const draw = drawTiles(bag, RACK_SIZE);
    bag = draw.bag;
    return {
      id: `player-${index + 1}`,
      name: name.trim() || `Joueur ${index + 1}`,
      score: 0,
      rack: draw.drawn,
      status: "active"
    };
  });

  return {
    board: createEmptyBoard(),
    bag,
    players,
    dictionaryLanguage: options.dictionaryLanguage ?? "fr",
    turnDurationSeconds: options.turnDurationSeconds || null,
    turnStartTime: Date.now(),
    playedWords: [],
    currentPlayerIndex: 0,
    selectedTileId: null,
    exchangeSelection: [],
    mode: "place",
    turnNumber: 1,
    passCount: 0,
    logs: [
      {
        id: "start",
        text: `Partie lancee pour ${players.map((player) => player.name).join(", ")}.`
      }
    ],
    winnerId: null,
    gameOver: false
  };
}

export function keyForPosition(row, col) {
  return `${row},${col}`;
}

export function premiumForCell(row, col) {
  return PREMIUM_CELLS[keyForPosition(row, col)] ?? { type: "NORMAL", label: "" };
}

function cloneBoard(board) {
  return board.map((line) => line.map((cell) => (cell ? { ...cell } : null)));
}

function clonePlayers(players) {
  return players.map((player) => ({
    ...player,
    rack: [...player.rack]
  }));
}

function getCell(board, row, col) {
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
    return null;
  }
  return board[row][col];
}

function findPlacedTiles(board) {
  const tiles = [];
  board.forEach((line, row) => {
    line.forEach((cell, col) => {
      if (cell && !cell.locked) {
        tiles.push({ row, col, tile: cell });
      }
    });
  });
  return tiles;
}

function allLockedTiles(board) {
  const tiles = [];
  board.forEach((line, row) => {
    line.forEach((cell, col) => {
      if (cell?.locked) {
        tiles.push({ row, col, tile: cell });
      }
    });
  });
  return tiles;
}

function hasAdjacentLockedTile(board, row, col) {
  return Boolean(
    getCell(board, row - 1, col)?.locked ||
    getCell(board, row + 1, col)?.locked ||
    getCell(board, row, col - 1)?.locked ||
    getCell(board, row, col + 1)?.locked,
  );
}

function collectWord(board, row, col, direction) {
  const [deltaRow, deltaCol] = direction === "horizontal" ? [0, 1] : [1, 0];
  let startRow = row;
  let startCol = col;

  while (getCell(board, startRow - deltaRow, startCol - deltaCol)) {
    startRow -= deltaRow;
    startCol -= deltaCol;
  }

  const positions = [];
  let currentRow = startRow;
  let currentCol = startCol;

  while (getCell(board, currentRow, currentCol)) {
    positions.push({
      row: currentRow,
      col: currentCol,
      tile: getCell(board, currentRow, currentCol)
    });
    currentRow += deltaRow;
    currentCol += deltaCol;
  }

  return positions;
}

function detectMainDirection(board, newTiles) {
  if (newTiles.length > 1) {
    const sameRow = newTiles.every((entry) => entry.row === newTiles[0].row);
    const sameCol = newTiles.every((entry) => entry.col === newTiles[0].col);
    if (!sameRow && !sameCol) {
      return null;
    }
    return sameRow ? "horizontal" : "vertical";
  }

  const single = newTiles[0];
  if (getCell(board, single.row, single.col - 1) || getCell(board, single.row, single.col + 1)) {
    return "horizontal";
  }
  if (getCell(board, single.row - 1, single.col) || getCell(board, single.row + 1, single.col)) {
    return "vertical";
  }
  return "horizontal";
}

function scoreWord(positions, newTileKeys) {
  let wordScore = 0;
  let wordMultiplier = 1;

  positions.forEach(({ row, col, tile }) => {
    let letterScore = tile.points;
    if (newTileKeys.has(keyForPosition(row, col))) {
      const premium = premiumForCell(row, col).type;
      if (premium === "DL") {
        letterScore *= 2;
      }
      if (premium === "TL") {
        letterScore *= 3;
      }
      if (premium === "DW" || premium === "STAR") {
        wordMultiplier *= 2;
      }
      if (premium === "TW") {
        wordMultiplier *= 3;
      }
    }
    wordScore += letterScore;
  });

  return wordScore * wordMultiplier;
}

function calculateEndGame(players, winnerIndex) {
  const nextPlayers = clonePlayers(players);
  const hasWinner =
    Number.isInteger(winnerIndex) &&
    winnerIndex >= 0 &&
    winnerIndex < nextPlayers.length;
  let collected = 0;

  nextPlayers.forEach((player, index) => {
    if (hasWinner && index === winnerIndex) {
      return;
    }
    const penalty = player.rack.reduce((sum, tile) => sum + tile.points, 0);
    player.score -= penalty;
    collected += penalty;
  });

  if (hasWinner) {
    nextPlayers[winnerIndex].score += collected;
  }
  return nextPlayers;
}

function getActivePlayers(players) {
  return players.filter((player) => player.status !== "quit");
}

function consecutivePassLimit(players) {
  return Math.max(1, getActivePlayers(players).length) * 2;
}

function hasReachedConsecutivePassLimit(players, passCount) {
  return passCount >= consecutivePassLimit(players);
}

function resolveWinner(players) {
  const activePlayers = getActivePlayers(players);
  const pool = activePlayers.length ? activePlayers : players;
  return [...pool].sort((left, right) => right.score - left.score)[0] ?? null;
}

function nextPlayerIndex(state, fromIndex = state.currentPlayerIndex) {
  const total = state.players.length;
  for (let offset = 1; offset <= total; offset += 1) {
    const index = (fromIndex + offset) % total;
    if (state.players[index]?.status !== "quit") {
      return index;
    }
  }
  return fromIndex;
}

function withLog(state, text) {
  return {
    ...state,
    logs: [{ id: `${Date.now()}-${Math.random()}`, text }, ...state.logs].slice(0, 12)
  };
}

function clearSelections(state) {
  return {
    ...state,
    selectedTileId: null,
    exchangeSelection: [],
    mode: "place"
  };
}

export function selectRackTile(state, tileId) {
  if (state.gameOver) {
    return state;
  }

  if (state.mode === "exchange") {
    const isSelected = state.exchangeSelection.includes(tileId);
    return {
      ...state,
      exchangeSelection: isSelected
        ? state.exchangeSelection.filter((id) => id !== tileId)
        : [...state.exchangeSelection, tileId]
    };
  }

  return {
    ...state,
    selectedTileId: state.selectedTileId === tileId ? null : tileId
  };
}

export function toggleExchangeMode(state) {
  if (state.gameOver) {
    return state;
  }
  if (findPlacedTiles(state.board).length > 0) {
    return withLog(state, "Rappelle d'abord les lettres posées avant un échange.");
  }
  return {
    ...state,
    mode: state.mode === "exchange" ? "place" : "exchange",
    selectedTileId: null,
    exchangeSelection: []
  };
}

export function placeSelectedTile(state, row, col, blankLetter = "E") {
  if (state.gameOver || state.mode !== "place") {
    return state;
  }

  const board = cloneBoard(state.board);
  const cell = board[row][col];
  if (cell) {
    return state;
  }

  const tileId = state.selectedTileId;
  if (!tileId) {
    return state;
  }

  const players = clonePlayers(state.players);
  const rack = players[state.currentPlayerIndex].rack;
  const rackTile = rack.find((tile) => tile.id === tileId);
  if (!rackTile) {
    return state;
  }

  board[row][col] = {
    ...rackTile,
    letter: rackTile.isBlank ? blankLetter.trim().slice(0, 1).toUpperCase() || "E" : rackTile.letter,
    locked: false,
    sourceId: rackTile.id
  };

  players[state.currentPlayerIndex].rack = rack.filter((tile) => tile.id !== tileId);

  return {
    ...state,
    board,
    players,
    selectedTileId: null
  };
}

export function placeTileFromRack(state, tileId, row, col, blankLetter = "E") {
  if (state.gameOver) {
    return state;
  }

  const board = cloneBoard(state.board);
  if (board[row][col]) {
    return state;
  }

  const players = clonePlayers(state.players);
  const rack = players[state.currentPlayerIndex].rack;
  const rackTile = rack.find((tile) => tile.id === tileId);
  if (!rackTile) {
    return state;
  }

  board[row][col] = {
    ...rackTile,
    letter: rackTile.isBlank ? blankLetter.trim().slice(0, 1).toUpperCase() || "E" : rackTile.letter,
    locked: false,
    sourceId: rackTile.id
  };

  players[state.currentPlayerIndex].rack = rack.filter((tile) => tile.id !== tileId);

  return {
    ...state,
    board,
    players
  };
}

export function removeTemporaryTile(state, row, col) {
  if (state.gameOver) {
    return state;
  }

  const board = cloneBoard(state.board);
  const cell = board[row][col];
  if (!cell || cell.locked) {
    return state;
  }

  board[row][col] = null;
  const players = clonePlayers(state.players);
  players[state.currentPlayerIndex].rack.push({
    id: cell.sourceId,
    letter: cell.isBlank ? "?" : cell.letter,
    points: cell.points,
    isBlank: cell.isBlank
  });

  return {
    ...state,
    board,
    players
  };
}

export function recallTiles(state) {
  let nextState = state;
  findPlacedTiles(state.board).forEach(({ row, col }) => {
    nextState = removeTemporaryTile(nextState, row, col);
  });
  return clearSelections(nextState);
}

export function shuffleRack(state) {
  if (state.gameOver) {
    return state;
  }

  const players = clonePlayers(state.players);
  players[state.currentPlayerIndex].rack = shuffle(players[state.currentPlayerIndex].rack);
  return {
    ...state,
    players
  };
}

export function quitPlayer(state, playerId) {
  if (state.gameOver) {
    return state;
  }

  const playerIndex = state.players.findIndex((player) => player.id === playerId);
  if (playerIndex === -1 || state.players[playerIndex].status === "quit") {
    return state;
  }

  let nextState = state;
  if (playerIndex === state.currentPlayerIndex) {
    nextState = recallTiles(nextState);
  }

  const players = clonePlayers(nextState.players);
  players[playerIndex] = {
    ...players[playerIndex],
    status: "quit"
  };

  const quittingPlayer = players[playerIndex];
  let updated = {
    ...nextState,
    players
  };

  const activePlayers = getActivePlayers(players);
  if (activePlayers.length <= 1) {
    const winner = resolveWinner(players);
    updated = {
      ...updated,
      gameOver: true,
      winnerId: winner?.id ?? null,
      passCount: 0
    };
  } else if (playerIndex === nextState.currentPlayerIndex) {
    updated = {
      ...updated,
      currentPlayerIndex: nextPlayerIndex({ ...updated, players }, playerIndex),
      turnNumber: nextState.turnNumber + 1,
      passCount: 0,
      turnStartTime: Date.now()
    };
  }

  const winner = updated.gameOver ? resolveWinner(updated.players) : null;
  const message = winner
    ? `${quittingPlayer.name} declare forfait. ${winner.name} gagne la partie.`
    : `${quittingPlayer.name} declare forfait.`;

  return withLog(updated, message);
}

export function shuffleRackForPlayer(state, playerId) {
  if (state.gameOver) {
    return state;
  }

  const players = clonePlayers(state.players);
  const playerIndex = players.findIndex((player) => player.id === playerId);
  if (playerIndex === -1) {
    return state;
  }

  players[playerIndex].rack = shuffle(players[playerIndex].rack);
  return {
    ...state,
    players
  };
}

export function moveTileInRack(state, playerId, tileId, targetIndex) {
  if (state.gameOver) {
    return state;
  }

  const players = clonePlayers(state.players);
  const playerIndex = players.findIndex((player) => player.id === playerId);
  if (playerIndex === -1) {
    return state;
  }

  const rack = [...players[playerIndex].rack];
  const sourceIndex = rack.findIndex((tile) => tile.id === tileId);
  if (sourceIndex === -1) {
    return state;
  }

  const [tile] = rack.splice(sourceIndex, 1);
  const safeTargetIndex = Math.max(0, Math.min(targetIndex, rack.length));
  rack.splice(safeTargetIndex, 0, tile);
  players[playerIndex].rack = rack;

  return {
    ...state,
    players
  };
}

export function passTurn(state) {
  if (state.gameOver) {
    return state;
  }

  const recalled = recallTiles(state);
  const passes = recalled.passCount + 1;
  const currentPlayer = recalled.players[recalled.currentPlayerIndex];
  let nextState = {
    ...recalled,
    currentPlayerIndex: nextPlayerIndex(recalled),
    turnNumber: recalled.turnNumber + 1,
    passCount: passes,
    turnStartTime: Date.now()
  };

  nextState = withLog(nextState, `${currentPlayer.name} passe son tour.`);

  if (hasReachedConsecutivePassLimit(nextState.players, passes)) {
    const completedPlayers = calculateEndGame(nextState.players, -1);
    const winner = resolveWinner(completedPlayers);
    return {
      ...nextState,
      players: completedPlayers,
      gameOver: true,
      winnerId: winner?.id ?? null
    };
  }

  return clearSelections(nextState);
}

export function exchangeTiles(state) {
  if (state.gameOver) {
    return state;
  }

  const selected = state.exchangeSelection;
  if (!selected.length) {
    return withLog(state, "Choisis au moins une lettre à échanger.");
  }

  if (state.bag.length < EXCHANGE_MIN_BAG_TILES) {
    return withLog(state, "Il faut au moins 7 lettres dans le sac pour echanger.");
  }

  const players = clonePlayers(state.players);
  const player = players[state.currentPlayerIndex];
  const toExchange = player.rack.filter((tile) => selected.includes(tile.id));
  if (!toExchange.length) {
    return state;
  }
  player.rack = player.rack.filter((tile) => !selected.includes(tile.id));

  const draw = drawTiles(state.bag, toExchange.length);
  const bag = shuffle([...draw.bag, ...toExchange]);
  player.rack.push(...draw.drawn);

  let nextState = {
    ...state,
    players,
    bag,
    currentPlayerIndex: nextPlayerIndex(state),
    turnNumber: state.turnNumber + 1,
    passCount: 0,
    turnStartTime: Date.now()
  };

  nextState = clearSelections(nextState);
  return withLog(nextState, `${player.name} échange ${toExchange.length} lettre(s).`);
}

export function exchangeTilesByIds(state, tileIds) {
  if (state.gameOver) {
    return state;
  }

  if (!tileIds.length) {
    return withLog(state, "Choisis au moins une lettre a echanger.");
  }

  if (state.bag.length < EXCHANGE_MIN_BAG_TILES) {
    return withLog(state, "Il faut au moins 7 lettres dans le sac pour echanger.");
  }

  const players = clonePlayers(state.players);
  const player = players[state.currentPlayerIndex];
  const toExchange = player.rack.filter((tile) => tileIds.includes(tile.id));
  if (!toExchange.length) {
    return state;
  }

  player.rack = player.rack.filter((tile) => !tileIds.includes(tile.id));

  const draw = drawTiles(state.bag, toExchange.length);
  const bag = shuffle([...draw.bag, ...toExchange]);
  player.rack.push(...draw.drawn);

  let nextState = {
    ...state,
    players,
    bag,
    currentPlayerIndex: nextPlayerIndex(state),
    turnNumber: state.turnNumber + 1,
    passCount: 0,
    turnStartTime: Date.now()
  };

  nextState = clearSelections(nextState);
  return withLog({ ...nextState, previousState: null }, `${player.name} echange ${toExchange.length} lettre(s).`);
}

export function analyzeBoard(state) {
  const board = state.board;
  const newTiles = findPlacedTiles(board);
  if (!newTiles.length) {
    return { valid: false, reason: "Pose au moins une lettre ou passe ton tour." };
  }

  const lockedTiles = allLockedTiles(board);
  const direction = detectMainDirection(board, newTiles);
  if (!direction) {
    return { valid: false, reason: "Toutes les nouvelles lettres doivent etre sur la meme ligne." };
  }

  const firstMove = lockedTiles.length === 0;
  if (firstMove && !newTiles.some(({ row, col }) => row === CENTER_INDEX && col === CENTER_INDEX)) {
    return { valid: false, reason: "Le premier mot doit couvrir la case centrale." };
  }

  if (!firstMove && !newTiles.some(({ row, col }) => hasAdjacentLockedTile(board, row, col))) {
    return { valid: false, reason: "Le mot doit se connecter au plateau existant." };
  }

  const fixed = direction === "horizontal" ? newTiles[0].row : newTiles[0].col;
  const lineValues = direction === "horizontal" ? newTiles.map((tile) => tile.col) : newTiles.map((tile) => tile.row);
  const min = Math.min(...lineValues);
  const max = Math.max(...lineValues);

  for (let cursor = min; cursor <= max; cursor += 1) {
    const cell = direction === "horizontal" ? getCell(board, fixed, cursor) : getCell(board, cursor, fixed);
    if (!cell) {
      return { valid: false, reason: "Les lettres posees doivent former un bloc continu." };
    }
  }

  const mainWordPositions = collectWord(board, newTiles[0].row, newTiles[0].col, direction);
  const newTileKeys = new Set(newTiles.map(({ row, col }) => keyForPosition(row, col)));
  const scoredWords = [];
  const mainWord = mainWordPositions.map(({ tile }) => tile.letter).join("");
  if (mainWordPositions.length < 2) {
    return { valid: false, reason: "Un coup doit former au moins un mot de deux lettres." };
  }

  scoredWords.push({
    word: mainWord,
    points: scoreWord(mainWordPositions, newTileKeys)
  });

  const crossDirection = direction === "horizontal" ? "vertical" : "horizontal";
  newTiles.forEach(({ row, col }) => {
    const crossWord = collectWord(board, row, col, crossDirection);
    if (crossWord.length > 1) {
      scoredWords.push({
        word: crossWord.map(({ tile }) => tile.letter).join(""),
        points: scoreWord(crossWord, newTileKeys)
      });
    }
  });

  const bonus = newTiles.length === RACK_SIZE ? BINGO_BONUS : 0;
  const total = scoredWords.reduce((sum, word) => sum + word.points, 0) + bonus;

  return {
    valid: true,
    score: total,
    bonus,
    words: scoredWords,
    newTileCount: newTiles.length
  };
}

export function validateTurn(state, options = {}) {
  if (state.gameOver) {
    return state;
  }

  const analysis = analyzeBoard(state);
  if (!analysis.valid) {
    return withLog(state, analysis.reason);
  }

  const invalidWords = options.isWordValid
    ? analysis.words
      .map((entry) => entry.word)
      .filter((word, index, collection) => collection.indexOf(word) === index)
      .filter((word) => !options.isWordValid(word))
    : [];

  if (invalidWords.length) {
    let nextState = recallTiles(state);
    const faultPlayer = state.players[state.currentPlayerIndex];
    nextState = {
      ...nextState,
      currentPlayerIndex: nextPlayerIndex(nextState),
      turnNumber: nextState.turnNumber + 1,
      passCount: nextState.passCount + 1,
      turnStartTime: Date.now()
    };
    nextState = clearSelections(nextState);
    return withLog(
      nextState,
      `Mot(s) invalide(s) (${options.languageLabel ?? "fr"}): ${invalidWords.join(", ")}. ${faultPlayer.name} perd son tour.`,
    );
  }

  const board = cloneBoard(state.board);
  const newTiles = findPlacedTiles(board);
  const players = clonePlayers(state.players);
  const currentPlayer = players[state.currentPlayerIndex];
  currentPlayer.score += analysis.score;

  newTiles.forEach(({ row, col }) => {
    board[row][col] = {
      ...board[row][col],
      locked: true
    };
  });

  const draw = drawTiles(state.bag, Math.min(RACK_SIZE - currentPlayer.rack.length, state.bag.length));
  currentPlayer.rack.push(...draw.drawn);

  const newPlayedWords = analysis.words.map((entry) => ({
    player: currentPlayer.name,
    word: entry.word,
    points: entry.points,
    turn: state.turnNumber
  }));

  let nextState = {
    ...state,
    board,
    bag: draw.bag,
    players,
    playedWords: [...(state.playedWords || []), ...newPlayedWords],
    currentPlayerIndex: nextPlayerIndex(state),
    turnNumber: state.turnNumber + 1,
    passCount: 0,
    turnStartTime: Date.now(),
    previousState: state
  };

  nextState = clearSelections(nextState);
  nextState = withLog(
    nextState,
    `${currentPlayer.name} marque ${analysis.score} pts avec ${analysis.words.map((entry) => entry.word).join(", ")}.`,
  );

  if (draw.bag.length === 0 && currentPlayer.rack.length === 0) {
    const completedPlayers = calculateEndGame(nextState.players, state.currentPlayerIndex);
    const winner = resolveWinner(completedPlayers);
    return {
      ...nextState,
      players: completedPlayers,
      gameOver: true,
      winnerId: winner?.id ?? null
    };
  }

  return nextState;
}


export function autoPassTurn(state) {
  if (state.gameOver) {
    return state;
  }
  let nextState = recallTiles(state);
  const player = nextState.players[nextState.currentPlayerIndex];

  nextState = {
    ...nextState,
    currentPlayerIndex: nextPlayerIndex(nextState),
    turnNumber: nextState.turnNumber + 1,
    passCount: nextState.passCount + 1,
    turnStartTime: Date.now(),
    previousState: state
  };

  nextState = clearSelections(nextState);

  if (hasReachedConsecutivePassLimit(nextState.players, nextState.passCount)) {
    const completedPlayers = calculateEndGame(nextState.players, -1);
    const winner = resolveWinner(completedPlayers);
    return withLog(
      {
        ...nextState,
        players: completedPlayers,
        gameOver: true,
        winnerId: winner?.id ?? null
      },
      `Chrono expire. ${player.name} passe le tour. Fin de la partie par passes successives.`,
    );
  }

  return withLog(nextState, `Temps ecoule pour ${player.name}. Tour passe automatiquement.`);
}

export function restartGame(state) {
  let bag = createBag();
  const players = state.players.map((p) => {
    const draw = drawTiles(bag, RACK_SIZE);
    bag = draw.bag;
    return {
      ...p,
      score: 0,
      rack: draw.drawn,
      status: p.status === "quit" ? "quit" : "active"
    };
  });

  return {
    ...state,
    board: createEmptyBoard(),
    bag,
    players,
    playedWords: [],
    currentPlayerIndex: 0,
    selectedTileId: null,
    exchangeSelection: [],
    mode: "place",
    turnNumber: 1,
    passCount: 0,
    turnStartTime: Date.now(),
    previousState: null,
    logs: [
      {
        id: `restart-${Date.now()}`,
        text: `Partie recommencee avec ${players.filter(p => p.status !== "quit").map((player) => player.name).join(", ")}.`
      }
    ],
    winnerId: null,
    gameOver: false
  };
}

export function undoLastTurn(state) {
  if (state.gameOver) {
    return state;
  }

  if (!state.previousState) {
    return withLog(state, "Aucun coup a annuler.");
  }

  const hasNewTiles = findPlacedTiles(state.board).length > 0;
  if (hasNewTiles) {
    return withLog(state, "Rappelle d'abord tes lettres posees avant d'annuler le coup precedent.");
  }

  const restored = {
    ...state.previousState,
    previousState: null
  };

  return withLog(restored, "Le dernier coup a ete annule.");
}
