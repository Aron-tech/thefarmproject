export type BinaryOperator = '+' | '-' | '*' | '/' | '//' | '%' | '**' | '<<' | '>>' | '&' | '|' | '^';
export type UnaryOperator = '-' | '+' | '~' | 'not';
export type CompareOperator = '<' | '>' | '<=' | '>=' | '==' | '!=' | 'in' | 'not in' | 'is' | 'is not';

export interface Param {
  name: string;
  defaultValue: Expr | null;
}

export interface Keyword {
  name: string;
  value: Expr;
}

export interface Comprehension {
  target: Expr;
  iter: Expr;
  ifs: Expr[];
}

export interface Slice {
  kind: 'Slice';
  line: number;
  lower: Expr | null;
  upper: Expr | null;
  step: Expr | null;
}

export type Expr =
  | { kind: 'Name'; line: number; id: string }
  | { kind: 'Num'; line: number; value: number; isFloat: boolean }
  | { kind: 'Str'; line: number; value: string }
  | { kind: 'Bool'; line: number; value: boolean }
  | { kind: 'NoneLit'; line: number }
  | { kind: 'BinOp'; line: number; op: BinaryOperator; left: Expr; right: Expr }
  | { kind: 'UnaryOp'; line: number; op: UnaryOperator; operand: Expr }
  | { kind: 'BoolOp'; line: number; op: 'and' | 'or'; values: Expr[] }
  | { kind: 'Compare'; line: number; left: Expr; ops: CompareOperator[]; comparators: Expr[] }
  | { kind: 'Call'; line: number; func: Expr; args: Expr[]; keywords: Keyword[] }
  | { kind: 'Attribute'; line: number; value: Expr; attr: string }
  | { kind: 'Subscript'; line: number; value: Expr; index: Expr | Slice }
  | { kind: 'List'; line: number; elts: Expr[] }
  | { kind: 'Tuple'; line: number; elts: Expr[] }
  | { kind: 'Set'; line: number; elts: Expr[] }
  | { kind: 'Dict'; line: number; keys: Expr[]; values: Expr[] }
  | { kind: 'IfExp'; line: number; test: Expr; body: Expr; orelse: Expr }
  | { kind: 'Lambda'; line: number; params: Param[]; body: Expr }
  | { kind: 'ListComp'; line: number; elt: Expr; generators: Comprehension[] };

export interface FunctionDef {
  kind: 'FunctionDef';
  line: number;
  name: string;
  params: Param[];
  body: Stmt[];
  /** Names assigned anywhere in the body (Python's compile-time local analysis). */
  localNames: string[];
  globalNames: string[];
}

export type Stmt =
  | { kind: 'ExprStmt'; line: number; value: Expr }
  | { kind: 'Assign'; line: number; targets: Expr[]; value: Expr }
  | { kind: 'AugAssign'; line: number; target: Expr; op: BinaryOperator; value: Expr }
  | { kind: 'If'; line: number; test: Expr; body: Stmt[]; orelse: Stmt[] }
  | { kind: 'While'; line: number; test: Expr; body: Stmt[]; orelse: Stmt[] }
  | { kind: 'For'; line: number; target: Expr; iter: Expr; body: Stmt[]; orelse: Stmt[] }
  | FunctionDef
  | { kind: 'Return'; line: number; value: Expr | null }
  | { kind: 'Break'; line: number }
  | { kind: 'Continue'; line: number }
  | { kind: 'Pass'; line: number }
  | { kind: 'Global'; line: number; names: string[] };

export interface Module {
  body: Stmt[];
}
