import {
  ACTIONS_PER_POWER,
  BLOCK_DEFS,
  COAL_POWER,
  CROP_DEFS,
  DYNAMITE_YIELD_FRACTION,
  EXPLOSION_DYNAMITE_LOSS,
  MUSHROOM_COLORS,
  RUIN_GOLD_PER_BLOCK,
  RUIN_MAX_SIZE,
  RUIN_MIN_SIZE,
  POWER_SPEED_MULTIPLIER,
  SUNFLOWER_BONUS_MIN_COUNT,
  SUNFLOWER_BONUS_MULTIPLIER,
  SUNFLOWER_MAX_PETALS,
  SUNFLOWER_MIN_PETALS,
} from '../core/state/constants.ts';
import type { UnlockId } from '../core/state/types.ts';
import { EXPAND_WORLD_SIZES, MINE_LAYERS_BY_DEPTH } from '../core/state/unlocks.ts';

/**
 * Guide pages, like the game's info window. A page appears once its unlock is bought (null: from the start).
 * Text uses `backticks` for inline code.
 */
export type GuideBlock =
  | { kind: 'text'; text: string }
  | { kind: 'code'; code: string }
  /** A function or statement with its description. */
  | { kind: 'entry'; signature: string; text: string };

export interface GuideTopic {
  id: string;
  title: string;
  unlock: UnlockId | null;
  blocks: GuideBlock[];
}

const text = (value: string): GuideBlock => ({ kind: 'text', text: value });
const code = (value: string): GuideBlock => ({ kind: 'code', code: value });
const entry = (signature: string, description: string): GuideBlock => ({ kind: 'entry', signature, text: description });

const seconds = (ticks: number) => `${ticks / 1000} s`;

const MINED_BLOCKS = ['Dirt', 'Clay', 'Coal', 'Stone', 'Iron', 'Quartz'] as const;
const BLOCK_NOTES: Record<(typeof MINED_BLOCKS)[number], string> = {
  Dirt: 'Gives nothing.',
  Clay: 'Gives clay.',
  Coal: 'Gives coal.',
  Stone: 'Gives stone.',
  Iron: 'Gives iron.',
  Quartz: 'Gives quartz.',
};

