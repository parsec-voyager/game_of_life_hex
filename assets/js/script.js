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

// Cell geometry. The board is drawn as wide as the text above it, so the space
// between cells is measured from the page when it loads, not fixed here.
// Columns are 7/8 as far apart as cells within a column, which keeps every
// cell the same distance from all six neighbours. Cells never grow past the
// 7px column spacing they had as buttons.
const MAX_PITCH_X = 7;
const MIN_SCREEN_PITCH = 2;  // screen pixels
const PITCH_RATIO = 7 / 8;
const CELL_RATIO = 0.75;     // dot size, as a fraction of its tile
const ROUND_MIN = 5;         // dots at least this many screen pixels across are drawn round
const DEAD_COLOR = "black";
const DIM_COLOR = "rgb(40, 40, 40)";
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

const container = document.querySelector("#grid-container");
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

// Drawing. The board is one canvas rather than one button per cell, so adding
// cells costs the browser almost nothing. Each cell is stamped from a small
// pre-drawn image, and only cells that change are redrawn.
//
// The board is drawn exactly as wide as the text column. That width rarely
// divides into a whole number of screen pixels per column, so the edges of the
// columns, and of the cells within them, are each rounded to the nearest
// screen pixel. Every cell is drawn the same size and stays crisp; the rounding
// only makes some gaps between cells a pixel wider than others.
const dpr = window.devicePixelRatio || 1;
const ctx = canvas.getContext("2d");

// Screen-pixel edges, filled in by layout(). columnEdge[x] is the left edge of
// column x. halfEdge[h] is the top edge of the h-th half cell down the board,
// since every second column is shifted down by half a cell.
const columnEdge = new Int32Array(WIDTH + 1);
const halfEdge = new Int32Array(2 * HEIGHT + 1);

// Exact screen pixels per column and per cell within a column, and the size
// of the tile each cell is stamped with. Also filled in by layout().
let pitchX = 0;
let pitchY = 0;
let tileWidth = 0;
let tileHeight = 0;
let deadSprite = null;
let aliveSprite = null;
let hoverSprite = null;

// How many half cells a column is shifted down, compared with the centre
// column: one for columns of the other parity, or minus one when the centre
// column is itself one of the shifted ones. Measuring from the centre column
// keeps the hexagon centred on the canvas either way.
function columnHalfShift(x) {
    return (x & 1) - (CENTER_X & 1);
}

// The board width in screen pixels: the width of the text column, but never
// so wide that cells grow past their original size, nor so narrow that a
// column is less than MIN_SCREEN_PITCH pixels.
function boardWidth() {
    const column = Math.floor(container.getBoundingClientRect().width * dpr);
    const largest = Math.floor(WIDTH * MAX_PITCH_X * dpr);
    return Math.max(WIDTH * MIN_SCREEN_PITCH, Math.min(largest, column));
}

// Draw one tile-sized image with the given function.
function makeSprite(draw) {
    const sprite = document.createElement("canvas");
    sprite.width = tileWidth;
    sprite.height = tileHeight;
    draw(sprite.getContext("2d"));
    return sprite;
}

// Where the dot sits inside its tile, in screen pixels. A dot is drawn round
// with a thin outline where there is room for one, and as a plain square below
// that, since a circle a few pixels across is only a blur.
function dotGeometry() {
    const size = Math.max(1, Math.round(Math.min(tileWidth, tileHeight) * CELL_RATIO));
    return {
        size: size,
        left: Math.floor((tileWidth - size) / 2),
        top: Math.floor((tileHeight - size) / 2),
        round: size >= ROUND_MIN,
    };
}

// Trace the dot, either as a circle or as a square.
function dotPath(c, dot) {
    c.beginPath();
    if (dot.round) {
        c.arc(dot.left + dot.size / 2, dot.top + dot.size / 2, dot.size / 2, 0, 2 * Math.PI);
    }
    else {
        c.rect(dot.left, dot.top, dot.size, dot.size);
    }
}

function cellSprite(alive) {
    const dot = dotGeometry();
    // Round dead cells are black inside a grey outline. Square ones are too
    // small for an outline, so they are a dim grey instead, which keeps the
    // shape of the board visible when nothing is alive.
    const fill = alive ? ALIVE_COLOR : (dot.round ? DEAD_COLOR : DIM_COLOR);

    return makeSprite(c => {
        // An opaque tile, so stamping it fully replaces whatever was there.
        c.fillStyle = DEAD_COLOR;
        c.fillRect(0, 0, tileWidth, tileHeight);
        dotPath(c, dot);
        c.fillStyle = fill;
        c.fill();
        if (dot.round) {
            const lineWidth = Math.max(1, Math.round(dot.size / 12));
            c.beginPath();
            c.arc(dot.left + dot.size / 2, dot.top + dot.size / 2, dot.size / 2 - lineWidth / 2, 0, 2 * Math.PI);
            c.lineWidth = lineWidth;
            c.strokeStyle = BORDER_COLOR;
            c.stroke();
        }
    });
}

