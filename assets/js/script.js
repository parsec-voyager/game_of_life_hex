// Grid size. Even rows hold WIDTH cells; odd rows hold one fewer and are
// centred, which shifts them half a cell to the right and makes the grid
// hexagonal: each cell touches two cells above, two below and one either side.
const WIDTH = 99;
const HEIGHT = 101;

// Neighbour counts that keep a live cell alive, and that bring a dead cell to
// life. Conway's original rules are SURVIVE = [2, 3] and BORN = [3]; this page
// uses 2 or 3 for both because it creates interesting results.
const SURVIVE = [2, 3];
const BORN = [2, 3];

// Cells that start alive, as [x, y] coordinates.
const STARTING_CELLS = [
    [48, 49], [49, 49],
    [48, 50], [50, 50],
    [48, 51], [49, 51],
];

const grid = document.querySelector("#grid");
const runButton = document.querySelector(".run");
const clearButton = document.querySelector(".clear");
const stepButton = document.querySelector(".step");
const resetButton = document.querySelector(".reset");
const speedSlider = document.querySelector(".speed");
const speedValue = document.querySelector(".speed-value");

// Cell state lives in flat arrays indexed by y * WIDTH + x, so a generation is
// plain arithmetic with no DOM queries. Odd rows leave their last slot unused.
let cells = new Uint8Array(WIDTH * HEIGHT);
let next = new Uint8Array(WIDTH * HEIGHT);
const elements = new Array(WIDTH * HEIGHT);

function rowWidth(y) {
    return y % 2 === 0 ? WIDTH : WIDTH - 1;
}

function isAlive(x, y) {
    if (y < 0 || y >= HEIGHT || x < 0 || x >= rowWidth(y)) {
        return 0;
    }
    return cells[y * WIDTH + x];
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

function setCell(index, alive) {
    cells[index] = alive;
    elements[index].classList.toggle("alive", alive === 1);
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

    // Only touch the DOM for cells that actually changed.
    for (let index = 0; index < cells.length; index++) {
        if (next[index] !== cells[index]) {
            elements[index].classList.toggle("alive", next[index] === 1);
        }
    }

    [cells, next] = [next, cells];
}

// Build the grid of buttons once, in a fragment, so the page lays it out once.
function buildGrid() {
    const fragment = document.createDocumentFragment();

    for (let y = 0; y < HEIGHT; y++) {
        const row = document.createElement("section");
        row.className = "row";

        const width = rowWidth(y);
        for (let x = 0; x < width; x++) {
            const button = document.createElement("button");
            button.dataset.coord = x + "," + y;
            elements[y * WIDTH + x] = button;
            row.appendChild(button);
        }

        fragment.appendChild(row);
    }

    grid.appendChild(fragment);
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
    STARTING_CELLS.forEach(([x, y]) => setCell(y * WIDTH + x, 1));
}

buildGrid();
resetGrid();

// Toggle a node between dead and alive. One listener on the grid handles every
// button instead of attaching ten thousand listeners.
grid.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) {
        return;
    }
    const [x, y] = button.dataset.coord.split(",").map(Number);
    const index = y * WIDTH + x;
    setCell(index, cells[index] ? 0 : 1);
});

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

// Reset to the starting shape, pausing the game first if it is running
resetButton.addEventListener("click", () => {
    if (timer !== null) {
        stopRunning();
    }
    resetGrid();
});

speedValue.textContent = speedSlider.value;

speedSlider.addEventListener("input", () => {
    speedValue.textContent = speedSlider.value;
    if (timer !== null) {
        stopRunning();
        startRunning();
    }
});
