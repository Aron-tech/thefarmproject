import {
  DIRECTIONS,
  ENTITY_TYPES,
  GROUND_TYPES,
  ITEM_TYPES,
  type ActionResult,
  type Direction,
  type DroneAction,
  type EntityType,
  type ItemType,
} from '../state/types.ts';
import { checkArgCount } from './builtins.ts';
import { PyError } from './errors.ts';
import { NONE, pyBool, pyBuiltin, pyInt, repr, typeName, type Gen, type PyEnum, type PyValue } from './values.ts';

function createEnum(group: string, member: string, qualified: boolean): PyEnum {
  return { type: 'enum', group, member, repr: qualified ? `${group}.${member}` : member };
}

function createEnumMap<T extends string>(group: string, members: readonly T[], qualified: boolean): Map<T, PyEnum> {
  return new Map(members.map((member) => [member, createEnum(group, member, qualified)]));
}

const DIRECTION_VALUES = createEnumMap('Direction', DIRECTIONS, false);
const ENTITY_VALUES = createEnumMap('Entities', ENTITY_TYPES, true);
const GROUND_VALUES = createEnumMap('Grounds', GROUND_TYPES, true);
const ITEM_VALUES = createEnumMap('Items', ITEM_TYPES, true);

function expectEnum<T extends string>(value: PyValue | undefined, group: string, fnName: string): T {
  if (!value || value.type !== 'enum' || value.group !== group) {
    const got = value ? `${typeName(value)} ${repr(value)}` : 'nothing';
    throw new PyError('TypeError', `${fnName}() expects a value from ${group}, got ${got}`);
  }
  return value.member as T;
}

/** Sends an action request to the scheduler and returns the game's answer. */
function* requestAction(action: DroneAction): Gen<ActionResult> {
  const result = yield { kind: 'action', action };
  if (result === undefined) throw new PyError('RuntimeError', `no result received for ${action.kind}`);
  return result;
}

function enumResult<T extends string>(values: Map<T, PyEnum>, result: ActionResult): PyValue {
  return result === null ? NONE : (values.get(result as T) ?? NONE);
}

function asNumber(result: ActionResult): number {
  if (typeof result !== 'number') throw new PyError('RuntimeError', 'expected a numeric action result');
  return result;
}

/** Game API functions, enum namespaces and direction constants exposed to player code. */
export function createGameBuiltins(): Map<string, PyValue> {
  const builtins = new Map<string, PyValue>();
  const define = (name: string, minArgs: number, run: (args: PyValue[]) => Gen<PyValue>) => {
    builtins.set(
      name,
      pyBuiltin(name, (args, kwargs) => {
        if (kwargs.size > 0) throw new PyError('TypeError', `${name}() takes no keyword arguments`);
        checkArgCount(name, args, minArgs);
        return run(args);
      }),
    );
  };

  define('move', 1, function* (args) {
    const direction = expectEnum<Direction>(args[0], 'Direction', 'move');
    return pyBool((yield* requestAction({ kind: 'move', direction })) === true);
  });
  define('harvest', 0, function* () {
    return pyBool((yield* requestAction({ kind: 'harvest' })) === true);
  });
  define('can_harvest', 0, function* () {
    return pyBool((yield* requestAction({ kind: 'canHarvest' })) === true);
  });
  define('plant', 1, function* (args) {
    const entity = expectEnum<EntityType>(args[0], 'Entities', 'plant');
    return pyBool((yield* requestAction({ kind: 'plant', entity })) === true);
  });
  define('till', 0, function* () {
    yield* requestAction({ kind: 'till' });
    return NONE;
  });
  define('clear', 0, function* () {
    yield* requestAction({ kind: 'clear' });
    return NONE;
  });
  define('do_a_flip', 0, function* () {
    yield* requestAction({ kind: 'doAFlip' });
    return NONE;
  });
  define('get_entity_type', 0, function* () {
    return enumResult(ENTITY_VALUES, yield* requestAction({ kind: 'getEntityType' }));
  });
  define('get_ground_type', 0, function* () {
    return enumResult(GROUND_VALUES, yield* requestAction({ kind: 'getGroundType' }));
  });
  define('get_pos_x', 0, function* () {
    return pyInt(asNumber(yield* requestAction({ kind: 'getPosX' })));
  });
  define('get_pos_y', 0, function* () {
    return pyInt(asNumber(yield* requestAction({ kind: 'getPosY' })));
  });
  define('get_world_size', 0, function* () {
    return pyInt(asNumber(yield* requestAction({ kind: 'getWorldSize' })));
  });
  define('num_items', 1, function* (args) {
    const item = expectEnum<ItemType>(args[0], 'Items', 'num_items');
    return pyInt(asNumber(yield* requestAction({ kind: 'numItems', item })));
  });
  builtins.set(
    'get_tick_count',
    pyBuiltin('get_tick_count', (args, _kwargs, ctx) => {
      checkArgCount('get_tick_count', args, 0);
      return pyInt(ctx.getTickCount());
    }),
  );

  for (const [name, value] of DIRECTION_VALUES) builtins.set(name, value);
  builtins.set('Entities', { type: 'namespace', name: 'Entities', members: ENTITY_VALUES });
  builtins.set('Grounds', { type: 'namespace', name: 'Grounds', members: GROUND_VALUES });
  builtins.set('Items', { type: 'namespace', name: 'Items', members: ITEM_VALUES });
  return builtins;
}