// The white sheen a cell shows under the mouse, matching the button hover style.
function makeHoverSprite() {
    const dot = dotGeometry();

    return makeSprite(c => {
        dotPath(c, dot);
        c.clip();
        const gradient = c.createLinearGradient(0, dot.top, 0, dot.top + dot.size);
        gradient.addColorStop(0, "rgba(255, 255, 255, 0.75)");
        gradient.addColorStop(1, "rgba(255, 255, 255, 0.25)");
        c.fillStyle = gradient;
        c.fillRect(0, 0, tileWidth, tileHeight);
    });
}

// Index of the cell under the mouse, or -1.
let hovered = -1;

function drawCell(index) {
    const y = Math.floor(index / WIDTH);
    const x = index - y * WIDTH;
    const px = columnEdge[x];
    const py = halfEdge[2 * y + columnHalfShift(x)];
    ctx.drawImage(cells[index] ? aliveSprite : deadSprite, px, py);
    if (index === hovered) {
        ctx.drawImage(hoverSprite, px, py);
    }
}

// Draw every cell on the board. The corners of the canvas outside the hexagon,
// and the gaps between tiles, are left transparent.
function drawGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let x = 0; x < WIDTH; x++) {
        for (let y = columnStart[x]; y < columnEnd[x]; y++) {
            drawCell(y * WIDTH + x);
        }
    }
}

// Size the canvas to the text column, work out every edge and tile, and redraw.
function layout() {
    const width = boardWidth();
    pitchX = width / WIDTH;
    pitchY = pitchX / PITCH_RATIO;

    for (let x = 0; x <= WIDTH; x++) {
        columnEdge[x] = Math.round(x * pitchX);
    }
    for (let h = 0; h <= 2 * HEIGHT; h++) {
        halfEdge[h] = Math.round(h * pitchY / 2);
    }

    // Tiles are as large as the narrowest column and shortest cell, so no two
    // ever overlap.
    tileWidth = Infinity;
    for (let x = 0; x < WIDTH; x++) {
        tileWidth = Math.min(tileWidth, columnEdge[x + 1] - columnEdge[x]);
    }
    tileHeight = Infinity;
    for (let h = 0; h + 2 <= 2 * HEIGHT; h++) {
        tileHeight = Math.min(tileHeight, halfEdge[h + 2] - halfEdge[h]);
    }

    canvas.width = columnEdge[WIDTH];
    canvas.height = halfEdge[2 * HEIGHT];
    canvas.style.width = canvas.width / dpr + "px";
    canvas.style.height = canvas.height / dpr + "px";

    deadSprite = cellSprite(false);
    aliveSprite = cellSprite(true);
    hoverSprite = makeHoverSprite();
    drawGrid();
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

layout();
resetGrid();

// Follow the text column when the window is resized, at most once a frame.
let layoutPending = false;

window.addEventListener("resize", () => {
    if (layoutPending) {
        return;
    }
    layoutPending = true;
    requestAnimationFrame(() => {
        layoutPending = false;
        if (boardWidth() !== canvas.width) {
            layout();
        }
    });
});

// The index of the span containing position p, given the edges between spans
// and their average width. The average gives a guess that is at most one span
// out, which the edges then correct. Returns -1 outside every span.
function spanAt(edges, count, averageWidth, p) {
    if (p < 0 || p >= edges[count]) {
        return -1;
    }
    let i = Math.min(count - 1, Math.floor(p / averageWidth));
    while (i > 0 && edges[i] > p) {
        i--;
    }
    while (i < count - 1 && edges[i + 1] <= p) {
        i++;
    }
    return i;
}

// Map a mouse position to the index of the cell under it, or -1 for none,
// including anywhere in the corners outside the hexagon. Every pixel of the
// board belongs to a cell, gaps between tiles included.
function cellAt(event) {
    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * canvas.width / rect.width;
    const py = (event.clientY - rect.top) * canvas.height / rect.height;
    const x = spanAt(columnEdge, WIDTH, pitchX, px);
    const h = spanAt(halfEdge, 2 * HEIGHT, pitchY / 2, py);
    if (x < 0 || h < 0) {
        return -1;
    }
    const y = Math.floor((h - columnHalfShift(x)) / 2);
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
