// Grid size. Even rows hold WIDTH cells; odd rows hold one fewer and are
// shifted right by half a cell, which makes the grid hexagonal: each cell
// touches two cells above, two below and one either side.
const WIDTH = 299;
const HEIGHT = 301;

// Cell geometry in CSS pixels: 6px round cells on an 8px horizontal and 7px
// vertical pitch, the same layout the page had when every cell was a button.
const CELL_SIZE = 6;
const PITCH_X = 8;
const PITCH_Y = 7;
const DEAD_COLOR = "black";
const ALIVE_COLOR = "rgb(0, 255, 128)";
const BORDER_COLOR = "rgb(64, 64, 64)";

// Fraction of cells the Random button brings to life.
const RANDOM_DENSITY = 0.5;

// Neighbour counts that keep a live cell alive, and that bring a dead cell to
// life. Conway's original rules are SURVIVE = [2, 3] and BORN = [3]; this page
// uses 2 or 3 for both because it creates interesting results.
const SURVIVE = [2, 3];
const BORN = [2, 3];

// Cells that start alive: the six neighbours of the centre cell, which form a
// small hexagon in the middle of the grid whatever its size.
function startingCells() {
    // Row nearest the vertical centre. When two rows tie (even HEIGHT), take
    // the one whose half-cell shift puts a cell exactly on the horizontal
    // centre: an even row when WIDTH is odd, an odd row when WIDTH is even.
    let centerY = Math.floor(HEIGHT / 2);
    if (HEIGHT % 2 === 0 && (WIDTH + centerY) % 2 === 0) {
        centerY -= 1;
    }
    // Column whose centre is nearest the horizontal centre, allowing for the
    // half-cell shift of odd rows.
    const centerX = Math.round((WIDTH - 1 - (centerY % 2)) / 2);
    const left = centerX - 1 + (centerY % 2);
    return [
        [centerX - 1, centerY], [centerX + 1, centerY],
        [left, centerY - 1], [left + 1, centerY - 1],
        [left, centerY + 1], [left + 1, centerY + 1],
    ].filter(([x, y]) => inGrid(x, y));
}

const canvas = document.querySelector("#grid");
const runButton = document.querySelector(".run");
const clearButton = document.querySelector(".clear");
const stepButton = document.querySelector(".step");
const resetButton = document.querySelector(".reset");
const randomButton = document.querySelector(".random");
const speedSlider = document.querySelector(".speed");
const speedValue = document.querySelector(".speed-value");

// Cell state lives in flat arrays indexed by y * WIDTH + x, so a generation is
// plain arithmetic. Odd rows leave their last slot unused.
const cells = new Uint8Array(WIDTH * HEIGHT);
const next = new Uint8Array(WIDTH * HEIGHT);

function rowWidth(y) {
    return y % 2 === 0 ? WIDTH : WIDTH - 1;
}

function inGrid(x, y) {
    return y >= 0 && y < HEIGHT && x >= 0 && x < rowWidth(y);
}

function isAlive(x, y) {
    return inGrid(x, y) ? cells[y * WIDTH + x] : 0;
}

function liveNeighbors(x, y) {
    // Odd rows are shifted right by half a cell, so their neighbours in the
    // rows above and below are at x and x + 1 rather than x - 1 and x.
    const left = x - 1 + (y % 2);
    const right = left + 1;

    return isAlive(x - 1, y) + isAlive(x + 1, y)
        + isAlive(left, y - 1) + isAlive(right, y - 1)
        + isAlive(left, y + 1) + isAlive(right, y + 1);
}

// Drawing. The grid is one canvas rather than one button per cell, so adding
// cells costs the browser almost nothing. Each cell is stamped from a small
// pre-drawn image, and only cells that change are redrawn.
const dpr = window.devicePixelRatio || 1;
canvas.width = WIDTH * PITCH_X * dpr;
canvas.height = HEIGHT * PITCH_Y * dpr;
canvas.style.width = WIDTH * PITCH_X + "px";
canvas.style.height = HEIGHT * PITCH_Y + "px";
const ctx = canvas.getContext("2d");
ctx.scale(dpr, dpr);

const CENTER_X = PITCH_X / 2;
const CENTER_Y = PITCH_Y / 2;
const RADIUS = CELL_SIZE / 2;

// Draw one cell-sized tile with the given function, at screen resolution.
function makeSprite(draw) {
    const sprite = document.createElement("canvas");
    sprite.width = PITCH_X * dpr;
    sprite.height = PITCH_Y * dpr;
    const c = sprite.getContext("2d");
    c.scale(dpr, dpr);
    draw(c);
    return sprite;
}

function cellSprite(color) {
    return makeSprite(c => {
        c.fillStyle = DEAD_COLOR;
        c.fillRect(0, 0, PITCH_X, PITCH_Y);
        c.beginPath();
        c.arc(CENTER_X, CENTER_Y, RADIUS, 0, 2 * Math.PI);
        c.fillStyle = color;
        c.fill();
        c.beginPath();
        c.arc(CENTER_X, CENTER_Y, RADIUS - 0.25, 0, 2 * Math.PI);
        c.lineWidth = 0.5;
        c.strokeStyle = BORDER_COLOR;
        c.stroke();
    });
}

