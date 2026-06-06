import { useEffect, useMemo, useRef, useState } from "react";
import { BOARD_SIZE, EXCHANGE_MIN_BAG_TILES, PREMIUM_STYLES } from "./lib/constants";
import { keyForPosition, premiumForCell } from "./lib/game";

const defaultNames = ["Awa", "Ben", "Chloe", "Dany"];
const DICTIONARY_LABELS = {
  fr: "Francais",
  en: "English"
};

function getDictionaryLabelForUi(language) {
  return DICTIONARY_LABELS[language] ?? DICTIONARY_LABELS.fr;
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function getServerHttpOrigin() {
  const configuredOrigin = trimTrailingSlash(import.meta.env.VITE_SERVER_ORIGIN);
  if (configuredOrigin) {
    return configuredOrigin;
  }

  if (import.meta.env.DEV) {
    return window.location.origin;
  }

  const configuredPort = import.meta.env.VITE_SERVER_PORT || "8788";
  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  return `${protocol}//${window.location.hostname}:${configuredPort}`;
}

function getApiUrl(path) {
  return new URL(path, `${getServerHttpOrigin()}/`).toString();
}

function getWsUrl(path) {
  const wsOrigin = getServerHttpOrigin().replace(/^http/i, "ws");
  return new URL(path, `${wsOrigin}/`).toString();
}

function getNetworkErrorMessage(error, fallbackMessage) {
  if (error instanceof TypeError) {
    return "Serveur de salle indisponible. Lance npm run dev:all ou demarre npm run server.";
  }

  return error?.message || fallbackMessage;
}

function buildSessionUrl(roomId, token) {
  const next = new URL(window.location.href);
  next.searchParams.set("room", roomId);
  next.searchParams.set("token", token);
  return next.toString();
}

function getSessionFromLocation() {
  const url = new URL(window.location.href);
  const roomId = url.searchParams.get("room");
  const token = url.searchParams.get("token");
  if (!roomId || !token) {
    return null;
  }
  return { roomId, token };
}

async function readJson(response) {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}

function setDragPayload(event, payload) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/json", JSON.stringify(payload));
}

