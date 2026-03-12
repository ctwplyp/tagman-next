"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image, { type StaticImageData } from "next/image";
import ace from "@/assets/images/ace.png";
import bri from "@/assets/images/bri.png";
import feetch from "@/assets/images/feetch.png";
import kenny from "@/assets/images/kenny.png";
import liv from "@/assets/images/liv.png";
import mazur from "@/assets/images/mazur.png";
import slocum from "@/assets/images/slocum.png";
import smash from "@/assets/images/smash.png";
import squeege from "@/assets/images/squeege.png";
import squirrel from "@/assets/images/squirrel.png";
import tbt from "@/assets/images/tbt.png";
import wordferri from "@/assets/images/wordferri.png";

type Direction = "left" | "right" | "up" | "down";
type GameStatus = "playing" | "paused" | "won" | "lost";
type Difficulty = "easy" | "normal" | "hard";
type GameConfig = {
  playerSpeed: number;
  ghostSpeed: number;
  duration: number;
  winTarget: number;
};

type Position = {
  x: number;
  y: number;
};

type Ghost = {
  id: number;
  avatar: StaticImageData;
  direction: Direction;
  position: Position;
};

const BOARD_PADDING = 20;
const HUD_HEIGHT = 92;
const PLAYER_SIZE = 56;
const GHOST_SIZE = 48;
const FOOD_STEP = 36;
const FOOD_SIZE = 8;
const BEST_SCORE_KEY_PREFIX = "tagman:best:";

const PLAYER_AVATAR = tbt;
const GHOST_AVATARS: StaticImageData[] = [
  liv,
  bri,
  feetch,
  mazur,
  slocum,
  wordferri,
  squeege,
  ace,
  kenny,
  squirrel,
  smash,
];
const GHOST_DIRECTIONS: Direction[] = ["left", "right", "up", "down"];
const DIFFICULTY_SETTINGS: Record<Difficulty, GameConfig> = {
  easy: { playerSpeed: 240, ghostSpeed: 135, duration: 40, winTarget: 8 },
  normal: { playerSpeed: 260, ghostSpeed: 180, duration: 30, winTarget: 11 },
  hard: { playerSpeed: 280, ghostSpeed: 225, duration: 24, winTarget: 12 },
};