const deadSprite = cellSprite(DEAD_COLOR);
const aliveSprite = cellSprite(ALIVE_COLOR);

// The white sheen a cell shows under the mouse, matching the button hover style.
const hoverSprite = makeSprite(c => {
    c.beginPath();
    c.arc(CENTER_X, CENTER_Y, RADIUS, 0, 2 * Math.PI);
    c.clip();
    const gradient = c.createLinearGradient(0, CENTER_Y - RADIUS, 0, CENTER_Y + RADIUS);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.75)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0.25)");
    c.fillStyle = gradient;
    c.fillRect(0, 0, PITCH_X, PITCH_Y);
});

// Index of the cell under the mouse, or -1.
let hovered = -1;

function drawCell(index) {
    const y = Math.floor(index / WIDTH);
    const x = index - y * WIDTH;
    const px = x * PITCH_X + (y % 2) * (PITCH_X / 2);
    const py = y * PITCH_Y;
    ctx.drawImage(cells[index] ? aliveSprite : deadSprite, px, py, PITCH_X, PITCH_Y);
    if (index === hovered) {
        ctx.drawImage(hoverSprite, px, py, PITCH_X, PITCH_Y);
    }
}

function drawGrid() {
    ctx.fillStyle = DEAD_COLOR;
    ctx.fillRect(0, 0, WIDTH * PITCH_X, HEIGHT * PITCH_Y);
    for (let y = 0; y < HEIGHT; y++) {
        const width = rowWidth(y);
        for (let x = 0; x < width; x++) {
            drawCell(y * WIDTH + x);
        }
    }
}

function setCell(index, alive) {
    cells[index] = alive;
    drawCell(index);
}

// Advance the whole grid by one iteration.
function step() {
    for (let y = 0; y < HEIGHT; y++) {
        const width = rowWidth(y);
        for (let x = 0; x < width; x++) {
            const index = y * WIDTH + x;
            const count = liveNeighbors(x, y);
            const rule = cells[index] ? SURVIVE : BORN;
            next[index] = rule.includes(count) ? 1 : 0;
        }
    }

    // Only redraw cells that actually changed.
    for (let index = 0; index < cells.length; index++) {
        if (next[index] !== cells[index]) {
            setCell(index, next[index]);
        }
    }
}

function clearGrid() {
    for (let index = 0; index < cells.length; index++) {
        if (cells[index]) {
            setCell(index, 0);
        }
    }
}

// Restore the starting shape
function resetGrid() {
    clearGrid();
    startingCells().forEach(([x, y]) => setCell(y * WIDTH + x, 1));
}

// Give every cell an independent chance of being alive
function randomizeGrid() {
    for (let y = 0; y < HEIGHT; y++) {
        const width = rowWidth(y);
        for (let x = 0; x < width; x++) {
            setCell(y * WIDTH + x, Math.random() < RANDOM_DENSITY ? 1 : 0);
        }
    }
}

drawGrid();
resetGrid();

// Map a mouse position to the index of the cell under it, or -1 for none.
function cellAt(event) {
    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * (WIDTH * PITCH_X / rect.width);
    const py = (event.clientY - rect.top) * (HEIGHT * PITCH_Y / rect.height);
    const y = Math.floor(py / PITCH_Y);
    if (y < 0 || y >= HEIGHT) {
        return -1;
    }
    const x = Math.floor((px - (y % 2) * (PITCH_X / 2)) / PITCH_X);
    if (x < 0 || x >= rowWidth(y)) {
        return -1;
    }
    return y * WIDTH + x;
}

// Toggle a node between dead and alive
canvas.addEventListener("click", event => {
    const index = cellAt(event);
    if (index >= 0) {
        setCell(index, cells[index] ? 0 : 1);
    }
});

// Highlight the node under the mouse
function setHovered(index) {
    if (index === hovered) {
        return;
    }
    const previous = hovered;
    hovered = index;
    if (previous >= 0) {
        drawCell(previous);
    }
    if (hovered >= 0) {
        drawCell(hovered);
    }
}

canvas.addEventListener("mousemove", event => setHovered(cellAt(event)));
canvas.addEventListener("mouseleave", () => setHovered(-1));

// Clear the grid
clearButton.addEventListener("click", clearGrid);

// Run and pause the game. The slider sets iterations per second.
let timer = null;

function startRunning() {
    timer = setInterval(step, 1000 / Number(speedSlider.value));
    runButton.classList.add("alive");
}

function stopRunning() {
    clearInterval(timer);
    timer = null;
    runButton.classList.remove("alive");
}

runButton.addEventListener("click", () => {
    if (timer === null) {
        startRunning();
    }
    else {
        stopRunning();
    }
});

// Advance a single iteration, pausing the game first if it is running
stepButton.addEventListener("click", () => {
    if (timer !== null) {
        stopRunning();
    }
    step();
});

// Reset to the starting shape. Like Clear, this leaves the game running.
resetButton.addEventListener("click", resetGrid);

// Fill the grid at random. This also leaves the game running.
randomButton.addEventListener("click", randomizeGrid);

speedValue.textContent = speedSlider.value;

speedSlider.addEventListener("input", () => {
    speedValue.textContent = speedSlider.value;
    if (timer !== null) {
        stopRunning();
        startRunning();
    }
});