function getDragPayload(event) {
  const raw = event.dataTransfer.getData("application/json");
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function FeatureCard({ title, text }) {
  return (
    <div className="rounded-[1.25rem] border border-white/60 bg-white/60 p-4 backdrop-blur">
      <p className="font-display text-lg font-black uppercase">{title}</p>
      <p className="mt-1 text-sm text-ink/70">{text}</p>
    </div>
  );
}

function SetupScreen({ onCreateRoom, onJoinRoom, createLoading, joinLoading, error }) {
  const [playerCount, setPlayerCount] = useState(2);
  const [names, setNames] = useState(defaultNames);
  const [mode, setMode] = useState("create");
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [dictionaryLanguage, setDictionaryLanguage] = useState("fr");
  const [turnDuration, setTurnDuration] = useState("0");

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 text-ink sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-[2rem] border border-white/60 bg-[radial-gradient(circle_at_top,#fff6d9,transparent_40%),linear-gradient(135deg,#fef7e5_0%,#f8e2b0_48%,#f2b682_100%)] p-6 shadow-panel sm:p-10">
        <div className="absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/30 blur-2xl" />
        <div className="absolute bottom-0 left-0 h-48 w-48 rounded-full bg-ember/20 blur-3xl" />

        <div className="relative grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-5">
            <p className="inline-flex rounded-full bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-ink/70">
              Scrabble mobile reseau local
            </p>
            <div className="space-y-3">
              <h1 className="max-w-xl font-display text-4xl font-black uppercase leading-none sm:text-5xl">
                Chaque joueur garde son chevalet prive sur son mobile.
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-ink/75 sm:text-base">
                Cree une salle sur ton PC, partage un lien prive a chaque joueur
                et joue sur le meme reseau local. Chaque mobile ne voit que le
                plateau et son propre jeu de lettres.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <FeatureCard title="Liens prives" text="Un lien unique par joueur pour masquer les autres chevalets." />
              <FeatureCard title="Temps reel" text="Le plateau se synchronise sur tous les appareils." />
              <FeatureCard title="Mobile-first" text="Commandes tactiles larges et plateau scrollable." />
            </div>
          </section>

          <section className="rounded-[1.75rem] bg-ink p-5 text-canvas sm:p-6">
            <div className="space-y-5">
              <div>
                <h2 className="font-display text-2xl font-bold uppercase">
                  {mode === "create" ? "Creer une salle" : "Rejoindre une salle"}
                </h2>
                <p className="mt-1 text-sm text-canvas/70">
                  {mode === "create"
                    ? "Le PC hote cree la partie puis partage le code ou les liens."
                    : "Entre le code de salle et ton nom de joueur pour recuperer ton chevalet prive."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode("create")}
                  className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${mode === "create"
                    ? "border-gold bg-gold text-ink"
                    : "border-white/15 bg-white/5 text-canvas/80"
                    }`}
                >
                  Creer
                </button>
                <button
                  type="button"
                  onClick={() => setMode("join")}
                  className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${mode === "join"
                    ? "border-gold bg-gold text-ink"
                    : "border-white/15 bg-white/5 text-canvas/80"
                    }`}
                >
                  Rejoindre
                </button>
              </div>

              {mode === "create" ? (
                <>
                  <div className="space-y-3">
                    <label className="block text-sm font-semibold">Choisir la langue</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { code: "fr", label: "Francais" },
                        { code: "en", label: "English" }
                      ].map((option) => (
                        <button
                          key={option.code}
                          type="button"
                          onClick={() => setDictionaryLanguage(option.code)}
                          className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${dictionaryLanguage === option.code
                            ? "border-gold bg-gold text-ink"
                            : "border-white/15 bg-white/5 text-canvas/80"
                            }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-sm font-semibold">Nombre de joueurs</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[2, 3, 4].map((count) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() => setPlayerCount(count)}
                          className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${playerCount === count
                            ? "border-gold bg-gold text-ink"
                            : "border-white/15 bg-white/5 text-canvas/80"
                            }`}
                        >
                          {count} joueurs
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {Array.from({ length: playerCount }).map((_, index) => (
                      <label key={index} className="block">
                        <span className="mb-2 block text-sm font-semibold">Joueur {index + 1}</span>
                        <input
                          value={names[index] ?? ""}
                          onChange={(event) => {
                            const next = [...names];
                            next[index] = event.target.value;
                            setNames(next);
                          }}
                          className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-base text-white outline-none transition focus:border-gold"
                          placeholder={`Nom du joueur ${index + 1}`}
                        />
                      </label>
                    ))}
                  </div>

                  <div className="space-y-3 pt-2">
                    <label className="block text-sm font-semibold">Temps par tour</label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        { value: "0", label: "Sans limite" },
                        { value: "60", label: "1 min" },
                        { value: "120", label: "2 min" },
                        { value: "180", label: "3 min" }
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setTurnDuration(option.value)}
                          className={`rounded-2xl border px-3 py-3 text-sm font-bold transition ${turnDuration === option.value
                            ? "border-gold bg-gold text-ink"
                            : "border-white/15 bg-white/5 text-canvas/80"
                            }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={createLoading}
                    onClick={() => onCreateRoom(names.slice(0, playerCount), dictionaryLanguage, parseInt(turnDuration, 10))}
                    className="w-full rounded-2xl bg-ember px-5 py-4 font-display text-lg font-black uppercase tracking-wide text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {createLoading ? "Creation..." : "Creer la salle"}
                  </button>
                </>
              ) : (
                <>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold">Code de salle</span>
                    <input
                      value={joinRoomCode}
                      onChange={(event) => setJoinRoomCode(event.target.value.toUpperCase())}
                      className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-base uppercase text-white outline-none transition focus:border-gold"
                      placeholder="Ex: AB12CD"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold">Nom du joueur</span>
                    <input
                      value={joinName}
                      onChange={(event) => setJoinName(event.target.value)}
                      className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-base text-white outline-none transition focus:border-gold"
                      placeholder="Ton nom exact dans la salle"
                    />
                  </label>

                  <button
                    type="button"
                    disabled={joinLoading}
                    onClick={() => onJoinRoom(joinRoomCode.trim(), joinName.trim())}
                    className="w-full rounded-2xl bg-ember px-5 py-4 font-display text-lg font-black uppercase tracking-wide text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {joinLoading ? "Connexion..." : "Rejoindre la salle"}
                  </button>
                </>
              )}

              {error && <div className="rounded-2xl bg-rose p-4 text-sm text-ink">{error}</div>}

              <div className="rounded-2xl bg-white/8 p-4 text-sm text-canvas/75">
                Lance de preference <span className="font-semibold text-white">npm run dev:all</span>,
                ou bien <span className="font-semibold text-white">npm run server</span> puis
                <span className="font-semibold text-white"> npm run dev</span>.
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function BoardCell({ cell, premium, onClick, highlight, onDragOver, onDrop, draggable = false, onDragStart }) {
  let cellStyle = "";
  if (cell) {
    if (cell.locked) {
      cellStyle = "bg-[#f8e8b7] text-ink shadow";
    } else if (cell.isOwn) {
      cellStyle = "bg-[#ffe38a] text-ink ring-2 ring-ember";
    } else {
      cellStyle = "bg-ocean/30 text-ink ring-2 ring-ocean animate-pulse";
    }
  } else {
    cellStyle = PREMIUM_STYLES[premium.type];
  }

  return (
    <button
      type="button"
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`relative flex aspect-square min-h-8 min-w-8 items-center justify-center rounded-lg border border-ink/10 text-[10px] font-bold uppercase transition sm:text-[11px] ${cellStyle} ${highlight ? "outline outline-2 outline-offset-1 outline-ink" : ""}`}
    >
      {cell ? (
        <>
          <span className="font-display text-sm font-black sm:text-base">{cell.letter}</span>
          <span className="absolute bottom-0.5 right-1 text-[8px] sm:text-[9px]">{cell.points}</span>
        </>
      ) : (
        <span className="opacity-80">{premium.label}</span>
      )}
    </button>
  );
}

function RackTile({
  tile,
  selected,
  inactive,
  onClick,
  exchangeMode,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  style
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={{ touchAction: "pan-y", ...style }}
      className={`relative flex h-14 w-12 flex-col items-center justify-center rounded-2xl border-2 shadow-md transition ${selected
        ? exchangeMode
          ? "border-rose bg-rose text-ink"
          : "border-ember bg-ember text-white"
        : "border-[#d7bb7a] bg-[#f8e8b7] text-ink"
        } ${inactive ? "opacity-75" : ""}`}
    >
      <span className="font-display text-xl font-black">{tile.letter}</span>
      <span className="absolute bottom-1 right-2 text-[10px] font-bold">{tile.points}</span>
    </button>
  );
}

function ActionButton({ text, onClick, tone = "default", disabled = false }) {
  const className =
    tone === "gold"
      ? "bg-gold text-ink"
      : tone === "rose"
        ? "bg-rose text-ink"
        : "bg-white text-ink";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-2xl px-4 py-3 text-sm font-black uppercase tracking-wide transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {text}
    </button>
  );
}

function CountdownTimer({ turnDurationSeconds, turnStartTime }) {
  const [timeLeft, setTimeLeft] = useState(turnDurationSeconds);

  useEffect(() => {
    if (!turnDurationSeconds || !turnStartTime) return;

    const update = () => {
      const elapsed = Math.floor((Date.now() - turnStartTime) / 1000);
      const remaining = Math.max(0, turnDurationSeconds - elapsed);
      setTimeLeft(remaining);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [turnDurationSeconds, turnStartTime]);

  if (!turnDurationSeconds) {
    return <div className="font-display text-xl font-black uppercase">∞</div>;
  }

  const mins = Math.floor(timeLeft / 60).toString().padStart(2, "0");
  const secs = (timeLeft % 60).toString().padStart(2, "0");
  const isDanger = timeLeft <= 10;

  return (
    <div className={`font-display text-xl font-black uppercase ${isDanger ? "text-rose animate-pulse" : ""}`}>
      {mins}:{secs}
    </div>
  );
}

function GameInfoPanel({ snapshot, statusText, onMenuClick }) {
  const allPlayers = snapshot.allPlayers ?? snapshot.opponents ?? [];

  return (
    <aside className="shrink-0 space-y-4 lg:w-[24rem] lg:h-full lg:overflow-y-auto lg:pr-2 lg:pb-8">
      <section className="rounded-[2rem] border border-white/60 bg-white/55 p-4 shadow-panel backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-ink/45">Salle {snapshot.roomId}</p>
            <h1 className="font-display text-3xl font-black uppercase">{snapshot.me.name}</h1>
          </div>
          <div className="flex items-center gap-3 text-right">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-ink/45">Chrono</div>
              <CountdownTimer turnDurationSeconds={snapshot.turnDurationSeconds} turnStartTime={snapshot.turnStartTime} />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-ink/45">Statut</div>
              <div className="font-display text-xl font-black uppercase">{statusText}</div>
            </div>
            <button
              onClick={onMenuClick}
              className="rounded-2xl border-2 border-white bg-white/40 p-3 shadow-sm transition hover:bg-white/70"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {allPlayers.map((player) => (
            <div
              key={player.id}
              className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-sm transition-all duration-300 ${player.isCurrent
                ? "border-2 border-ember bg-ember/15 font-bold"
                : player.status === "quit"
                  ? "border border-ink/10 bg-white/40 opacity-50 line-through"
                  : "border border-ink/10 bg-white/70"
                }`}
            >
              <span className={`font-display font-black uppercase ${player.id === snapshot.me?.id ? "text-ember" : ""}`}>
                {player.name}{player.id === snapshot.me?.id ? " (toi)" : ""}
              </span>
              <span className="font-display text-lg font-black">{player.score}</span>
              <span className="text-[10px] uppercase text-ink/45">pts</span>
            </div>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-white/70 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-ink/45">Score</div>
            <div className="mt-1 font-display text-lg font-black">{snapshot.me.score}</div>
          </div>
          <div className="rounded-2xl bg-white/70 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-ink/45">Sac</div>
            <div className="mt-1 font-display text-lg font-black">{snapshot.bagCount}</div>
          </div>
          <div className="rounded-2xl bg-white/70 px-3 py-2">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-ink/45">Tour</div>
            <div className="mt-1 font-display text-lg font-black">#{snapshot.turnNumber}</div>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/60 bg-white/70 p-4 text-ink shadow-panel mt-auto">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-ink/45">Alertes de jeu</p>
        <h2 className="font-display text-2xl font-black uppercase mb-3">Logs</h2>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {snapshot.logs?.map((log) => (
            <div key={log.id} className="rounded-xl bg-[#f7f1e1] px-3 py-2 text-xs leading-5">
              {log.text}
            </div>
          ))}
        </div>
      </section>
    </aside>
  );
}

function GameOverScreen({ snapshot, onAction, onLogout }) {
  const allPlayers = snapshot.allPlayers ?? snapshot.opponents ?? [];
  const winner = allPlayers.find(p => p.id === snapshot.winnerId);
  const playedWords = snapshot.playedWords || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[linear-gradient(180deg,#fff5df_0%,#f6e3b2_35%,#eab47b_100%)] p-6 shadow-2xl overflow-y-auto">
      <div className="w-full max-w-4xl space-y-6 animate-[pulse_2s_ease-in-out_infinite]">

        <div className="text-center space-y-2">
          <p className="text-sm font-bold uppercase tracking-[0.5em] text-ink/60">Partie Terminee</p>
          <h1 className="font-display text-6xl font-black uppercase text-ember drop-shadow-md">
            Felicitations {winner?.name || "!"}
          </h1>
          <p className="text-xl font-bold uppercase tracking-widest text-ink/80">
            Gagne avec {winner?.score} points
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <div className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-panel">
            <h2 className="font-display text-2xl font-black uppercase mb-4">Classement</h2>
            <div className="space-y-3">
              {[...allPlayers].sort((a, b) => b.score - a.score).map((player, idx) => (
                <div key={player.id} className={`flex items-center justify-between rounded-2xl px-4 py-3 ${idx === 0 ? "bg-gold/20 border-2 border-gold" : "bg-white"}`}>
                  <span className="font-display text-lg font-black uppercase">{idx + 1}. {player.name}</span>
                  <span className="font-display text-2xl font-black">{player.score} <span className="text-xs">pts</span></span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-panel">
            <h2 className="font-display text-2xl font-black uppercase mb-4">Historique des mots</h2>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2">
              {playedWords.length === 0 ? (
                <p className="text-sm text-ink/50 italic">Aucun mot joue...</p>
              ) : (
                playedWords.map((pw, i) => (
                  <div key={i} className="flex justify-between items-center bg-[#f7f1e1] rounded-xl px-3 py-2 text-sm">
                    <span><b>{pw.player}</b> (T{pw.turn})</span>
                    <span className="font-bold uppercase tracking-widest text-ember">{pw.word}</span>
                    <span className="font-black">{pw.points} pts</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-4 justify-center">
          <button
            onClick={() => onAction({ type: "restart_game" })}
            className="rounded-2xl bg-moss px-8 py-4 font-display text-xl font-black uppercase text-white shadow-xl transition-transform hover:scale-105 active:scale-95"
          >
            Recommencer
          </button>
          <button
            onClick={onLogout}
            className="rounded-2xl bg-ink/10 px-8 py-4 font-display text-xl font-black uppercase text-ink/80 shadow-xl transition-opacity hover:bg-ink/20"
          >
            Quitter
          </button>
        </div>

      </div>
    </div>
  );
}

function OverlayModal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4 backdrop-blur-sm shadow-2xl">
      <div className="w-full max-w-md rounded-[2rem] border border-white/60 bg-[#fff5df] p-6 text-ink shadow-panel max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="font-display text-2xl font-black uppercase">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border-2 border-ink/10 bg-white/50 px-3 py-2 text-xs font-bold uppercase transition hover:bg-white"
          >
            Fermer X
          </button>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
}

function OpponentPlayingPopup({ snapshot }) {
  if (snapshot.gameOver || snapshot.isMyTurn || snapshot.me?.status === "quit") {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 max-w-xs rounded-[1.5rem] border border-white/60 bg-white/90 p-4 text-ink shadow-panel backdrop-blur">
      <div className="text-xs font-semibold uppercase tracking-[0.25em] text-ink/45">Info tour</div>
      <div className="mt-2 font-display text-xl font-black uppercase">
        {snapshot.currentPlayerName} est en train de jouer
      </div>
      <div className="mt-1 text-sm text-ink/70">
        Le plateau et les scores se mettent a jour en temps reel.
      </div>
    </div>
  );
}

function JokerLetterForm({ defaultLetter = "E", onCancel, onConfirm }) {
  const [letter, setLetter] = useState((defaultLetter || "E").slice(0, 1).toUpperCase());

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-ink/75">
        Choisis la lettre que le joker representera pour ce coup.
      </p>
      <input
        value={letter}
        onChange={(event) =>
          setLetter(
            event.target.value
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/[^A-Za-z]/g, "")
              .slice(0, 1)
              .toUpperCase(),
          )
        }
        className="w-full rounded-2xl border border-ink/10 bg-[#f7f1e1] px-4 py-3 text-center font-display text-3xl font-black uppercase outline-none focus:border-ember"
        placeholder="A"
        maxLength={1}
      />
      <div className="flex gap-2">
        <ActionButton text="Annuler" onClick={onCancel} />
        <ActionButton
          text="Valider"
          tone="gold"
          disabled={!letter}
          onClick={() => onConfirm(letter)}
        />
      </div>
    </div>
  );
}

function PlayerView({ snapshot, onAction, onLogout }) {
  const [selectedTileId, setSelectedTileId] = useState(null);
  const [exchangeMode, setExchangeMode] = useState(false);
  const [exchangeSelection, setExchangeSelection] = useState([]);
  const [jokerModal, setJokerModal] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [forfeitModalOpen, setForfeitModalOpen] = useState(false);
  const [rackTouchDrag, setRackTouchDrag] = useState(null);
  const rackTileRefs = useRef(new Map());
  const rackTouchDragRef = useRef(null);
  const suppressTileClickRef = useRef(false);

  useEffect(() => {
    rackTouchDragRef.current = rackTouchDrag;
  }, [rackTouchDrag]);

  useEffect(() => {
    if (snapshot.gameOver) {
      setForfeitModalOpen(false);
    }

    if (!snapshot?.isMyTurn) {
      setSelectedTileId(null);
      setExchangeMode(false);
      setExchangeSelection([]);
      return;
    }

    if (selectedTileId && !snapshot.me.rack.some((tile) => tile.id === selectedTileId)) {
      setSelectedTileId(null);
    }

    setExchangeSelection((current) =>
      current.filter((tileId) => snapshot.me.rack.some((tile) => tile.id === tileId)),
    );
  }, [selectedTileId, snapshot]);

  const temporaryPositions = new Set(
    snapshot.board.flatMap((row, rowIndex) =>
      row.flatMap((cell, colIndex) => (cell && !cell.locked ? [keyForPosition(rowIndex, colIndex)] : [])),
    ),
  );
  const hasTempTiles = temporaryPositions.size > 0;

  const isActivePlayer = snapshot.me?.status !== "quit";
  const canPlay = isActivePlayer && snapshot.isMyTurn && !snapshot.gameOver;
  const canShuffle = isActivePlayer && !snapshot.gameOver;
  const canDragRack = isActivePlayer && !snapshot.gameOver && !exchangeMode;
  const canExchange = canPlay && !hasTempTiles && snapshot.bagCount >= EXCHANGE_MIN_BAG_TILES;
  const rackShift = 56;
  const statusText = snapshot.gameOver
    ? "Partie terminee."
    : !isActivePlayer
      ? "Vous avez abandonne."
      : snapshot.isMyTurn
        ? "A toi de jouer."
        : `En attente du tour de ${snapshot.currentPlayerName}.`;

  useEffect(() => {
    if (!canDragRack) {
      setRackTouchDrag(null);
    }
  }, [canDragRack]);

  function setRackTileRef(tileId, node) {
    if (node) {
      rackTileRefs.current.set(tileId, node);
      return;
    }
    rackTileRefs.current.delete(tileId);
  }

  function computeRackTargetIndex(clientX, draggedTileId) {
    const otherTiles = snapshot.me.rack.filter((tile) => tile.id !== draggedTileId);
    for (let index = 0; index < otherTiles.length; index += 1) {
      const node = rackTileRefs.current.get(otherTiles[index].id);
      if (!node) {
        continue;
      }
      const rect = node.getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) {
        return index;
      }
    }
    return otherTiles.length;
  }

  function startRackTouchDrag(event, tileId, sourceIndex) {
    if (!canDragRack || event.pointerType === "mouse") {
      return;
    }

    suppressTileClickRef.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setRackTouchDrag({
      pointerId: event.pointerId,
      tileId,
      sourceIndex,
      targetIndex: sourceIndex,
      startX: event.clientX,
      currentX: event.clientX,
      started: false
    });
  }

  function updateRackTouchDrag(event, tileId) {
    const currentDrag = rackTouchDragRef.current;
    if (!currentDrag || currentDrag.pointerId !== event.pointerId || currentDrag.tileId !== tileId) {
      return;
    }

    const deltaX = event.clientX - currentDrag.startX;
    const started = currentDrag.started || Math.abs(deltaX) > 8;
    if (started) {
      suppressTileClickRef.current = true;
    }

    setRackTouchDrag({
      ...currentDrag,
      currentX: event.clientX,
      started,
      targetIndex: started ? computeRackTargetIndex(event.clientX, currentDrag.tileId) : currentDrag.targetIndex
    });
  }

  async function finishRackTouchDrag(event, tileId) {
    const currentDrag = rackTouchDragRef.current;
    if (!currentDrag || currentDrag.pointerId !== event.pointerId || currentDrag.tileId !== tileId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setRackTouchDrag(null);

    if (currentDrag.started && currentDrag.sourceIndex !== currentDrag.targetIndex) {
      await onAction({
        type: "move_tile_in_rack",
        tileId: currentDrag.tileId,
        targetIndex: currentDrag.targetIndex
      });
    }
  }

  function cancelRackTouchDrag() {
    setRackTouchDrag(null);
  }

  async function handlePlaceTile(tileId, row, col) {
    if (!canPlay || exchangeMode || !tileId) {
      return;
    }

    const tile = snapshot.me.rack.find((entry) => entry.id === tileId);
    if (!tile) {
      return;
    }

    if (tile.isBlank) {
      setJokerModal({
        tileId,
        row,
        col,
        defaultLetter: "E"
      });
      return;
    }

    await onAction({
      type: "place_tile",
      tileId,
      row,
      col,
      blankLetter: "E"
    });
    setSelectedTileId(null);
  }

  async function handleBoardDrop(event, row, col, cell) {
    event.preventDefault();
    if (!canPlay || exchangeMode || cell) {
      return;
    }

    const payload = getDragPayload(event);
    if (!payload) {
      return;
    }

    if (payload.source === "rack") {
      await handlePlaceTile(payload.tileId, row, col);
      return;
    }

    if (payload.source === "board") {
      if (payload.row === row && payload.col === col) {
        return;
      }

      if (payload.isBlank) {
        setJokerModal({
          tileId: payload.tileId,
          row,
          col,
          fromBoard: { row: payload.row, col: payload.col },
          defaultLetter: payload.currentLetter ?? "E"
        });
        return;
      }

      await onAction({ type: "remove_tile", row: payload.row, col: payload.col });
      await onAction({
        type: "place_tile",
        tileId: payload.tileId,
        row,
        col,
        blankLetter: "E"
      });
      setSelectedTileId(null);
    }
  }

  async function handleRackDrop(event, targetIndex) {
    event.preventDefault();
    if (snapshot.gameOver) {
      return;
    }

    const payload = getDragPayload(event);
    if (!payload) {
      return;
    }

    if (payload.source === "rack" && !exchangeMode) {
      await onAction({
        type: "move_tile_in_rack",
        tileId: payload.tileId,
        targetIndex
      });
      return;
    }

    if (payload.source === "board" && canPlay) {
      await onAction({ type: "remove_tile", row: payload.row, col: payload.col });
    }
  }

  if (snapshot.gameOver) {
    return <GameOverScreen snapshot={snapshot} onAction={onAction} onLogout={onLogout} />;
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-[linear-gradient(180deg,#fff5df_0%,#f6e3b2_35%,#eab47b_100%)] text-ink lg:overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-4 overflow-y-auto px-3 py-4 sm:px-5 lg:flex-row lg:items-start lg:gap-6 lg:overflow-hidden lg:px-6 lg:py-6">
        <div className="flex min-w-0 flex-1 flex-col space-y-4 lg:h-full lg:overflow-y-auto lg:pr-2 lg:pb-8">


          <main className="rounded-[2rem] border border-white/60 bg-white/45 p-3 shadow-panel backdrop-blur sm:p-4">
            <div className="overflow-x-auto rounded-[1.5rem] bg-[#ead8ac]/80 p-2 sm:p-3">
              <div
                className="mx-auto grid w-[min(92vw,44rem)] min-w-[19rem] gap-1"
                style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}
              >
                {snapshot.board.map((row, rowIndex) =>
                  row.map((cell, colIndex) => {
                    const premium = premiumForCell(rowIndex, colIndex);
                    const positionKey = keyForPosition(rowIndex, colIndex);
                    return (
                      <BoardCell
                        key={positionKey}
                        cell={cell}
                        premium={premium}
                        highlight={temporaryPositions.has(positionKey)}
                        draggable={Boolean(canPlay && cell && !cell.locked)}
                        onDragStart={(event) => {
                          if (!cell || cell.locked || !canPlay) {
                            return;
                          }
                          setDragPayload(event, {
                            source: "board",
                            tileId: cell.sourceId,
                            row: rowIndex,
                            col: colIndex,
                            isBlank: cell.isBlank,
                            currentLetter: cell.letter
                          });
                        }}
                        onDragOver={(event) => {
                          if (!exchangeMode && canPlay) {
                            event.preventDefault();
                          }
                        }}
                        onDrop={(event) => {
                          void handleBoardDrop(event, rowIndex, colIndex, cell);
                        }}
                        onClick={() => {
                          if (!canPlay) {
                            return;
                          }

                          if (cell && !cell.locked) {
                            void onAction({ type: "remove_tile", row: rowIndex, col: colIndex });
                            return;
                          }

                          void handlePlaceTile(selectedTileId, rowIndex, colIndex);
                        }}
                      />
                    );
                  }),
                )}
              </div>
            </div>

            <section className="mt-4 rounded-[1.5rem] bg-ink p-4 text-canvas">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-canvas/55">Chevalet prive</p>
                  <h2 className="font-display text-2xl font-black uppercase">
                    {exchangeMode ? "Selection d'echange" : "Lettres"}
                  </h2>
                </div>
                <div className="text-right text-sm text-canvas/75">
                  {exchangeMode
                    ? "Selectionne les lettres a echanger."
                    : "Clique ou glisse une lettre; glisse aussi entre lettres pour melanger."}
                </div>
              </div>

              <div
                className="mt-4 flex min-h-16 flex-nowrap gap-2 overflow-x-auto rounded-2xl border border-white/10 p-2"
                onDragOver={(event) => {
                  if (!snapshot.gameOver) {
                    event.preventDefault();
                  }
                }}
                onDrop={(event) => {
                  void handleRackDrop(event, snapshot.me.rack.length);
                }}
              >
                {snapshot.me.rack.map((tile, index) => (
                  <div
                    key={tile.id}
                    ref={(node) => setRackTileRef(tile.id, node)}
                    className="shrink-0 rounded-2xl"
                    style={{ transition: rackTouchDrag?.tileId === tile.id ? 'none' : 'transform 200ms ease' }}
                    onDragOver={(event) => {
                      if (!snapshot.gameOver) {
                        event.preventDefault();
                      }
                    }}
                    onDrop={(event) => {
                      void handleRackDrop(event, index);
                    }}
                  >
                    <RackTile
                      tile={tile}
                      inactive={!isActivePlayer}
                      exchangeMode={exchangeMode}
                      draggable={canDragRack}
                      onDragOver={(event) => {
                        if (!snapshot.gameOver) {
                          event.preventDefault();
                        }
                      }}
                      onDrop={(event) => {
                        void handleRackDrop(event, index);
                      }}
                      onDragStart={(event) => {
                        if (!canDragRack) {
                          return;
                        }
                        setDragPayload(event, {
                          source: "rack",
                          tileId: tile.id
                        });
                      }}
                      onPointerDown={(event) => startRackTouchDrag(event, tile.id, index)}
                      onPointerMove={(event) => updateRackTouchDrag(event, tile.id)}
                      onPointerUp={(event) => {
                        void finishRackTouchDrag(event, tile.id);
                      }}
                      onPointerCancel={cancelRackTouchDrag}
                      style={
                        rackTouchDrag?.tileId === tile.id
                          ? {
                            transform: `translateX(${rackTouchDrag.currentX - rackTouchDrag.startX}px) scale(1.04)`,
                            zIndex: 20,
                            boxShadow: "0 10px 30px rgba(19, 33, 47, 0.25)"
                          }
                          : rackTouchDrag?.started && rackTouchDrag.sourceIndex < rackTouchDrag.targetIndex &&
                            index > rackTouchDrag.sourceIndex &&
                            index <= rackTouchDrag.targetIndex
                            ? { transform: `translateX(-${rackShift}px)` }
                            : rackTouchDrag?.started && rackTouchDrag.sourceIndex > rackTouchDrag.targetIndex &&
                              index >= rackTouchDrag.targetIndex &&
                              index < rackTouchDrag.sourceIndex
                              ? { transform: `translateX(${rackShift}px)` }
                              : undefined
                      }
                      selected={exchangeMode ? exchangeSelection.includes(tile.id) : selectedTileId === tile.id}
                      onClick={() => {
                        if (suppressTileClickRef.current) {
                          suppressTileClickRef.current = false;
                          return;
                        }
                        if (!canPlay) {
                          return;
                        }

                        if (exchangeMode) {
                          setExchangeSelection((current) =>
                            current.includes(tile.id)
                              ? current.filter((tileId) => tileId !== tile.id)
                              : [...current, tile.id],
                          );
                          return;
                        }

                        setSelectedTileId((current) => (current === tile.id ? null : tile.id));
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* Apercu du score avant validation */}
              {canPlay && hasTempTiles && snapshot.pendingScore && (
                <div className={`mt-4 rounded-2xl px-4 py-3 text-sm leading-6 ${snapshot.pendingScore.valid
                  ? "border-2 border-gold/60 bg-gold/15 text-ink"
                  : "border-2 border-rose/40 bg-rose/10 text-ink/70"
                  }`}>
                  {snapshot.pendingScore.valid ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-display text-xs font-bold uppercase tracking-[0.2em] text-ink/50">Apercu</div>
                        <div className="font-display text-2xl font-black text-ember">
                          +{snapshot.pendingScore.score} pts
                          {snapshot.pendingScore.bonus > 0 ? ` (dont ${snapshot.pendingScore.bonus} bonus)` : ""}
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {snapshot.pendingScore.words.map((entry, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 rounded-xl bg-white/60 px-2 py-1 text-xs font-bold uppercase">
                            {entry.word} <span className="text-ember">{entry.points}pts</span>
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-rose font-semibold">⚠ {snapshot.pendingScore.reason}</div>
                  )}
                </div>
              )}

              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                <ActionButton
                  text={`Valider${snapshot.pendingScore?.valid ? ` (+${snapshot.pendingScore.score})` : ""}`}
                  tone="gold"
                  disabled={!canPlay || exchangeMode || !hasTempTiles}
                  onClick={() => onAction({ type: "validate_turn" })}
                />
                {hasTempTiles && (
                  <ActionButton
                    text="\u21a9 Rappeler"
                    disabled={!canPlay || exchangeMode}
                    onClick={() => {
                      setSelectedTileId(null);
                      void onAction({ type: "recall_tiles" });
                    }}
                  />
                )}
                {snapshot.canUndo && !hasTempTiles && (
                  <ActionButton
                    text="\u21a9 Annuler le coup"
                    tone="rose"
                    disabled={!canPlay || exchangeMode}
                    onClick={() => {
                      void onAction({ type: "undo_turn" });
                    }}
                  />
                )}
                <ActionButton
                  text="Melanger"
                  disabled={!canShuffle}
                  onClick={() => {
                    setSelectedTileId(null);
                    setExchangeMode(false);
                    setExchangeSelection([]);
                    void onAction({ type: "shuffle_rack" });
                  }}
                />
                <ActionButton
                  text={exchangeMode ? "Annuler echange" : "Mode echange"}
                  disabled={!canExchange && !exchangeMode}
                  onClick={() => {
                    setSelectedTileId(null);
                    setExchangeSelection([]);
                    setExchangeMode((current) => !current);
                  }}
                />
                {exchangeMode && (
                  <ActionButton
                    text="Confirmer echange"
                    disabled={!canExchange || exchangeSelection.length === 0}
                    onClick={() => {
                      void onAction({ type: "exchange_tiles", tileIds: exchangeSelection });
                      setExchangeMode(false);
                      setExchangeSelection([]);
                      setSelectedTileId(null);
                    }}
                  />
                )}
                <ActionButton
                  text="Passer"
                  disabled={!canPlay || exchangeMode}
                  onClick={() => onAction({ type: "pass_turn" })}
                />
                <ActionButton
                  text="Forfait"
                  tone="rose"
                  disabled={!isActivePlayer || snapshot.gameOver}
                  onClick={() => setForfeitModalOpen(true)}
                />
              </div>
            </section>
          </main>
        </div>

        <GameInfoPanel snapshot={snapshot} statusText={statusText} onMenuClick={() => setMenuOpen(true)} />
      </div>
      <OpponentPlayingPopup snapshot={snapshot} />
      {jokerModal && (
        <OverlayModal title="Choisir la lettre" onClose={() => setJokerModal(null)}>
          <JokerLetterForm
            defaultLetter={jokerModal.defaultLetter}
            onCancel={() => setJokerModal(null)}
            onConfirm={async (letter) => {
              if (jokerModal.fromBoard) {
                await onAction({
                  type: "remove_tile",
                  row: jokerModal.fromBoard.row,
                  col: jokerModal.fromBoard.col
                });
              }
              await onAction({
                type: "place_tile",
                tileId: jokerModal.tileId,
                row: jokerModal.row,
                col: jokerModal.col,
                blankLetter: letter
              });
              setSelectedTileId(null);
              setJokerModal(null);
            }}
          />
        </OverlayModal>
      )}

      {forfeitModalOpen && (
        <OverlayModal title="Declarer forfait" onClose={() => setForfeitModalOpen(false)}>
          <div className="space-y-4">
            <p className="text-sm leading-6 text-ink/75">
              Tu vas abandonner la partie. Si tu es l'avant-dernier joueur actif, la partie se termine
              immediatement et le dernier joueur restant est declare gagnant.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <ActionButton text="Annuler" onClick={() => setForfeitModalOpen(false)} />
              <ActionButton
                text="Confirmer forfait"
                tone="rose"
                onClick={async () => {
                  await onAction({ type: "quit_game" });
                  setForfeitModalOpen(false);
                  setMenuOpen(false);
                }}
              />
            </div>
          </div>
        </OverlayModal>
      )}

      {menuOpen && (
        <OverlayModal title="Menu du Jeu" onClose={() => setMenuOpen(false)}>
          <div className="space-y-6">
            <section className="rounded-[1.5rem] bg-ink text-canvas p-4">
              <h3 className="font-display font-black uppercase mb-3">Aide rapide</h3>
              <ul className="list-inside list-disc space-y-2 text-sm text-canvas/80">
                <li>Glisse ou clique une lettre pour la poser.</li>
                <li>Glisse une lettre sur une autre pour reorganiser.</li>
                <li>Melanger est toujours disponible.</li>
              </ul>
            </section>

            <section className="rounded-[1.5rem] bg-white/70 border border-ink/10 p-4">
              <h3 className="font-display font-black uppercase mb-3">Infos additionnelles</h3>
              <p className="text-sm text-ink/70">
                Jeu heberge localement. Le dictionnaire <b>{snapshot.dictionaryLabel ?? getDictionaryLabelForUi(snapshot.dictionaryLanguage)}</b> est utilise.
                <br />Salle: <b className="uppercase">{snapshot.roomId}</b>
              </p>
            </section>

            <div className="space-y-3">
              {isActivePlayer && !snapshot.gameOver && (
                <button
                  type="button"
                  onClick={() => {
                    setForfeitModalOpen(true);
                  }}
                  className="w-full rounded-2xl border-2 border-rose/30 bg-rose/10 px-4 py-3 text-sm font-black uppercase tracking-wide text-rose transition hover:bg-rose hover:text-white"
                >
                  Declarer forfait
                </button>
              )}

              <button
                type="button"
                onClick={onLogout}
                className="w-full rounded-2xl border-2 border-ink/20 bg-ink px-4 py-3 text-sm font-black uppercase tracking-wide text-white transition hover:brightness-110"
              >
                Se deconnecter
              </button>
            </div>
          </div>
        </OverlayModal>
      )}

    </div>
  );
}

function LinkCard({ label, href, connected }) {
  return (
    <div className="rounded-[1.5rem] border border-ink/10 bg-white/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-display text-xl font-black uppercase">{label}</div>
          <div className={`mt-1 text-xs font-bold uppercase tracking-[0.22em] ${connected ? "text-moss" : "text-ink/45"}`}>
            {connected ? "Connecte" : "Pas encore connecte"}
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(href)}
          className="rounded-xl border border-ink/10 bg-white px-3 py-2 text-xs font-bold uppercase"
        >
          Copier
        </button>
      </div>
      <div className="mt-3 break-all rounded-2xl bg-[#f7f1e1] px-3 py-3 text-xs leading-5 text-ink/70">
        {href}
      </div>
    </div>
  );
}

function AdminView({ snapshot }) {
  const winner = snapshot.players.find((player) => player.id === snapshot.winnerId);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fff5df_0%,#f6e3b2_35%,#eab47b_100%)] text-ink">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-3 py-4 sm:px-5 lg:flex-row lg:items-start lg:gap-6 lg:px-6 lg:py-6">
        <main className="flex-1 rounded-[2rem] border border-white/60 bg-white/55 p-4 shadow-panel backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-ink/45">Tableau de bord</p>
              <h1 className="font-display text-3xl font-black uppercase">Salle {snapshot.roomId}</h1>
            </div>
            <div className="text-right">
              <div className="text-xs font-semibold uppercase tracking-[0.25em] text-ink/45">Tour actif</div>
              <div className="font-display text-xl font-black uppercase">{snapshot.currentPlayerName}</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-[0.25em] text-ink/45">
                {snapshot.dictionaryLabel ?? getDictionaryLabelForUi(snapshot.dictionaryLanguage)}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:max-w-md sm:grid-cols-4">
            <MetricCard label="Tour" value={`#${snapshot.turnNumber}`} />
            <MetricCard label="Sac" value={snapshot.bagCount} />
            <MetricCard label="Joueurs" value={snapshot.players.length} />
            <MetricCard label="Etat" value={snapshot.gameOver ? "Fini" : "Actif"} />
          </div>

          {snapshot.gameOver && winner && (
            <div className="mt-4 rounded-[1.5rem] border-2 border-gold bg-gold/20 px-5 py-4">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-ink/55">Gagnant annonce</p>
              <div className="mt-1 font-display text-3xl font-black uppercase text-ember">
                {winner.name} gagne avec {winner.score} points
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[1.5rem] bg-ink px-4 py-4 text-canvas">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.25em] text-canvas/45">Code de salle</div>
              <div className="mt-1 font-display text-3xl font-black uppercase">{snapshot.roomId}</div>
            </div>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(snapshot.roomId)}
              className="rounded-2xl bg-gold px-4 py-3 text-sm font-black uppercase text-ink"
            >
              Copier le code
            </button>
          </div>

          <div className="mt-5 overflow-x-auto rounded-[1.5rem] bg-[#ead8ac]/80 p-2 sm:p-3">
            <div
              className="mx-auto grid w-[min(92vw,44rem)] min-w-[19rem] gap-1"
              style={{ gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0, 1fr))` }}
            >
              {snapshot.board.map((row, rowIndex) =>
                row.map((cell, colIndex) => (
                  <BoardCell
                    key={`${rowIndex}-${colIndex}`}
                    cell={cell}
                    premium={premiumForCell(rowIndex, colIndex)}
                    highlight={false}
                    onClick={() => { }}
                  />
                )),
              )}
            </div>
          </div>

          <div className="mt-5 space-y-2">
            {snapshot.logs?.map((log) => (
              <div key={log.id} className="rounded-2xl bg-white/80 px-4 py-3 text-sm text-ink/75">
                {log.text}
              </div>
            ))}
          </div>
        </main>

        <aside className="w-full shrink-0 space-y-4 lg:w-[26rem]">
          <section className="rounded-[2rem] border border-white/60 bg-ink p-4 text-canvas shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-canvas/45">Partage</p>
            <h2 className="font-display text-2xl font-black uppercase">Liens joueurs</h2>
            <p className="mt-2 text-sm text-canvas/70">
              Ouvre chaque lien sur le mobile du bon joueur. Chaque lien donne acces uniquement a son chevalet.
            </p>
          </section>

          {snapshot.players.map((player) => (
            <LinkCard
              key={player.id}
              label={player.name}
              href={buildSessionUrl(snapshot.roomId, player.token)}
              connected={player.connected}
            />
          ))}

          <section className="rounded-[2rem] border border-white/60 bg-white/70 p-4 shadow-panel">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-ink/45">Scores</p>
            <h2 className="font-display text-2xl font-black uppercase">Table</h2>
            <div className="mt-4 space-y-2">
              {snapshot.players.map((player) => (
                <div
                  key={player.id}
                  className={`rounded-2xl border px-4 py-3 ${player.isCurrent ? "border-ember bg-ember/10" : "border-ink/10 bg-white/70"
                    }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-display text-lg font-black uppercase">{player.name}</div>
                      <div className="text-xs uppercase tracking-[0.2em] text-ink/45">
                        {player.status === "quit" ? "abandon" : `${player.rackCount} lettres`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-display text-2xl font-black">{player.score}</div>
                      <div className="text-xs uppercase tracking-[0.2em] text-ink/45">pts</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-2xl bg-white/70 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-ink/45">{label}</div>
      <div className="mt-1 font-display text-lg font-black uppercase">{value}</div>
    </div>
  );
}

function LoadingScreen({ text }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#fff5df_0%,#f6e3b2_35%,#eab47b_100%)] p-6 text-center text-ink">
      <div className="rounded-[2rem] border border-white/60 bg-white/65 px-8 py-10 shadow-panel">
        <div className="font-display text-3xl font-black uppercase">{text}</div>
      </div>
    </div>
  );
}

function ErrorScreen({ message, onReset }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#fff5df_0%,#f6e3b2_35%,#eab47b_100%)] p-6 text-ink">
      <div className="max-w-xl rounded-[2rem] border border-white/60 bg-white/65 p-8 text-center shadow-panel">
        <div className="font-display text-3xl font-black uppercase">Connexion impossible</div>
        <p className="mt-3 text-sm text-ink/75">{message}</p>
        <button
          type="button"
          onClick={onReset}
          className="mt-5 rounded-2xl bg-ember px-5 py-3 font-display text-lg font-black uppercase text-white"
        >
          Revenir a l'accueil
        </button>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(() => getSessionFromLocation());
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(Boolean(session));
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!session) {
      setSnapshot(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let socket = null;

    async function load() {
      try {
        setLoading(true);
        const response = await fetch(getApiUrl(`/api/rooms/${session.roomId}?token=${session.token}`));
        const payload = await readJson(response);
        if (cancelled) {
          return;
        }
        setSnapshot(payload);
        setError("");

        socket = new WebSocket(getWsUrl(`/ws?roomId=${session.roomId}&token=${session.token}`));
        socket.onmessage = (event) => {
          const message = JSON.parse(event.data);
          if (message.type === "snapshot" && !cancelled) {
            setSnapshot(message.payload);
          }
        };
        socket.onerror = () => {
          if (!cancelled) {
            setError("Le flux temps reel a ete interrompu.");
          }
        };
      } catch (nextError) {
        if (!cancelled) {
          setError(getNetworkErrorMessage(nextError, "Impossible de charger la salle."));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      if (socket) {
        socket.close();
      }
    };
  }, [session]);

  const sendAction = useMemo(
    () => async (action) => {
      if (!session) {
        return;
      }

      const response = await fetch(getApiUrl(`/api/rooms/${session.roomId}?token=${session.token}`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(action)
      });

      const payload = await readJson(response);
      setSnapshot(payload);
    },
    [session],
  );

  if (!session) {
    return (
      <SetupScreen
        createLoading={creating}
        joinLoading={joining}
        error={error}
        onCreateRoom={async (playerNames, dictionaryLanguage, turnDurationSeconds) => {
          try {
            setCreating(true);
            setError("");
            const response = await fetch(getApiUrl("/api/rooms"), {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ playerNames, dictionaryLanguage, turnDurationSeconds })
            });
            const payload = await readJson(response);
            const nextSession = {
              roomId: payload.roomId,
              token: payload.adminToken
            };
            window.history.replaceState(null, "", buildSessionUrl(payload.roomId, payload.adminToken));
            setSession(nextSession);
          } catch (nextError) {
            setError(getNetworkErrorMessage(nextError, "Impossible de creer la salle."));
          } finally {
            setCreating(false);
          }
        }}
        onJoinRoom={async (roomCode, playerName) => {
          try {
            setJoining(true);
            setError("");
            const response = await fetch(getApiUrl(`/api/rooms/${roomCode}/join`), {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ playerName })
            });
            const payload = await readJson(response);
            const nextSession = {
              roomId: payload.roomId,
              token: payload.token
            };
            window.history.replaceState(null, "", buildSessionUrl(payload.roomId, payload.token));
            setSession(nextSession);
          } catch (nextError) {
            setError(getNetworkErrorMessage(nextError, "Impossible de rejoindre la salle."));
          } finally {
            setJoining(false);
          }
        }}
      />
    );
  }

  if (loading || !snapshot) {
    return <LoadingScreen text="Connexion a la salle..." />;
  }

  if (error && !snapshot) {
    return (
      <ErrorScreen
        message={error}
        onReset={() => {
          window.history.replaceState(null, "", window.location.pathname);
          setSession(null);
          setError("");
        }}
      />
    );
  }

  const handleLogout = () => {
    window.history.replaceState(null, "", window.location.pathname);
    setSession(null);
    setError("");
  };

  return snapshot.role === "admin" ? (
    <AdminView snapshot={snapshot} />
  ) : (
    <PlayerView snapshot={snapshot} onAction={sendAction} onLogout={handleLogout} />
  );
}

export default App;
