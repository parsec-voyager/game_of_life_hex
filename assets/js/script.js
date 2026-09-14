// Board size. The board is a hexagon standing on a point: every cell at most
// RADIUS steps from the centre cell. Its middle column is 2 * RADIUS + 1 cells
// tall, and each column to the left or right is one cell shorter. Every second
// column is shifted down by half a cell, so each cell touches one cell above,
// one below, and two in each neighbouring column.
const RADIUS = 149;

// Cells are stored in a square block that just contains the hexagon, with the
// centre cell in the middle of it.
const WIDTH = 2 * RADIUS + 1;
const HEIGHT = 2 * RADIUS + 1;
const CENTER_X = RADIUS;
const CENTER_Y = RADIUS;

// Cell geometry in CSS pixels: 6px round cells, 8px apart within a column and
// with columns 7px apart, the button layout from before turned on its side.
const CELL_SIZE = 6;
const PITCH_X = 7;
const PITCH_Y = 8;
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
// small hexagon at the exact centre of the board.
function startingCells() {
    const top = CENTER_Y - 1 + (CENTER_X % 2);
    return [
        [CENTER_X, CENTER_Y - 1], [CENTER_X, CENTER_Y + 1],
        [CENTER_X - 1, top], [CENTER_X - 1, top + 1],
        [CENTER_X + 1, top], [CENTER_X + 1, top + 1],
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
// plain arithmetic. Slots outside the hexagon are never used.
const cells = new Uint8Array(WIDTH * HEIGHT);
const next = new Uint8Array(WIDTH * HEIGHT);

// For each column, the first row on the board and the row just past its last.
// Steps between cells are easiest to count in axial coordinates, where the
// column stays the same and the row has the half-cell shift of every second
// column taken out. Two cells are then as many steps apart as the largest of
// the column change, the row change, and the two added together.
const columnStart = new Int32Array(WIDTH);
const columnEnd = new Int32Array(WIDTH);

function axialRow(x, y) {
    return y - (x - (x & 1)) / 2;
}

for (let x = 0; x < WIDTH; x++) {
    const columnChange = x - CENTER_X;
    const centerRow = axialRow(CENTER_X, CENTER_Y);
    const firstRow = centerRow + Math.max(-RADIUS, -RADIUS - columnChange);
    const lastRow = centerRow + Math.min(RADIUS, RADIUS - columnChange);
    columnStart[x] = firstRow + (x - (x & 1)) / 2;
    columnEnd[x] = lastRow + (x - (x & 1)) / 2 + 1;
}

function inGrid(x, y) {
    return x >= 0 && x < WIDTH && y >= columnStart[x] && y < columnEnd[x];
}

function isAlive(x, y) {
    return inGrid(x, y) ? cells[y * WIDTH + x] : 0;
}

function liveNeighbors(x, y) {
    // Odd columns are shifted down by half a cell, so their neighbours in the
    // columns either side are at y and y + 1 rather than y - 1 and y.
    const top = y - 1 + (x % 2);
    const bottom = top + 1;

    return isAlive(x, y - 1) + isAlive(x, y + 1)
        + isAlive(x - 1, top) + isAlive(x - 1, bottom)
        + isAlive(x + 1, top) + isAlive(x + 1, bottom);
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

const DOT_X = PITCH_X / 2;
const DOT_Y = PITCH_Y / 2;
const DOT_RADIUS = CELL_SIZE / 2;

// How far a column is drawn from the top, in cells, compared with the centre
// column. Columns of the other parity sit half a cell below it, or half a cell
// above when the centre column is itself one of the shifted ones. Measuring
// from the centre column keeps the hexagon centred on the canvas either way.
function columnShift(x) {
    return ((x & 1) - (CENTER_X & 1)) / 2;
}

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
        c.arc(DOT_X, DOT_Y, DOT_RADIUS, 0, 2 * Math.PI);
        c.fillStyle = color;
        c.fill();
        c.beginPath();
        c.arc(DOT_X, DOT_Y, DOT_RADIUS - 0.25, 0, 2 * Math.PI);
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
    c.arc(DOT_X, DOT_Y, DOT_RADIUS, 0, 2 * Math.PI);
    c.clip();
    const gradient = c.createLinearGradient(0, DOT_Y - DOT_RADIUS, 0, DOT_Y + DOT_RADIUS);
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
    const px = x * PITCH_X;
    const py = (y + columnShift(x)) * PITCH_Y;
    ctx.drawImage(cells[index] ? aliveSprite : deadSprite, px, py, PITCH_X, PITCH_Y);
    if (index === hovered) {
        ctx.drawImage(hoverSprite, px, py, PITCH_X, PITCH_Y);
    }
}

// Draw every cell on the board. The corners of the canvas outside the hexagon
// are left transparent.
function drawGrid() {
    ctx.clearRect(0, 0, WIDTH * PITCH_X, HEIGHT * PITCH_Y);
    for (let x = 0; x < WIDTH; x++) {
        for (let y = columnStart[x]; y < columnEnd[x]; y++) {
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
    for (let x = 0; x < WIDTH; x++) {
        for (let y = columnStart[x]; y < columnEnd[x]; y++) {
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
    for (let x = 0; x < WIDTH; x++) {
        for (let y = columnStart[x]; y < columnEnd[x]; y++) {
            setCell(y * WIDTH + x, Math.random() < RANDOM_DENSITY ? 1 : 0);
        }
    }
}

drawGrid();
resetGrid();

// Map a mouse position to the index of the cell under it, or -1 for none,
// including anywhere in the corners outside the hexagon.
function cellAt(event) {
    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * (WIDTH * PITCH_X / rect.width);
    const py = (event.clientY - rect.top) * (HEIGHT * PITCH_Y / rect.height);
    const x = Math.floor(px / PITCH_X);
    const y = Math.floor(py / PITCH_Y - columnShift(x));
    return inGrid(x, y) ? y * WIDTH + x : -1;
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