function randomDirection() {
  return GHOST_DIRECTIONS[Math.floor(Math.random() * GHOST_DIRECTIONS.length)];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isColliding(a: Position, aSize: number, b: Position, bSize: number) {
  return (
    a.x < b.x + bSize &&
    a.x + aSize > b.x &&
    a.y < b.y + bSize &&
    a.y + aSize > b.y
  );
}

function getBestScoreKey(level: Difficulty) {
  return `${BEST_SCORE_KEY_PREFIX}${level}`;
}

function readBestScore(level: Difficulty) {
  if (typeof window === "undefined") {
    return 0;
  }
  const rawValue = window.localStorage.getItem(getBestScoreKey(level));
  const parsed = rawValue ? Number(rawValue) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function writeBestScore(level: Difficulty, score: number) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(getBestScoreKey(level), String(score));
}

function createGhosts(width: number, height: number, randomize: boolean) {
  const maxGhostX = Math.max(0, width - GHOST_SIZE);
  const maxGhostY = Math.max(0, height - GHOST_SIZE);
  return GHOST_AVATARS.map((avatar, index) => ({
    id: index,
    avatar,
    direction: randomize ? randomDirection() : GHOST_DIRECTIONS[index % GHOST_DIRECTIONS.length],
    position: {
      // Keep the initial SSR/client render deterministic to avoid hydration mismatch.
      x: randomize ? Math.random() * maxGhostX : ((index * 97 + 43) % 1000 / 1000) * maxGhostX,
      y: randomize ? Math.random() * maxGhostY : ((index * 71 + 131) % 1000 / 1000) * maxGhostY,
    },
  }));
}

export default function TagmanGame() {
  const [boardSize, setBoardSize] = useState({ width: 960, height: 560 });
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [playerAvatar, setPlayerAvatar] = useState<StaticImageData>(PLAYER_AVATAR);
  const [playerDirection, setPlayerDirection] = useState<Direction>("right");
  const [playerPosition, setPlayerPosition] = useState<Position>({ x: 0, y: 0 });
  const [ghosts, setGhosts] = useState<Ghost[]>(() => createGhosts(960, 560, false));
  const [eatenFood, setEatenFood] = useState<Set<number>>(new Set());
  const [tags, setTags] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number>(DIFFICULTY_SETTINGS.normal.duration);
  const [bestTags, setBestTags] = useState(0);
  const [status, setStatus] = useState<GameStatus>("playing");

  const frameRef = useRef<number | null>(null);
  const directionRef = useRef<Direction>("right");
  const lastFrameRef = useRef<number>(0);
  const directionTimerRef = useRef(0);
  const touchStartRef = useRef<Position | null>(null);
  const difficultyRef = useRef<Difficulty>("normal");
  const configRef = useRef<GameConfig>(DIFFICULTY_SETTINGS.normal);
  const playerPositionRef = useRef<Position>({ x: 0, y: 0 });
  const ghostsRef = useRef<Ghost[]>(createGhosts(960, 560, false));
  const playerAvatarRef = useRef<StaticImageData>(PLAYER_AVATAR);
  const eatenFoodRef = useRef<Set<number>>(new Set());
  const tagsRef = useRef(0);
  const bestTagsRef = useRef(0);
  const statusRef = useRef<GameStatus>("playing");

  const maxX = Math.max(0, boardSize.width - PLAYER_SIZE);
  const maxY = Math.max(0, boardSize.height - PLAYER_SIZE);
  const activeConfig = DIFFICULTY_SETTINGS[difficulty];

  const columns = Math.max(1, Math.floor((boardSize.width - BOARD_PADDING) / FOOD_STEP));
  const rows = Math.max(1, Math.floor((boardSize.height - BOARD_PADDING) / FOOD_STEP));

  const foodPoints = useMemo(() => {
    const points: Position[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < columns; col += 1) {
        points.push({
          x: col * FOOD_STEP + FOOD_STEP / 2 - FOOD_SIZE / 2,
          y: row * FOOD_STEP + FOOD_STEP / 2 - FOOD_SIZE / 2,
        });
      }
    }
    return points;
  }, [columns, rows]);

  const setDirection = useCallback((nextDirection: Direction) => {
    directionRef.current = nextDirection;
    setPlayerDirection(nextDirection);
  }, []);

  const setBestScore = useCallback((level: Difficulty, nextValue: number) => {
    bestTagsRef.current = nextValue;
    setBestTags(nextValue);
    writeBestScore(level, nextValue);
  }, []);

  const restart = useCallback((levelOverride?: Difficulty) => {
    const level = levelOverride ?? difficultyRef.current;
    const config = DIFFICULTY_SETTINGS[level];
    configRef.current = config;
    const width = Math.max(320, window.innerWidth - BOARD_PADDING * 2);
    const height = Math.max(360, window.innerHeight - HUD_HEIGHT - BOARD_PADDING * 2);
    const nextGhosts = createGhosts(width, height, true);
    setBoardSize({ width, height });
    setPlayerAvatar(PLAYER_AVATAR);
    setPlayerPosition({ x: 0, y: 0 });
    setGhosts(nextGhosts);
    setDirection("right");
    setEatenFood(new Set());
    setTags(0);
    setTimeLeft(config.duration);
    setStatus("playing");
    directionTimerRef.current = 0;
    lastFrameRef.current = 0;
    playerPositionRef.current = { x: 0, y: 0 };
    ghostsRef.current = nextGhosts;
    playerAvatarRef.current = PLAYER_AVATAR;
    eatenFoodRef.current = new Set();
    tagsRef.current = 0;
    statusRef.current = "playing";
  }, [setDirection]);

  const applyDifficulty = useCallback(
    (nextDifficulty: Difficulty) => {
      difficultyRef.current = nextDifficulty;
      configRef.current = DIFFICULTY_SETTINGS[nextDifficulty];
      setDifficulty(nextDifficulty);
      const storedBest = readBestScore(nextDifficulty);
      bestTagsRef.current = storedBest;
      setBestTags(storedBest);
      restart(nextDifficulty);
    },
    [restart],
  );

  const togglePause = useCallback(() => {
    setStatus((currentStatus) => {
      if (currentStatus === "playing") {
        return "paused";
      }
      if (currentStatus === "paused") {
        return "playing";
      }
      return currentStatus;
    });
  }, []);

  useEffect(() => {
    const onResize = () => {
      const width = Math.max(320, window.innerWidth - BOARD_PADDING * 2);
      const height = Math.max(360, window.innerHeight - HUD_HEIGHT - BOARD_PADDING * 2);
      setBoardSize({ width, height });
    };

    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const storedBest = readBestScore(difficultyRef.current);
    bestTagsRef.current = storedBest;
    setBestTags(storedBest);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (key === " " || key === "p") {
        event.preventDefault();
        togglePause();
      }
      if (key === "arrowleft" || key === "a") setDirection("left");
      if (key === "arrowright" || key === "d") setDirection("right");
      if (key === "arrowup" || key === "w") setDirection("up");
      if (key === "arrowdown" || key === "s") setDirection("down");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setDirection, togglePause]);

  useEffect(() => {
    if (status !== "playing") {
      return;
    }

    const timerId = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          setStatus("lost");
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timerId);
  }, [status]);

  useEffect(() => {
    if (status !== "playing") {
      return;
    }

    const animate = (timestamp: number) => {
      if (statusRef.current !== "playing") {
        return;
      }
      if (!lastFrameRef.current) {
        lastFrameRef.current = timestamp;
      }
      const dt = (timestamp - lastFrameRef.current) / 1000;
      lastFrameRef.current = timestamp;
      directionTimerRef.current += dt;

      const distance = configRef.current.playerSpeed * dt;
      let nextPlayerX = playerPositionRef.current.x;
      let nextPlayerY = playerPositionRef.current.y;
      if (directionRef.current === "left") nextPlayerX -= distance;
      if (directionRef.current === "right") nextPlayerX += distance;
      if (directionRef.current === "up") nextPlayerY -= distance;
      if (directionRef.current === "down") nextPlayerY += distance;
      const nextPlayerPosition = {
        x: clamp(nextPlayerX, 0, maxX),
        y: clamp(nextPlayerY, 0, maxY),
      };

      const maxGhostX = Math.max(0, boardSize.width - GHOST_SIZE);
      const maxGhostY = Math.max(0, boardSize.height - GHOST_SIZE);
      let nextGhosts = ghostsRef.current.map((ghost) => {
        const ghostDistance = configRef.current.ghostSpeed * dt;
        let nextDirection = ghost.direction;
        let nextX = ghost.position.x;
        let nextY = ghost.position.y;

        if (directionTimerRef.current >= 0.6 && Math.random() > 0.72) {
          nextDirection = randomDirection();
        }
        if (nextDirection === "left") nextX -= ghostDistance;
        if (nextDirection === "right") nextX += ghostDistance;
        if (nextDirection === "up") nextY -= ghostDistance;
        if (nextDirection === "down") nextY += ghostDistance;

        if (nextX <= 0 || nextX >= maxGhostX || nextY <= 0 || nextY >= maxGhostY) {
          nextDirection = randomDirection();
        }

        return {
          ...ghost,
          direction: nextDirection,
          position: {
            x: clamp(nextX, 0, maxGhostX),
            y: clamp(nextY, 0, maxGhostY),
          },
        };
      });

      const playerCenter: Position = {
        x: nextPlayerPosition.x + PLAYER_SIZE / 2,
        y: nextPlayerPosition.y + PLAYER_SIZE / 2,
      };
      const foodCol = Math.floor(playerCenter.x / FOOD_STEP);
      const foodRow = Math.floor(playerCenter.y / FOOD_STEP);
      const foodIndex = foodRow * columns + foodCol;
      if (foodCol >= 0 && foodCol < columns && foodRow >= 0 && foodRow < rows) {
        if (!eatenFoodRef.current.has(foodIndex)) {
          const nextFood = new Set(eatenFoodRef.current);
          nextFood.add(foodIndex);
          eatenFoodRef.current = nextFood;
          setEatenFood(nextFood);
        }
      }

      const hitGhost = nextGhosts.find((ghost) =>
        isColliding(nextPlayerPosition, PLAYER_SIZE, ghost.position, GHOST_SIZE),
      );

      if (hitGhost) {
        const nextTags = tagsRef.current + 1;
        tagsRef.current = nextTags;
        setTags(nextTags);
        if (nextTags > bestTagsRef.current) {
          setBestScore(difficultyRef.current, nextTags);
        }
        if (nextTags >= configRef.current.winTarget) {
          statusRef.current = "won";
          setStatus("won");
        }

        nextGhosts = nextGhosts.map((ghost) => {
          if (ghost.id !== hitGhost.id) {
            return ghost;
          }
          return {
            ...ghost,
            avatar: playerAvatarRef.current,
            direction: randomDirection(),
            position: {
              x: Math.random() * Math.max(0, boardSize.width - GHOST_SIZE),
              y: Math.random() * Math.max(0, boardSize.height - GHOST_SIZE),
            },
          };
        });

        playerAvatarRef.current = hitGhost.avatar;
        setPlayerAvatar(hitGhost.avatar);
      }

      playerPositionRef.current = nextPlayerPosition;
      ghostsRef.current = nextGhosts;
      setPlayerPosition(nextPlayerPosition);
      setGhosts(nextGhosts);

      if (directionTimerRef.current >= 0.6) {
        directionTimerRef.current = 0;
      }

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
      frameRef.current = null;
    };
  }, [boardSize.height, boardSize.width, columns, maxX, maxY, rows, setBestScore, status]);

  useEffect(() => {
    playerAvatarRef.current = playerAvatar;
  }, [playerAvatar]);

  useEffect(() => {
    playerPositionRef.current = playerPosition;
  }, [playerPosition]);

  useEffect(() => {
    ghostsRef.current = ghosts;
  }, [ghosts]);

  useEffect(() => {
    eatenFoodRef.current = eatenFood;
  }, [eatenFood]);

  useEffect(() => {
    tagsRef.current = tags;
  }, [tags]);

  useEffect(() => {
    statusRef.current = status;
    if (status !== "playing" && frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, [status]);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current) {
      return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const threshold = 20;

    if (Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold) {
      return;
    }

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      setDirection(deltaX > 0 ? "right" : "left");
      return;
    }
    setDirection(deltaY > 0 ? "down" : "up");
  };

  return (
    <section className="game-shell">
      <header className="hud">
        <div className="hud-main">
          <h1>TAGMAN</h1>
          <p className="hud-subtitle">Arrow keys or WASD to move. Space/P to pause.</p>
        </div>
        <p className="pill">
          Tags <strong>{tags}</strong>/<strong>{activeConfig.winTarget}</strong>
        </p>
        <p className="pill">
          Time <strong>{timeLeft}</strong>s
        </p>
        <p className="pill">
          Best <strong>{bestTags}</strong>
        </p>
      </header>

      <div className="settings">
        <label htmlFor="difficulty">Difficulty</label>
        <select
          id="difficulty"
          onChange={(event) => applyDifficulty(event.target.value as Difficulty)}
          value={difficulty}
        >
          <option value="easy">Easy</option>
          <option value="normal">Normal</option>
          <option value="hard">Hard</option>
        </select>
        <button onClick={togglePause} type="button">
          {status === "paused" ? "Resume" : "Pause"}
        </button>
        <button onClick={() => restart()} type="button">
          Restart
        </button>
      </div>

      <div
        className="board"
        role="application"
        aria-label="Tagman game board"
        style={{ width: boardSize.width, height: boardSize.height }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {foodPoints.map((point, index) => (
          <span
            aria-hidden="true"
            className={`food-dot ${eatenFood.has(index) ? "hidden" : ""}`}
            key={`food-${index}`}
            style={{
              width: FOOD_SIZE,
              height: FOOD_SIZE,
              transform: `translate(${point.x}px, ${point.y}px)`,
            }}
          />
        ))}

        {ghosts.map((ghost) => (
          <div
            aria-label={`Ghost ${ghost.id + 1}`}
            className="ghost"
            key={ghost.id}
            style={{
              width: GHOST_SIZE,
              height: GHOST_SIZE,
              transform: `translate(${ghost.position.x}px, ${ghost.position.y}px)`,
            }}
          >
            <Image
              alt={`Ghost ${ghost.id + 1}`}
              className="ghost-image"
              height={40}
              priority={ghost.id === 0}
              src={ghost.avatar}
              width={40}
            />
          </div>
        ))}

        <div
          aria-label="Player"
          className={`player facing-${playerDirection}`}
          style={{
            width: PLAYER_SIZE,
            height: PLAYER_SIZE,
            transform: `translate(${playerPosition.x}px, ${playerPosition.y}px)`,
          }}
        >
          <Image alt="Player avatar" className="player-image" height={48} priority src={playerAvatar} width={48} />
        </div>
      </div>

      <div className="controls" aria-label="Touch controls">
        <button onClick={() => setDirection("up")} type="button">
          Up
        </button>
        <button onClick={() => setDirection("left")} type="button">
          Left
        </button>
        <button onClick={() => setDirection("down")} type="button">
          Down
        </button>
        <button onClick={() => setDirection("right")} type="button">
          Right
        </button>
      </div>

      {(status === "won" || status === "lost") && (
        <div className="overlay" role="status" aria-live="polite">
          <p>{status === "won" ? "You won. Everyone got tagged." : "Time is up."}</p>
          <button onClick={() => restart()} type="button">
            Play again
          </button>
        </div>
      )}
    </section>
  );
}