export const GUIDE_TOPICS: readonly GuideTopic[] = [
  {
    id: 'start',
    title: 'Getting started',
    unlock: null,
    blocks: [
      text('You do not farm yourself: you write Python code, and the drone runs it.'),
      text('Write code in the `main` window and press ▶ (F5) to run it. ▷ (F10) runs it one statement at a time. While it runs, ■ (Shift+F5) stops it and ❚❚ pauses it.'),
      text('Click left of a line to set a breakpoint: the program pauses there, and the output window shows your variables.'),
      code('harvest()'),
      text('Harvest crops to collect items, then spend them in the unlock tree (the tree button in the top right) to unlock new code features, crops and upgrades. Every unlock adds a page to this guide.'),
    ],
  },
  {
    id: 'drone',
    title: 'The drone',
    unlock: null,
    blocks: [
      entry('harvest()', 'Harvests whatever grows below the drone. Ripe plants give items; unripe ones are destroyed without giving anything. Returns True if something was removed.'),
      entry('do_a_flip()', 'The drone does a flip. Takes as long as any other drone action.'),
      text(`Grass grows on grassland by itself in about ${seconds(CROP_DEFS.Grass.baseGrowTicks)} and gives Hay. After harvesting, new grass starts growing at once.`),
      text('Drone actions (moving, harvesting, planting…) take time; plain code like arithmetic is much faster. Unlock Speed or use power to make the drone faster. Crops grow at the same pace however fast the drone is.'),
    ],
  },
  {
    id: 'files',
    title: 'Code windows and files',
    unlock: null,
    blocks: [
      text('Every code window is a file. Press + in the top right to add a new one. Double-click a window title to rename it (names must be valid Python names, such as `farm_utils`). `main` cannot be renamed or deleted.'),
      text('Each window has its own ▶ and ▷ buttons, so any file can be run. F5 and F10 run the window you used last.'),
      text('The Files button (folder icon) lists all files. Click a file to open it, double-click to rename, drag it onto a folder to group it. "+ Folder" adds a folder; each folder can show, minimise or hide all of its windows at once. Closing a window keeps the file.'),
      text('Once you unlock Functions, files can use each other with `import` (see the Import page).'),
    ],
  },
  {
    id: 'unlocks',
    title: 'Unlocks and items',
    unlock: null,
    blocks: [
      text('The unlock tree shows what you can buy next. An upgrade shows up once the ones before it are bought. Green tiles are affordable: click to buy. Costs you cannot pay yet are shown in orange.'),
      text('Some upgrades, like Speed and Expand, have several levels; buying one shows the cost of the next.'),
      text('Using a feature before unlocking it stops the program with a LockedError telling you which unlock it needs.'),
    ],
  },
  {
    id: 'loops',
    title: 'Loops',
    unlock: 'Loops',
    blocks: [
      entry('while condition:', 'Repeats the indented block as long as the condition is true. `while True:` repeats forever, until you stop the program.'),
      entry('for x in range(n):', 'Runs the block n times, with x = 0, 1, … n-1. `range(start, stop)` and `range(start, stop, step)` also work.'),
      entry('break / continue', '`break` leaves the loop; `continue` jumps to its next round.'),
      code('while True:\n    harvest()'),
    ],
  },
  {
    id: 'speed',
    title: 'Speed',
    unlock: 'Speed',
    blocks: [
      text('Every level of the Speed upgrade makes the drone faster. Buy more levels in the unlock tree.'),
      text(`Power makes the drone another ${POWER_SPEED_MULTIPLIER}× faster (see Sunflowers).`),
    ],
  },
  {
    id: 'expand',
    title: 'Expand and moving',
    unlock: 'Expand',
    blocks: [
      text(`Expand makes the farm bigger: ${EXPAND_WORLD_SIZES.slice(1).map((size) => `${size}×${size}`).join(', ')}.`),
      entry('move(direction)', 'Moves the drone one tile: North, East, South or West. The farm wraps around: moving off one edge brings the drone back on the opposite side.'),
      code('for i in range(3):\n    harvest()\n    move(North)'),
    ],
  },
  {
    id: 'senses',
    title: 'Senses',
    unlock: 'Senses',
    blocks: [
      entry('can_harvest()', 'True if the plant below the drone is ripe.'),
      entry('get_entity_type()', 'What grows below the drone: `Entities.Grass`, `Entities.Bush`, … or None.'),
      entry('get_ground_type()', '`Grounds.Grassland` or `Grounds.Soil`.'),
      entry('get_pos_x(), get_pos_y()', 'The drone position. x grows towards East, y towards North; (0, 0) is the south-west corner.'),
      entry('get_world_size()', 'Width (and height) of the farm.'),
      entry('num_items(item)', 'How many of an item you have, e.g. `num_items(Items.Hay)`.'),
      code('while True:\n    if can_harvest():\n        harvest()'),
    ],
  },
  {
    id: 'plant',
    title: 'Planting',
    unlock: 'Plant',
    blocks: [
      entry('plant(entity)', 'Plants an entity below the drone. Returns False if it cannot be planted there (wrong ground, occupied tile or missing items).'),
      text(`Bushes (\`Entities.Bush\`) grow on grassland or soil in about ${seconds(CROP_DEFS.Bush.baseGrowTicks)} and give Wood.`),
      code('plant(Entities.Bush)'),
    ],
  },
  {
    id: 'operators',
    title: 'Operators',
    unlock: 'Operators',
    blocks: [
      entry('+  -  *  /  //  %  **', 'Arithmetic: add, subtract, multiply, divide, integer divide, remainder and power.'),
      entry('==  !=  <  >  <=  >=', 'Comparisons; they give True or False.'),
      entry('and  or  not', 'Combine conditions.'),
      entry('a if condition else b', 'Chooses between two values.'),
      text('Also unlocks `abs()`, `round()`, `int()`, `float()`, `str()` and `bool()`.'),
      code('if get_pos_x() % 2 == 0 and can_harvest():\n    harvest()'),
    ],
  },
  {
    id: 'debug',
    title: 'Debug',
    unlock: 'Debug',
    blocks: [
      entry('print(value, …)', 'Shows values in the output window and in a speech bubble above the drone.'),
      entry('quick_print(value, …)', 'Same as print.'),
      entry('get_tick_count()', 'Operations executed since the program started; useful to measure how fast your code is.'),
    ],
  },
  {
    id: 'variables',
    title: 'Variables',
    unlock: 'Variables',
    blocks: [
      entry('name = value', 'Stores a value under a name.'),
      entry('name += value', 'Shorthand for `name = name + value` (also -=, *=, …).'),
      code('rounds = 0\nwhile True:\n    harvest()\n    rounds += 1'),
    ],
  },
  {
    id: 'carrots',
    title: 'Carrots',
    unlock: 'Carrots',
    blocks: [
      entry('till()', 'Turns grassland into soil, or soil back into grassland. Removes whatever grows there.'),
      text(`Carrots (\`Entities.Carrot\`) only grow on soil, in about ${seconds(CROP_DEFS.Carrot.baseGrowTicks)}. Planting one costs 1 Hay and 1 Wood.`),
      code('till()\nplant(Entities.Carrot)'),
    ],
  },
  {
    id: 'functions',
    title: 'Functions',
    unlock: 'Functions',
    blocks: [
      entry('def name(parameters):', 'Defines a function: a named block of code you can call again and again.'),
      entry('return value', 'Ends the function and gives back a value.'),
      entry('lambda x: expression', 'A small function without a name.'),
      entry('global name', 'Inside a function, lets you change a variable of the file.'),
      code('def harvest_column():\n    for i in range(get_world_size()):\n        if can_harvest():\n            harvest()\n        move(North)\n\nwhile True:\n    harvest_column()\n    move(East)'),
    ],
  },
  {
    id: 'import',
    title: 'Import',
    unlock: 'Functions',
    blocks: [
      text('Put functions you use often in their own file (press + to add one, double-click its title to rename it), and use them from other files.'),
      entry('import name', 'Runs the file `name` once and gives access to its functions and variables as `name.something`.'),
      entry('from name import *', 'Makes everything from the file available directly.'),
      entry('from name import a, b', 'Makes only a and b available directly.'),
      text('A file is run only the first time it is imported; later imports reuse it. Errors in an imported file are reported with its name and line.'),
      code('# in a file named farm_utils\ndef harvest_if_ready():\n    if can_harvest():\n        harvest()'),
      code('# in main\nimport farm_utils\n\nwhile True:\n    farm_utils.harvest_if_ready()\n    move(North)'),
    ],
  },
  {
    id: 'lists',
    title: 'Lists',
    unlock: 'Lists',
    blocks: [
      entry('[a, b, c]', 'A list. `items[0]` is its first element, `items[-1]` its last; `items.append(x)` adds one.'),
      entry('(a, b), {key: value}, {a, b}', 'Tuples, dictionaries and sets.'),
      entry('[x * 2 for x in items]', 'List comprehensions build a list from another one.'),
      text('Also unlocks `len()`, `min()`, `max()`, `sum()`, `sorted()`, `reversed()`, `enumerate()`, `zip()`, `any()`, `all()`, `list()`, `tuple()`, `dict()` and `set()`.'),
      code('crops = [Entities.Bush, Entities.Carrot]\nfor crop in crops:\n    plant(crop)\n    move(North)'),
    ],
  },
  {
    id: 'sunflowers',
    title: 'Sunflowers and power',
    unlock: 'Sunflowers',
    blocks: [
      text(`Sunflowers (\`Entities.Sunflower\`) grow on soil in about ${seconds(CROP_DEFS.Sunflower.baseGrowTicks)} and cost 1 Carrot. Harvesting one gives Power.`),
      entry('measure()', `The number of petals of the sunflower below the drone (${SUNFLOWER_MIN_PETALS}–${SUNFLOWER_MAX_PETALS}), or None if there is no sunflower.`),
      text(`If at least ${SUNFLOWER_BONUS_MIN_COUNT} sunflowers grow on the farm and you harvest the one with the most petals, it gives ${SUNFLOWER_BONUS_MULTIPLIER}× power.`),
      text(`While you have power, the drone is ${POWER_SPEED_MULTIPLIER}× faster. One power lasts ${ACTIONS_PER_POWER} drone actions.`),
    ],
  },
  {
    id: 'mining',
    title: 'The mine',
    unlock: 'Mining',
    blocks: [
      text(
        `Below the farm lie layers of earth and rock: ${MINE_LAYERS_BY_DEPTH[0]} at first, up to ${MINE_LAYERS_BY_DEPTH.at(-1)} with the Depth upgrade. Every cell of a layer is a block, until the drone digs it out.`,
      ),
      entry('dig(direction)', 'Hits the block next to the drone in that direction (`North`, `East`, `South`, `West`, `Up` or `Down`). Returns `True` when the block breaks; its items go to your inventory. From the farm you can only dig `Down`.'),
      entry('move(Down) / move(Up)', 'Moves the drone into the dug-out cell below or above. In the mine the drone can only move into dug-out cells; `move` returns `False` otherwise. Layers wrap around at the edges like the farm.'),
      entry('get_depth()', 'The drone\'s layer: 0 on the farm, 1 for the first mine layer and so on.'),
      entry('get_max_depth()', 'The number of mine layers.'),
      text('Digging down from the farm leaves a shaft: nothing grows there until `clear()` in the first layer fills it in again.'),
      entry('clear()', 'In the mine, refills the drone\'s whole layer with fresh blocks and lifts the drone back to the farm, so the ores never run out.'),
      code('dig(Down)\nmove(Down)\nwhile not dig(East):\n    pass\nmove(East)'),
    ],
  },
  {
    id: 'blocks',
    title: 'Blocks and the drill',
    unlock: 'Mining',
    blocks: [
      text('Harder blocks need several hits before they break. Each Drill level takes one hit off (at least one hit is always needed).'),
      ...MINED_BLOCKS.map((block) => entry(`Blocks.${block}`, `${BLOCK_DEFS[block].hardness} ${BLOCK_DEFS[block].hardness === 1 ? 'hit' : 'hits'}. ${BLOCK_NOTES[block]}`)),
      text('The upper layers are mostly dirt, clay and coal; stone, iron and quartz lie deeper down.'),
      code('def dig_through(direction):\n    while not dig(direction):\n        pass'),
    ],
  },
  {
    id: 'scanner',
    title: 'Scanner',
    unlock: 'Scanner',
    blocks: [
      entry('get_block_type(direction)', 'The block next to the drone, e.g. `Blocks.Coal`, or `Blocks.Air` for a dug-out cell; `None` if there is nothing in that direction.'),
      code('for direction in [North, East, South, West]:\n    if get_block_type(direction) == Blocks.Coal:\n        dig(direction)'),
    ],
  },
  {
    id: 'coal',
    title: 'Coal power',
    unlock: 'Coal',
    blocks: [
      entry('use_item(item)', 'Uses one of an item. Returns `True` if it worked.'),
      text(`\`use_item(Items.Coal)\` burns a coal for ${COAL_POWER} power, a second way to power the drone besides sunflowers.`),
      code('while num_items(Items.Power) < 10 and num_items(Items.Coal) > 0:\n    use_item(Items.Coal)'),
    ],
  },
  {
    id: 'rice',
    title: 'Clay and rice',
    unlock: 'Rice',
    blocks: [
      text('`use_item(Items.Clay)` turns the farm tile below the drone into clay ground (`Grounds.Clay`).'),
      text(`Rice (\`Entities.Rice\`) only grows on clay. It takes about ${seconds(CROP_DEFS.Rice.baseGrowTicks)} and costs ${CROP_DEFS.Rice.plantCost.Hay} Hay.`),
      code('use_item(Items.Clay)\nplant(Entities.Rice)'),
    ],
  },
  {
    id: 'mushrooms',
    title: 'Mushroom sorting',
    unlock: 'Mushrooms',
    blocks: [
      text(`Mushrooms grow in dug-out cells of the mine. The third layer has caves full of them. Each one has a colour from 0 to ${MUSHROOM_COLORS - 1}.`),
      entry('measure()', 'In the mine: the colour of the mushroom at the drone.'),
      entry('swap(direction)', 'Swaps the mushroom at the drone with the one next to it.'),
      text('Harvesting a ripe mushroom also harvests every ripe mushroom connected to it, if the whole group is sorted: colours never get smaller going East or North. A sorted group of n mushrooms gives n² mushrooms; otherwise you get just one.'),
      text(`\`plant(Entities.Mushroom)\` plants one in a dug-out cell for ${CROP_DEFS.Mushroom.plantCost.Mushroom} mushroom.`),
      code('# one pass of bubble sort along a row, moving East\nfor i in range(get_world_size() - 1):\n    here = measure()\n    move(East)\n    if measure() < here:\n        swap(West)'),
    ],
  },
  {
    id: 'minefield',
    title: 'Minesweeper and dynamite',
    unlock: 'Dynamite',
    blocks: [
      text('The minefield layer hides mines in the rock. They look exactly like stone, even to `get_block_type`. The cells around the corner at (0, 0) are always safe.'),
      entry('measure()', 'In a dug-out minefield cell: how many of the 8 cells around it (on the same layer) hold a mine.'),
      entry('defuse(direction)', 'Removes the mine next to the drone and keeps it as dynamite. Returns `False` (and wastes the time) if there is no mine.'),
      text(`Digging into a mine blows the drone up: your program stops with an error, the drone lands back on the farm, the layer is rebuilt and you lose ${EXPLOSION_DYNAMITE_LOSS * 100}% of your dynamite.`),
      text(`\`use_item(Items.Dynamite)\` blows up the 3×3×3 blocks around the drone. You only get ${DYNAMITE_YIELD_FRACTION * 100}% of their items, and it damages ruins.`),
      code('if measure() == 0:\n    for direction in [North, East, South, West]:\n        dig(direction)'),
    ],
  },
  {
    id: 'ruins',
    title: 'Ruins',
    unlock: 'Depth',
    blocks: [
      text(`Deep layers hold ancient ruins: groups of ${RUIN_MIN_SIZE}–${RUIN_MAX_SIZE} carved sandstone blocks (\`Blocks.Ruin\`).`),
      text(`Dig out every block around a ruin (on its layer, and above and below it) to excavate it. A ruin of n blocks gives ${RUIN_GOLD_PER_BLOCK}×n² gold.`),
      text('Never dig into a ruin block, and keep dynamite away: a damaged ruin crumbles to worthless rubble.'),
    ],
  },
];

